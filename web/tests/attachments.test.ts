import { describe, expect, it } from 'vitest';
import { classify, processFile, readsPdf, textWithFiles } from '../src/core/attachments';
import { toOpenAiMessages } from '../src/core/providers/openai';
import { toAnthropicMessages } from '../src/core/providers/anthropic';
import { toGeminiContents } from '../src/core/providers/gemini';
import { toOllamaMessages } from '../src/core/providers/ollama';
import { BUILT_IN_PROVIDERS } from '../src/core/providers/catalog';
import type { Attachment, WireMessage } from '../src/core/types';

const img: Attachment = { id: '1', kind: 'image', name: 'a.png', mime: 'image/png', size: 3, data: 'AAA' };
const pdf: Attachment = { id: '2', kind: 'pdf', name: 'b.pdf', mime: 'application/pdf', size: 3, data: 'BBB' };
const txt: Attachment = { id: '3', kind: 'text', name: 'c.md', mime: 'text/markdown', size: 2, text: 'hi' };
const msg: WireMessage = { role: 'user', text: 'look', attachments: [img, pdf, txt] };

describe('attachments', () => {
  it('classifies files like Android (images, PDFs, text by mime or extension)', () => {
    expect(classify('x.jpg', 'image/jpeg')).toBe('image');
    expect(classify('x.pdf', '')).toBe('pdf');
    expect(classify('notes.md', '')).toBe('text');
    expect(classify('data.json', 'application/json')).toBe('text');
    expect(classify('app.zip', 'application/zip')).toBeNull();
  });

  it('appends text files in the Android format', () => {
    expect(textWithFiles('look', [txt])).toBe('look\n\n--- File: c.md ---\nhi');
  });

  it('reads text and PDF files', async () => {
    const t = await processFile(new File(['hello'], 'n.txt', { type: 'text/plain' }));
    expect(t).toMatchObject({ kind: 'text', text: 'hello' });
    const p = await processFile(new File([new Uint8Array([37, 80, 68, 70])], 'd.pdf', { type: 'application/pdf' }));
    expect(p).toMatchObject({ kind: 'pdf', data: 'JVBERg==' });
    await expect(processFile(new File(['x'], 'a.zip', { type: 'application/zip' }))).rejects.toThrow(/Unsupported/);
  });

  it('OpenAI-compatible: image_url and file parts', () => {
    const [m] = toOpenAiMessages(undefined, [msg]) as { content: any[] }[];
    expect(m.content[0]).toEqual({ type: 'text', text: 'look\n\n--- File: c.md ---\nhi' });
    expect(m.content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } });
    expect(m.content[2]).toEqual({ type: 'file', file: { filename: 'b.pdf', file_data: 'data:application/pdf;base64,BBB' } });
  });

  it('Anthropic: image and document blocks before the text', () => {
    const [m] = toAnthropicMessages([msg]);
    expect((m.content as any[]).map((b) => b.type)).toEqual(['image', 'document', 'text']);
    expect((m.content[0] as any).source).toEqual({ type: 'base64', media_type: 'image/png', data: 'AAA' });
  });

  it('Gemini: inlineData parts', () => {
    const [c] = toGeminiContents([msg]);
    expect(c.parts.slice(0, 2)).toEqual([{ inlineData: { mimeType: 'image/png', data: 'AAA' } }, { inlineData: { mimeType: 'application/pdf', data: 'BBB' } }]);
  });

  it('Ollama: images array (no PDFs)', () => {
    const [m] = toOllamaMessages(undefined, [msg]) as any[];
    expect(m.images).toEqual(['AAA']);
  });

  it('knows which providers read PDFs', () => {
    const by = (id: string) => BUILT_IN_PROVIDERS.find((p) => p.id === id)!;
    expect(['anthropic', 'google', 'openai', 'openrouter'].map((id) => readsPdf(by(id)))).toEqual([true, true, true, true]);
    expect(['deepseek', 'groq', 'qwen', 'ollama'].map((id) => readsPdf(by(id)))).toEqual([false, false, false, false]);
  });
});
