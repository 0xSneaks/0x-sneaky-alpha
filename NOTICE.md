# Notice

0x Sneaky Alpha is a modified version of **Agora** (https://github.com/newo-ether/Agora), copyright the Agora authors, released under the GNU General Public License v3.0. This project is not affiliated with or endorsed by the original author.

## Modifications

This repository is a single snapshot of the web app, published without the original project's history. Relative to the original project:

- A new web app (`web/`) that brings the Android app's experience to iPhone as an installable PWA: neon intro, name step and time-of-day greeting, multi-provider streaming chat, branching conversations, memory and web-search tools, remote MCP servers, and JSON export/import.
- Branding changed to 0x Sneaky Alpha (the Android app's `app_name`) across the page title, manifest, Home Screen label, intro, greeting, About screen, docs and file names.
- Attachments: photos (resized to 2048 px, HEIC converted to JPEG), text and code files inlined in the Android app's `--- File: name ---` format, and PDFs sent natively to the providers that accept them.
- An OpenCode Go proxy (`web/api/proxy`) implemented as Vercel Edge Functions, because OpenCode Go blocks direct browser calls. It relays only the chat-completions and models endpoints, forwards only the request body and the Authorization, Content-Type and Accept headers, and contains no logging, storage or environment variables.
- The original project is credited only in this notice and on the app's About screen. Those two credits are kept on purpose. Do not remove them.

The Android app this web app is based on lives in a separate repository; this repository contains only the web app.
