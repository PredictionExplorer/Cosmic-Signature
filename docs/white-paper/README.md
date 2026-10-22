# Canonical English white paper

[Read white paper 1.3](cosmic-signature-white-paper-v1.3.md) or
[download its PDF](cosmic-signature-white-paper-v1.3.pdf).

The English Markdown is the canonical source. It explains proposed contract V3,
records the current proxy's V1 and V2 deployment history, compares V2 with V3,
and lists the substantive corrections to the previous English paper 1.0.
Its contract revision and deployment status are explicit: V2 is still active in
the fixed-block snapshot. A paper version is not a contract deployment.

The previous papers and translations remain unchanged in the frontend
repository. This directory does not synchronize or publish website content.
Future translations should identify the canonical English edition they follow.

## Source evidence

- [Deployment snapshot](deployment-snapshot.json): raw getter values at Arbitrum
  block 515784460, deployment/upgrade transaction references, exact-match
  Sourcify records, runtime hashes, and baseline source comparisons. All numeric
  quantities are decimal strings in their contract units.
- [Validation record](review-validation.json): compilation, the four quick-test
  configurations, unchanged Solidity instructions, and a local fork rehearsal
  with its explicit precompile simulation limits.
- [Documentation review](../documentation-review-v3.md): review scope, claim
  references, corrections, validation results, and per-file coverage.
- [V2-to-V3 technical changes](../v3-vs-v2-changes.md): detailed behavior, ABI,
  initialization, storage, and optional wallet replacement.

The snapshot is historical evidence, not a live configuration feed. Its source
URLs use Sourcify API v2. To recheck it, read the EIP-1967 implementation slot,
the listed getters, and runtime bytecode at its exact block; compare source
files with its recorded baseline commit and runtime hashes with the verified
records. Do not overwrite a historical snapshot with current values and retain
its old date.

## Build and verify the PDF

Install Node.js, Pandoc, and Tectonic. From any directory:

```bash
node /path/to/Cosmic-Signature/docs/white-paper/build.mjs
node /path/to/Cosmic-Signature/docs/white-paper/build.mjs --check
```

The build derives its title, author, date, sections, tables, and content from
the Markdown. It records the source, build-script, and PDF SHA-256 digests in
`artifact-manifest.json`. The check verifies those digests; it does not certify
contract accuracy or visual layout. Re-render and inspect the PDF after content
changes, and commit the source, PDF, and manifest together. Tool versions are
recorded because PDF bytes can depend on the toolchain.

Substantive future revisions should receive a new paper version and extend its
revision history. Keep published versions citable. Recheck current on-chain
state before describing a proposed upgrade as deployed, and record any new
implementation or wallet address with its transaction evidence.
