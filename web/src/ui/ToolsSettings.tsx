// Settings sections for memory, web search and MCP servers. Licensed under GPL-3.0.
import { useEffect, useState } from 'preact/hooks';
import { newId } from '../core/providers/http';
import { deleteSecret, hasSecret, secretName, setSecret } from '../core/secrets';
import { settingsStore, updateSettings, type McpServer, type SearchProvider } from '../core/settings';
import { useStore } from '../core/store';
import { deleteMemoryFile, getActiveMemory, listMemoryFiles, setActiveMemory, type MemoryFile } from '../core/tools/memory';
import { mcpClientFor } from '../core/tools/host';
import { SEARCH_LABEL } from '../core/tools/websearch';
import { toast } from './toast';

export function MemorySection() {
  const s = useStore(settingsStore);
  const [active, setActive] = useState('');
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const load = () => { getActiveMemory().then(setActive); listMemoryFiles().then(setFiles); };
  useEffect(load, []);
  return (
    <div>
      <label class="check"><input type="checkbox" data-testid="memory-enabled" checked={s.memoryEnabled} onChange={(e) => updateSettings({ memoryEnabled: (e.target as HTMLInputElement).checked })} /> Let the AI read and write memory</label>
      <label class="field">
        <span>Active memory (added to every chat)</span>
        <textarea class="textarea" data-testid="active-memory" value={active} onInput={(e) => setActive((e.target as HTMLTextAreaElement).value)} onBlur={() => setActiveMemory(active)} />
      </label>
      {files.length > 0 && <p class="subtle">Memory files</p>}
      {files.map((f) => (
        <details class="tool" key={f.name}>
          <summary>{f.name}{f.description ? ` — ${f.description}` : ''}</summary>
          <pre>{f.content}</pre>
          <button class="btn danger" onClick={async () => { await deleteMemoryFile(f.name); load(); }}>Delete</button>
        </details>
      ))}
    </div>
  );
}

export function SearchSection() {
  const s = useStore(settingsStore);
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { setKey(''); hasSecret(secretName.search(s.searchProvider)).then(setSaved); }, [s.searchProvider]);
  return (
    <div>
      <label class="check"><input type="checkbox" data-testid="native-search" checked={s.nativeSearch} onChange={(e) => updateSettings({ nativeSearch: (e.target as HTMLInputElement).checked })} /> Use the provider's built-in search (Google, Anthropic, Open Router)</label>
      <label class="field">
        <span>Web search tool</span>
        <select class="select" data-testid="search-provider" value={s.searchProvider} onChange={(e) => updateSettings({ searchProvider: (e.target as HTMLSelectElement).value as SearchProvider })}>
          {(Object.keys(SEARCH_LABEL) as SearchProvider[]).map((p) => <option key={p} value={p}>{SEARCH_LABEL[p]}</option>)}
        </select>
      </label>
      {s.searchProvider === 'searxng' && (
        <label class="field"><span>SearXNG URL (JSON format and CORS must be enabled)</span>
          <input class="input" type="url" autocapitalize="off" value={s.searxngUrl} onChange={(e) => updateSettings({ searxngUrl: (e.target as HTMLInputElement).value.trim() })} /></label>
      )}
      {s.searchProvider !== 'off' && s.searchProvider !== 'searxng' && (
        <label class="field"><span>{SEARCH_LABEL[s.searchProvider]} API key {saved && <b style={{ color: '#6fe39a' }}>· saved</b>}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input class="input" type="password" autocomplete="off" placeholder={saved ? '•••••••• (leave blank to keep)' : 'API key'} value={key} onInput={(e) => setKey((e.target as HTMLInputElement).value)} />
            <button class="btn" onClick={async () => { await setSecret(secretName.search(s.searchProvider), key); setKey(''); setSaved(!!key.trim() || saved); toast('Saved'); }}>Save</button>
          </div>
        </label>
      )}
      <p class="subtle">Search services must allow browser apps (CORS). DuckDuckGo and Kagi need a server, so they are not available on iPhone.</p>
    </div>
  );
}

