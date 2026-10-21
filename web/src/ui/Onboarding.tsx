// First-run flow, matching the Android welcome: welcome → name → provider → key → model → done.
// Every step can be skipped. Licensed under GPL-3.0.
import { useState } from 'preact/hooks';
import { kv } from '../core/db';
import { cleanName, MAX_NAME_LENGTH } from '../core/greeting';
import { BUILT_IN_PROVIDERS, CORS_LABEL, customToInfo, type CustomProvider, type ProviderInfo } from '../core/providers/catalog';
import { newId } from '../core/providers/http';
import { secretName, setSecret } from '../core/secrets';
import { addModel, settingsStore, updateSettings } from '../core/settings';
import { useStore } from '../core/store';
import { refreshModels } from './ModelSheet';
import { corsClass } from './ProviderEditor';

type Step = 'welcome' | 'name' | 'provider' | 'key' | 'model' | 'done';

export function Onboarding({ onDone, onName }: { onDone: () => void; onName: (n: string) => void }) {
  const settings = useStore(settingsStore);
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [key, setKey] = useState('');
  const [url, setUrl] = useState('');
  const [model, setModel] = useState('');
  const [status, setStatus] = useState('');
  const [protocol, setProtocol] = useState<CustomProvider['protocol']>('openai');
  const isCustom = provider?.id === 'custom';

  const finish = async () => {
    await kv.set('onboarded', true);
    onDone();
  };

  const body = () => {
    switch (step) {
      case 'welcome':
        return (<>
          <h1>Welcome to 0x Sneaky Alpha</h1>
          <p class="subtle">A BYOK app that takes back your data sovereignty.</p>
          <p class="subtle">Bring your own key. Chats, settings and keys stay on this iPhone; requests go straight to the provider you choose.</p>
          <div class="spacer" />
          <button class="btn primary" data-testid="ob-start" onClick={() => setStep('name')}>Get Started</button>
        </>);
      case 'name':
        return (<>
          <h1>What should I call you?</h1>
          <p class="subtle">Your name stays on this device and is only used to greet you.</p>
          <input class="input" placeholder="Your name" maxLength={MAX_NAME_LENGTH} data-testid="ob-name" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          <div class="spacer" />
          <div class="btn-row">
            <button class="btn" onClick={() => setStep('provider')}>Skip</button>
            <button class="btn primary" style={{ flex: 1 }} data-testid="ob-name-next" onClick={async () => { const n = cleanName(name); await kv.set('profile.name', n); onName(n); setStep('provider'); }}>Continue</button>
          </div>
        </>);
      case 'provider':
        return (<>
          <h1>Select Provider</h1>
          <p class="subtle">Choose an AI provider to get started. You can add custom endpoints later in Settings.</p>
          {BUILT_IN_PROVIDERS.map((p) => (
            <button class="row" key={p.id} data-testid={`ob-provider-${p.id}`} onClick={() => { setProvider(p); setStep('key'); }}>
              <span class="grow">{p.label}{p.note && <span class="subtle"> · {p.note}</span>}</span>
              <span class={corsClass(p.cors)}>{CORS_LABEL[p.cors]}</span>
            </button>
          ))}
          <button class="row" data-testid="ob-provider-custom" onClick={() => {
            setProvider({ id: 'custom', label: 'Custom', protocol: 'openai', defaultBaseUrl: 'https://api.example.com/v1', keyRequired: false, builtIn: false, cors: 'custom' });
            setStep('key');
          }}>
            <span class="grow">Custom <span class="subtle">· OpenAI / Anthropic / Google-compatible</span></span>
          </button>
          <div class="spacer" />
          <button class="btn" onClick={finish}>Skip for now</button>
        </>);
      case 'key':
        return (<>
          <h1>{isCustom ? 'Custom Provider' : provider!.keyRequired ? 'API Key' : 'Server URL'}</h1>
          <p class="subtle">{isCustom ? 'Connect a custom endpoint.' : provider!.keyRequired ? `Enter your API key for ${provider!.label}.` : 'Enter your Ollama server URL.'}</p>
          {isCustom && (
            <select class="select" style={{ marginBottom: 8 }} data-testid="ob-protocol" value={protocol} onChange={(e) => setProtocol((e.target as HTMLSelectElement).value as CustomProvider['protocol'])}>
              <option value="openai">OpenAI-compatible</option>
              <option value="anthropic">Anthropic-compatible</option>
              <option value="gemini">Google-compatible</option>
            </select>
          )}
          {(provider!.keyRequired || isCustom) && (
            <input class="input" type="password" autocomplete="off" autocapitalize="off" spellcheck={false} placeholder="Enter your API key…" data-testid="ob-key" value={key} onInput={(e) => setKey((e.target as HTMLInputElement).value)} />
          )}
          <input class="input" style={{ marginTop: 8 }} type="url" autocapitalize="off" spellcheck={false} placeholder={provider!.defaultBaseUrl} data-testid="ob-url" value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} />
          {provider!.cors === 'blocked' && <div class="banner warn">{provider!.note}</div>}
          {status && <div class="banner err">{status}</div>}
          <div class="spacer" />
          <div class="btn-row">
            <button class="btn" onClick={() => setStep('provider')}>Back</button>
            <button class="btn primary" style={{ flex: 1 }} data-testid="ob-key-next" disabled={isCustom && !/^https?:\/\//i.test(url.trim())} onClick={async () => {
              setStatus('');
              let p = provider!;
              if (isCustom) {
                const c: CustomProvider = { id: newId('custom-').slice(0, 19), label: 'Custom', protocol, baseUrl: url.trim() };
                await updateSettings((s) => ({ customProviders: [...s.customProviders, c] }));
                p = customToInfo(c);
                setProvider(p);
              } else if (url.trim()) {
                await updateSettings((s) => ({ providerUrls: { ...s.providerUrls, [p.id]: url.trim() } }));
              }
              if (key.trim()) await setSecret(secretName.provider(p.id), key);
              setStep('model');
              try { await refreshModels({ ...p, defaultBaseUrl: url.trim() || p.defaultBaseUrl }); } catch (e) { setStatus((e as Error).message); }
            }}>Continue</button>
          </div>
        </>);
      case 'model': {
        const list = settings.models[provider!.id] ?? [];
        return (<>
          <h1>Select Model</h1>
          <p class="subtle">Pick the model you want to chat with.</p>
          {status && <div class="banner err" data-testid="ob-model-error">{status}</div>}
          <div style={{ maxHeight: '45vh', overflowY: 'auto' }}>
            {list.map((m) => <button key={m} class={'opt' + (m === model ? ' sel' : '')} onClick={() => setModel(m)}>{m}</button>)}
          </div>
          <input class="input" style={{ marginTop: 8 }} placeholder="…or type a model id" autocapitalize="off" spellcheck={false} data-testid="ob-model" value={model} onInput={(e) => setModel((e.target as HTMLInputElement).value)} />
          <div class="spacer" />
          <div class="btn-row">
            <button class="btn" onClick={() => setStep('key')}>Back</button>
            <button class="btn primary" style={{ flex: 1 }} data-testid="ob-model-next" disabled={!model.trim()} onClick={async () => {
              await addModel(provider!.id, model.trim());
              await updateSettings({ defaultProviderId: provider!.id, defaultModel: model.trim() });
              setStep('done');
            }}>Continue</button>
          </div>
        </>);
      }
      case 'done':
        return (<>
          <h1>You're All Set!</h1>
          <p class="subtle">Start chatting with full control over your data and privacy.</p>
          <div class="spacer" />
          <button class="btn primary" data-testid="ob-finish" onClick={finish}>Start chatting</button>
        </>);
    }
  };

  return <div class="onboard" data-testid="onboarding">{body()}</div>;
}
