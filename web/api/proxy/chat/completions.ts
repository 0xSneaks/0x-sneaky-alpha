// Vercel Edge Function: POST /api/proxy/chat/completions
// Relays to OpenCode Go's chat completions endpoint. See ../_opencode-proxy.ts.
// Licensed under GPL-3.0.
import { proxyOpenCode } from '../../_opencode-proxy';

export const config = { runtime: 'edge' };

export default function handler(request: Request): Promise<Response> {
  return proxyOpenCode(request, 'chat/completions');
}
