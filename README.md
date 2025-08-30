## Cosmic Signature: Smart-Contract Architecture and Flow Overview

**Version**: 1.0.0  
**Solidity Version**: 0.8.30  
**Network**: Arbitrum (L2)  
**OpenZeppelin Contracts**: v5.x  

This document provides a comprehensive technical specification of the Cosmic Signature on-chain game, covering the contracts, data model, configuration, bidding mechanics, prize distribution, staking, donations, and upgradeability as implemented in the `production` contracts.

### Introduction: How the game works (deep dive)

- **Core idea**: A round-based, last-bidder-wins game where each bid extends a deadline. When the deadline arrives, the last bidder becomes the main-prize beneficiary. The game also allocates multiple secondary prizes and NFTs to encourage broad participation and staking.
- **Two bid assets**:
  - **ETH bids** (must be the first bid in every round). Before the first ETH bid, the price follows a Dutch auction that starts high and linearly declines to a floor. After the first ETH bid, the next ETH price increases slightly after each subsequent bid.
  - **CST bids** (the in-game token) are allowed only after the first ETH bid in a round. CST price also follows a Dutch auction that linearly declines to zero over a configured duration.
- **RandomWalk NFT discount**: An ETH+RandomWalk NFT bid gets a 50% ETH discount vs ETH-only bids. Each RandomWalk NFT can be used once per game lifetime for bidding.
- **Timer mechanics**: On the first bid, the main prize timer is set using an initial duration. Each subsequent bid extends the timer by a fixed increment. If no one bids again before the timer expires, the last bidder can claim the round’s main prize.
- **Prizes**:
  - **Main ETH prize**: A configurable percentage of the Game’s ETH balance is paid to the main-prize beneficiary at claim time.
  - **Secondary ETH prizes**: A percentage for the Chrono-Warrior (longest continuous last-bid streak) and multiple equal raffle prizes for randomly selected bidders.
  - **NFT prizes**: Multiple Cosmic Signature NFTs (CSN) are minted to the beneficiary, Endurance Champion, last CST bidder (if any), random bidders, and random RandomWalk NFT stakers.
  - **CST prizes**: Endurance Champion and last CST bidder (if any) receive CST prizes proportional to the number of bids. Each bid, including CST bids, mints a fixed CST reward to the bidder.
  - **Staking reward**: A percentage of ETH is routed to CSN stakers (pooled per-staked-NFT reward). If no stakers exist, this portion is redirected to charity.
  - **Marketing and charity**: A fixed CST amount is minted to the marketing wallet each round; a percentage of ETH is donated to charity.
- **Custody and claiming**:
  - Most secondary ETH prizes and all donations are escrowed in `PrizesWallet` with a per-round withdrawal timeout: winners can withdraw anytime; after the timeout, anyone may withdraw the winner’s balance to themselves (the caller receives the ETH/tokens/NFT).
  - The main ETH prize is sent directly on claim (end of round processing).
- **Round flow**:
  1) Round is inactive until `roundActivationTime`.
  2) First bid must be ETH. It sets the baseline and starts the CST auction timer and main prize timer.
  3) Subsequent bids (ETH or CST) extend the deadline and adjust prices.
  4) When the deadline arrives, last bidder can claim; after a timeout, anyone can claim.
  5) Claim executes all prize distributions, updates staking rewards, and starts the next round after a configured delay.

### High-level system

- **Core game**: `CosmicSignatureGame` (UUPS-upgradeable) composes modules via inheritance:
  - Storage: `CosmicSignatureGameStorage`
  - Config/admin: `SystemManagement`
  - Bidding core: `BiddingBase`, `Bidding`
  - Main prize plumbing: `MainPrizeBase`, `MainPrize`
  - Stats: `BidStatistics`
  - Donations: `EthDonations`, `NftDonations`
  - Secondary prizes: `SecondaryPrizes`
  - Address checks: `AddressValidator`

- **Assets**:
  - ERC20 `CosmicSignatureToken` (CST): rewards, fees, DAO votes (ERC20Votes), permit.
  - ERC721 `CosmicSignatureNft` (CSN): minted as prizes and raffles.
  - ERC721 `RandomWalkNFT` (external legacy): optional bid discount and staking.

- **Prize custody and distribution**:
  - `PrizesWallet`: holds secondary ETH prizes, donated ERC20s and NFTs; enforces per-round withdrawal timeouts.
  - Staking wallets: `StakingWalletRandomWalkNft`, `StakingWalletCosmicSignatureNft`.
  - Optional support wallets: `MarketingWallet`, `CharityWallet`.

- **Governance**: `CosmicSignatureDao` uses CST as the voting token (timestamp clock).


### Storage model (selected)

- Bidding-round tracking and params live in `CosmicSignatureGameStorage`:
  - Round: `roundNum`, `roundActivationTime`, `delayDurationBeforeRoundActivation`.
  - ETH Dutch auction: `ethDutchAuctionBeginningBidPrice`, `ethDutchAuctionEndingBidPriceDivisor`, `ethDutchAuctionDurationDivisor`, `nextEthBidPrice`, `ethBidPriceIncreaseDivisor`.
  - CST Dutch auction: `cstDutchAuctionBeginningTimeStamp`, `cstDutchAuctionBeginningBidPrice`, `cstDutchAuctionDurationDivisor`, `nextRoundFirstCstDutchAuctionBeginningBidPrice`, `cstDutchAuctionBeginningBidPriceMinLimit`.
  - Misc bidding: `ethBidRefundAmountInGasToSwallowMaxLimit`, `bidMessageLengthMaxLimit`, `cstRewardAmountForBidding`, `usedRandomWalkNfts`.
  - Champions: `enduranceChampionAddress`, `enduranceChampionStartTimeStamp`, `enduranceChampionDuration`, `prevEnduranceChampionDuration`, `chronoWarriorAddress`, `chronoWarriorDuration`.
  - Prize timers: `mainPrizeTime`, `mainPrizeTimeIncrementInMicroSeconds`, `initialDurationUntilMainPrizeDivisor`, `mainPrizeTimeIncrementIncreaseDivisor`, `timeoutDurationToClaimMainPrize`.
  - Prize splits: `mainEthPrizeAmountPercentage`, `chronoWarriorEthPrizeAmountPercentage`, `raffleTotalEthPrizeAmountForBiddersPercentage`, `cosmicSignatureNftStakingTotalEthRewardAmountPercentage`.
  - Raffle counts: `numRaffleEthPrizesForBidders`, `numRaffleCosmicSignatureNftsForBidders`, `numRaffleCosmicSignatureNftsForRandomWalkNftStakers`.
  - External links: `token`, `randomWalkNft`, `nft`, `prizesWallet`, `stakingWalletRandomWalkNft`, `stakingWalletCosmicSignatureNft`, `marketingWallet`, `marketingWalletCstContributionAmount`, `charityAddress`, `charityEthDonationAmountPercentage`.

