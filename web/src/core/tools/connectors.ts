// One-tap MCP connectors. Each one is called through this site's own relay (api/mcp). Licensed under GPL-3.0.
import { MCP_RELAY_TARGETS, mcpRelayIdFor } from '../../../api/_mcp-relay';

export interface Connector {
  id: string;
  name: string;
  url: string;
  blurb: string;
  /** Needs an Authorization header (a personal token) before it works. */
  needsToken?: boolean;
}

export const CONNECTORS: Connector[] = [
  { id: 'exa', name: 'Exa', url: MCP_RELAY_TARGETS.exa, blurb: 'Web search and page fetch' },
  { id: 'context7', name: 'Context7', url: MCP_RELAY_TARGETS.context7, blurb: 'Up-to-date library docs' },
  { id: 'deepwiki', name: 'DeepWiki', url: MCP_RELAY_TARGETS.deepwiki, blurb: 'Ask about any public GitHub repo' },
  { id: 'github', name: 'GitHub', url: MCP_RELAY_TARGETS.github, blurb: 'Your repos, issues and PRs (needs a token)', needsToken: true },
];

/** Same-origin relay path for a server URL the relay knows; otherwise the URL itself. */
export function mcpEndpoint(url: string): string {
  const id = mcpRelayIdFor(url);
  return id ? `/api/mcp?s=${id}` : url;
}

export { mcpRelayIdFor };
