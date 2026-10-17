## Cosmic Signature Contracts: Functional Requirements

### About This Document

This document goes a little bit beyond purely functional requirements. It's intended to provide important details to the auditor.

It describes the production source in this branch, distinguishing V1, V2, and V3 behavior. V3 is the upcoming Game implementation, not a statement that it is already deployed. Upgrading the Game proxy does not upgrade the separately deployed token, NFT, DAO, or wallet contracts. In particular, source changes to `PrizesWallet` apply to a newly deployed wallet, not automatically to the existing wallet. The [white paper](white-paper/cosmic-signature-white-paper-v1.3.md) records the reviewed release and deployment baseline.

### Glossary

- User. An account interacting with the contracts, either directly or through a smart contract. Contract callers are supported where they satisfy the relevant authorization and payment requirements.

### Contracts

- `CosmicSignatureGame`. This is our main Game contract, V1 of it. Its main part (not inherited) is responsible for initializing and upgrading the contract. It inherits OpenZeppelin's `UUPSUpgradeable`. Besides, it inherits multiple abstract contracts listed below.

- `CosmicSignatureGame is CosmicSignatureGameStorage`. This contract contains the shared Game-specific state variables. Inherited ownership, initialization, and reentrancy machinery also has its own state.

- `CosmicSignatureGame is BiddingCommon`. This contract contains a few simple methods.

- `CosmicSignatureGame is MainPrizeCommon`. This contract contains a few simple methods.

- `CosmicSignatureGame is SystemManagement`. This contract contains `CosmicSignatureGame` configurable parameter setters to be called only by the contract owner. With some exceptions, a typical setter requires that the current bidding round wasn't active yet.

- `CosmicSignatureGame is EthDonations`. Processes ETH donations made to `CosmicSignatureGame`.

- `CosmicSignatureGame is BidStatistics`. This contract supports updating and getting game playing statistics, including Endurance Champion and Chrono-Warrior.

- `CosmicSignatureGame is Bidding`. This contract supports bid price formation, processing arriving bids, as well as donated third party ERC-20 token amounts and ERC-721 NFTs that accompany the bids.

- `CosmicSignatureGame is SecondaryPrizes`. Secondary Prizes. This contract contains a few simple methods.

- `CosmicSignatureGame is MainPrize`. This contract supports claiming bidding round main prize.

- `CosmicSignatureGameV2`, `CosmicSignatureGameV3`, and other V2 and V3 abstract contracts that the new Game contracts inherit from. These are further versions of the Game contract to upgrade to.

- `CosmicSignatureToken`. The Official ERC-20 Token for the Cosmic Signature Ecosystem. Its symbol is CST. It's used by our DAO for voting power after delegation. Only the immutable Game address can mint or invoke the Game-specific burn methods. The inherited `ERC20Burnable` methods also let holders burn their own CST and approved spenders burn CST within their allowance. It supports permits and timestamp-based voting checkpoints.

- `RandomWalkNFT`. This is an existing external ERC-721 collection with symbol RWLK. The Game checks ownership for its one-time bid discount, and the Random Walk staking wallet holds NFTs for its selection pool. The source copy contains adaptations for current dependencies; it is not a new deployment of the existing collection. Its independent mint and withdrawal mechanism is outside the Game upgrade, but its integration remains part of this review.

- `CosmicSignatureNft`. The Official ERC-721 NFT for the Cosmic Signature Ecosystem. Its symbol is COSMIC. Only the immutable Game address can mint new NFTs. Each token stores a seed and an optional name. The owner or an approved operator may set a name of at most 32 bytes. The contract owner can change metadata and generation-script URIs; there is no setter for an existing seed.

- `PrizesWallet`. A wallet to hold the Cosmic Signature Game prizes and donations. It supports depositing ETH, donating third party ERC-20 token amounts and ERC-721 NFTs, and allows prize winners (and after a timeout anybody) to withdraw their prizes.

- `DonatedTokenHolder`. This contract acts as an account holding all third party ERC-20 token amounts donated during a particular bidding round.

- `StakingWalletRandomWalkNft`. Staking Wallet for Random Walk NFTs. Supports random picking of staked NFTs.

- `StakingWalletCosmicSignatureNft`. Staking Wallet for Cosmic Signature NFTs. It holds ETH to be distributed to stakers. It tracks the cumulative amount of ETH rewards earned by each staked NFT and pays it to the staker on NFT unstake.