- Constants default/initial values are in `libraries/CosmicSignatureConstants.sol`.


### Lifecycle

1) Deployment and init
- `CosmicSignatureGame` is deployed as implementation + proxy; `initialize(owner)` sets defaults and owner.
- Many parameters initialize from constants; `roundActivationTime` defaults far in the future to allow configuration before going live.

2) Round activation
- Conceptually, rounds are continuous counters (`roundNum`), but each round becomes “active” only at `roundActivationTime`.
- The owner can set activation time and other auction/divisor parameters, mostly gated by “round inactive” and “no bids yet” checks.

3) Bidding
- First bid per round must be ETH. Thereafter, bidders can use:
  - ETH only, or ETH + RandomWalk NFT (50% discount).
  - CST after at least one ETH bid in the round.
- Every bid checks message length and, for RW NFTs, single-use and ownership.
- Rewards: every bid mints `cstRewardAmountForBidding` CST to the bidder.
- First bid sets the ETH Dutch auction baseline and starts the CST auction timer; it also sets initial `mainPrizeTime` using `getInitialDurationUntilMainPrize()`.

4) Price mechanics
- ETH Dutch auction (before first ETH bid in round):
  - Starting price: `ethDutchAuctionBeginningBidPrice` (for round 0, falls back to constant `FIRST_ROUND_INITIAL_ETH_BID_PRICE`).
  - Ending price: `floor = start / ethDutchAuctionEndingBidPriceDivisor + 1`.
  - Linearly decreases over `ethDutchAuctionDuration = mainPrizeTimeIncrementInMicroSeconds / ethDutchAuctionDurationDivisor`.
  - Once at least one bid exists, the next ETH price is `nextEthBidPrice`, updated after each bid by: `next = paid + paid / ethBidPriceIncreaseDivisor + 1`.
- ETH + RW NFT bid price: `paid = (ethPrice + (RANDOMWALK_NFT_BID_PRICE_DIVISOR - 1)) / RANDOMWALK_NFT_BID_PRICE_DIVISOR` where `RANDOMWALK_NFT_BID_PRICE_DIVISOR = 2`, effectively calculating `ceil(ethPrice / 2)` for a 50% discount.
- CST Dutch auction: linearly decreases from `cstDutchAuctionBeginningBidPrice` to 0 over `mainPrizeTimeIncrementInMicroSeconds / cstDutchAuctionDurationDivisor`. First CST bid of a round also updates `nextRoundFirstCstDutchAuctionBeginningBidPrice`.
- Admin helper: after ETH auction floor is reached and no bids, owner can call `halveEthDutchAuctionEndingBidPrice()` (with constraints) to re-ignite bidding by halving the floor and re-smoothing duration.

5) Main prize timer extension
- On every bid after the first, `mainPrizeTime` extends by `mainPrizeTimeIncrementInMicroSeconds / MICROSECONDS_PER_SECOND`.

6) Champions tracking
- Endurance Champion: the address that remained last-bidder the longest continuous time.
- Chrono-Warrior: the address that holds the longest such continuous streak within the round overall.
- Updated on each bid and on main-prize claim boundary.

7) Claiming the main prize
- Who/when:
  - Last bidder can claim at or after `mainPrizeTime`.
  - After `timeoutDurationToClaimMainPrize`, anyone can claim on their behalf.
- What happens on claim:
  - Finalize champions; allocate and issue secondary prizes; mint CSN NFTs; mint/burn/mint CST rewards; deposit ETH prizes to `PrizesWallet` (for bidders and chrono-warrior); deposit ETH to CSN staking wallet; transfer ETH to charity; finally, pay main ETH prize directly to beneficiary.
  - Prepare next round: increment round, increase `mainPrizeTimeIncrementInMicroSeconds` slightly, set next `roundActivationTime = now + delayDurationBeforeRoundActivation`, and clear round state.


### Prize distribution details

- Main ETH prize: `address(this).balance * mainEthPrizeAmountPercentage / 100` is transferred directly to the main-prize beneficiary at the end of distribution.
- Charity: `address(this).balance * charityEthDonationAmountPercentage / 100` is sent to `charityAddress` (best-effort; logs success/failure, does not revert on failure).
- Chrono-Warrior ETH prize: percentage of contract ETH allocated and deposited to `PrizesWallet` for later withdrawal.
- Raffle ETH prizes (bidders): `raffleTotalEthPrizeAmountForBiddersPercentage` split equally among `numRaffleEthPrizesForBidders` randomly chosen bids, deposited to `PrizesWallet`.
- CSN staking ETH reward: percentage of ETH is deposited into `StakingWalletCosmicSignatureNft.deposit(roundNum)`. If division-by-zero panic occurs (no stakers), the amount is rerouted to charity.
- CSN mints (NFT prizes):
  - For random RandomWalk stakers: `numRaffleCosmicSignatureNftsForRandomWalkNftStakers` addresses selected from `StakingWalletRandomWalkNft`.
  - For last CST bidder (if any): 1 CSN.
  - For main prize beneficiary: 1 CSN.
  - For Endurance Champion: 1 CSN.
  - For random bidders: `numRaffleCosmicSignatureNftsForBidders` CSNs.
- CST mints:
  - Marketing wallet receives `marketingWalletCstContributionAmount`.
  - Endurance Champion receives `bidsInRound * cstPrizeAmountMultiplier`.
  - Last CST bidder (if any) receives `bidsInRound * cstPrizeAmountMultiplier`.
  - Every bid mints `cstRewardAmountForBidding` to the bidder; CST bid additionally burns the CST bid price and mints the reward in a single batched call.


### Donations (not tied to bidding)

- `donateEth()` and `donateEthWithInfo(string json)` emit events and (for the latter) append a record in `ethDonationWithInfoRecords` for later off-chain indexing.
- During any bid, a bidder can combine with a donation:
  - `bidWithEthAndDonateToken` / `bidWithEthAndDonateNft` (and CST variants) route donation custody to `PrizesWallet`; ERC20 uses a per-round `DonatedTokenHolder` for allowances.
