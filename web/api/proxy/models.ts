// Vercel Edge Function: GET /api/proxy/models
// Relays to OpenCode Go's models endpoint. See ../_opencode-proxy.ts.
// Licensed under GPL-3.0.
import { proxyOpenCode } from '../_opencode-proxy';

export const config = { runtime: 'edge' };

export default function handler(request: Request): Promise<Response> {
  return proxyOpenCode(request, 'models');
}