- `MarketingWallet`. This wallet holds CST funds and facilitates their distribution to fund marketing activities, such as rewarding people for marketing the project on social media. The `CosmicSignatureGame` contract mints a configurable CST amount to this wallet on main prize claim. Only its treasurer can use the payment methods. The treasurer initially is the deployer and can be changed by the wallet owner; DAO appointment requires the DAO to own this wallet.

- `CharityWallet`. This contract holds an ETH balance to be donated to charity. Its owner chooses the beneficiary; DAO control requires ownership to have been transferred to the DAO. `CosmicSignatureGame` attempts to deposit a configurable percentage of its ETH to the configured charity address on main prize claim, normally this wallet. As noted in Comment-202409273, anybody can separately call the wallet to transfer all or a specified part of its accumulated ETH to its designated beneficiary. A zero beneficiary disables sending; a failed beneficiary transfer reverts that separate transaction.

- `CosmicSignatureDao`. This contract implements the governance mechanism for the Cosmic Signature ecosystem. `${workspaceFolder}/test/tests-src/CosmicSignatureDao.js` shows what our DAO can be used for.

The DAO uses delegated CST at timestamp snapshots. Its defaults are a 100 CST proposal threshold, a 2-day voting delay, a 2-week voting period, and quorum of 3% of snapshot total supply. For and Abstain count toward quorum; For must exceed Against. Successful proposals execute directly through the Governor, without a separate timelock module. The Governor cannot call another contract's owner-only methods unless that contract is owned by the Governor. Governance can change the Governor's settings through proposals.

### Storage Variables

- `roundActivationTime`. The current bidding round activation time. Starting at this point in time, people will be allowed to place bids.

- `mainPrizeTime`. The time when the last bidder will be granted the premission to claim the main prize.

- `charityAddress`. In `CharityWallet`, this is the ultimate beneficiary. In `CosmicSignatureGameStorage`, it is the recipient of the Game's charity allocation, normally our own `CharityWallet`. Each is separately configurable by its contract's owner. See Comment-202411078 for details.

- There are many other storage variables out there.

### Bidding Rounds

Each point in time is located within a bidding round, or simply round. Each round has a sequential number, starting with zero. Round zero begins the moment the contract gets deployed. A round begins in the inactive mode. When `block.timestamp` reaches `roundActivationTime`, the round becomes active. The active mode/stage is divided into 2 substages: before and after a bid is placed.

So a round is broken down in the following stages: (1) inactive; (2.1) active before a bid; (2.2) active after a bid.

Only during the inactive stage the contract owner is allowed to call most `CosmicSignatureGame` configurable parameter setters. But there are setters that are in addition allowed to be called during stage 2.1 and some at any time. Some other contracts also have configurable parameter setters, and those are OK to call at any time.

Users are allowed to place bids during the active stage, including after `mainPrizeTime` until a successful main prize claim. The deadline grants claim eligibility; it does not close bidding. A later bid can change the eligible last bidder and extend the stored deadline, which can still remain in the past.

When a bid is placed, `mainPrizeTime` gets updated (the logic is described in a separate section).

When `block.timestamp` reaches `mainPrizeTime`, the last bidder is granted the right to claim main prize. But if they do not do so by the time `block.timestamp` reaches `mainPrizeTime` plus a configurble timeout, main prize becomes available to claim by anybody.

When main prize gets claimed, the caller is declared the round's main prize winner and receives main ETH prize, other winners are selected and awarded with their prizes, and the current round ends. The next round's `roundActivationTime` is set to `block.timestamp` plus a configurable duration. With a positive, nonoverflowing delay it begins inactive; a zero delay makes it active immediately.

### Bid Types

There are 2 bid types, depending on bid currency: ETH and CST.\
ETH bid is broken down into 2 subtypes: with and without a Random Walk NFT.

### Bid Price Formation

The `CosmicSignatureGame` contract dictates bid prices. Bidders have no control over that. However it's still under their control when to bid, which affects the prices.

