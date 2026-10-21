// Passphrase prompt shown at launch when keys are encrypted. Licensed under GPL-3.0.
import { useState } from 'preact/hooks';
import { eraseSecrets, unlock } from '../core/secrets';

export function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form class="lock" data-testid="lock-screen" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      setErr('');
      if (await unlock(pass)) onUnlocked(); else setErr('Wrong passphrase');
      setBusy(false);
    }}>
      <h2>🔒 0x Sneaky Alpha is locked</h2>
      <p class="subtle">Enter your passphrase to unlock your API keys.</p>
      <input class="input" type="password" autocomplete="current-password" data-testid="unlock-pass" value={pass} onInput={(e) => setPass((e.target as HTMLInputElement).value)} />
      {err && <p class="err" style={{ color: 'var(--danger)' }}>{err}</p>}
      <div class="btn-row" style={{ justifyContent: 'center', marginTop: 10 }}>
        <button class="btn primary" type="submit" data-testid="unlock" disabled={busy || !pass}>{busy ? 'Unlocking…' : 'Unlock'}</button>
      </div>
      <p style={{ marginTop: 30 }}>
        <button type="button" class="btn danger" onClick={async () => {
          if (confirm('Erase all saved API keys? Your chats are kept.')) { await eraseSecrets(); onUnlocked(); }
        }}>Forgot passphrase? Erase keys</button>
      </p>
    </form>
  );
}
