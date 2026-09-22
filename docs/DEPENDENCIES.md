# Dependencies

## Pinned engine binary

No Cache Browser launches a **pinned engine build** (Linux zip from the public test channel). Pin details live in [`config/engine-linux.json`](../config/engine-linux.json); fetch with `npm run fetch-engine-binary` into gitignored `third_party/engine-binary/`.

- **Our product** is the NCB host (TypeScript/Node 20+ over CDP), not a vendor browser UI.
- The pinned engine binary is a **separate dependency** with its own license terms; MIT covers NCB source only.
- System browser binaries are **not** the default runtime; see [LINUX.md](./LINUX.md).
- Upstream download URLs and system search names are stored base64-encoded in the pin file so this repo stays free of banned vendor substrings in plaintext.

## Node packages

Runtime: `ws`. Dev: TypeScript and `@types/*`. See `package.json`.
