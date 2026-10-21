# 0x Sneaky Alpha for iPhone (web app)

0x Sneaky Alpha as an installable web app (PWA) for iPhone. Open it once in Safari, tap **Share → Add to Home Screen**, and it runs full screen like a normal app. No Mac, no App Store, no Apple developer account.

Same idea as the Android app: bring your own key, keep everything on your device.

## What's included

- **Neon intro, name step and time-of-day greeting**, like the Android app.
- **Providers:** Google (Gemini), OpenAI, Anthropic, DeepSeek, Qwen, Groq, Ollama, Open Router, OpenCode Go, plus custom OpenAI-, Anthropic- or Google-compatible endpoints.
- **Streaming replies**, a stop button, and a model picker (fetch models or type an id).
- **Attachments:** photos (resized to 2048 px, HEIC becomes JPEG), text and code files (added to the message like on Android), and PDFs for Anthropic, Google, OpenAI and Open Router.
- **Branching:** edit a message or regenerate a reply without losing the old branch. Switch with ‹ 1/2 ›.
- **Memory:** the same memory tools as Android (memory files + active memory).
- **Web search:** the provider's built-in search (Google, Anthropic, Open Router), or Tavily, Brave, Serper, SearXNG.
- **Remote MCP servers** over Streamable HTTP or SSE.
- **Export / import** chats as JSON (keys are never exported).
- **Works offline** for reading your chats. Sending needs a connection.

## Privacy and security

- Chats, settings and API keys are stored in this app's storage on your iPhone (IndexedDB).
- Each key is sent only to the provider it belongs to. No analytics. The one exception is OpenCode Go, which blocks direct browser calls: on a Vercel deployment it goes through this site's own proxy function (`web/api/proxy`, chat and models endpoints only, no logging or storage in the code), so that key passes through the deployment on its way to OpenCode.
- Optional **passphrase lock** (Settings → Security) encrypts your keys with AES-GCM (PBKDF2, 600,000 rounds). Without it, keys are stored unencrypted in the app's storage.

## Which providers work from a browser

A web app can only call a provider that allows browser requests (CORS). Each provider row shows a badge, and **Settings → Providers → Test connection** checks it from your phone.

| Provider | Status |
|---|---|
| Anthropic, Google | Works (checked live) |
| OpenAI, Open Router | Expected to work (public reports) |
| DeepSeek, Qwen, Groq | Not yet checked. Use Test connection |
| OpenCode Go | Via this site's own proxy (built in; works where the `api/` functions are deployed, e.g. Vercel) |
| Ollama | Your server must allow this site (`OLLAMA_ORIGINS`) and use HTTPS |

## Not available on iPhone

iOS doesn't allow these in a web app, so they stay Android-only:

- Local shell (PRoot sandbox)
- On-device models (llama.cpp)
- Scheduled tasks and loops that run in the background
- The on-device provider-setup API
- DuckDuckGo and Kagi web search (they need a server)

## Build and test

Needs Node 20+.

```
cd web
npm install
npm run typecheck
npm test            # unit tests
npm run build       # output in web/dist
npx playwright test --project=webkit-iphone   # end-to-end, iPhone + WebKit
```

`web/dist` is a static site. Host it on any HTTPS static host (GitHub Pages, Vercel, Netlify). The build uses relative paths, so it also works from a sub-folder.

See [INSTALL-IPHONE.md](INSTALL-IPHONE.md) for install steps.

## License

GPL-3.0, same as the rest of this repository. See [LICENSE](../LICENSE) and [NOTICE.md](../NOTICE.md).