- `PrizesWallet` enforces that before the per-round withdrawal timeout, only the main-prize beneficiary can claim donated assets; after timeout anyone can claim them (or withdraw ETH on behalf of winners).


### Staking

- RandomWalk staking: `StakingWalletRandomWalkNft`
  - One-time stake per NFT enforced by base `usedNfts` bitmap.
  - Tracks active stakes, supports random selection of stakers for CSN raffle.
  - Unstake returns NFT.

- CSN staking: `StakingWalletCosmicSignatureNft`
  - Maintains `rewardAmountPerStakedNft` (cumulative). On deposit (from Game at round end), increases per-NFT reward by `msg.value / numStakedNfts`.
  - When unstaking, staker receives `rewardAmountPerStakedNft - initialSnapshot` ETH.
  - Owner can forward leftover ETH to charity when there are no staked NFTs via `tryPerformMaintenance(charity)`.


### PrizesWallet

- Holds and accounts secondary ETH prizes and donations per round
- Records `mainPrizeBeneficiaryAddresses[round]` and `roundTimeoutTimesToWithdrawPrizes[round]` on round end
- ETH withdrawal:
  - Winner can withdraw their cumulative ETH at any time; after the per-round timeout, anyone can withdraw the winner’s balance to themselves
  - Balance tracked in `_ethBalancesInfo` mapping (address → {roundNum, amount})
- ERC20 donations:
  - **DonatedTokenHolder pattern**: Each round creates a separate holder contract on first ERC20 donation
  - Purpose: Isolates allowances per round, preventing cross-round token theft
  - Flow: Donor approves PrizesWallet → PrizesWallet transfers to DonatedTokenHolder → Holder approves PrizesWallet for claims
  - Claiming transfers from holder to the caller via `SafeERC20.safeTransferFrom` (beneficiary-only before timeout; anyone after timeout)
- ERC721 donations:
  - Stored as flat list across rounds in `donatedNfts` array
  - Beneficiaries (or anyone after timeout) claim by index; transfer goes to the caller
  - Deleted entries prevent double-claiming
- `withdrawEverything` convenience method to batch-claim ETH, ERC20s, and NFTs in one transaction


### CST and CSN assets

- `CosmicSignatureToken` (CST)
  - Only the Game may mint/burn via `mint`, `burn`, and batch variants; includes `mintAndBurnMany` for CST bids that both burn the price and mint rewards in one call.
  - ERC20Votes + timestamp clock integration for DAO; `transferMany` helpers for marketing.

- `CosmicSignatureNft` (CSN)
  - Only the Game can mint single or batch; sets per-NFT `seed` via `RandomNumberHelpers` to drive art generation; owner/approved can set a bounded-length human name.

- `RandomWalkNFT` (legacy)
  - External collection used for bid discounts and staking; contract has known limitations and is treated as-is.


### Configuration and system management

- Owner-only setters in `SystemManagement` adjust operational parameters, mostly allowed only while a round is inactive (with few exceptions like `delayDurationBeforeRoundActivation` and `roundActivationTime` before any bids).
- All changes emit strongly-typed events in `ISystemEvents` to support off-chain sync.


### Upgradeability

- The Game uses UUPS (Universal Upgradeable Proxy Standard) pattern
- Upgrade gates:
  - `onlyOwner` modifier - only contract owner can upgrade
  - `_onlyRoundIsInactive` modifier - prevents upgrades during active rounds for trustlessness
  - Non-zero implementation address validation
- Implementation:
  - `upgradeTo(address newImplementation)` updates the implementation slot (`ERC1967Utils.IMPLEMENTATION_SLOT`)
  - Emits `IERC1967.Upgraded` event
  - Uses `OwnableUpgradeableWithReservedStorageGaps` for storage collision protection (256 persistent + 1 transient gap slots)
  - Inherits from `UUPSUpgradeable` and properly initializes all upgradeable base contracts


### Security Considerations

#### Reentrancy Protection
- Uses `ReentrancyGuardTransientUpgradeable` for main game contracts (leverages transient storage for gas optimization)
- Uses `ReentrancyGuardTransient` for non-upgradeable contracts (PrizesWallet, staking wallets)
- All external state-changing functions are protected with `nonReentrant` modifier
- ETH transfers handled carefully with explicit success checking

#### Access Control
- Owner-only functions protected via `OwnableUpgradeable` pattern
- Game-only functions in auxiliary contracts (Token, NFT, PrizesWallet) use custom `_onlyGame` modifier
- Round state modifiers (`_onlyRoundIsActive`, `_onlyRoundIsInactive`, `_onlyBeforeBidPlacedInRound`) ensure proper timing
- Treasurer role in MarketingWallet for CST distribution

#### Input Validation
- `AddressValidator` mixin provides `_providedAddressIsNonZero` modifier for zero-address checks
- Bid message length limited to `bidMessageLengthMaxLimit` (default 280 chars)
- CST bid requires `priceMaxLimit` to prevent unexpected price increases
- RandomWalk NFT single-use enforced via `usedNfts` bitmap (array of uint256, each tracking 256 NFTs)

#### Randomness Generation
- Primary entropy sources:
  - `blockhash(block.number - 1)` - L2 block hash
  - `block.basefee` - current gas base fee
  - Arbitrum precompiles (when available):
    - `ArbSys.arbBlockNumber()` and `ArbSys.arbBlockHash()` - L1 block data
    - `ArbGasInfo.getGasBacklog()` - L2 gas backlog
    - `ArbGasInfo.getL1PricingUnitsSinceUpdate()` - L1 pricing data
- Precompile failures handled gracefully (emit `ArbitrumError` event, continue with available entropy)
- Seed incremented and hashed for each random number generation
- Note: Suitable for raffle selection but not for high-stakes cryptographic security

#### Fund Transfer Safety
- ETH transfers use low-level `call` with explicit success checking
- Failed charity transfers emit event but don't revert (best-effort)
- Failed user withdrawals revert with `FundTransferFailed` error
- Gas limit considerations for refunds (`ethBidRefundAmountInGasToSwallowMaxLimit`)
- Safe ERC20 operations via OpenZeppelin's `SafeERC20`

### Important behaviors and edge cases

