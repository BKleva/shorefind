const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function svcHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const token = event.queryStringParameters && event.queryStringParameters.rid;
  if (!token) return { statusCode: 400, body: JSON.stringify({ error: 'Missing rid' }) };

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/review_requests?token=eq.${token}&select=id,status,businesses(name,brand_color,gate_enabled,logo_url)`,
    { headers: svcHeaders() }
  );
  const rows = await res.json();
  const request = rows[0];
  if (!request || !request.businesses) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
  }

  if (request.status === 'sent') {
    await fetch(`${SUPABASE_URL}/rest/v1/review_requests?id=eq.${request.id}`, {
      method: 'PATCH',
      headers: svcHeaders(),
      body: JSON.stringify({ status: 'opened', opened_at: new Date().toISOString() })
    });
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      business_name: request.businesses.name,
      brand_color: request.businesses.brand_color,
      gate_enabled: request.businesses.gate_enabled,
      logo_url: request.businesses.logo_url,
      already_responded: request.status === 'routed_google' || request.status === 'private_feedback'
    })
  };
};
