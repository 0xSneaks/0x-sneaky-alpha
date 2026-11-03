// Vercel Edge Function: GET /api/brave?q=<query>
// Relays to Brave Search. See ./_brave-relay.ts.
// Licensed under GPL-3.0.
import { relayBrave } from './_brave-relay';

export const config = { runtime: 'edge' };

export default function handler(request: Request): Promise<Response> {
  return relayBrave(request);
}