- ETH price is guaranteed nonzero when needed; CST price can reach zero at the end of its Dutch auction
- Small ETH overpayments can be "swallowed" (kept) if refunding would likely cost more gas than the refund (threshold: `ethBidRefundAmountInGasToSwallowMaxLimit`, default 6843 gas); larger overpayments are refunded in the same transaction
- First round first bid price is fixed via constant (`FIRST_ROUND_INITIAL_ETH_BID_PRICE = 0.0001 ether`); subsequent rounds derive starting ETH/CST prices from prior activity and configured multipliers
- Division-by-zero protection: CSN staking rewards rerouted to charity if no stakers exist
- Bitmap storage optimization: `usedNfts` and `usedRandomWalkNfts` use fixed-size arrays for O(1) lookups


### External API (selected)

- Bidding and donations (game):
  - `receive()` to bid with ETH using default params.
  - `bidWithEth(int256 randomWalkNftId, string message)`; `bidWithEthAndDonateToken|Nft(...)`.
  - `bidWithCst(uint256 priceMaxLimit, string message)`; `bidWithCstAndDonateToken|Nft(...)`.
  - `getNextEthBidPrice[Advanced]`, `getEthPlusRandomWalkNftBidPrice`, `getEthDutchAuctionDurations`.
  - `getNextCstBidPrice[Advanced]`, `getCstDutchAuctionDurations`.
  - `donateEth()`, `donateEthWithInfo(json)`.
  - `claimMainPrize()`.

- Queries (stats):
  - `getTotalNumBids(round)`, `getBidderAddressAt(round,index)`, `getBidderTotalSpentAmounts(round,address)`.
  - `tryGetCurrentChampions()`.

- Prizes wallet:
  - `withdrawEverything(...)`, `withdrawEth()`, `withdrawEth(prizeWinner)`, `claimDonatedToken(...)`, `claimDonatedNft(index)`.

- Admin (owner-only on Game):
  - Setters for timings, percentages, divisors, addresses, and amounts per `ISystemManagement`.
  - `halveEthDutchAuctionEndingBidPrice()` under strict conditions (non-first round, before any bid, after ETH floor time has passed).
  - `upgradeTo(newImplementation)` while round inactive.


### Key Constants and Default Configuration

#### Timing Constants
- `MICROSECONDS_PER_SECOND = 1,000,000` - Time precision for main prize timer
- `INITIAL_MAIN_PRIZE_TIME_INCREMENT = 1 hours` - Base increment for timer extensions
- `DEFAULT_DELAY_DURATION_BEFORE_ROUND_ACTIVATION = 30 minutes` - Delay between rounds
- `DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE = 1 days` - Timeout for anyone to claim on behalf of winner
- `DEFAULT_TIMEOUT_DURATION_TO_WITHDRAW_PRIZES = 5 weeks` - Timeout for PrizesWallet withdrawals

#### ETH Auction Parameters
- `FIRST_ROUND_INITIAL_ETH_BID_PRICE = 0.0001 ether` - Starting price for round 0
- `ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER = 2` - Multiplier for next auction start price
- `DEFAULT_ETH_DUTCH_AUCTION_ENDING_BID_PRICE_DIVISOR = 20` - Divisor for auction floor (10x multiplier)
- `DEFAULT_ETH_BID_PRICE_INCREASE_DIVISOR = 100` - 1% increase per bid
- `DEFAULT_ETH_DUTCH_AUCTION_DURATION_DIVISOR` - Controls auction duration (≈2 days)
- `DEFAULT_ETH_BID_REFUND_AMOUNT_IN_GAS_TO_SWALLOW_MAX_LIMIT = 6843` - Gas threshold for refunds

#### CST Auction Parameters  
- `DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT = 200 ether` - Minimum CST auction start
- `CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER = 2` - Multiplier for next CST auction
- `DEFAULT_CST_DUTCH_AUCTION_DURATION_DIVISOR` - Controls CST auction duration (≈12 hours)
- `DEFAULT_CST_REWARD_AMOUNT_FOR_BIDDING = 100 ether` - CST minted per bid
- `DEFAULT_CST_PRIZE_AMOUNT_MULTIPLIER = 10 ether` - CST prize multiplier per bid

#### Prize Distribution Percentages
- `DEFAULT_MAIN_ETH_PRIZE_AMOUNT_PERCENTAGE = 25%` - Main prize portion
- `DEFAULT_CHRONO_WARRIOR_ETH_PRIZE_AMOUNT_PERCENTAGE = 7%` - Chrono-Warrior prize
- `DEFAULT_RAFFLE_TOTAL_ETH_PRIZE_AMOUNT_FOR_BIDDERS_PERCENTAGE = 5%` - Bidder raffles total
- `DEFAULT_COSMIC_SIGNATURE_NFT_STAKING_TOTAL_ETH_REWARD_AMOUNT_PERCENTAGE = 10%` - CSN staking rewards
- `DEFAULT_CHARITY_ETH_DONATION_AMOUNT_PERCENTAGE = 10%` - Charity donation

#### Raffle Counts
- `DEFAULT_NUM_RAFFLE_ETH_PRIZES_FOR_BIDDERS = 3` - ETH prizes for random bidders
- `DEFAULT_NUM_RAFFLE_COSMIC_SIGNATURE_NFTS_FOR_BIDDERS = 5` - CSN NFTs for random bidders
- `DEFAULT_NUM_RAFFLE_COSMIC_SIGNATURE_NFTS_FOR_RANDOMWALK_NFT_STAKERS = 4` - CSN NFTs for RW stakers

#### DAO Governance
- `DAO_DEFAULT_VOTING_DELAY = 1 days` - Delay before voting starts
- `DAO_DEFAULT_VOTING_PERIOD = 2 weeks` - Duration of voting
- `DAO_DEFAULT_VOTES_QUORUM_PERCENTAGE = 2%` - Required quorum

#### Other Limits
- `DEFAULT_BID_MESSAGE_LENGTH_MAX_LIMIT = 280` - Max bid message length (Twitter-like)
- `COSMIC_SIGNATURE_NFT_NFT_NAME_LENGTH_MAX_LIMIT = 32` - Max NFT name length
- `RANDOMWALK_NFT_BID_PRICE_DIVISOR = 2` - 50% discount divisor

### Key formulas (informal)

- ETH Dutch auction current price (no bids yet):
  - `duration = mainPrizeTimeIncrementInMicroSeconds / ethDutchAuctionDurationDivisor`
  - `floor = start / ethDutchAuctionEndingBidPriceDivisor + 1`
  - `elapsed = max(0, now - roundActivationTime) + offset`
  - `price = start - (start - floor) * min(elapsed, duration) / duration`
