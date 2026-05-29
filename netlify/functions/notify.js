exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { bname, plan, email, fname, lname, town, county, status } = body;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Shoreworks Catalog <onboarding@resend.dev>',
      to: ['ben@shoreworksnj.com'],
      subject: `New listing submitted: ${bname}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;color:#1a1a1a">
          <div style="background:#0D3D54;border-radius:12px 12px 0 0;padding:24px 28px">
            <p style="color:#4BB8B8;font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin:0 0 6px">Shoreworks Catalog</p>
            <h2 style="color:#fff;margin:0;font-size:22px">New listing submitted</h2>
          </div>
          <div style="background:#fff;border:1px solid #DDD8CE;border-top:none;border-radius:0 0 12px 12px;padding:24px 28px">
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:7px 0;color:#888;font-size:13px;width:100px">Business</td><td style="padding:7px 0;font-size:13px;font-weight:600;border-bottom:1px solid #F0EDE6">${bname}</td></tr>
              <tr><td style="padding:7px 0;color:#888;font-size:13px">Plan</td><td style="padding:7px 0;font-size:13px;border-bottom:1px solid #F0EDE6;text-transform:capitalize">${plan}</td></tr>
              <tr><td style="padding:7px 0;color:#888;font-size:13px">Location</td><td style="padding:7px 0;font-size:13px;border-bottom:1px solid #F0EDE6">${town}, ${county}</td></tr>
              <tr><td style="padding:7px 0;color:#888;font-size:13px">Contact</td><td style="padding:7px 0;font-size:13px;border-bottom:1px solid #F0EDE6">${fname} ${lname}</td></tr>
              <tr><td style="padding:7px 0;color:#888;font-size:13px">Email</td><td style="padding:7px 0;font-size:13px;border-bottom:1px solid #F0EDE6">${email}</td></tr>
              <tr><td style="padding:7px 0;color:#888;font-size:13px">Status</td><td style="padding:7px 0;font-size:13px;color:${status === 'active' ? '#1A7A4A' : '#8a6520'}">${status === 'active' ? 'Active' : 'Pending review'}</td></tr>
            </table>
            <a href="https://shoreworksnj.com" style="display:inline-block;margin-top:20px;background:#0D3D54;color:#fff;padding:11px 22px;border-radius:100px;text-decoration:none;font-size:12px;font-weight:500">Open admin panel →</a>
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
