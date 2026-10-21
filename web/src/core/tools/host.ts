// Wires memory, web search and MCP into the chat engine's tool host. Licensed under GPL-3.0.
import { setToolHost } from '../chat';
import { safeParseArgs } from '../providers/http';
import { getSecret, secretName } from '../secrets';
import { settingsStore, type McpServer } from '../settings';
import { providerById } from '../settings';
import type { ToolCall, ToolDef } from '../types';
import { executeMemoryTool, getActiveMemory, MEMORY_TOOL_NAMES, MEMORY_TOOLS } from './memory';
import { McpClient, mcpToolDef, parseHeaders } from './mcp';
import { formatResults, WEB_SEARCH_TOOL, webSearch } from './websearch';

const NATIVE_SEARCH = new Set(['google', 'anthropic', 'openrouter']);
const clients = new Map<string, { key: string; client: McpClient }>();
let mcpRoutes = new Map<string, { client: McpClient; tool: string }>();

export async function mcpClientFor(server: McpServer): Promise<McpClient> {
  const headers = parseHeaders((await getSecret(secretName.mcpHeaders(server.id))) ?? '');
  const key = JSON.stringify([server.url, server.transport, headers]);
  const cached = clients.get(server.id);
  if (cached && cached.key === key) return cached.client;
  cached?.client.close();
  const client = new McpClient(server, headers);
  clients.set(server.id, { key, client });
  return client;
}

export function installToolHost(): void {
  setToolHost({
    async prepare(conv) {
      const s = settingsStore.get();
      const tools: ToolDef[] = [];
      const system: string[] = [];
      if (s.memoryEnabled) {
        tools.push(...MEMORY_TOOLS);
        const active = (await getActiveMemory()).trim();
        if (active) system.push(`Active memory (things to remember about the user):\n${active}`);
      }
      if (s.searchProvider !== 'off') tools.push(WEB_SEARCH_TOOL);
      const routes = new Map<string, { client: McpClient; tool: string }>();
      for (const server of s.mcpServers.filter((m) => m.enabled)) {
        try {
          const client = await mcpClientFor(server);
          for (const t of await client.listTools()) {
            const def = mcpToolDef(server, t);
            if (routes.has(def.name)) continue;
            routes.set(def.name, { client, tool: t.name });
            tools.push(def);
          }
        } catch {
          // An unreachable server just contributes no tools; Settings → Test shows the reason.
        }
      }
      mcpRoutes = routes;
      const provider = providerById(conv.providerId);
      const nativeSearch = s.nativeSearch && !!provider && NATIVE_SEARCH.has(provider.id);
      return { tools, system, nativeSearch };
    },
    async execute(call: ToolCall, signal: AbortSignal) {
      const args = safeParseArgs(call.arguments);
      if (MEMORY_TOOL_NAMES.has(call.name)) return executeMemoryTool(call.name, args);
      if (call.name === WEB_SEARCH_TOOL.name) {
        const s = settingsStore.get();
        const key = (await getSecret(secretName.search(s.searchProvider))) ?? '';
        return formatResults(await webSearch(s.searchProvider, String(args.query ?? ''), key, s.searxngUrl, signal));
      }
      const route = mcpRoutes.get(call.name);
      if (route) return route.client.callTool(route.tool, args, signal);
      return `Unknown tool: ${call.name}`;
    },
  });
}
