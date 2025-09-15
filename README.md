## Cosmic Signature

On-chain, last‑bidder‑wins game on Arbitrum. Bid with ETH or CST, extend the deadline, and if the deadline passes while you’re last, you win the round. Along the way, players earn special prizes (including NFTs), and CSN stakers share ETH rewards.

### How it works

- **Rounds and deadline**: Each round becomes active at `roundActivationTime`. The first bid must be in ETH and starts the deadline and pricing. Every subsequent bid extends the deadline. When the deadline arrives, the last bidder has the right to claim the main prize. After a timeout, anyone may claim on their behalf.
- **Bid price mechanics**:
  - Before the first ETH bid, ETH price follows a Dutch auction from a start price down to a floor.
  - After the first ETH bid, the next ETH price increases slightly after each bid.
  - CST bids are allowed only after the first ETH bid; CST price follows its own Dutch auction down to zero.
- **RandomWalk NFT discount**: Bidding with a RandomWalk NFT halves the ETH price (50% discount). Each RandomWalk NFT can be used once ever for bidding.
- **Prizes**:
  - **Main ETH prize**: sent directly to the winner when the main prize is claimed.
  - **Special prizes (aka secondary)**: ETH for Chrono‑Warrior and raffle winners; CSN NFTs for the winner, Endurance Champion, last CST bidder (if any), random bidders, and random RandomWalk stakers; CST rewards per bid plus round‑end CST bonuses.
- **Custody and withdrawals**: Special ETH prizes and donated assets are escrowed in `PrizesWallet` with a per‑round withdrawal timeout. Winners can withdraw any time; after the timeout, anyone can withdraw to themselves.
- **Staking**: CSN stakers receive a share of ETH deposited by the game at round end. If there are no stakers, that share is routed to the Charity Wallet.

### Champions (at a glance)

- **Endurance Champion (EC)**: address that held “last bidder” for the single longest continuous interval in the round.
- **Chrono‑Warrior (CW)**: address with the best “chrono” streak derived from EC updates across the round, finalized at round end.

Both EC and CW receive special prizes.

### Quick start (developers)

Prerequisites: Node 18+, npm, git

1) Install deps
```bash
npm install
```

2) Compile contracts
```bash
npx hardhat compile
# or use helper scripts
bash contracts-compiling/runners/compile.bash
```

3) Run a local node (optional)
```bash
bash scripts/hardhat-node.bash
```

4) Run tests
```bash
npx hardhat test
# or
bash test/runners/test-1.bash
```

5) Deploy (runners)
```bash
# Local Hardhat (connected to localhost node)
bash tasks/runners/run-deploy-cosmic-signature-contracts-hardhat_on_localhost.bash

# Arbitrum Sepolia (testnet)
bash tasks/runners/run-deploy-cosmic-signature-contracts-arbitrumSepolia.bash
```

6) Live‑chain checks (optional)
```bash
bash live-blockchain-testing/runners/live-blockchain-tests.bash
```

### Key contracts (production)

- `contracts/production/CosmicSignatureGame.sol` — main game (bidding, deadlines, prizes, round flow)
- `contracts/production/PrizesWallet.sol` — custody and withdrawal timeouts for special prizes and donations
- `contracts/production/CosmicSignatureToken.sol` — CST (ERC20)
- `contracts/production/CosmicSignatureNft.sol` — CSN (ERC721)
- `contracts/production/StakingWalletCosmicSignatureNft.sol` — CSN staking with per‑NFT reward share
- `contracts/production/StakingWalletRandomWalkNft.sol` — RandomWalk staking for CSN raffles

### Documentation

- Game prizes and flow: `docs/cosmic-signature-game-prizes.md`
- Functional requirements: `docs/functional-requirements.md`
- Quick start notes: `docs/QUICKSTART.md`
- Formal verification specs and plan: `certora/` (see `formal_verification_plan.md`)
- Config parameter guidance: `contract-configuration-params-calculation/`

### Integration tips

- Read prices from on‑chain helpers: `getNextEthBidPrice`, `getEthPlusRandomWalkNftBidPrice`, `getNextCstBidPrice`.
- Add a small buffer to ETH you send to avoid race conditions between reading price and sending a transaction.
- For events, listen to `BidPlaced`, `MainPrizeClaimed`, and champion updates.

### Security notes

- Access control: owner‑only admin; auxiliary contracts gate game‑only entry points.
- Reentrancy protection on external state‑changing functions; ETH transfers checked explicitly.
- Charity transfers are best‑effort; failures are logged without reverting.
- This repo includes static analysis and verification:
  - Slither helpers: `slither/`
  - Solhint helpers: `solhint/`
  - Certora specs: `certora/`

Review and test thoroughly before mainnet deployments.

### Project structure (selected)

- `contracts/production/` — game, wallets, tokens, NFTs
- `contracts/tests/` — test scaffolding contracts
- `tasks/` — deployment/upgrade runners and docs
- `live-blockchain-testing/` — scripts and docs for on‑chain testing
- `docs/` — design docs and integration notes

### License

MIT — see `LICENSE`.