Round zero's first **ETH bid price** equals a hardcoded constant. It does not change over time.\
In any round, the base ETH bid price of the second and further ETH bids increases exponentially as the previous ETH bid's undiscounted base price plus a configurable fraction of it (the logic must ensure that even a small value will increase). This base price does not change over time.\
Starting with round 1, the first bid beginning ETH bid price equals 2x of the first ETH bid's undiscounted base price in the previous round. Beginning at `roundActivationTime` and over a configurable duration, the price declines linearly from the maximum to the minimum, subject to integer rounding. The minimum is `floor(beginningPrice / ethDutchAuctionEndingBidPriceDivisor) + 1 wei`, which keeps it nonzero under valid configuration, as discussed in Comment-202503162. If bid price reaches its minimum and nobody bid yet it will stay at its minimum indefinitely (but the `halveEthDutchAuctionEndingBidPrice` method gives the contract owner an option to lower it further). That's a Dutch auction.

If an ETH bid is accompanied by a Random Walk NFT, its required payment is `ceil(normalPrice / 2)`, including the late premium in V3. Rounding up preserves a nonzero price, as discussed in Comment-202503162.

Every **CST bid price** is formed using a Dutch auction. The first CST Dutch auction in a given round begins when a user places the first ETH bid.\
The first beginning CST bid price of round zero is initialized to the default beginning minimum. The first beginning CST bid price in a nonzero round equals the second beginning CST bid price in the previous round, or remains unchanged if that round had no CST bid. Changing `cstDutchAuctionBeginningBidPriceMinLimit` does not rewrite that saved first-auction price. When someone places a CST bid, the new beginning price is calculated as 2x of the base price without any late-bid premium, but no lower than the configured minimum and, in V3, the duration-based floor below. After each CST bid, the Dutch auction repeats.\
The base CST bid price declines linearly and can reach zero. In V2-, CST Dutch auction duration over which the price declines down to zero is configurable, and in V2 it's automatically reduced on each ETH and increased on each CST bid to encourage a mix of ETH and CST bids. In V3+, the stored `cstBidPriceDeclineMultiplier` is the decline rate in CST smallest units per second; bids adjust it in the opposite directions. It is not divided by the evolving cycle increment. After a CST bid, the new beginning price is also forced to be at least the new decline rate times `CST_DUTCH_AUCTION_DURATION_MIN_LIMIT` (3 minutes). An ETH bid increases the multiplier only if the resulting total auction duration, measured from its start, would remain at least that minimum. This does not guarantee three minutes remaining, and the first auction of a round can be shorter because its opening price is carried from an earlier round. See Comment-202611053 for details.

In V3+, bids near or after `mainPrizeTime` pay a polynomial premium. At default parameters the total cost rises from the base price to approximately 5 times that price during an initially 20-minute window, with exponent 8, and stays at its capped value after the deadline. The actual window grows with the time increment; the exact fixed-point calculation is documented in the white paper. The first bid of a round has no premium. The premium multiplies the base price, so a zero base CST price remains zero.

Again, a Dutch auction is used for: (1) the first ETH bid price in a nonzero round; (2) each CST bid's base price. Round zero first ETH bid price is a constant. Any round non-first ETH bid's base price increases exponentially from the previous ETH bid's undiscounted base price. Late-bid premiums and swallowed ETH overpayments do not increase these price anchors.

### Bid Monetary Effects

- When placing an ETH bid, the current ETH bid price gets transferred from the bidder to the Game contract.

- When placing a CST bid, the current CST bid price gets burned from the bidder's CST balance.

- When someone places a bid of any type, a configurable bid CST reward gets minted if nonzero. In V1, the amount is fixed. In V2, the amount is proportional to the square root of the duration elapsed since the previous bid in the current bidding round, or since round activation for the first bid. In V3+, the amount is linearly proportional to the duration since the previous bid; the first bid mints no reward. In V2-, the reward is minted to the bidder placing the bid, while in V3+, to the bidder who placed the previous bid in the current bidding round. See `${workspaceFolder}/docs/cosmic-signature-game-prizes.md` for details.

### `mainPrizeTime` Update Logic

When someone places the first bid in a round, `mainPrizeTime` gets calculated as `block.timestamp` plus a configurable duration.\
When another bid is placed, V1 calculaates `mainPrizeTime` as `max(mainPrizeTime, block.timestamp)` plus a shorter configurable duration, while V2+ simply adds the duration to `mainPrizeTime`. The rationale for the refactoring is described in Comment-202606175.

### Bidding Rules

- Bidding is allowed only if the current round is in the active mode.

- The first bid in a round is required to be ETH.

