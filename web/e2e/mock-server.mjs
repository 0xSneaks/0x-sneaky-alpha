// Local mock of an OpenAI-compatible provider for E2E tests. Streams "Echo: <last user text>"
// word by word. Text containing "slow" streams for ~10s so Stop can be tested.
import http from 'node:http';

const port = Number(process.env.MOCK_PORT ?? 4174);
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, accept, mcp-session-id, mcp-protocol-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.url === '/v1/models') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ data: [{ id: 'mock-1' }, { id: 'mock-2' }] }));
  }
  if (req.url === '/v1/chat/completions' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const j = JSON.parse(body);
      const lastUser = [...j.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      const parts = Array.isArray(lastUser) ? lastUser : [];
      const last = Array.isArray(lastUser)
        ? `${parts.filter((p) => p.type === 'text').map((p) => p.text).join('')} [images:${parts.filter((p) => p.type === 'image_url').length} files:${parts.filter((p) => p.type === 'file').length}]`
        : lastUser;
      const lastMsg = j.messages[j.messages.length - 1];
      const toolNames = (j.tools ?? []).map((t) => t.function.name);
      const call = (name, args) => {
        res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name, arguments: '' } }] } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] })}\n\n`);
        res.end('data: [DONE]\n\n');
      };
      if (lastMsg.role === 'tool') {
        res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `Tool said: ${lastMsg.content}` } }] })}\n\n`);
        return res.end('data: [DONE]\n\n');
      }
      const remember = last.match(/^remember (.+)$/);
      if (remember && toolNames.includes('update_active_memory')) return call('update_active_memory', { content: remember[1], mode: 'append' });
      const mcpTool = toolNames.find((n) => n.startsWith('mcp_'));
      if (/^use mcp/.test(last) && mcpTool) return call(mcpTool, { text: 'from model' });
      const slow = /slow/.test(last);
      const words = slow ? Array.from({ length: 70 }, (_, i) => `w${i} `) : `Echo: ${last}`.split(/(?<= )/);
      res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      let i = 0;
      const tick = () => {
        if (res.destroyed) return;
        if (i < words.length) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: words[i++] } }] })}\n\n`);
          setTimeout(tick, slow ? 150 : 60);
        } else {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
          res.end('data: [DONE]\n\n');
        }
      };
      tick();
    });
    return;
  }
  if (req.url === '/mcp' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const msg = JSON.parse(body);
      const h = { ...cors, 'Access-Control-Expose-Headers': 'Mcp-Session-Id', 'Content-Type': 'application/json', 'Mcp-Session-Id': 'mock-session' };
      if (!('id' in msg)) { res.writeHead(202, cors); return res.end(); }
      const result = msg.method === 'initialize' ? { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'mock', version: '1' } }
        : msg.method === 'tools/list' ? { tools: [{ name: 'echo', description: 'Echo text', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } }] }
          : { content: [{ type: 'text', text: `mcp echo: ${msg.params?.arguments?.text}` }] };
      res.writeHead(200, h);
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
    });
    return;
  }
  res.writeHead(404, cors);
  res.end();
}).listen(port, '127.0.0.1');
