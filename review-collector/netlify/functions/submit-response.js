const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function svcHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
}

async function sendOwnerEmail(ownerUserId, businessName, rating, comment) {
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${ownerUserId}`, { headers: svcHeaders() });
  if (!userRes.ok) return;
  const user = await userRes.json();
  if (!user.email) return;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'Review Requests <reviews@shoreworksnj.com>',
      to: [user.email],
      subject: `Private feedback for ${businessName}: ${rating}★`,
      html: `<div style="font-family:sans-serif;max-width:480px;color:#1a1a1a">
        <div style="background:#0D3D54;border-radius:12px 12px 0 0;padding:24px 28px">
          <h2 style="color:#fff;margin:0;font-size:20px">New private feedback — ${rating}★</h2>
        </div>
        <div style="background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;padding:24px 28px">
          <p style="font-size:14px;color:#888">This customer rated their experience ${rating} out of 5, so it was kept private instead of routed to Google.</p>
          <div style="margin-top:12px;background:#FAF8F4;border-radius:8px;padding:14px 16px">
            <p style="font-size:14px;line-height:1.6;margin:0">${comment ? comment.replace(/\n/g, '<br>') : '(no comment left)'}</p>
          </div>
        </div>
      </div>`
    })
  });
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { token, rating, comment } = body;
  if (!token) return { statusCode: 400, body: JSON.stringify({ error: 'Missing token' }) };

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/review_requests?token=eq.${token}&select=id,business_id,businesses(name,google_place_id,gate_enabled,owner_user_id)`,
    { headers: svcHeaders() }
  );
  const rows = await res.json();
  const request = rows[0];
  if (!request || !request.businesses) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
  }

  const business = request.businesses;
  const numericRating = rating === null || rating === undefined ? null : Number(rating);
  const routeToGoogle = !business.gate_enabled || numericRating === null || numericRating >= 4;

  if (routeToGoogle) {
    await fetch(`${SUPABASE_URL}/rest/v1/review_requests?id=eq.${request.id}`, {
      method: 'PATCH',
      headers: svcHeaders(),
      body: JSON.stringify({ status: 'routed_google', rating: numericRating, responded_at: new Date().toISOString() })
    });
    const googleUrl = business.google_place_id
      ? `https://search.google.com/local/writereview?placeid=${business.google_place_id}`
      : null;
    return { statusCode: 200, body: JSON.stringify({ redirect: googleUrl }) };
  }

  await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
    method: 'POST',
    headers: svcHeaders(),
    body: JSON.stringify({ review_request_id: request.id, business_id: request.business_id, rating: numericRating, comment: comment || null })
  });
  await fetch(`${SUPABASE_URL}/rest/v1/review_requests?id=eq.${request.id}`, {
    method: 'PATCH',
    headers: svcHeaders(),
    body: JSON.stringify({ status: 'private_feedback', rating: numericRating, responded_at: new Date().toISOString() })
  });

  await sendOwnerEmail(business.owner_user_id, business.name, numericRating, comment);

  return { statusCode: 200, body: JSON.stringify({ redirect: null }) };
};
