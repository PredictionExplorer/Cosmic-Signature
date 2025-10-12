# Cosmic Signature

**Cosmic Signature** is an on-chain, last-bidder-wins game built on **Arbitrum**.
Players compete by placing bids with **ETH** or **Cosmic Signature Token (CST)**, extending the round deadline. When the timer expires, the last bidder wins the **main prize**. Along the way, participants earn **special prizes**, including **Cosmic Signature NFTs **, ETH, and CST rewards.

The ecosystem includes staking, donations to the game, charity allocations, and DAO governance to create a complete, community-driven game economy.

---

## Table of Contents
1. [Overview](#overview)
2. [Key Features](#key-features)
3. [Contract Modules](#contract-modules)
4. [Prizes](#prizes)
5. [Architecture & Flow](#architecture--flow)
6. [Installation & Development](#installation--development)
7. [Configuration & Constants](#configuration--constants)
8. [Deployment & Upgrades](#deployment--upgrades)
9. [Security Notes](#security-notes)
10. [License](#license)

---

## Overview
- **Network:** Arbitrum (testnet: Arbitrum Sepolia, mainnet: Arbitrum One).
- **Game type:** Last-bidder-wins auction with token asset generation.
- **Bidding assets:** ETH and CST.
- **NFT integration:** Random Walk NFT (discount bidding), Cosmic Signature NFT (ecosystem rewards).
- **Governance:** CST token powers the DAO.
- **Charity & Marketing:** Automatic ETH and CST allocations to dedicated wallets.

---

## Key Features
- **Rounds:**
  Each round has 3 stages: inactive, active before first bid, and active after first bid.
- **Bidding mechanics:**
  - ETH starts as a Dutch auction, then increases incrementally.
  - CST always follows a Dutch auction, restarting after each bid.
  - Random Walk NFT halves ETH bid cost (one-time use per NFT).
- **Prizes:** ETH, CST, and NFTs awarded to multiple winners at round end.
- **Staking:**
  - CosmicSignature NFT staking: ETH reward distribution.
  - RWLK staking: raffle eligibility for CosmicSignature NFT prizes.
- **DAO governance:** CST holders vote on key ecosystem decisions.
- **Charity & marketing:** Funds automatically allocated each round.

---

## Contract Modules
| Contract | Description |
|----------|-------------|
| **CosmicSignatureGame** | Core game logic: bidding, deadlines, main prize claims, prize distribution. |
| **Bidding, BidStatistics, SecondaryPrizes, MainPrize** | Submodules handling bid pricing, statistics, and prize mechanics. |
| **CosmicSignatureToken (CST)** | ERC-20 token; minted by the game for rewards and DAO voting power. |
| **CosmicSignatureNft (CSN)** | ERC-721 NFT; official NFT minted as rewards. |
| **RandomWalkNFT (RWLK)** | External ERC-721 NFT (not part of repo); used for discounted ETH bids. |
| **PrizesWallet** | Custody of secondary prizes and donations with withdrawal timeouts. |
| **CharityWallet** | Holds ETH allocations for donation to DAO-approved charity. |
| **MarketingWallet** | Holds CST allocations for marketing initiatives. |
| **CosmicSignatureDao** | Governance contract powered by CST. |
| **StakingWalletCosmicSignatureNft** | ETH reward distribution to NFT stakers. |
| **StakingWalletRandomWalkNft** | Staking with random NFT raffle eligibility. |
| **SystemManagement** | Owner-only configuration and system parameter updates. |

---

## Prizes
At round end, prizes are distributed as follows:

- **Main Prize Winner (Last Bidder)**
  - ETH share (main prize percentage)
  - 1 Cosmic Signature NFT
  - CST bonus

- **Last CST Bidder**
  - 1 Cosmic Signature NFT
  - CST bonus

- **Endurance Champion**
  - 1 Cosmic Signature NFT
  - CST bonus

- **Chrono-Warrior**
  - ETH share (chrono-warrior prize percentage)
  - 1 Cosmic Signature NFT
  - CST bonus

- **Bidders (raffles)**
  - An instant CST rewards for each bid
  - Randomly awarded ETH raffle prizes
  - Randomly awarded Cosmic Signature NFTs and CST bonuses

- **Stakers**
  - RW NFT stakers: raffle for Cosmic Signature NFTs and CST bonuses
  - CosmicSignature NFT stakers: ETH reward share

- **Ecosystem**
  - Marketing Wallet: CST allocation
  - Charity Wallet: ETH allocation

   Definition and examples of Chrono-Warrior & Endurance Champion are located [here](docs/endurance-chrono-README.md)
---

## Architecture & Flow
1. **Round starts inactive**.
2. At `roundActivationTime`, bidding opens. First bid must be ETH.
3. Each new bid:
   - Updates prices (Dutch auction or incremental).
   - Updates `mainPrizeTime`.
   - Rewards bidder with CST.
   - May update Endurance Champion & Chrono-Warrior stats.
4. When `mainPrizeTime` passes:
   - Last bidder can claim the main prize.
   - If unclaimed after timeout, anyone can claim.
5. Claiming ends the round: prizes distributed, next round initialized.

---

## Installation & Development
### Prerequisites
- Node.js v20+
- npm
- Git

### Setup
```bash
git clone <this-repo>
cd Cosmic-Signature
npm ci
````

### Compile

```bash
npx hardhat compile
```

### Run Tests

```bash
npx hardhat test
```

### Local Development Node

```bash
bash scripts/hardhat-node.bash
```

---

## Configuration & Constants

* **Deployment config files:** `tasks/config/deploy-cosmic-signature-contracts-<network>.json`
* Key parameters:

  * `roundActivationTime` – round start time
  * `mainPrizeTime` – deadline to claim prize
  * Bid pricing fractions, Dutch auction durations
  * Prize distribution percentages (main, chrono, charity, stakers, etc.)

A few constants and formulas are documented in **contract-configuration-params-calculation/**.

---

## Deployment & Upgrades

* **Deployment instructions:** [Cosmic-Signature-Contracts-Deployment-And-Registration.md](tasks/docs/Cosmic-Signature-Contracts-Deployment-And-Registration.md)
* **Upgrade instructions:** [Cosmic-Signature-Game-Contract-Upgrade-And-Re-Registration.md](tasks/docs/Cosmic-Signature-Game-Contract-Upgrade-And-Re-Registration.md)

Scripts for deployment and registration are located in:

* `tasks/runners/` (e.g. `run-deploy-cosmic-signature-contracts-arbitrumSepolia.bash`)
* Reports with deployed addresses are written to `output/`.

---

## Security Notes

* **Access control:** Owner-only for sensitive system management.
* **Reentrancy protection:** Applied to external state-changing functions.
* **Prize custody:** Secondary prizes escrowed in `PrizesWallet` until claimed.
* **Charity transfers:** Best-effort, non-blocking (won’t revert prize claim if transfer to Charity Wallet fails).
* **Randomness:** Multiple Arbitrum precompiles + fallback sources for unpredictable random numbers.

---

## License

CC0 1.0 — see [LICENSE](LICENSE).
