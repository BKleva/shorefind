exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { fname, lname, email, phone, type, message } = body;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Shoreworks Catalog <ben@shoreworksnj.com>',
      to: ['ben@shoreworksnj.com'],
      reply_to: email,
      subject: `[${type}] Message from ${fname} ${lname}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;color:#1a1a1a">
          <div style="background:#0D3D54;border-radius:12px 12px 0 0;padding:24px 28px">
            <p style="color:#4BB8B8;font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin:0 0 6px">Shoreworks Catalog</p>
            <h2 style="color:#fff;margin:0;font-size:22px">New inquiry: ${type}</h2>
          </div>
          <div style="background:#fff;border:1px solid #DDD8CE;border-top:none;border-radius:0 0 12px 12px;padding:24px 28px">
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:7px 0;color:#888;font-size:13px;width:100px">Name</td><td style="padding:7px 0;font-size:13px;font-weight:600;border-bottom:1px solid #F0EDE6">${fname} ${lname}</td></tr>
              <tr><td style="padding:7px 0;color:#888;font-size:13px">Email</td><td style="padding:7px 0;font-size:13px;border-bottom:1px solid #F0EDE6"><a href="mailto:${email}" style="color:#1A6B8A">${email}</a></td></tr>
              ${phone ? `<tr><td style="padding:7px 0;color:#888;font-size:13px">Phone</td><td style="padding:7px 0;font-size:13px;border-bottom:1px solid #F0EDE6">${phone}</td></tr>` : ''}
              <tr><td style="padding:7px 0;color:#888;font-size:13px">Type</td><td style="padding:7px 0;font-size:13px;border-bottom:1px solid #F0EDE6">${type}</td></tr>
            </table>
            <div style="margin-top:16px;background:#FAF8F4;border-radius:8px;padding:14px 16px">
              <p style="font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.08em;margin:0 0 8px">Message</p>
              <p style="font-size:13px;color:#0F1923;line-height:1.7;margin:0">${message.replace(/\n/g,'<br>')}</p>
            </div>
            <p style="font-size:11px;color:#aaa;margin-top:16px">Reply directly to this email to respond to ${fname}.</p>
          </div>
        </div>
      `
    })
  });

  return {
    statusCode: res.ok ? 200 : 500,
    body: JSON.stringify({ ok: res.ok })
  };
};