- In V2, each bid changes CST Dutch auction duration, as described in a separate section.

- In V3+, a CST bid reduces the CST price decline multiplier; an ETH bid increases it only when the minimum-duration guard permits, as described in a separate section.

- Each bid updates the price state of the same bid type, as described in a separate section. In V2+, an ETH bid can also reduce the current CST price, as mentioned in Comment-202608312. In V3 the duration guard can leave the decline multiplier unchanged; zero elapsed time or an already-zero base price can also leave the quoted CST price unchanged.

- Each bid advances `mainPrizeTime`, as described in a separate section.

- A given Random Walk NFT may be used for bidding only once.

### Endurance Champion and Chrono-Warrior

These winners/champions are defined in `${workspaceFolder}/docs/endurance-chrono-README.md`.

There are designated storage variables to store the current Endurance Champion and Chrono-Warrior. They are updated on each bid, except the first bid in a round, and then last time on main prize claim. The variables actually contain outdated values. Provided the first bid has been placed in the current bidding round, the actual real-time values specifying who the champions are and their durations change over time, even if the contract state does not change. Relevant logic is implemented in the `BidStatistics` contract.

### Donating Assets

- Anybody can make an ETH donation to the `CosmicSignatureGame` contract without placing a bid by calling `donateEth` or `donateEthWithInfo`. A plain ETH transfer with empty calldata instead invokes `receive` and attempts an ETH bid with default arguments.

- A bid may include a third party ERC-20 token amount or ERC-721 NFT donation. `PrizesWallet` holds the NFTs and deploys a separate `DonatedTokenHolder` for each round that receives ERC-20 donations. It controls the holder's token allowance and the beneficiary's later claims. Arbitrary token behavior can make a donation or claim fail; no compatibility guarantee is made for malicious or nonstandard assets.

### Prizes

Most prizes are awarded at the end of each round. Some recipients are selected randomly and others deterministically. The default ETH percentages total 50%, with the remainder retained for later rounds. Rounding, an absent Cosmic Signature staking pool, or a failed charity transfer can increase the amount retained. A larger reserve in the next round is not guaranteed. The percentages are owner-configurable, so 50% is a default rather than an invariant enforced by the contract.

All prizes are listed in `${workspaceFolder}/docs/cosmic-signature-game-prizes.md`.

### Prize Transfer Reversals

One allocation is an ETH transfer to `CosmicSignatureGameStorage.charityAddress`, normally `CharityWallet`. A failed transfer is recorded without reverting the main prize claim, leaving that ETH in the Game. See Comment-202411078, Comment-202411077 for details. This exception does not cover every external call: a failed direct payment to the main prize claimant or a failed token mint reverts finalization. A division-by-zero panic from the Cosmic Signature staking deposit, normally caused by an empty staking pool, is caught; other staking failures propagate. Secondary winners receive escrow credits rather than an immediate ETH callback.

### Withdrawing Prizes

- The main ETH prize is transfered directly to main prize winner claiming main prize. There is nothing to withdraw in this case.

- Other (secondary) ETH prizes are transferred to `PrizesWallet`. Even main prize winner can get their secondary ETH prizes this way.

- COSMIC staking ETH rewards are transferred to `StakingWalletCosmicSignatureNft`. The funds will stay there indefinitely until the user unstakes their NFT.

- Donated ERC-721 NFTs are held by `PrizesWallet`; donated ERC-20 balances are held by each round's `DonatedTokenHolder`. The main prize claimant receives priority to retrieve them through `PrizesWallet` after finalization.

- CST and COSMIC prizes are minted to the winner addresses by making calls to respective token contracts. There is nothing to withdraw in this case.

- Winners retrieve their escrowed prizes through `PrizesWallet`. When the round ends, the wallet records an absolute deadline using its then-current timeout duration (5 weeks by default). At or after that deadline, anyone may retrieve an unretrieved balance or asset for themselves. Changing the duration affects subsequently registered rounds, not deadlines already recorded. The owner may set the duration to zero before registration; the code does not enforce a minimum.

### Random Number Generation

Some recipients are selected using `RandomNumberHelpers`, which hashes available block and Arbitrum precompile values, then derives further values from the seed. This is block-derived randomness, not a verifiable random oracle. Values need not change after every transaction, and a sequencer or transaction submitter may influence ordering, timing, or whether to execute. The contracts do not prove unpredictability or prevent simulation and selective submission. The white paper documents the inputs and these limitations.

