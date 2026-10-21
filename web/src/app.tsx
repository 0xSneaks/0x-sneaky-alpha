// 0x Sneaky Alpha web app root. Licensed under GPL-3.0.
import { useCallback, useEffect, useState } from 'preact/hooks';
import { Intro } from './ui/Intro';
import { ChatScreen } from './ui/ChatScreen';
import { Onboarding } from './ui/Onboarding';
import { LockScreen } from './ui/LockScreen';
import { kv } from './core/db';
import { initChat } from './core/chat';
import { loadSettings } from './core/settings';
import { isUnlocked, onLockChange } from './core/secrets';
import { isIos, isStandalone, requestPersistentStorage } from './core/platform';
import { useStore } from './core/store';
import { toastStore } from './ui/toast';
import { installFeatures } from './features';

type Phase = 'loading' | 'locked' | 'onboarding' | 'ready';

export function App() {
  const [introDone, setIntroDone] = useState(false);
  const [phase, setPhase] = useState<Phase>('loading');
  const [name, setName] = useState('');
  const toastText = useStore(toastStore);
  const onIntroDone = useCallback(() => setIntroDone(true), []);

  const route = useCallback(async () => {
    if (!(await isUnlocked())) return setPhase('locked');
    setPhase((await kv.get<boolean>('onboarded')) ? 'ready' : 'onboarding');
  }, []);

  useEffect(() => {
    (async () => {
      await loadSettings();
      installFeatures();
      await initChat();
      setName((await kv.get<string>('profile.name')) ?? '');
      await route();
      requestPersistentStorage();
    })();
    return onLockChange(() => { route(); });
  }, [route]);

  const standalone = isStandalone();
  return (
    <div class="app-root" data-standalone={String(standalone)}>
      {!introDone && <Intro onDone={onIntroDone} />}
      {phase === 'onboarding' && !standalone && isIos() && <InstallHint />}
      {phase === 'locked' && <LockScreen onUnlocked={route} />}
      {phase === 'onboarding' && <Onboarding onName={setName} onDone={() => setPhase('ready')} />}
      {phase === 'ready' && <ChatScreen name={name} onName={setName} />}
      {toastText && <div class="toast" role="status" data-testid="toast">{toastText}</div>}
    </div>
  );
}

export function InstallHint() {
  return <div class="banner" style={{ margin: '10px 14px 0' }} data-testid="install-hint">Install: tap <b>Share</b> → <b>Add to Home Screen</b>.</div>;
}
