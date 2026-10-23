# Cosmic Signature

**Cosmic Signature** is an on-chain, last-bidder-wins game on **Arbitrum**.
Players bid with **ETH** or **Cosmic Signature Token (CST)**. The first bid starts the bidding round countdown; later bids extend its stored deadline. When the deadline passes, the last bidder can claim the **main prize**. After an additional timeout, another caller can claim it instead. Successful finalization also distributes **secondary prizes**: ETH, CST, and **Cosmic Signature NFTs**.

The ecosystem also includes NFT staking, donations, charity and marketing allocations, and CST-based DAO governance.

This document provides an overview and links to detailed docs. To avoid stale copies, game rules, prize amounts, and parameter values are described only in the linked docs and in the contract source code.

---

## Documentation

- Canonical English white paper 1.3: [source and PDF](docs/white-paper/README.md). It explains the proposed V3 design, the chain-backed V1/V2 history, and changes from the previous paper. The old papers and translations remain in the frontend repository.
- Documentation review and code coverage inventory: [docs/documentation-review-v3.md](docs/documentation-review-v3.md).
- Endurance Champion and Chrono-Warrior: [docs/endurance-chrono-README.md](docs/endurance-chrono-README.md).
- Prizes: [docs/cosmic-signature-game-prizes.md](docs/cosmic-signature-game-prizes.md).
- Historical V1 class diagram and calls: [docs/cosmic-signature-contracts-class-diagram-and-calls.svg](docs/cosmic-signature-contracts-class-diagram-and-calls.svg). This partial historical diagram does not show current V3 inheritance or per-round token holders; use the V3 change register and current source for those relationships.
- Contracts and their functional requirements: [docs/cosmic-signature-contracts-functional-requirements.md](docs/cosmic-signature-contracts-functional-requirements.md).
- Numbered comments, such as `Comment-202501022`, used throughout the codebase: [docs/numbered-comments.md](docs/numbered-comments.md).
- Testing the DAO with the Tally app: [docs/testing-cosmic-signature-dao-with-the-tally-app.md](docs/testing-cosmic-signature-dao-with-the-tally-app.md).
- Audit considerations: [docs/cosmic-signature-contracts-audit-considerations.md](docs/cosmic-signature-contracts-audit-considerations.md).
- Default parameter values: `contracts/production/libraries/CosmicSignatureConstants.sol`. Some of them are calculated in [contract-configuration-params-calculation/](contract-configuration-params-calculation/).
- Changes made in the latest Game contract version, including what frontend and backend developers need to change: [docs/v3-vs-v2-changes.md](docs/v3-vs-v2-changes.md).

---

## Contracts

All production contracts are in [contracts/production/](contracts/production/).

| Contract | Description |
|----------|-------------|
| `CosmicSignatureGame` | The Game contract: bidding, main prize claim, prize distribution, statistics, and owner-only configuration. It is an upgradeable (UUPS) proxy. Its implementation versions are `CosmicSignatureGame` (V1), `CosmicSignatureGameV2`, and `CosmicSignatureGameV3`, each composed of abstract contracts such as `Bidding*`, `BidStatistics*`, `MainPrize*`, `SecondaryPrizes*`, and `SystemManagement*`. |
| `CosmicSignatureToken` (CST) | ERC-20 token minted by the Game. The Game can burn bid costs; holders and approved spenders also have inherited burn methods. Delegated balances provide DAO voting power. |
| `CosmicSignatureNft` (COSMIC) | ERC-721 NFT minted by the Game as prizes. |
| `RandomWalkNFT` (RWLK) | A previously deployed third-party ERC-721 NFT. Bidding with it halves the ETH bid price, once per NFT. |
| `PrizesWallet` | Holds secondary ETH prizes and donated ERC-721 NFTs, records round beneficiaries and retrieval deadlines, and controls donated ERC-20 claims through per-round token holders. |
| `DonatedTokenHolder` | Holds a round's donated ERC-20 tokens; the creating `PrizesWallet` controls transfers to authorized claimants. |
| `StakingWalletCosmicSignatureNft` | Cosmic Signature NFT staking. Stakers share an ETH reward. |
| `StakingWalletRandomWalkNft` | Random Walk NFT staking. Stakers are eligible for raffle prizes. |
| `CharityWallet` | Receives ETH; a separate permissionless call forwards its balance to the owner-configured beneficiary. |
| `MarketingWallet` | Receives CST for distribution by an owner-appointed treasurer. |
| `CosmicSignatureDao` | CST-based governance over assets and permissions it actually controls; deployment alone does not give it ownership of other contracts. |

---

## Development

### Prerequisites

- Node.js v20+ and npm.
- The binary `solc` compiler of the version specified in `hardhat.config.js`. See Comment-202409011 in that file for how to install it.

### Setup

```bash
git clone <this-repo>
cd Cosmic-Signature
npm ci
```

### Dependency security review

The October 22, 2026 review updated compatible tool dependencies and removed the
critical Handlebars finding (`4.7.8` to `4.7.10`). It also updated the HTTP, XML,
YAML, glob-expansion, cookie, and cryptographic utility packages where the
existing consumer ranges permitted a patched version. Hardhat remains `2.27.2`,
and the compiled OpenZeppelin packages remain `5.4.0`.

Two exact consumer pins require narrow, same-major overrides until upstream
releases remove those pins:

