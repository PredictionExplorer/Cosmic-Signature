# Solidity Upgrade Diff

A small Next.js interface for reviewing Solidity-only upgrade diffs.

The app is data-driven: versions and logical file mappings are configured in
`src/lib/versionRegistry.ts`. The server reads Solidity source files from the
repository root and exposes a safe, read-only diff API.

## Run

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Add Future Versions

Add a version entry in `src/lib/versionRegistry.ts`.

Each version maps a stable logical file id, such as `game` or `bidding`, to a
Solidity source path. That lets reviewers compare:

- original to V2;
- V2 to V3;
- V3 to V5;
- any future version pair.

Only `.sol` files are allowed, and the current registry intentionally excludes
tests and non-Solidity artifacts.