### Exponential Duration Increase

At the end of each round, the following configurable durations automatically increase exponentially by a configurable fraction: ETH Dutch auction duration; initial duration until main prize (used to calculate `mainPrizeTime` on the first bid in a round); `mainPrizeTime` increment (by how much `mainPrizeTime` gets extended on each subsequent bid in a round); in V3+, the duration before `mainPrizeTime` during which a premium is added to the bid price. In V1, CST Dutch auction duration is increased as well; in V2, it's reduced on each ETH bid and increased on each CST bid by a separate configurable fraction.

### Cosmic Signature and Random Walk NFT Staking

NFTs from both our NFT contracts can be staked. Stakers receive designated prizes/rewards, as specified in `${workspaceFolder}/docs/cosmic-signature-game-prizes.md`.

An NFT may be staked only once. Once unstaked, the same NFT may not be staked again.

Only the original staker can unstake. Cosmic Signature rewards accrue as the sum of each deposit divided by the number of NFTs staked at that deposit; division remainders stay in the wallet. Unstaking transfers the NFT back and pays accrued ETH atomically, so a failed ETH payment reverts the unstake. When no NFTs remain staked, the wallet owner can send its residual ETH to a chosen nonzero address through `tryPerformMaintenance`. Random Walk staking has no ETH payout; its selections are with replacement and weighted by the number of NFTs held in the staking pool. The one-time Random Walk bid discount and the one-time staking permission are tracked independently.

### Asset Types and Their Flows

#### ETH

- At any time, a user can donate ETH to the Game contract.\
According to Comment-202610044, a user also can force-send ETH to the Game contract by `selfdestruct`ing a contract, which would result in the same outcome as a donation, except a respective event won't be emitted.

- While a round is active, a user can place an ETH bid. The current ETH bid price, or `ceil(price / 2)` if an RWLK was provided, is transferred to the Game contract, together with any swallowed overpayment.

- At the end of each round, the configured percentages of the Game's ETH balance are distributed: the main prize claimant is paid directly; COSMIC staking allocations go to `StakingWalletCosmicSignatureNft`; the charity allocation is attempted to the configured charity address; secondary ETH allocations go to `PrizesWallet`. Defaults total 50%, subject to the rounding and skipped-transfer cases described above.

- At any time, a user can withdraw their ETH prizes from `PrizesWallet`. After a timeout, anybody is allowed to withdraw unclaimed assets from there.

- Anyone can call `CharityWallet.send` to forward ETH to its configured nonzero beneficiary; a failed transfer reverts.

- At any time, a staker can unstake their COSMIC and get their staking ETH rewards.

#### Cosmic Signature Token (Symbol = "CST")

- While a round is active, a user can place a CST bid. The current CST bid price gets burned.

- When a user places a bid of any type, a configurable CST reward goes to that bidder in V2-, or to the previous bidder in V3+. See Bid Monetary Effects above.

- At the end of a round, various amounts of CST are minted to various beneficiaries, including `MarketingWallet`.

- The treasurer uses CST in `MarketingWallet` to fund marketing activities, such as rewarding people for marketing the project on social media.

- CST is used by our DAO for voting power.

- Holders can voluntarily burn their CST, and approved spenders can use `burnFrom` within their allowance. These flows are independent of bidding.

#### Random Walk NFT (Symbol = "RWLK")

- While a round is active, an RWLK can be provided with an ETH bid, which halves the required ETH price with upward rounding to whole wei. An RWLK is allowed to be used for bidding only once.

- At any time, an RWLK can be staked. An RWLK is allowed to be staked only once.

- At any time, a staker can unstake their RWLK.

#### Cosmic Signature NFT (Symbol = "COSMIC")

- At the end of a round, a number of COSMICs are minted to various beneficiaries.

- At any time, a COSMIC can be staked. A COSMIC is allowed to be staked only once.

- At any time, a staker can unstake their COSMIC and get their staking ETH rewards.

#### Third party ERC-20 token amount and ERC-721 NFT

- When a bidding round is active, one or the other asset can accompany a bid of any type. The NFT goes to `PrizesWallet`; ERC-20 balances go to the round's `DonatedTokenHolder` under that wallet's control.