| Consumer | Pinned dependency | Override | Reason |
| --- | --- | --- | --- |
| `@nomicfoundation/ignition-core@0.15.15` | `lodash@4.17.21` | `4.18.1` | Fix template code injection and prototype pollution; no newer compatible consumer release. |
| `@ethersproject/providers@5.8.0` | `ws@8.18.0` | `8.21.0` | Fix memory disclosure and resource exhaustion; no newer ethers v5 provider release. |

A clean installation and full dependency-tree validation were performed with
npm `10.9.8`, without changing the system package manager. npm `11.3.0` incorrectly
reports the deduplicated `ws@8.21.0` as invalid even though the reported required
version is also `8.21.0`; use the verified npm version when checking this tree:

```bash
npm exec --yes --package=npm@10.9.8 -- npm ci
npm exec --yes --package=npm@10.9.8 -- npm ls --all
```

After the dependency update, all 29 credential-handling tests passed and the
quick suite passed all four conditional-compilation modes (200 + 200 + 200 +
201 test executions). On macOS the `/usr/bin/bash` wrapper is unavailable, so
the documented `LONG_TEST_MODE_CODE=1 bash test.bash -b` equivalent was used.
Focused ESLint checks for the auction tests and V4 inspection/rehearsal tasks
also passed; the declared `eslint-plugin-chai-friendly` is restored by `npm ci`.

The full audit changed from 80 package entries (1 critical, 32 high, 28 moderate,
19 low) to 57 (0 critical, 17 high, 19 moderate, 21 low). These are affected
package entries, including propagated findings, not 57 independent exploits.
The remaining findings are not suppressed and the full audit still fails.
Every dependency is declared under `devDependencies`, so `--omit=dev` alone
would conceal the relevant Solidity dependencies as well as tools.

The remaining high-severity findings have these boundaries:

| Dependency family | Actual exposure in this repository | Remediation boundary |
| --- | --- | --- |
| Nitro's nested OpenZeppelin `4.7.3` packages | Not present in the generated Solidity compiler input. Only Nitro's standalone `ArbSys` and `ArbGasInfo` interfaces are imported; the game's OpenZeppelin source is `5.4.0`. | Nitro and its upgrade executor pin `4.7.3`. Replacing that package or reviewing its full upgrade path is separate from updating the compiled game libraries. |
| Hardhat's `undici` 5.x and its `@fastify/busboy` | Development RPC/download transport; a hostile endpoint/response can affect tooling. It is not deployed EVM code or served by the gallery. | No patched 5.x path. Hardhat 2 still selects this major; a tooling migration needs separate compatibility work. The upgraded OpenZeppelin tool's independent undici 6.x copy is patched. |
| `adm-zip` 0.4.x | Hardhat's Windows compiler ZIP extraction path. This project uses a pinned native compiler; CI installs and verifies that binary directly. | Fixed versions are outside Hardhat's pre-1.0 compatible range. Do not force an untested archive-library replacement. |
| `serialize-javascript` 6.x | Mocha's parallel-worker option serialization, using the local test configuration. Tests already execute repository code; auction participant data is not supplied to this path. | The fix requires a new major that Mocha 10 does not accept. Migrating the coverage and test tooling requires compatibility testing. |
| `tmp` 0.0.x | Installed through solc-js SMT support and Nitro's patch tooling; not the configured native Solidity compiler execution path. | Consumers pin old pre-1.0 APIs. Updating requires a compatible consumer replacement or a separately tested migration. |
| `braces` and its glob/watch consumers | Local repository globs and test-file discovery, not public gallery requests. | The latest upstream `braces` release is still affected; no patched compatible version exists. |

The remaining low/moderate entries include inherited ethers v5 cryptographic
utilities, Hardhat's telemetry/UUID helpers, and downstream packages that carry
those findings. These boundaries explain the present impact; they are not a
blanket assurance that development tooling is safe. A Hardhat 3/toolbox migration
and replacement of the old coverage/Nitro dependency paths should be reviewed as
a dedicated change with the complete upgrade and conditional-compilation suites.

### Compile

```bash
npx hardhat compile
```

See also: [contracts-compiling/](contracts-compiling/)

### Run Tests

Test runners are in [test/runners/](test/runners/). The quick runner tests four combinations of conditional compilation options with the shortest long-test mode:

```bash
npm run hardhat-test-quick
```

On systems without `/usr/bin/bash`, run the same quick sequence explicitly:

```bash
cd test/runners
LONG_TEST_MODE_CODE=1 bash test.bash -b
```

Longer modes are available as `hardhat-test-medium` and `hardhat-test-full`.

### Local Development Node

```bash
bash scripts/hardhat-node.bash
```

---

## Deployment and Upgrades

- Deployment: [tasks/docs/Cosmic-Signature-Contracts-Deployment-And-Registration.md](tasks/docs/Cosmic-Signature-Contracts-Deployment-And-Registration.md).
- Game contract upgrade: [tasks/docs/Cosmic-Signature-Game-Contract-Upgrade-And-Re-Registration.md](tasks/docs/Cosmic-Signature-Game-Contract-Upgrade-And-Re-Registration.md).
- `PrizesWallet` replacement: [tasks/docs/Prizes-Wallet-Contract-Upgrade-And-Re-Registration.md](tasks/docs/Prizes-Wallet-Contract-Upgrade-And-Re-Registration.md).

Deployment and upgrade scripts are in [tasks/runners/](tasks/runners/). Their configuration files are in [tasks/config/](tasks/config/). Reports with deployed contract addresses are written to `tasks/output/`.

---

## License

CC0 1.0 -- see [LICENSE](LICENSE).
