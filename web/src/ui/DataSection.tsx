// Export / import / erase. Licensed under GPL-3.0.
import { useRef } from 'preact/hooks';
import { exportAll, importAll } from '../core/backup';
import { reloadAll } from '../core/chat';
import { clear } from '../core/db';
import { toast } from './toast';

async function shareOrDownload(name: string, text: string) {
  const file = new File([text], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function DataSection() {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div class="btn-row">
        <button class="btn" data-testid="export" onClick={async () => {
          const data = await exportAll();
          await shareOrDownload(`0x-sneaky-alpha-chats-${data.exportedAt.slice(0, 10)}.json`, JSON.stringify(data, null, 2));
        }}>Export chats</button>
        <button class="btn" data-testid="import" onClick={() => input.current?.click()}>Import chats</button>
        <input ref={input} type="file" accept="application/json,.json" style={{ display: 'none' }} data-testid="import-file" onChange={async (e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          (e.target as HTMLInputElement).value = '';
          if (!f) return;
          try {
            const r = await importAll(await f.text());
            await reloadAll();
            toast(`Imported ${r.conversations} chat${r.conversations === 1 ? "" : "s"}`);
          } catch (err) {
            toast((err as Error).message, 5000);
          }
        }} />
      </div>
      <p class="subtle">Exports include chats, branches and memory. API keys are never exported.</p>
      <button class="btn danger" onClick={async () => {
        if (!confirm('Delete all chats and memory on this device? Keys and settings are kept.')) return;
        await clear('conversations'); await clear('messages'); await clear('memory');
        await reloadAll();
        toast('All chats deleted');
      }}>Delete all chats</button>
    </div>
  );
}
