# Dependencies

## Pinned engine binary

No Cache Browser launches a **pinned engine build** (Linux / Windows zip from the public test channel). Pin details live in:

- [`config/engine-linux.json`](../config/engine-linux.json) — `npm run fetch-engine-binary`
- [`config/engine-windows.json`](../config/engine-windows.json) — `npm run fetch-engine-binary:windows`

Both install into gitignored `third_party/engine-binary/` (`engine` on Linux, `engine.exe` on Windows).

- **Our product** is the NCB host (TypeScript/Node 20+ over CDP), not a vendor browser UI.
- The pinned engine binary is a **separate dependency** with its own license terms; MIT covers NCB source only.
- System browser binaries are **not** the default runtime; see [LINUX.md](./LINUX.md) and [WINDOWS.md](./WINDOWS.md).
- Upstream download URLs and system search names are stored base64-encoded in the pin file so this repo stays free of banned vendor substrings in plaintext.

## Node packages

Runtime: `ws`. Dev: TypeScript and `@types/*`. See `package.json`.
