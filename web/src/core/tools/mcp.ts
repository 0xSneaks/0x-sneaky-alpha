// Remote MCP client over Streamable HTTP or legacy HTTP+SSE (no stdio on iOS). Licensed under GPL-3.0.
import { readSse } from '../providers/sse';
import { redact } from '../redact';
import type { McpServer } from '../settings';
import type { ToolDef } from '../types';

export const MCP_PROTOCOL_VERSION = '2025-06-18';

export interface McpTool { name: string; description?: string; inputSchema?: Record<string, unknown> }

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

export class McpClient {
  private sessionId: string | null = null;
  private nextId = 1;
  private sseEndpoint: string | null = null;
  private ssePending = new Map<number, Pending>();
  private sseAbort: AbortController | null = null;
  private ready: Promise<void> | null = null;

  constructor(readonly server: McpServer, private readonly headers: Record<string, string>) {}

  private secretValues(): string[] {
    return Object.values(this.headers);
  }

  private fail(msg: string): Error {
    return new Error(redact(`${this.server.name}: ${msg}`, ...this.secretValues()));
  }

  connect(): Promise<void> {
    this.ready ??= (async () => {
      if (this.server.transport === 'sse') await this.openSse();
      await this.request('initialize', {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: '0x Sneaky Alpha', version: '1.0' },
      });
      await this.notify('notifications/initialized');
    })().catch((e) => {
      this.ready = null;
      throw e;
    });
    return this.ready;
  }

  close(): void {
    this.sseAbort?.abort();
    this.ready = null;
  }

  async listTools(): Promise<McpTool[]> {
    await this.connect();
    const out: McpTool[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 20; i++) {
      const r = await this.request('tools/list', cursor ? { cursor } : {});
      out.push(...(r?.tools ?? []));
      cursor = r?.nextCursor;
      if (!cursor) break;
    }
    return out;
  }

  async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
    await this.connect();
    const r = await this.request('tools/call', { name, arguments: args }, signal);
    const text = (r?.content ?? [])
      .map((c: any) => (c.type === 'text' ? c.text : c.type === 'resource' ? c.resource?.text ?? '' : `[${c.type}]`))
      .join('\n');
    const body = text || (r?.structuredContent ? JSON.stringify(r.structuredContent) : '');
    return r?.isError ? `Error: ${body}` : body;
  }

  private baseHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...this.headers };
    if (this.ready) h['MCP-Protocol-Version'] = MCP_PROTOCOL_VERSION;
    if (this.sessionId) h['Mcp-Session-Id'] = this.sessionId;
    return h;
  }

  private async post(url: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', headers: this.baseHeaders(), body: JSON.stringify(body), signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw this.fail('unreachable (offline, or the server does not allow browser apps via CORS).');
    }
    if (!res.ok && res.status !== 202) throw this.fail(`HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
    const sid = res.headers.get('Mcp-Session-Id');
    if (sid) this.sessionId = sid;
    return res;
  }

  private async notify(method: string): Promise<void> {
    const msg = { jsonrpc: '2.0', method };
    if (this.server.transport === 'sse') await this.post(this.sseEndpoint!, msg);
    else await this.post(this.server.url, msg);
  }

  private async request(method: string, params: unknown, signal?: AbortSignal): Promise<any> {
    const id = this.nextId++;
    const msg = { jsonrpc: '2.0', id, method, params };
    if (this.server.transport === 'sse') {
      const reply = new Promise<any>((resolve, reject) => {
        this.ssePending.set(id, { resolve, reject });
        signal?.addEventListener('abort', () => { this.ssePending.delete(id); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
      });
      await this.post(this.sseEndpoint!, msg, signal);
      return unwrap(await reply, this);
    }
    const res = await this.post(this.server.url, msg, signal);
    const type = res.headers.get('Content-Type') ?? '';
    if (type.includes('text/event-stream')) {
      for await (const ev of readSse(res.body!, signal)) {
        let d: any;
        try { d = JSON.parse(ev.data); } catch { continue; }
        if (d.id === id) return unwrap(d, this);
      }
      throw this.fail(`no response to ${method}`);
    }
    return unwrap(await res.json(), this);
  }

  /** Legacy transport: GET opens the event stream; its first `endpoint` event says where to POST. */
  private async openSse(): Promise<void> {
    this.sseAbort = new AbortController();
    let res: Response;
    try {
      res = await fetch(this.server.url, { headers: { Accept: 'text/event-stream', ...this.headers }, signal: this.sseAbort.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    } catch {
      throw this.fail('unreachable (offline, or the server does not allow browser apps via CORS).');
    }
    if (!res.ok) throw this.fail(`HTTP ${res.status}`);
    const events = readSse(res.body!, this.sseAbort.signal);
    for (;;) {
      const { value, done } = await events.next();
      if (done) throw this.fail('event stream closed before the endpoint event');
      if (value.event === 'endpoint') {
        this.sseEndpoint = new URL(value.data.trim(), this.server.url).href;
        break;
      }
    }
    (async () => {
      try {
        for await (const ev of events) {
          let d: any;
          try { d = JSON.parse(ev.data); } catch { continue; }
          const p = typeof d?.id === 'number' ? this.ssePending.get(d.id) : undefined;
          if (p) { this.ssePending.delete(d.id); p.resolve(d); }
        }
      } catch { /* closed */ }
      for (const p of this.ssePending.values()) p.reject(this.fail('event stream closed'));
      this.ssePending.clear();
      this.ready = null;
    })();
  }
}

function unwrap(d: any, c: McpClient): any {
  if (d?.error) throw new Error(`${c.server.name}: ${d.error.message ?? 'MCP error'}`);
  return d?.result;
}

/** Model-facing tool name: mcp_<server>__<tool>, limited to [A-Za-z0-9_-] and 64 chars. */
export function mcpToolName(server: McpServer, tool: string): string {
  const slug = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return `mcp_${slug(server.name).slice(0, 20)}__${slug(tool)}`.slice(0, 64);
}

export function mcpToolDef(server: McpServer, t: McpTool): ToolDef {
  return {
    name: mcpToolName(server, t.name),
    description: `[${server.name}] ${t.description ?? t.name}`.slice(0, 1024),
    parameters: t.inputSchema && typeof t.inputSchema === 'object' ? t.inputSchema : { type: 'object', properties: {} },
  };
}

/** Parses "Header: value" lines. */
export function parseHeaders(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) {
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (/^[A-Za-z0-9-]+$/.test(k) && v) out[k] = v;
    }
  }
  return out;
}
