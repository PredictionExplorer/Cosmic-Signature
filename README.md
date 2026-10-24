# Cosmic Signature

**Cosmic Signature** is an on-chain, last-bidder-wins game on **Arbitrum**.
Players bid with **ETH** or **Cosmic Signature Token (CST)**. The first bid starts the bidding round countdown; later bids extend its stored deadline. When the deadline passes, the last bidder can claim the **main prize**. After an additional timeout, another caller can claim it instead. Successful finalization also distributes **secondary prizes**: ETH, CST, and **Cosmic Signature NFTs**.

The ecosystem also includes NFT staking, donations, charity and marketing allocations, and CST-based DAO governance.

This document provides an overview and links to detailed docs. To avoid stale copies, game rules, prize amounts, and parameter values are described only in the linked docs and in the contract source code.

---

## Documentation

- Canonical English white paper 1.3: [source and PDF](docs/white-paper/README.md). It explains the V3 design, deployment history, and changes from the previous paper. The old papers and translations remain in the frontend repository.
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
