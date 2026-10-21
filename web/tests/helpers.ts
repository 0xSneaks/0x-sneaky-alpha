// Test helpers: build streaming Responses from strings.
export function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(c) {
      if (i < chunks.length) c.enqueue(enc.encode(chunks[i++]));
      else c.close();
    },
  });
}

export function sse(events: unknown[], done = true): string[] {
  const out = events.map((e) => `data: ${JSON.stringify(e)}\n\n`);
  if (done) out.push('data: [DONE]\n\n');
  // Split chunks mid-line to exercise buffering.
  return out.flatMap((s) => [s.slice(0, 7), s.slice(7)]);
}

export function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return handler(url, init);
  };
  globalThis.fetch = fn as typeof fetch;
  return calls;
}

export async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of gen) out.push(v);
  return out;
}