- Next ETH price after a bid: `next = paid + paid / ethBidPriceIncreaseDivisor + 1`
- ETH + RW NFT price: `(ethPrice + (RANDOMWALK_NFT_BID_PRICE_DIVISOR - 1)) / RANDOMWALK_NFT_BID_PRICE_DIVISOR` (ceiling division for 50% discount)
- CST Dutch auction price: `remaining = duration - (now - cstDutchAuctionBeginningTimeStamp) - offset`; `price = max(0, start * remaining / duration)`


### Files to start reading

- `CosmicSignatureGame.sol`: glue/initializer/upgrade.
- `Bidding.sol`: bid placement, price math, CST burns/mints, ETH refunds, champions updates.
- `MainPrize.sol`: main prize claim and full end-of-round distribution.
- `PrizesWallet.sol`: custody, timeouts, and claims.
- `CosmicSignatureToken.sol`, `CosmicSignatureNft.sol`: assets.
- `StakingWalletCosmicSignatureNft.sol`, `StakingWalletRandomWalkNft.sol`: staking and rewards.


### Deployment and Integration Guide

#### Pre-Deployment Checklist
1. Deploy contracts in the following order (constructor dependencies require the Game proxy address first for some components):
   - Deploy `CosmicSignatureGame` implementation and proxy
   - Call `initialize(ownerAddress)` on the proxy (sets defaults from `CosmicSignatureConstants`; initial `roundActivationTime` is far in the future)
   - Deploy `CosmicSignatureToken` (constructor requires the Game proxy address)
   - Deploy `CosmicSignatureNft` (constructor requires the Game proxy address)
   - Deploy `RandomWalkNFT` (if not already deployed)
   - Deploy `PrizesWallet` (constructor requires the Game proxy address)
   - Deploy `StakingWalletCosmicSignatureNft` (constructors require CSN and Game addresses)
   - Deploy `StakingWalletRandomWalkNft` (constructor requires RandomWalk NFT address)
   - Deploy `MarketingWallet` (constructor requires CST token address)
   - Deploy `CharityWallet`
   - Deploy `CosmicSignatureDao` (constructor requires CST token address)

2. Configure Game parameters (while round inactive):
   - Set contract addresses: `setCosmicSignatureToken`, `setCosmicSignatureNft`, `setPrizesWallet`, `setStakingWalletCosmicSignatureNft`, `setStakingWalletRandomWalkNft`, `setMarketingWallet`, `setMarketingWalletCstContributionAmount`, `setCharityAddress`
   - Adjust auction parameters: divisors, percentages, timeouts, raffle counts

3. Activate the first round:
   - Set `roundActivationTime` to desired start time using `setRoundActivationTime`

4. Pre-launch verification:
   - Verify all contract addresses are set correctly
   - Check auction parameters are within reasonable ranges
   - Ensure owner has sufficient gas for operations
   - Test with small amounts on testnet first

#### Integration Requirements

##### For Frontend/DApp Integration
- **Price Calculation**: 
  - Use `getNextEthBidPriceAdvanced(offset)` with pending block timestamp offset for accurate pricing
  - Same for `getNextCstBidPriceAdvanced(offset)` 
  - Account for gas costs in ETH bid amount to avoid failed transactions

- **Bid Validation**:
  - Check message length ≤ `bidMessageLengthMaxLimit` (280 chars default)
  - Verify RandomWalk NFT ownership and unused status before bidding
  - Ensure sufficient CST balance and allowance for CST bids
  - Add buffer to ETH amount for potential price increases between read and transaction

- **Event Monitoring**:
  - Listen to `BidPlaced` events for real-time updates
  - Monitor `MainPrizeClaimed` for round transitions
  - Track champion changes via `EnduranceChampionUpdated` and `ChronoWarriorUpdated`
  - Watch for configuration changes via `ISystemEvents` events

##### For Backend/Indexer Integration
- Index all bid events with timestamps for champion calculation verification
- Track round state: activation time, first bid, current champions
- Monitor prize distributions and withdrawal timeouts
- Store donation records from `ethDonationWithInfoRecords`

#### Gas Optimization Techniques Used

- **Transient Storage**: `ReentrancyGuardTransient` uses EIP-1153 transient storage for cheaper reentrancy protection
- **Unchecked Blocks**: Used in price calculations where overflow is impossible (saves ~30 gas per operation)
- **Bitmap Storage**: `usedNfts` arrays pack 256 boolean values per storage slot
- **Batch Operations**: `mintAndBurnMany` for CST operations, `withdrawEverything` for claims
- **Storage Packing**: Struct members ordered for optimal packing
- **Low-Level Calls**: Direct `call` for ETH transfers vs. higher-level transfer/send
- **Cached Storage Reads**: Local variables cache frequently accessed storage values

#### Parameter Tuning Guidelines

- **Auction Durations**: Balance between giving users time to bid and maintaining excitement
  - ETH: 2-3 days allows price discovery
  - CST: 12-24 hours prevents excessive zero-price windows

- **Prize Percentages**: Total should leave sufficient balance for next round
  - Main (25%) + Chrono (7%) + Raffles (5%) + Staking (10%) + Charity (10%) = 57%
  - Remaining 43% carries to next round, building larger prizes

- **Timeout Durations**: Balance security with user convenience
  - Main prize claim: 1 day prevents holding round hostage
  - Secondary withdrawals: 5 weeks gives winners ample time to claim

### Notes for integration

- Expect owner-tunable parameters to change between rounds (and some during rounds where permitted). Always read current on-chain config for pricing and timing
- For best user UX, compute prices in the pending block; consider `currentTimeOffset` usage for CST/ETH helpers as documented in comments
- Handle message length and RandomWalk NFT ownership checks client-side to prevent avoidable reverts
- Monitor gas prices on Arbitrum for optimal transaction timing
- Consider implementing retry logic for failed Arbitrum precompile calls


### Known trade-offs and TODOs

- Inline comments mark additional considerations (gas, rounding +1s, Arbitrum precompiles, upgrade minimalism). Some are informational and left by design.
- `RandomWalkNFT` has historical limitations; treated as external input.


### Detailed per-file and per-function documentation

Below is a practical, implementation-first breakdown of each production contract and its key functions, with an emphasis on how each contributes to the overall game.

