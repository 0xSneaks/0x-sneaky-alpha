// Settings page. Sections are separate components so features can add their own. Licensed under GPL-3.0.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { kv } from '../core/db';
import { cleanName, MAX_NAME_LENGTH } from '../core/greeting';
import { CORS_LABEL, PROTOCOL_LABEL, type CustomProvider, type ProviderInfo } from '../core/providers/catalog';
import { newId } from '../core/providers/http';
import { disableLock, enableLock, hasSecret, lockEnabled, lockNow, secretName, setSecret } from '../core/secrets';
import { allProviders, settingsStore, updateSettings } from '../core/settings';
import { useStore } from '../core/store';
import { ProviderEditor, corsClass } from './ProviderEditor';
import { toast } from './toast';

export const extraSections: { title: string; render: () => ComponentChildren }[] = [];

export function Settings({ onClose, name, onName }: { onClose: () => void; name: string; onName: (n: string) => void }) {
  const settings = useStore(settingsStore);
  const [editing, setEditing] = useState<ProviderInfo | null>(null);
  const [keys, setKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const out: Record<string, boolean> = {};
      for (const p of allProviders(settings)) out[p.id] = await hasSecret(secretName.provider(p.id));
      setKeys(out);
    })();
  }, [settings, editing]);

  if (editing) return <ProviderEditor provider={allProviders(settings).find((p) => p.id === editing.id) ?? editing} onClose={() => setEditing(null)} />;

  return (
    <div class="page" data-testid="settings">
      <header class="topbar">
        <button class="icon-btn" aria-label="Back" data-testid="settings-back" onClick={onClose}>‹</button>
        <div class="title">Settings</div>
        <span style={{ width: 44 }} />
      </header>
      <main class="main">
        <div class="section">
          <h3>Providers</h3>
          {allProviders(settings).map((p) => (
            <button class="row" key={p.id} data-testid={`provider-${p.id}`} onClick={() => setEditing(p)}>
              <span class="grow">{p.label}{!p.builtIn && <span class="subtle"> · {PROTOCOL_LABEL[p.protocol]}</span>}</span>
              {keys[p.id] && <span class="pill ok">Key</span>}
              <span class={corsClass(p.cors)}>{CORS_LABEL[p.cors]}</span>
            </button>
          ))}
          <AddCustomProvider />
        </div>
        <div class="section">
          <h3>You</h3>
          <label class="field">
            <span>Your name (only used to greet you, stays on this device)</span>
            <input class="input" maxLength={MAX_NAME_LENGTH} value={name} data-testid="settings-name"
              onInput={(e) => { const v = (e.target as HTMLInputElement).value; onName(v); kv.set('profile.name', cleanName(v)); }} />
          </label>
        </div>
        <div class="section">
          <h3>Generation</h3>
          <label class="field">
            <span>System prompt</span>
            <textarea class="textarea" value={settings.systemPrompt} onChange={(e) => updateSettings({ systemPrompt: (e.target as HTMLTextAreaElement).value })} />
          </label>
          <label class="field">
            <span>Temperature (blank = provider default)</span>
            <input class="input" inputMode="decimal" value={settings.temperature ?? ''} onChange={(e) => {
              const v = (e.target as HTMLInputElement).value.trim();
              const n = Number(v);
              updateSettings({ temperature: v === '' || Number.isNaN(n) ? undefined : Math.min(2, Math.max(0, n)) });
            }} />
          </label>
          <label class="field">
            <span>Max output tokens (blank = default)</span>
            <input class="input" inputMode="numeric" value={settings.maxTokens ?? ''} onChange={(e) => {
              const n = parseInt((e.target as HTMLInputElement).value, 10);
              updateSettings({ maxTokens: Number.isFinite(n) && n > 0 ? n : undefined });
            }} />
          </label>
        </div>
        {extraSections.map((s) => (
          <div class="section" key={s.title}>
            <h3>{s.title}</h3>
            {s.render()}
          </div>
        ))}
        <div class="section">
          <h3>Security</h3>
          <SecuritySection />
        </div>
        <div class="section">
          <h3>About</h3>
          <About />
        </div>
      </main>
    </div>
  );
}