- After finalization, the registered main prize beneficiary can retrieve the round's donated ERC-20s and ERC-721s through `PrizesWallet`. Once the recorded timeout expires, anybody can retrieve remaining assets for themselves. A zero requested ERC-20 amount means to query and transfer the holder's current balance, not necessarily the amount originally donated.

### Actions Logic

The following lists summarize required conditions and successful effects; they are not an execution-order trace. In particular, price and reward checks and token calls can fail before the message, activation, or first-bid-type checks in `_bidCommon`. See [V3 vs V2 changes](v3-vs-v2-changes.md#event-order-and-revert-behavior) for error precedence.

#### A user places an ETH bid.

- Parameters:
	- Random Walk NFT ID (optional).
	- Message (maye be empty).
	- V2+: Bid CST reward min limit (may be zero).

- If the provided message is too long: revert.

- If the current bidding round is inactive: revert.

- V2+: If the provided bid CST reward min limit is greater than the current bid CST reward: revert.\
  But in V3+ don't check this if there were no bids in the current round yet.

- Calculate the current ETH bid price, including any V3+ late-bid premium.

- Calculate the price the user is required to pay. It will be (1) the same as above or (2) `ceil(price / 2)` if the user provided an RW NFT.

- V3+: Use the undiscounted ETH bid price without the premium for price updates and raffle weights (Comment-202609098).

- If `msg.value` is less than required: revert.

- If an RW NFT has been provided:

	- if the NFT already was used for bidding or the caller is not the NFT owner: revert.

	- Register that the provided NFT was used for bidding.

- V2-: Mint a bid CST reward to the current bidder.\
  V3+: If this is not the first bid in the current bidding round: mint a bid CST reward to the previous bidder.

- If this is not the first bid in the current bidding round: update Endurance Champion and Chrono-Warrior.

- Update `mainPrizeTime`.

- V2: reduce CST Dutch auction duration.

- V3+: increase CST bid price decline per second only if the resulting auction duration would remain at least `CST_DUTCH_AUCTION_DURATION_MIN_LIMIT` (Comment-202611053).

- If the user sent more ETH than required, refund the excess only when it exceeds `ethBidRefundAmountInGasToSwallowMaxLimit * tx.gasprice`. Excess at or below that threshold remains in the Game. This is a configured gas-cost estimate, not a measurement of the eventual refund cost.

#### A user places a CST bid.

- Parameters:
	- Max CST price the user is willing to pay.
	- Message (maye be empty).
	- V2+: Bid CST reward min limit (maye be zero).

- If the provided message is too long: revert.

- If no bid placed in the current bidding round yet: revert. (An ETH bid shall happen first. So provided it happened, we know that the current bidding round is active, therefore it's unnecessary to check that.)

- V2+: If the provided bid CST reward min limit is greater than the current bid CST reward: revert.

- Calculate the current CST base price.

- V3+: If a bid was already placed within the current round and the current time is inside the late window or after `mainPrizeTime`, add the applicable premium to the base price. The premium is capped at its deadline value and is zero when the base price is zero.

- If the provided max price the user is willing to pay or the user's CST balance is less than required: revert.

- Burn the current CST bid price from the user's CST balance.

- V2-: Mint a bid CST reward to the current bidder.\
  V3+: If this is not the first bid in the current bidding round: mint a bid CST reward to the previous bidder.

- On a successful non-first bid, update Endurance Champion and Chrono-Warrior.

- Update `mainPrizeTime`.

- V2: increase CST Dutch auction duration.

- V3+: reduce CST bid price decline per second.

#### A user claims the current bidding round main prize.

- If the caller is the same as the last bidder:

	- Note that at this point we know that someone has already placed a bid in the current round. So it's unnecessary to check that.

	- If `block.timestamp < mainPrizeTime`: revert.

- Else:

	- If no bid placed in the current round yet: revert.

	- Note that at this point we know that someone who is not the last bidder is trying to claim main prize. They do actually have a chance to succeed.

	- If timeout to claim main prize has not expired yet, that's if `block.timestamp < mainPrizeTime + timeout`: revert.

- Update Endurance Champion and Chrono-Warrior.

- Distribute prizes. All prizes distributed on main prize claim, or, in other words, at the end of a round, are listed in `${workspaceFolder}/docs/cosmic-signature-game-prizes.md`.

- Update contract state to begin the next round, which includes:

	- `roundActivationTime = block.timestamp` plus a configurable duration.