#### CosmicSignatureGame.sol
- Composition root of the system. Inherits all mixins (storage, bidding, prizes, donations, etc.).
- `constructor()`: disables initializers on the implementation.
- `initialize(address ownerAddress_)`: proxy initializer; wires defaults (via `_initialize`) and sets owner.
- `_initialize(address owner)`: sets initial values for all configurable parameters (from `CosmicSignatureConstants`) and ensures initial round is not active.
- `upgradeTo(address newImplementation)`: minimal UUPS upgrade method; requires owner and inactive round; writes implementation slot and emits `Upgraded`.

Contribution: orchestrates lifecycle, centralizes upgradeability, and consolidates behaviors.

#### CosmicSignatureGameStorage.sol
- Declares all persistent storage used across modules:
  - Round timing (`roundNum`, `roundActivationTime`, `delayDuration...`), ETH/CST auction parameters, bid tracking (`bidderAddresses`, `biddersInfo`), champions (endurance/chrono), main prize timing and increments, prize percentages, counts for raffles, references to external contracts (token/NFT/wallets), marketing and charity settings.

Contribution: single source of truth for all state used by the game mechanics.

#### BiddingBase.sol
- Modifiers and helpers:
  - `_onlyNonFirstRound()`, `_onlyRoundIsInactive()`, `_onlyRoundIsActive()`, `_onlyBeforeBidPlacedInRound()`.
  - `_setRoundActivationTime`, `_setEthDutchAuctionDurationDivisor`, `_setEthDutchAuctionEndingBidPriceDivisor`.
  - Getters for elapsed/until-activation durations.

Contribution: guardrails and shared helpers for bidding logic and admin safety.

#### Bidding.sol
- Entry points:
  - `receive()`: default ETH bid with defaults.
  - `bidWithEth`, `bidWithEthAndDonateToken`, `bidWithEthAndDonateNft`.
  - `bidWithCst`, `bidWithCstAndDonateToken`, `bidWithCstAndDonateNft`.
- Pricing:
  - `getNextEthBidPrice[Advanced]`, `getEthPlusRandomWalkNftBidPrice` (50% divisor for RW NFT), `getEthDutchAuctionDurations`.
  - `getNextCstBidPrice[Advanced]`, `getCstDutchAuctionDurations`.
- Admin helper:
  - `halveEthDutchAuctionEndingBidPrice()`: after floor reached and no bids, adjust ending floor and duration to smoothly halve price.
- Core flows:
  - `_bidWithEth(...)`: computes price, handles overpayment refund vs swallow threshold, checks RW NFT ownership and single-use, updates bidder stats, sets baseline on first bid, updates `nextEthBidPrice`, mints CST reward, common bookkeeping, emits `BidPlaced`, refunds excess if needed.
  - `_bidWithCst(...)`: enforces ETH-first rule (indirectly), computes CST price, burns paid CST and mints CST reward in one call, updates CST auction start, increases next CST baseline and min floor, sets `lastCstBidderAddress`, common bookkeeping, emits `BidPlaced`.
  - `_bidCommon(...)`: first bid guards, sets initial timers, or else updates champions and extends main prize; records bidder address list and last bid timestamp.

Contribution: implements the economic engine: price curves, bids, refunds, and per-bid reward logic.

#### MainPrizeBase.sol
- `getInitialDurationUntilMainPrize()`: initial window at first bid.
- `getDurationUntilMainPrize()`, `getDurationUntilMainPrizeRaw()`: time left (clamped and raw).
- `getMainPrizeTimeIncrement()`: per-bid extension increment (seconds).
- `_extendMainPrizeTime()`: extend logic used on every bid after first.

Contribution: deterministic time math for the dynamic deadline.

#### MainPrize.sol
- `claimMainPrize()`: eligibility check (last bidder vs timeout), finalize champions, distribute secondary prizes and NFTs, route staking/charity, transfer main prize, prepare next round.
- `_distributePrizes()`: detailed distribution pipeline:
  - Picks random stakers/bidders, builds CSN mint list, computes CST prize specs, emits events, mints CSN and CST.
  - Builds and deposits ETH allocations to `PrizesWallet` (chrono-warrior, bidder raffles), computes main/charity/staking splits, registers round end, emits `MainPrizeClaimed`.
  - Sends ETH to CSN staking wallet (or reroutes to charity on divide-by-zero case), then transfers charity, then finally transfers main ETH prize to beneficiary.
- `_prepareNextRound()`: reset round-specific state, increment round, increase `mainPrizeTimeIncrementInMicroSeconds` slightly, schedule activation using `delayDurationBeforeRoundActivation`.
- `getMainEthPrizeAmount()`, `getCharityEthDonationAmount()`: convenience getters.

Contribution: closes the loop; executes end-of-round accounting and starts the next round.

#### BidStatistics.sol
- Query helpers: `getTotalNumBids`, `getBidderAddressAt`, `getBidderTotalSpentAmounts`.
- On-bid maintenance:
  - `_updateChampionsIfNeeded()`: updates endurance champion; when a new champion appears, updates chrono-warrior candidate window.
  - `_updateChronoWarriorIfNeeded(chronoEndTime)`: updates global chrono-warrior if the current best window exceeds prior.
- `tryGetCurrentChampions()`: read-only view of instant champions as if updated now.

Contribution: tracks competitive roles that seed secondary prizes and adds transparency for UIs/analytics.

#### EthDonations.sol / NftDonations.sol
- ETH: `donateEth()`, `donateEthWithInfo(string)`, `numEthDonationWithInfoRecords()` with eventing and on-chain info records.
- NFT: empty marker mixin to keep layering consistent.

Contribution: public donations and metadata, useful for seeding and sponsor messaging.

#### SystemManagement.sol
- Owner-only setters for all tunables:
  - Timing/divisors/limits for ETH/CST auctions and main prize; message length; per-bid CST reward; raffle counts; percentages for main/chrono/raffle/staking/charity; addresses for assets and wallets; marketing CST contribution.
  - Guards: most setters require inactive round; activation time requires no bids yet.

Contribution: operational control-plane with strong eventing for off-chain sync.

