# Welcome to 0x Sneaky Alpha for iPhone 👋

**Your AI chat app, now on your iPhone — no App Store needed.**

0x Sneaky Alpha is a friendly little chat app where *you* pick the AI. Bring your own API key from the provider you like — Anthropic, Google, OpenAI, and more — plug it in once, and start chatting. Your conversations and your keys stay on your phone, not on somebody else's server.

It's the iPhone companion to the 0x Sneaky Alpha Android app: same idea, same neon welcome, made to feel right at home on iOS.

## 🚀 Try it right now

No downloads, no accounts, no Mac, no developer anything:

1. Open **[0x-sneaky-alpha.vercel.app](https://0x-sneaky-alpha.vercel.app)** in **Safari** on your iPhone.
2. Tap **Share → Add to Home Screen → Add**.
3. Open **0x Sneaky Alpha** from your Home Screen — it runs full screen, just like a regular app.
4. Pick a provider, paste your API key, pick a model, and say hello.

Full walkthrough, tips, and troubleshooting: **[INSTALL-IOS.md](INSTALL-IOS.md)** 📖

## ✨ What's inside

- **Lots of providers:** Google (Gemini), OpenAI, Anthropic, DeepSeek, Qwen, Groq, Ollama, Open Router, OpenCode Go — plus your own custom endpoints if they speak OpenAI, Anthropic, or Google style.
- **Streaming replies** that arrive word by word, with a stop button and an easy model picker.
- **Attachments:** photos (HEIC is converted for you), text and code files, and PDFs on the providers that accept them.
- **Branching chats:** edit a message or regenerate a reply without losing the old version — flip between branches with ‹ 1/2 ›.
- **Memory:** the app can remember things across chats, just like on Android.
- **Web search** built in, through your provider or Tavily, Brave, Serper, or SearXNG.
- **Remote MCP servers** over Streamable HTTP or SSE, if you like your tools fancy.
- **Export / import** your chats as JSON whenever you want a backup. (Keys are *never* included in an export.)
- **Works offline** for reading your chats. Sending a message needs a connection.

## 🔒 Your keys stay yours

This part matters, so here it is plainly:

- Chats, settings, and API keys are stored **only in the app's storage on your iPhone**.
- Each key is sent only to the provider it belongs to. There is no analytics and no middleman account.
- The one exception is **OpenCode Go**, which refuses direct browser calls — so those requests pass through this site's own small proxy (`web/api/proxy`, chat and models only). The proxy's code is right here in this repo for anyone to read: it forwards your key to OpenCode and logs and stores nothing.
- Want a lock on the door? **Settings → Security** lets you set a passphrase that encrypts your keys (AES-GCM, PBKDF2 with 600,000 rounds). You'll enter it when the app opens.

## 📱 iPhone vs 🤖 Android — same app, a few honest differences

Same welcome, same providers, same memory, same branching chats. A web app on iPhone can't do *everything* a native Android app can, because iOS doesn't allow it — so these stay Android-only:

- Local shell (PRoot sandbox)
- On-device models (llama.cpp)
- Scheduled tasks and background loops
- The on-device provider-setup API
- DuckDuckGo and Kagi web search (they need a server)

Everything else made the trip. If a provider can't be called from a browser at all (a CORS limit), the app tells you honestly — every provider row has a status badge, and **Settings → Providers → Test connection** checks it live from your phone. Anthropic and Google are confirmed working; OpenCode Go works through the built-in proxy.

## 🛠️ Build and test

For the curious and the contributors — welcome aboard:

```bash
cd web
npm install          # needs Node 20+
npm run typecheck
npm test             # unit tests
npm run build        # output in web/dist
npx playwright test --project=webkit-iphone   # end-to-end, iPhone + WebKit
```

`web/dist` is a plain static site with relative paths, so it hosts happily on any HTTPS static host (Vercel, Netlify, GitHub Pages), even from a sub-folder. Just note the OpenCode Go proxy needs the `web/api` functions, which Vercel runs out of the box.

## 📄 License

GPL-3.0, same as the rest of this repository. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).

---

*Made for people who like their AI the way they like their coffee: their own keys, their own phone, their own business.* ☕
