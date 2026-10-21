// Model picker: providers with a key (or keyless) and their known models. Licensed under GPL-3.0.
import { useEffect, useState } from 'preact/hooks';
import { addModel, allProviders, baseUrlFor, settingsStore, updateSettings } from '../core/settings';
import { useStore } from '../core/store';
import { adapterFor } from '../core/providers/catalog';
import { getSecret, hasSecret, secretName } from '../core/secrets';
import type { ProviderInfo } from '../core/providers/catalog';
import { toast } from './toast';

export async function refreshModels(p: ProviderInfo): Promise<string[]> {
  const key = (await getSecret(secretName.provider(p.id))) ?? '';
  const models = await adapterFor(p.protocol).listModels(baseUrlFor(p), key);
  await updateSettings((s) => ({ models: { ...s.models, [p.id]: [...new Set([...(s.models[p.id] ?? []), ...models])].sort() } }));
  return models;
}

export function ModelSheet({ current, onPick, onClose }: {
  current: { providerId?: string; model?: string };
  onPick: (providerId: string, model: string) => void;
  onClose: () => void;
}) {
  const settings = useStore(settingsStore);
  const [ready, setReady] = useState<ProviderInfo[]>([]);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const list: ProviderInfo[] = [];
      for (const p of allProviders(settings)) {
        if (!p.keyRequired || (await hasSecret(secretName.provider(p.id))) || settings.providerUrls[p.id] || (settings.models[p.id]?.length ?? 0) > 0) list.push(p);
      }
      setReady(list);
    })();
  }, [settings]);

  const pick = (pid: string, m: string) => {
    updateSettings({ defaultProviderId: pid, defaultModel: m });
    onPick(pid, m);
    onClose();
  };

  return (
    <>
      <div class="scrim" onClick={onClose} />
      <div class="sheet" role="dialog" aria-label="Choose model" data-testid="model-sheet">
        <h3 style={{ marginTop: 0 }}>Model</h3>
        {ready.length === 0 && <p class="subtle">No providers set up yet. Add an API key in Settings → Providers.</p>}
        {ready.map((p) => {
          const models = settings.models[p.id] ?? [];
          return (
            <div class="section" key={p.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ flex: 1, margin: 0 }}>{p.label}</h3>
                <button class="btn" disabled={loading === p.id} onClick={async () => {
                  setLoading(p.id);
                  try { toast(`${(await refreshModels(p)).length} models`); } catch (e) { toast((e as Error).message, 6000); }
                  setLoading(null);
                }}>{loading === p.id ? 'Loading…' : 'Refresh'}</button>
              </div>
              {models.length === 0 && <p class="subtle">No models yet. Tap Refresh, or type a model id below.</p>}
              {models.map((m) => (
                <button key={m} class={'opt' + (current.providerId === p.id && current.model === m ? ' sel' : '')} data-testid={`model-${p.id}-${m}`} onClick={() => pick(p.id, m)}>{m}</button>
              ))}
              <form style={{ display: 'flex', gap: 8, marginTop: 6 }} onSubmit={(e) => {
                e.preventDefault();
                const model = (custom[p.id] ?? '').trim();
                if (!model) return;
                addModel(p.id, model);
                pick(p.id, model);
              }}>
                <input class="input" placeholder="Type a model id" value={custom[p.id] ?? ''} data-testid={`add-model-${p.id}`}
                  onInput={(e) => setCustom({ ...custom, [p.id]: (e.target as HTMLInputElement).value })}
                  autocapitalize="off" autocorrect="off" spellcheck={false} />
                <button class="btn" type="submit">Use</button>
              </form>
            </div>
          );
        })}
      </div>
    </>
  );
}
