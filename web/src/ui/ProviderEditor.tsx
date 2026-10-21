// Edit one provider: key, base URL, test connection (the on-device CORS check). Licensed under GPL-3.0.
import { useEffect, useState } from 'preact/hooks';
import { CORS_LABEL, PROTOCOL_LABEL, type ProviderInfo } from '../core/providers/catalog';
import { deleteSecret, hasSecret, secretName, setSecret } from '../core/secrets';
import { settingsStore, updateSettings } from '../core/settings';
import { useStore } from '../core/store';
import { refreshModels } from './ModelSheet';
import { toast } from './toast';

export function corsClass(c: ProviderInfo['cors']): string {
  return c === 'verified' ? 'pill ok' : c === 'blocked' || c === 'unverified' ? 'pill warn' : 'pill';
}

export function ProviderEditor({ provider, onClose }: { provider: ProviderInfo; onClose: () => void }) {
  const settings = useStore(settingsStore);
  const [saved, setSaved] = useState(false);
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [url, setUrl] = useState(settings.providerUrls[provider.id] ?? '');
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { hasSecret(secretName.provider(provider.id)).then(setSaved); }, [provider.id]);

  const save = async () => {
    try {
      if (key.trim()) {
        await setSecret(secretName.provider(provider.id), key);
        setKey('');
        setSaved(true);
      }
      if (provider.builtIn) {
        await updateSettings((s) => {
          const providerUrls = { ...s.providerUrls };
          if (url.trim()) providerUrls[provider.id] = url.trim(); else delete providerUrls[provider.id];
          return { providerUrls };
        });
      } else if (url.trim()) {
        await updateSettings((s) => ({ customProviders: s.customProviders.map((c) => (c.id === provider.id ? { ...c, baseUrl: url.trim() } : c)) }));
      }
      toast('Saved');
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const runTest = async () => {
    setBusy(true);
    setTest(null);
    try {
      await save();
      const models = await refreshModels({ ...provider, defaultBaseUrl: url.trim() || provider.defaultBaseUrl });
      setTest({ ok: true, text: `Connected from this browser. ${models.length} models found.` });
    } catch (e) {
      setTest({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
  };

  return (
    <div class="page" data-testid="provider-editor">
      <header class="topbar">
        <button class="icon-btn" aria-label="Back" onClick={onClose}>‹</button>
        <div class="title">{provider.label}</div>
        <span style={{ width: 44 }} />
      </header>
      <main class="main">
        <p class="subtle">
          {PROTOCOL_LABEL[provider.protocol]} · <span class={corsClass(provider.cors)}>{CORS_LABEL[provider.cors]}</span>
          {provider.note && <><br />{provider.note}</>}
        </p>
        <label class="field">
          <span>API key {saved && <b style={{ color: '#6fe39a' }}>· saved on this device</b>}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input class="input" type={show ? 'text' : 'password'} data-testid="api-key" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck={false}
              placeholder={saved ? '•••••••• (leave blank to keep)' : provider.keyRequired ? 'Paste your API key' : 'Optional'}
              value={key} onInput={(e) => setKey((e.target as HTMLInputElement).value)} />
            <button class="btn" type="button" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
          </div>
        </label>
        <label class="field">
          <span>Base URL</span>
          <input class="input" type="url" inputMode="url" autocapitalize="off" autocorrect="off" spellcheck={false} data-testid="base-url"
            placeholder={provider.defaultBaseUrl} value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} />
        </label>
        <div class="btn-row">
          <button class="btn primary" data-testid="save-provider" onClick={save}>Save</button>
          <button class="btn" data-testid="test-provider" disabled={busy} onClick={runTest}>{busy ? 'Testing…' : 'Test connection'}</button>
          {saved && <button class="btn danger" onClick={async () => { await deleteSecret(secretName.provider(provider.id)); setSaved(false); toast('Key removed'); }}>Remove key</button>}
        </div>
        {test && <div class={'banner ' + (test.ok ? '' : 'err')} data-testid="test-result">{test.text}</div>}
        <p class="subtle">Your key is stored only on this device and is sent only to {url.trim() || provider.defaultBaseUrl}.</p>
        {!provider.builtIn && (
          <button class="btn danger" style={{ marginTop: 18 }} onClick={async () => {
            await deleteSecret(secretName.provider(provider.id));
            await updateSettings((s) => ({ customProviders: s.customProviders.filter((c) => c.id !== provider.id) }));
            onClose();
          }}>Delete this provider</button>
        )}
      </main>
    </div>
  );
}
