const UMAMI_BASE = 'https://api.umami.is/v1';

export async function onRequest(context) {
  const { request, env } = context;

  const apiKey = env.UMAMI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'UMAMI_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Extract the path after /api/
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '');
  const targetUrl = `${UMAMI_BASE}${path}${url.search}`;

  const res = await fetch(targetUrl, {
    method: request.method,
    headers: {
      'x-umami-api-key': apiKey,
      'Content-Type': 'application/json',
    },
  });

  const body = await res.text();

  return new Response(body, {
    status: res.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