#### PrizesWallet.sol
- Round registration: `registerRoundEnd[AndDepositEthMany]` writes beneficiary and round withdrawal timeout; deposits ETH for secondary prizes.
- ETH flows: `depositEth`, `withdrawEth()` (self), `withdrawEth(address)` (after timeout), `getEthBalanceInfo` (self/any).
- ERC20 donations: `donateToken(round, donor, token, amount)` stores per-round holder; `claimDonatedToken(round, token, amount)` with timeout rule; batch claim and balance query.
- ERC721 donations: `donateNft(round, donor, nft, id)` adds indexed item; `claimDonatedNft(index)` with timeout rule; batch claim.
- Maintenance: configurable `timeoutDurationToWithdrawPrizes`.

Contribution: safe custody of secondary prizes and donations with fairness/time-based recovery.

#### DonatedTokenHolder.sol
- Per-round, per-token mini-holder that authorizes `PrizesWallet` (deployer) as spender for donated ERC20s; minimizes cross-round coupling.

Contribution: isolates ERC20 allowances to round-scope, reducing risk and simplifying claims.

#### StakingWalletRandomWalkNft.sol (+ base)
- `stake(nftId)`, `unstake(stakeActionId)`, `unstakeMany(ids)`; tracks actions densely (`stakeActionIds`) and sparsely (`stakeActions`), single-use per NFT enforced by base `usedNfts`.
- Random selection: `pickRandomStakerAddressesIfPossible(k, seed)` for CSN raffle.
- Base `StakingWalletNftBase`: common single-use guard and multi-stake convenience.

Contribution: creates the RandomWalk staking population used for raffle-based CSN distribution.

#### StakingWalletCosmicSignatureNft.sol
- `stake`, `stakeMany`, `unstake`, `unstakeMany`: records `initialRewardAmountPerStakedNft` snapshot for each stake.
- `deposit(roundNum)`: increases `rewardAmountPerStakedNft` by `msg.value / numStakedNfts`; emits deposit event.
- `tryPerformMaintenance(charity)`: owner can forward balance to charity only when there are no staked NFTs.

Contribution: delivers ETH staking rewards to CSN stakers proportional to time staked and deposit history.

#### Assets
- `CosmicSignatureToken.sol`
  - ERC20 + Permit + Votes; only Game can `mint`, `burn`, and batch operations; `mintAndBurnMany` supports CST bid price burn and per-bid reward minting in one call; includes `transferMany` helpers for marketing.
- `CosmicSignatureNft.sol`
  - ERC721Enumerable; only Game can mint; each NFT records `seed` for off-chain art; owners can set bounded-length names.
- `RandomWalkNFT.sol`
  - Legacy NFT collection used for ETH bid discount and staking; includes its own sale/withdraw logic (treated as external).

#### Governance
- `CosmicSignatureDao.sol`: OpenZeppelin Governor with timestamp-based clock; uses CST for voting; configured defaults for delay/period/quorum.

#### Wallets
- `MarketingWallet.sol`: owner sets treasurer; treasurer can pay marketing rewards in CST via transfers or batch specs.
- `CharityWallet.sol`: basic ETH receiver and forwarder to configured charity address.

#### Libraries
- `CosmicSignatureConstants.sol`: defaults and initial values; time constants.
- `CosmicSignatureErrors.sol`: custom, gas-efficient errors across all domains.
- `CosmicSignatureEvents.sol`: shared events (e.g., charity transfer attempts, L2 errors).
- `RandomNumberHelpers.sol`: seeds and random numbers (hash-based), includes Arbitrum precompile inputs.
- `ArbitrumHelpers.sol`: safe low-level calls to precompiles; emits events on failure instead of reverting.
- `CryptographyHelpers.sol`: keccak-based hash helper.

#### Interfaces
- `ICosmicSignatureGame*`, `IBidding*`, `IMainPrize*`, `ISecondaryPrizes`, `IEthDonations`, `INftDonations`, `IPrizesWallet`, `I*Wallet`, `IRandomWalkNFT`, `ICosmicSignatureToken`, etc.: define cross-module contracts and event surfaces for clear integration.


### Champions: Endurance Champion and Chrono‑Warrior (precise definitions)

Simple explanation (TL;DR):
- Endurance Champion (EC): the participant who remained the last bidder for the longest single continuous period in the round.
- Chrono‑Warrior (CW): the participant who remained Endurance Champion for the longest period (i.e., held the record) across the round, with standings finalized at round end.
- Both receive special prizes (see Prize distribution details).

The game tracks two related, but distinct achievements within each round. Both are derived from the timeline of who is the last bidder and for how long.

- **Continuous last‑bid interval**: After an address A places a bid that makes them the last bidder, A’s continuous last‑bid interval starts at A’s last bid timestamp and ends when someone else outbids A (or at the time of evaluation).

- **Endurance Champion (EC)**: The address that has achieved the longest single continuous last‑bid interval so far in the round.
  - Implementation details:
    - When there is no EC yet, the current last bidder becomes EC with duration = now − lastBidTime.
    - Whenever the current last bidder’s ongoing interval exceeds the recorded EC duration, the contract:
      1) First updates the Chrono‑Warrior candidate (see below) for the outgoing EC using the interval [EC.start + EC.prevDuration, EC.start + EC.duration].
      2) Then promotes the current last bidder to be the new EC:
         - `enduranceChampionAddress = lastBidderAddress`
         - `enduranceChampionStartTimeStamp = lastBidTimeStamp`
         - `prevEnduranceChampionDuration = old enduranceChampionDuration`
         - `enduranceChampionDuration = now − lastBidTimeStamp`

- **Chrono‑Warrior (CW)**: The address with the longest “chrono” duration, defined as the length of the most recent (latest) continuous last‑bid interval achieved by the Endurance Champion when it was last updated.
  - Intuition: CW recognizes the best “peak streak” by the ECs over time. Each time a new EC dethrones the previous EC, the previous EC’s “chrono interval” is computed as:
    - `chronoStart = enduranceChampionStartTimeStamp + prevEnduranceChampionDuration`
    - `chronoEnd = lastBidTimeStampOfNewEC + durationOfOldEC`
    - `chronoDuration = chronoEnd − chronoStart`
    - If `chronoDuration` exceeds the recorded CW duration, update CW to the old EC and record this new `chronoDuration`.
  - On finalization (e.g., main‑prize claim), the logic also evaluates the current EC’s ongoing chrono at “now” to ensure the best streak is captured if it ends the round as EC:
    - `chronoStart = enduranceChampionStartTimeStamp + prevEnduranceChampionDuration`
    - `chronoEnd = now`
    - `chronoDuration = chronoEnd − chronoStart`
    - If larger than the current CW duration, CW becomes the current EC with this duration.

