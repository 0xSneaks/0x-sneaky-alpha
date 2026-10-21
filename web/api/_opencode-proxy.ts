// OpenCode Go proxy handler. Licensed under GPL-3.0.
//
// OpenCode Go (https://opencode.ai/zen/go/v1) does not answer browser
// preflight requests, so the web app cannot call it directly. This Vercel
// Edge Function sits on the app's own origin (no CORS) and relays exactly
// two endpoints to it:
//
//   POST /api/proxy/chat/completions  ->  POST /zen/go/v1/chat/completions
//   GET  /api/proxy/models            ->  GET  /zen/go/v1/models
//
// The allowlist is the route table below plus the function files on disk:
// no other path exists, and any other method is refused. Only the request
// body and the Authorization, Content-Type and Accept headers are forwarded
// (the Authorization value is the user's own OpenCode key, supplied by the
// app per request). The upstream reply is streamed straight back.
//
// This file deliberately has no logging calls, no storage and no
// environment variables. Vercel still logs request metadata (path, status,
// time) at the platform level, never headers or bodies.

const UPSTREAM_BASE = 'https://opencode.ai/zen/go/v1';

/** The only upstream paths this proxy will ever request, and their methods. */
export const PROXY_ROUTES: Record<string, string> = {
  'chat/completions': 'POST',
  models: 'GET',
};

const FORWARDED_HEADERS = ['authorization', 'content-type', 'accept'] as const;

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function proxyOpenCode(request: Request, path: string): Promise<Response> {
  const method = PROXY_ROUTES[path];
  if (!method) return jsonError(404, 'Not found');
  if (request.method !== method) return jsonError(405, `Method not allowed: use ${method}`);

  const headers: Record<string, string> = {};
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM_BASE}/${path}`, {
      method,
      headers,
      body: method === 'POST' ? request.body : undefined,
    });
  } catch {
    return jsonError(502, 'Could not reach OpenCode Go');
  }

  const responseHeaders: Record<string, string> = { 'Cache-Control': 'no-store' };
  const contentType = upstream.headers.get('content-type');
  if (contentType) responseHeaders['Content-Type'] = contentType;
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
