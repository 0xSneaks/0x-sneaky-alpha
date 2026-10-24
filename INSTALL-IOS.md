# Installing 0x Sneaky Alpha on your iPhone 📱

A step-by-step manual for getting 0x Sneaky Alpha onto your iPhone, setting it up, and fixing the small things that can go sideways. No App Store, no Mac, no developer account — just Safari and a few taps.

**App address:** https://0x-sneaky-alpha.vercel.app

## What you need

- An iPhone with a current version of iOS and **Safari**.
- An internet connection for setup and for sending messages (reading old chats works offline).
- An **API key** from at least one AI provider — for example Anthropic or Google. You create the key on the provider's own website and paste it into the app. The key stays on your phone.

## Step 1 — Install the app

1. Open **Safari** on your iPhone. (It has to be Safari — other browsers on iPhone can't add apps to the Home Screen the same way.)
2. Go to **0x-sneaky-alpha.vercel.app**.
3. Tap the **Share** button (the square with an arrow pointing up).
4. Scroll down and tap **Add to Home Screen**.
5. Tap **Add** in the top corner.
6. Find the **0x Sneaky Alpha** icon on your Home Screen and open it. The neon intro plays, full screen, just like a regular app.

## Step 2 — First-time setup

1. **Your name (optional):** the app greets you by name and by the time of day. Skip it if you like.
2. **Pick a provider:** choose the company whose AI you want to talk to — Anthropic and Google are confirmed working from iPhone.
3. **Paste your API key** for that provider. It is saved only in the app's storage on your phone and is sent only to that provider.
4. **Check it works:** go to **Settings → Providers →** your provider **→ Test connection**. "Connected" means your phone can reach it.
5. **Pick a model:** fetch the model list, or type a model id if you know one.
6. **Start chatting.** 🎉

You can add more providers later, one key each, and switch between them any time.

## Step 3 — Lock your keys (recommended)

Your keys are valuable — treat them like passwords.

1. Open **Settings → Security**.
2. Set a **passphrase**. The app encrypts your stored keys with it (AES-GCM).
3. From then on, you enter the passphrase when the app opens. Don't forget it: there is no recovery, because nobody else has your keys to recover them with.

## Using OpenCode Go

OpenCode Go refuses direct calls from a browser, so the app sends those requests through its own small built-in proxy on the site. Nothing extra for you to set up — add your OpenCode Go key and provider the same way as the others, and chat as normal. (The proxy's code is public in this repository: it forwards your key to OpenCode and logs and stores nothing.)

## Keeping the app up to date

Updates are automatic and free:

- When a new version is published, **close the app fully** (swipe it away in the app switcher) and **reopen it**. It picks up the new version itself.
- There is nothing to download from an app store, ever.

## Back up your chats

- **Export:** Settings → Data → **Export chats** → save the file somewhere safe (for example, Files or iCloud Drive).
- **Import:** Settings → Data → **Import**, and choose that file.
- Exports contain your chats only — **never your API keys** — so you'll re-enter keys on a new phone.

## Troubleshooting

**A provider fails its connection test.**
Some providers don't allow calls from a web browser (a rule called CORS), so they can't work on iPhone even with a correct key. The provider's badge in Settings shows its status. Anthropic, Google, and OpenCode Go (via the proxy) are the reliable picks on iPhone.

**A reply stopped halfway.**
iOS pauses web apps in the background. Keep the app on screen while it answers, and tap **↻** to regenerate if a reply got cut short.

**My chats and keys disappeared.**
That happens if the Home Screen app is deleted or Safari's website data is cleared — your data lives in the app's storage on the phone. Export your chats regularly if they matter to you, and don't clear Safari data for the app's site.

**The app won't add to the Home Screen.**
Make sure you opened the address in **Safari** (not an in-app browser inside another app) and that you're on the app's main page, then try Share → Add to Home Screen again.

## Removing the app

Press and hold the Home Screen icon → **Remove App → Delete App**. That also removes the app's stored chats and keys from the phone. Export first if you want to keep your chats.

---

*Stuck on something this manual doesn't cover? Open an issue on this repository and describe what you tapped and what happened — screenshots help.*
