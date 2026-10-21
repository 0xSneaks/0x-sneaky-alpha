// Turns picked files into attachments, matching the Android rules: images are sent as images,
// text files are added to the message as "--- File: name ---", PDFs go to providers that read
// them natively. Licensed under GPL-3.0.
import { newId } from './providers/http';
import type { ProviderInfo } from './providers/catalog';
import type { Attachment } from './types';

export const MAX_IMAGE_SIDE = 2048;
export const MAX_TEXT_BYTES = 1024 * 1024;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;

const TEXT_MIME = ['text/', 'application/json', 'application/xml', 'application/yaml', 'application/x-yaml', 'application/javascript', 'application/x-sh'];
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|ya?ml|toml|ini|cfg|conf|log|html?|css|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|kts|swift|c|h|cc|cpp|hpp|cs|php|sh|bash|zsh|sql|r|lua|dart|scala|vue|svelte|env|gitignore|dockerfile)$/i;

export function classify(name: string, mime: string): Attachment['kind'] | null {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (TEXT_MIME.some((t) => m.startsWith(t)) || TEXT_EXT.test(name)) return 'text';
  return null;
}

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function blobToBase64(b: Blob): Promise<string> {
  return toBase64(await b.arrayBuffer());
}

/** Scales an image so its longest side is at most MAX_IMAGE_SIDE; HEIC and other formats become JPEG. */
async function processImage(file: File): Promise<Attachment> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
  const keep = scale === 1 && /^image\/(jpeg|png|gif|webp)$/.test(file.type) && file.size <= 5 * 1024 * 1024;
  if (keep) {
    bitmap.close?.();
    return { id: newId('f_'), kind: 'image', name: file.name || 'image', mime: file.type, size: file.size, data: await blobToBase64(file), width, height };
  }
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not read this image.'))), 'image/jpeg', 0.85));
  const name = (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg';
  return { id: newId('f_'), kind: 'image', name, mime: 'image/jpeg', size: blob.size, data: await blobToBase64(blob), width: w, height: h };
}

export async function processFile(file: File): Promise<Attachment> {
  const kind = classify(file.name, file.type);
  if (!kind) throw new Error(`Unsupported file type: ${file.name}`);
  if (kind === 'image') return processImage(file);
  if (kind === 'pdf') {
    if (file.size > MAX_PDF_BYTES) throw new Error(`${file.name} is larger than 20 MB.`);
    return { id: newId('f_'), kind, name: file.name || 'document.pdf', mime: 'application/pdf', size: file.size, data: await blobToBase64(file) };
  }
  if (file.size > MAX_TEXT_BYTES) throw new Error(`${file.name} is larger than 1 MB.`);
  return { id: newId('f_'), kind, name: file.name || 'file.txt', mime: file.type || 'text/plain', size: file.size, text: await file.text() };
}

/** The user's text with text-file contents appended, in the Android format. */
export function textWithFiles(text: string, attachments: Attachment[] = []): string {
  return text + attachments.filter((a) => a.kind === 'text').map((a) => `\n\n--- File: ${a.name} ---\n${a.text ?? ''}`).join('');
}

/** Image and PDF attachments, which adapters send as native parts. */
export function binaryParts(attachments: Attachment[] = []): Attachment[] {
  return attachments.filter((a) => (a.kind === 'image' || a.kind === 'pdf') && a.data);
}

/** Providers that accept PDF files directly. */
export function readsPdf(p: Pick<ProviderInfo, 'id' | 'protocol' | 'builtIn'>): boolean {
  return p.protocol === 'anthropic' || p.protocol === 'gemini' || p.id === 'openai' || p.id === 'openrouter' || (!p.builtIn && p.protocol === 'openai');
}