function AddCustomProvider() {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [protocol, setProtocol] = useState<CustomProvider['protocol']>('openai');
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  if (!open) return <button class="btn" data-testid="add-custom" onClick={() => setOpen(true)}>+ Custom provider</button>;
  return (
    <form class="banner" onSubmit={async (e) => {
      e.preventDefault();
      if (!label.trim() || !/^https?:\/\//i.test(url.trim())) return toast('Name and an http(s) base URL are required');
      const id = newId('custom-').slice(0, 19);
      try {
        if (key.trim()) await setSecret(secretName.provider(id), key);
        await updateSettings((s) => ({ customProviders: [...s.customProviders, { id, label: label.trim(), protocol, baseUrl: url.trim() }] }));
        setOpen(false); setLabel(''); setUrl(''); setKey('');
      } catch (err) {
        toast((err as Error).message);
      }
    }}>
      <label class="field"><span>Name</span><input class="input" data-testid="custom-name" value={label} onInput={(e) => setLabel((e.target as HTMLInputElement).value)} /></label>
      <label class="field"><span>Protocol</span>
        <select class="select" data-testid="custom-protocol" value={protocol} onChange={(e) => setProtocol((e.target as HTMLSelectElement).value as CustomProvider['protocol'])}>
          <option value="openai">OpenAI-compatible</option>
          <option value="anthropic">Anthropic-compatible</option>
          <option value="gemini">Google-compatible</option>
        </select>
      </label>
      <label class="field"><span>Base URL</span><input class="input" type="url" data-testid="custom-url" autocapitalize="off" placeholder="https://api.example.com/v1" value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} /></label>
      <label class="field"><span>API key (optional)</span><input class="input" type="password" data-testid="custom-key" autocomplete="off" value={key} onInput={(e) => setKey((e.target as HTMLInputElement).value)} /></label>
      <div class="btn-row"><button class="btn primary" type="submit" data-testid="custom-save">Add</button><button class="btn" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  );
}

function SecuritySection() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { lockEnabled().then(setEnabled); }, []);
  if (enabled === null) return null;
  if (enabled) {
    return (
      <div>
        <p class="subtle">Your API keys are encrypted with your passphrase (AES-GCM, PBKDF2 600k). You'll enter it each time the app opens.</p>
        <div class="btn-row">
          <button class="btn" data-testid="lock-now" onClick={() => lockNow()}>Lock now</button>
          <button class="btn danger" onClick={async () => { await disableLock(); setEnabled(false); toast('Passphrase removed'); }}>Remove passphrase</button>
        </div>
      </div>
    );
  }
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (p1 !== p2) return toast('Passphrases do not match');
      setBusy(true);
      try { await enableLock(p1); setEnabled(true); setP1(''); setP2(''); toast('Keys encrypted'); } catch (err) { toast((err as Error).message); }
      setBusy(false);
    }}>
      <p class="subtle">Without a passphrase, keys are stored unencrypted in this app's storage on your iPhone. Add one to encrypt them. If you forget it, you'll have to re-enter your keys.</p>
      <input class="input" type="password" autocomplete="new-password" placeholder="New passphrase (8+ characters)" data-testid="pass1" value={p1} onInput={(e) => setP1((e.target as HTMLInputElement).value)} />
      <input class="input" style={{ marginTop: 8 }} type="password" autocomplete="new-password" placeholder="Repeat passphrase" data-testid="pass2" value={p2} onInput={(e) => setP2((e.target as HTMLInputElement).value)} />
      <div class="btn-row" style={{ marginTop: 8 }}><button class="btn primary" type="submit" disabled={busy || p1.length < 8} data-testid="set-pass">{busy ? 'Encrypting…' : 'Set passphrase'}</button></div>
    </form>
  );
}

function About() {
  return (
    <div class="subtle" data-testid="about">
      <p><b>0x Sneaky Alpha</b> — Modified Version.</p>
      <p>Based on <a href="https://github.com/newo-ether/Agora" target="_blank" rel="noopener noreferrer">Agora</a> (GPL-3.0). Not affiliated with the original author.</p>
      <p>This program comes with ABSOLUTELY NO WARRANTY. It is free software: you can redistribute it and/or modify it under the terms of the <a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noopener noreferrer">GPL-3.0</a>.</p>
      <p>Source: <a href="https://github.com/0xSneaks/0x-sneaky-alpha" target="_blank" rel="noopener noreferrer">github.com/0xSneaks/0x-sneaky-alpha</a></p>
      <p>No analytics, no relay server. The app only talks to the providers, search services and MCP servers you configure.</p>
    </div>
  );
}