These roles are maintained in `BidStatistics`:
- `_updateChampionsIfNeeded()` evaluates, on bids after the first, whether the current last‑bidder’s active interval surpasses the recorded EC duration. If so, it first closes and scores the previous EC’s chrono segment, then promotes the current last‑bidder to EC.
- `_updateChronoWarriorIfNeeded(chronoEndTime)` computes the chrono duration based on the EC state and updates CW if it’s an improvement.
- On main prize claim, the code calls `_updateChampionsIfNeeded()` and `_updateChronoWarriorIfNeeded(block.timestamp)` to finalize standings before prizes.

#### Example timeline

1) Address A bids at t=100; A is last bidder. Suppose no prior EC exists:
   - EC := A, EC.start=100, EC.duration=now−100, prevEC.duration=0.
2) Address B outbids at t=140 (becomes last bidder). When B's active interval grows and exceeds EC.duration (which belonged to A), the contract:
   - First sets CW candidate using A's chrono window [A.start + 0, A.start + A.duration].
   - Promotes B to EC with EC.start=t(B's last bid), prevEC.duration = A.duration.
3) Near the end of the round, suppose C becomes EC and at claim time we finalize using "now" as chronoEnd; if C's current chrono segment is the longest of all, C becomes CW.

### Concrete Examples

#### Example 1: ETH Dutch Auction Pricing
**Scenario**: Round starts, no bids yet
- Starting price: 0.0002 ETH (previous round's first bid × 2)
- Ending price: 0.00001 ETH (start ÷ 20 + 1 wei)
- Duration: 2 days (3,600 seconds × 1,000,000 microseconds ÷ divisor)

**Timeline**:
- t=0: Price = 0.0002 ETH
- t=1 day: Price ≈ 0.00011 ETH (roughly halfway)
- t=2 days: Price = 0.00001 ETH (floor reached)
- Alice bids 0.00015 ETH at t=12 hours
- Next ETH price = 0.00015 + 0.00015/100 + 1 wei ≈ 0.0001515 ETH

#### Example 2: Prize Distribution
**Scenario**: Round ends with 10 ETH contract balance, 50 total bids
- Main prize (25%): 2.5 ETH → Last bidder
- Chrono-Warrior (7%): 0.7 ETH → Longest EC streak holder
- Bidder raffles (5% ÷ 3): 0.166 ETH each → 3 random bidders
- CSN staking (10%): 1 ETH → Distributed to all CSN stakers
- Charity (10%): 1 ETH → Charity address
- Remaining (43%): 4.3 ETH → Stays for next round

**CST rewards**:
- Each bidder: 100 CST immediate reward
- Endurance Champion: 50 × 10 = 500 CST bonus
- Last CST bidder: 50 × 10 = 500 CST bonus
- Marketing wallet: 1000 CST

#### Example 3: Champions Tracking
**Detailed timeline with timestamps**:
```
t=1000: Alice bids (first bid, becomes EC immediately)
  - EC: Alice, start=1000, duration=0
  - CW: none (initialized to max uint256)

t=1100: Bob bids (Alice was EC for 100 seconds)
  - EC: still Alice, duration=100
  - Last bidder: Bob

t=1250: Bob's streak reaches 150 seconds > Alice's 100
  - Update CW candidate: Alice's chrono = [1000+0, 1100+100] = 100 seconds
  - New EC: Bob, start=1100, duration=150, prevDuration=100
  - CW: Alice with 100 seconds

t=1300: Charlie bids
  - EC: Bob, duration=200
  - Last bidder: Charlie

t=1350: Charlie's streak reaches 50 seconds < Bob's 200
  - No champion changes

t=1600: David bids when Charlie has 300 > Bob's 200
  - Update CW: Bob's chrono = [1100+100, 1300+200] = 200 seconds
  - New EC: Charlie, start=1300, prevDuration=200
  - CW: Bob with 200 seconds

Round ends at t=2000:
  - Final EC: David (if he remained last bidder)
  - Final CW: Evaluated comparing all chrono windows
```

#### Example 4: Staking Rewards Calculation
**CSN Staking with 10 NFTs staked**:
1. Round 1 deposits 1 ETH: Each NFT earns 0.1 ETH
2. Alice stakes 2 NFTs at this point (snapshot = 0.1 ETH/NFT)
3. Round 2 deposits 0.5 ETH: Each NFT earns additional 0.05 ETH (total 0.15 ETH/NFT)
4. Alice unstakes: Receives (0.15 - 0.1) × 2 = 0.1 ETH total

#### Example 5: RandomWalk NFT Bid Discount
**Without RW NFT**:
- Current ETH price: 0.01 ETH
- Alice must pay: 0.01 ETH

**With RW NFT #123 (unused)**:
- Current ETH price: 0.01 ETH  
- Discounted price: ceil(0.01 / 2) = 0.005 ETH
- Alice pays: 0.005 ETH + provides NFT #123
- NFT #123 marked as used (cannot be used again)

In summary:
- EC is “who has the longest single continuous time as last bidder so far.”
- CW is “who has the longest chrono window derived from EC’s most recent streak at the time of each EC update, with a final check at round end.”

These definitions guarantee that EC recognizes peak continuous control during the round, while CW awards the best (possibly later) EC streak in terms of the chrono metric. Both are deterministic and fully driven by the bid timestamps recorded on‑chain.

This analysis is qualitative and intended to help new players build intuition; actual equilibria depend on parameterization and participant behavior.

### Summary

The Cosmic Signature game is a sophisticated on-chain gaming ecosystem built on Arbitrum that combines:
- **Economic mechanics**: Dutch auctions, dynamic pricing, dual-token system
- **Social dynamics**: Champions tracking, message boards, community prizes
- **DeFi elements**: Staking, governance, charity donations
- **NFT integration**: Prize NFTs, staking rewards, legacy NFT discounts
- **Technical excellence**: Gas optimizations, upgrade safety, comprehensive security

The architecture demonstrates careful attention to:
- **Security**: Multiple layers of access control, reentrancy protection, safe fund handling
- **Fairness**: Timeout mechanisms, random selection, transparent rules
- **Sustainability**: Round-to-round balance carryover, configurable parameters
- **Extensibility**: UUPS upgradeability, modular design, event-driven architecture

This comprehensive documentation serves as both a technical specification and an integration guide for developers, auditors, and users of the Cosmic Signature ecosystem.
