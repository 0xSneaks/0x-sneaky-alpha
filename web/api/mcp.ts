// Vercel Edge Function: POST|GET|DELETE /api/mcp?s=<id>
// Relays to an allowlisted hosted MCP server. See ./_mcp-relay.ts.
// Licensed under GPL-3.0.
import { relayMcp } from './_mcp-relay';

export const config = { runtime: 'edge' };

export default function handler(request: Request): Promise<Response> {
  return relayMcp(request);
}
