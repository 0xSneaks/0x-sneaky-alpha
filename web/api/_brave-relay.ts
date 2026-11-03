// Brave Search relay handler. Licensed under GPL-3.0.
//
// Brave's Search API sends no CORS headers, so the iPhone web app cannot call
// it directly. This Vercel Edge Function sits on the app's own origin and
// relays exactly one call:
//
//   GET /api/brave?q=<query>  ->  GET https://api.search.brave.com/res/v1/web/search?count=6&q=<query>
//
// Only the query and the user's own X-Subscription-Token header are forwarded.
// No logging calls, no storage, no environment variables.

const UPSTREAM = 'https://api.search.brave.com/res/v1/web/search';

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** `upstream` exists only so tests can point the relay at a local server. */
export async function relayBrave(request: Request, upstream = UPSTREAM): Promise<Response> {
  if (request.method !== 'GET') return jsonError(405, 'Method not allowed: use GET');
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 400);
  if (!q) return jsonError(400, 'q is required');
  const token = request.headers.get('x-subscription-token');
  if (!token) return jsonError(401, 'Brave API key missing');

  let res: Response;
  try {
    res = await fetch(`${upstream}?count=6&q=${encodeURIComponent(q)}`, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': token },
    });
  } catch {
    return jsonError(502, 'Could not reach Brave Search');
  }
  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store' },
  });
}