export function McpSection() {
  const s = useStore(settingsStore);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [transport, setTransport] = useState<McpServer['transport']>('http');
  const [headers, setHeaders] = useState('');
  const [status, setStatus] = useState<Record<string, string>>({});

  const test = async (m: McpServer) => {
    setStatus((x) => ({ ...x, [m.id]: 'Connecting…' }));
    try {
      const tools = await (await mcpClientFor(m)).listTools();
      setStatus((x) => ({ ...x, [m.id]: `Connected · ${tools.length} tools: ${tools.map((t) => t.name).join(', ').slice(0, 200)}` }));
    } catch (e) {
      setStatus((x) => ({ ...x, [m.id]: (e as Error).message }));
    }
  };

  return (
    <div>
      {s.mcpServers.map((m) => (
        <div class="banner" key={m.id} data-testid="mcp-server">
          <label class="check" style={{ minHeight: 0 }}>
            <input type="checkbox" checked={m.enabled} onChange={(e) => updateSettings((st) => ({ mcpServers: st.mcpServers.map((x) => (x.id === m.id ? { ...x, enabled: (e.target as HTMLInputElement).checked } : x)) }))} />
            <b>{m.name}</b> <span class="subtle">{m.transport === 'sse' ? 'SSE' : 'HTTP'}</span>
          </label>
          <div class="subtle" style={{ wordBreak: 'break-all' }}>{m.url}</div>
          {status[m.id] && <div class="subtle" data-testid="mcp-status">{status[m.id]}</div>}
          <div class="btn-row" style={{ marginTop: 6 }}>
            <button class="btn" data-testid="mcp-test" onClick={() => test(m)}>Test</button>
            <button class="btn danger" onClick={async () => { await deleteSecret(secretName.mcpHeaders(m.id)); await updateSettings((st) => ({ mcpServers: st.mcpServers.filter((x) => x.id !== m.id) })); }}>Remove</button>
          </div>
        </div>
      ))}
      {adding ? (
        <form class="banner" onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || !/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)/i.test(url.trim())) return toast('Name and an https URL are required');
          const id = newId('mcp-').slice(0, 16);
          if (headers.trim()) await setSecret(secretName.mcpHeaders(id), headers);
          await updateSettings((st) => ({ mcpServers: [...st.mcpServers, { id, name: name.trim(), url: url.trim(), transport, enabled: true }] }));
          setAdding(false); setName(''); setUrl(''); setHeaders('');
        }}>
          <label class="field"><span>Name</span><input class="input" data-testid="mcp-name" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
          <label class="field"><span>URL</span><input class="input" type="url" autocapitalize="off" data-testid="mcp-url" placeholder="https://example.com/mcp" value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} /></label>
          <label class="field"><span>Transport</span>
            <select class="select" data-testid="mcp-transport" value={transport} onChange={(e) => setTransport((e.target as HTMLSelectElement).value as McpServer['transport'])}>
              <option value="http">Streamable HTTP</option>
              <option value="sse">SSE (legacy)</option>
            </select>
          </label>
          <label class="field"><span>Headers, one per line (e.g. Authorization: Bearer …). Stored like API keys.</span>
            <textarea class="textarea" autocapitalize="off" spellcheck={false} data-testid="mcp-headers" value={headers} onInput={(e) => setHeaders((e.target as HTMLTextAreaElement).value)} /></label>
          <div class="btn-row"><button class="btn primary" type="submit" data-testid="mcp-save">Add</button><button class="btn" type="button" onClick={() => setAdding(false)}>Cancel</button></div>
        </form>
      ) : (
        <button class="btn" data-testid="mcp-add" onClick={() => setAdding(true)}>+ MCP server</button>
      )}
      <p class="subtle">Remote servers only (HTTP or SSE). The server must allow browser apps (CORS) and expose the Mcp-Session-Id header.</p>
    </div>
  );
}

