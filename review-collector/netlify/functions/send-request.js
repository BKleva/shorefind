const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

function svcHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };
}

async function getCallerUserId(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user.id || null;
}

async function sendEmail(to, fromName, subject, html) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `${fromName} <reviews@shoreworksnj.com>`,
      to: [to],
      subject,
      html
    })
  });
}

const DEFAULT_PROMPT = 'Thanks for choosing us! Mind sharing a quick word about your experience?';

async function sendSms(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const params = new URLSearchParams({ To: to, From: process.env.TWILIO_FROM_NUMBER, Body: body });
  return fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { business_id, customer_ids, channel } = body;
  const accessToken = (event.headers.authorization || '').replace(/^Bearer /i, '');

  if (!business_id || !Array.isArray(customer_ids) || !customer_ids.length || !channel || !accessToken) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing business_id, customer_ids, channel, or auth token' }) };
  }

  const userId = await getCallerUserId(accessToken);
  if (!userId) return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in' }) };

  const bizRes = await fetch(`${SUPABASE_URL}/rest/v1/businesses?id=eq.${business_id}&select=*`, { headers: svcHeaders() });
  const bizRows = await bizRes.json();
  const business = bizRows[0];
  if (!business || business.owner_user_id !== userId) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Not your business' }) };
  }

  const idsFilter = customer_ids.join(',');
  const custRes = await fetch(
    `${SUPABASE_URL}/rest/v1/customers?business_id=eq.${business_id}&id=in.(${idsFilter})&select=*`,
    { headers: svcHeaders() }
  );
  const customers = await custRes.json();

  const siteUrl = process.env.SITE_URL || process.env.URL || '';
  const results = [];

  for (const customer of customers) {
    const token = crypto.randomBytes(16).toString('hex');
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/review_requests`, {
      method: 'POST',
      headers: { ...svcHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({ business_id, customer_id: customer.id, token, channel, status: 'sent' })
    });
    if (!insertRes.ok) { results.push({ customer_id: customer.id, ok: false, error: 'insert failed' }); continue; }

    const link = `${siteUrl}/r.html?rid=${token}`;
    const prompt = business.review_prompt || DEFAULT_PROMPT;
    const sendErrors = [];

    if ((channel === 'email' || channel === 'both') && customer.email) {
      const r = await sendEmail(
        customer.email,
        `${business.name} Review Request`,
        `How was your experience with ${business.name}? (Ref #${token.slice(0, 6).toUpperCase()})`,
        `<div style="font-family:sans-serif;max-width:480px;color:#1a1a1a">
          <div style="background:${business.brand_color || '#0D3D54'};border-radius:12px 12px 0 0;padding:24px 28px">
            ${business.logo_url ? `<img src="${business.logo_url}" alt="${business.name}" style="max-height:36px;max-width:160px;margin-bottom:10px;display:block">` : ''}
            <h2 style="color:#fff;margin:0;font-size:20px">${business.name}</h2>
          </div>
          <div style="background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;padding:24px 28px">
            <p style="font-size:14px;line-height:1.6">Hi ${customer.name || ''}, ${prompt}</p>
            <a href="${link}" style="display:inline-block;margin-top:12px;background:${business.brand_color || '#0D3D54'};color:#fff;padding:11px 24px;border-radius:100px;text-decoration:none;font-size:13px;font-weight:600">Leave feedback</a>
          </div>
        </div>`
      );
      if (!r.ok) sendErrors.push('email');
    }

    if ((channel === 'sms' || channel === 'both') && customer.phone) {
      const r = await sendSms(customer.phone, `${business.name}: ${prompt} ${link}`);
      if (!r.ok) sendErrors.push('sms');
    }

    results.push({ customer_id: customer.id, ok: sendErrors.length === 0, errors: sendErrors });
  }

  return { statusCode: 200, body: JSON.stringify({ results }) };
};
