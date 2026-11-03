// MCP relay handler. Licensed under GPL-3.0.
//
// Most hosted MCP servers do not answer browser preflight requests or do not
// expose the Mcp-Session-Id header, so the iPhone web app cannot call them
// directly. This Vercel Edge Function sits on the app's own origin (no CORS)
// and relays to a fixed allowlist of servers:
//
//   POST|GET|DELETE /api/mcp?s=<id>  ->  MCP_RELAY_TARGETS[id]
//
// It is not an open proxy: the target comes only from the table below, never
// from the request. Only the request body and the MCP-relevant headers are
// forwarded (Authorization is the user's own token, supplied by the app per
// request). The upstream reply is streamed straight back.
//
// This file deliberately has no logging calls, no storage and no
// environment variables. Vercel still logs request metadata (path, status,
// time) at the platform level, never headers or bodies.

/** The only upstream MCP endpoints this relay will ever request. */
export const MCP_RELAY_TARGETS: Record<string, string> = {
  exa: 'https://mcp.exa.ai/mcp',
  context7: 'https://mcp.context7.com/mcp',
  deepwiki: 'https://mcp.deepwiki.com/mcp',
  github: 'https://api.githubcopilot.com/mcp/',
};

const METHODS = new Set(['POST', 'GET', 'DELETE']);
const FORWARDED_HEADERS = ['authorization', 'content-type', 'accept', 'mcp-protocol-version', 'mcp-session-id', 'last-event-id'] as const;
const RETURNED_HEADERS = ['content-type', 'mcp-session-id'] as const;
const USER_AGENT = '0x-sneaky-alpha/1.0 (+https://github.com/0xSneaks/0x-sneaky-alpha)';

const norm = (u: string) => u.trim().replace(/\/+$/, '').toLowerCase();

/** Relay id for a server URL the relay knows, else undefined (that server is called directly). */
export function mcpRelayIdFor(url: string): string | undefined {
  const n = norm(url);
  return Object.keys(MCP_RELAY_TARGETS).find((id) => norm(MCP_RELAY_TARGETS[id]) === n);
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** `targets` exists only so tests can point the relay at a local server. */
export async function relayMcp(request: Request, targets: Record<string, string> = MCP_RELAY_TARGETS): Promise<Response> {
  const id = new URL(request.url).searchParams.get('s') ?? '';
  const target = Object.prototype.hasOwnProperty.call(targets, id) ? targets[id] : undefined;
  if (!target) return jsonError(404, 'Unknown MCP server');
  if (!METHODS.has(request.method)) return jsonError(405, 'Method not allowed');

  const headers: Record<string, string> = { 'user-agent': USER_AGENT };
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
    });
  } catch {
    return jsonError(502, 'Could not reach the MCP server');
  }

  const responseHeaders: Record<string, string> = { 'Cache-Control': 'no-store' };
  for (const name of RETURNED_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders[name] = value;
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
