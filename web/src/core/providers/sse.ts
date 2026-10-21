// Streaming body readers: Server-Sent Events and NDJSON. Licensed under GPL-3.0.

export interface SseEvent {
  event: string;
  data: string;
}

async function* lines(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const onAbort = () => reader.cancel().catch(() => undefined);
  signal?.addEventListener('abort', onAbort);
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        let line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        yield line;
      }
    }
    buf += decoder.decode();
    if (buf) yield buf.endsWith('\r') ? buf.slice(0, -1) : buf;
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock?.();
  }
}

/** Parses an SSE stream per the HTML spec's line rules (event/data fields, blank-line dispatch). */
export async function* readSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SseEvent> {
  let event = '';
  let data: string[] = [];
  for await (const line of lines(body, signal)) {
    if (line === '') {
      if (data.length) yield { event: event || 'message', data: data.join('\n') };
      event = '';
      data = [];
      continue;
    }
    if (line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  if (data.length) yield { event: event || 'message', data: data.join('\n') };
}

export async function* readNdjson(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<unknown> {
  for await (const line of lines(body, signal)) {
    const t = line.trim();
    if (t) yield JSON.parse(t);
  }
}
