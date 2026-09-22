# Dependencies

## Chromium (Chrome-for-Testing)

No Cache Browser launches a **pinned Chromium build** from Google’s Chrome-for-Testing channel (Linux `chrome-linux64` zip). Pin details live in [`config/chromium-linux.json`](../config/chromium-linux.json); fetch with `npm run fetch-chromium` into gitignored `third_party/chromium/`.

- **Our product** is the NCB host (TypeScript/Node CDP shell), not Google Chrome.
- **MIT** on this repository covers No Cache Browser source only.
- Chromium/CfT is a **separate dependency** with its own license and notices (Chromium / Google terms). Do not treat the binary as MIT-licensed NCB code.
- System Google Chrome/Chromium is **not** the default runtime; see [LINUX.md](./LINUX.md).
