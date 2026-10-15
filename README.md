# Cosmic Signature

**Cosmic Signature** is an on-chain, last-bidder-wins game on **Arbitrum**.
Players bid with **ETH** or **Cosmic Signature Token (CST)**. Each bid extends the bidding round deadline. When the deadline passes, the last bidder can claim the **main prize**, and other participants receive **secondary prizes**: ETH, CST, and **Cosmic Signature NFTs**.

The ecosystem also includes NFT staking, donations, charity and marketing allocations, and CST-based DAO governance.

This document provides an overview and links to detailed docs. To avoid stale copies, game rules, prize amounts, and parameter values are described only in the linked docs and in the contract source code.

---

## Documentation

- Endurance Champion and Chrono-Warrior: [docs/endurance-chrono-README.md](docs/endurance-chrono-README.md).
- Prizes: [docs/cosmic-signature-game-prizes.md](docs/cosmic-signature-game-prizes.md).
- Contract class diagram and calls: [docs/cosmic-signature-contracts-class-diagram-and-calls.svg](docs/cosmic-signature-contracts-class-diagram-and-calls.svg).
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
| `CosmicSignatureToken` (CST) | ERC-20 token minted and burned by the Game. It provides DAO voting power. |
| `CosmicSignatureNft` (COSMIC) | ERC-721 NFT minted by the Game as prizes. |
| `RandomWalkNFT` (RWLK) | A previously deployed third-party ERC-721 NFT. Bidding with it halves the ETH bid price, once per NFT. |
| `PrizesWallet` | Holds some ETH prizes and donated ERC-20 tokens and ERC-721 NFTs until winners withdraw or claim them. |
| `StakingWalletCosmicSignatureNft` | Cosmic Signature NFT staking. Stakers share an ETH reward. |
| `StakingWalletRandomWalkNft` | Random Walk NFT staking. Stakers are eligible for raffle prizes. |
| `CharityWallet` | Receives ETH donations for charity. |
| `MarketingWallet` | Receives CST for marketing. |
| `CosmicSignatureDao` | CST-based governance. |

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

Test runners are in [test/runners/](test/runners/). They test multiple combinations of conditional compilation options. For example:

```bash
npm run hardhat-test-full
```

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
