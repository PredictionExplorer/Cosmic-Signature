todo-0 Review the old Nick's document again.

## Cosmic Signature Contracts: Functional Requirements

### Glossary

- User. An Ethereum account capable of signing transactions with a private key.

### Contracts

- `CosmicSignatureGame`. This is our main Game contract. Its main part (not inherited) is responsible for upgrading the contract. Besides, it inherits functionality from multiple abstract contracts listed below.

- `CosmicSignatureGame is CosmicSignatureGameStorage`. This contract contains all state variables that `CosmicSignatureGame` and the contracts that it inherits access.

- `CosmicSignatureGame is BiddingBase`. This contract contains a few simple methods.

- `CosmicSignatureGame is MainPrizeBase`. This contract contains a few simple methods.

- `CosmicSignatureGame is SystemManagement`. This contract contains `CosmicSignatureGame` configurable parameter setters to be called only by the owner. With some exceptions, a typical setter requires that the current bidding round wasn't active yet.

- `CosmicSignatureGame is EthDonations`. Anybody can make an ETH donation to the `CosmicSignatureGame` contract without placing a bid, with or without providing a message.

- `CosmicSignatureGame is BidStatistics`. This contract is responsible for updating and getting game playing statistics.

- `CosmicSignatureGame is Bidding`. This contract is responsible for bid price formation, processing arriving bids, processing donated assets that accompany the bids.

- `CosmicSignatureGame is SecondaryPrizes`. Secondary, a.k.a. Special (Non-Main) Prizes. This contract contains a few simple methods.

- `CosmicSignatureGame is MainPrize`. This contract supports claiming bidding round main prize.

- `CosmicSignatureToken`. The Official ERC-20 Token for the Cosmic Signature Ecosystem. Its symbol is CST.

- `CosmicSignatureNft`. The Official ERC-721 NFT for the Cosmic Signature Ecosystem. Its symbol is CSN.

- `PrizesWallet`. A wallet to hold the Cosmic Signature Game prizes and donations. It supports depositing ETH, donating ERC-20 tokens and ERC-721 NFTs, and allows prize winners (and after a timeout anybody) to withdraw their prizes.

- `DonatedTokenHolder`. This contract acts as an account holding all ERC-20 token balances donated during a particular bidding round.

- `StakingWalletRandomWalkNft`. Staking Wallet for Random Walk NFTs.

- `StakingWalletCosmicSignatureNft`. Staking Wallet for Cosmic Signature NFTs.

- `MarketingWallet`. This wallet holds a CST balance and facilitates its distribution to fund marketing activities.

- `CharityWallet`. This contract holds an ETH balance to be donated to charity.

- `CosmicSignatureDao`. This contract implements the governance mechanism for the Cosmic Signature ecosystem.

- `RandomWalkNFT`. It's an ERC-721 NFT contract that has already been deployed. Its symbol is RWLK. It can be considered a third party contract that is not a part of this project, but it plays an important role.

### Variables

- `roundActivationTime`. The current bidding round activation time. Starting at this point in time, people will be allowed to place bids.

- `mainPrizeTime`. The time when the last bidder will be granted the premission to claim the main prize.

- `charityAddress`. This variable exists in `CharityWallet`. The same named variable exists in `CosmicSignatureGameStorage` and actually points at our own `CharityWallet`.

### Bidding Rounds

Each point in time is located within a bidding round, or simply round. Each round has a sequential number, starting with zero. Round zero begins the moment the contracts get deployed. A round begins in the inactive mode. When the current block timestamp reaches `roundActivationTime`, the round becomes active. The active mode is divided into 2 parts: before and after a bid is placed.

So a round has 3 stages: (1) inactive; (2) active before a bid; (3) active after a bid.

Only during the inactive stage the contract owner is allowed to call most `CosmicSignatureGame` configurable parameter setters. But there are setters that are in addition allowed to be called during stage 2 and some at any time. Some other contracts also have configurable parameter setters, and those are OK to call at any time.

Users are allowed to place bids during the active stage.

When a bid is placed, `mainPrizeTime` gets updated (the logic is described in a separate section). 

When the current block timestamp reaches `mainPrizeTime`, the last bidder is granted the right to claim main prize. But if they do not claim it by the time the current block timestamp reaches `mainPrizeTime` plus a configurble timeout, the main prize becomes available to claim by anybody.

When main prize gets claimed, the caller is declared the round's main prize winner and receive main ETH prize, other winners are selected and awarded with their prizes, the current round ends and the next one begins in the inactive mode by changing `roundActivationTime` to `block.timestamp` plus a configurable duration.

### Bid Types

There are 2 bid types, depending on bid currency: ETH and CST.\
ETH bid is broken down into 2 subtypes: with and without a Random Walk NFT.

### Bid Price Formation

The `CosmicSignatureGame` contract dictates bid prices. Bidders have no control over that. However it's still under their control when to bid, which affects the prices.

Round zero **ETH bid price** equals a hardcoded constant. It does not change.\
In any round, ETH bid price of the second and further bids increases exponentially as the previous bid paid price plus a configurable fraction of it. (It does not change over time.)\
Beginning with round 1, the first bid starting ETH bid price equals 2x of the first bid paid price in the previous round. Startting at `roundActivationTime` and over a configurable duration, the price declines linearly from the maximum to the minimum. The minimum is a configurable fraction of the first bid paid price in the previous round. If the price reaches its minimum and nobody bid yet it will stay at its minimum indefinitely. That's a Dutch auction.

If an ETH bid is accompanied by a Random Walk NFT, the bid price becomes a half of its normal value.

Every **CST bid price** is formed using a Dutch auction. The first CST Dutch auction in a given round begins when a user places the first ETH bid.\
The starting CST bid price of round zero equals a configurable minimum. Then over a configurable duration it declines lineraly down to zero. As soon as someone places a bid, the new starting price is calculated as 2x of the paid price, but no lower than the same configurable minimum. After each bid the Dutch auction repeats.\
The starting CST bid price of the first bid in a nonzero round equals starting price of the second bid in the previous round.

Again, a **Dutch auction** is used for: (1) the first ETH bid price in a nonzero round; (2) each CST bid price.

### Bid Monetary Effects

When placing an ETH bid, the current ETH bid price gets transferred from the bidder to the Game contract.\
When placing a CST bid, the current CST bid price gets burned from the bidder's CST balance.\
When someone places a bid of any type, a configurable amount of CST is minted for the bidder.

### `mainPrizeTime` Update Logic

When someone places the first bid in a round, `mainPrizeTime` gets calculated as `block.timestamp` plus a configurable duration.\
When another bid is placed, `mainPrizeTime` gets calculated as `max(mainPrizeTime, block.timestamp)` plus a shorter configurable duration.

### Bidding Rules

- Bidding is allowed only if the current round is in the active mode.

- The first bid in a round is required to be ETH.

- Each bid changes bid price, as described in a separate section.

- Each bid changes `mainPrizeTime`, as described in a separate section.

- A given Random Walk NFT may be used only once for bidding.

### Endurance Champion and Chrono-Warrior

Those winners are defined in `${workspaceFolder}/README.md`. Use the following reg-ex pattern to find the right text (case insensitive, not whole word):
```regex
\b(?:ec|cw)\b|endurance|chrono
```

### Prizes

Prizes are distributed among multiple winners at the end of each round. Some winners get picked based on chance and others deterministically. Supported prize types are ETH, newly minted CST token amount, newly minted CSN NFT. The way the Game is configured, distributes only a half of its ETH balance to winners. Besides, as noted above, each bidder gets rewarded with CST the moment they place a bid. In addition, our Game supports ETH donations that add to the Game contract balance and ERC-20 token and ERC-721 NFT donations that will be awarded to the current bidding round main prize winner.

All prizes are listed in "./cosmic-signature-game-prizes.md".

### Prize Transfer Reversals

One of the prizes is a charitable donation ETH to be transferred to `CosmicSignatureGameStorage.charityAddress`. If the transfer reverts we will not revert the main prize claim. In fact, one might argue that this feature is unnecessary because the ETH transfer goes to our own `CharityWallet`, which cannot, realistically, revert. But we have no plans to refactor this.

### Withdrawing Prizes

- The main ETH prize is transfered directly to main prize winner claiming main prize. There is nothing to withdraw in this case.

- Other (secondary) ETH prizes are transferred to `PrizesWallet`. Even main prize winner can get their secondary ETH prizes this way.

- Donated ERC-20 token amounts and ERC-721 NFTs are transferred to `PrizesWallet`. They are claimable by main prize winner.

- CST and CSN prizes are minted by respective token contracts to the winner address. There is nothing to withdraw in this case.

- Winners are required to withdraw/claim their prizes held in `PrizesWallet`. They are given a configurable timeout window after the round end to do so before anybody is allowed to withdraw/claim unclaimed prizes.

### Random Number Generation

Some prize winners are picked randomly. We have done our best to generate high quality random numbers purely on-chain. We have found 2 Arbitrum precompile methods that return different values after each transaction. We use them besides some other lower quality sources of randomness to generate random numbers. Therefore it's practically impossible to develop a script that sends transaction requests in such a way that it knows what random number will be generated. Additionally, we believe that this game does not offer a sufficient profit incentive for someone to attempt developing such a script.

### Exponential Duration Increase

At the end of each round, the following configurable durations automatically increase exponentially by a configurable fraction: ETH and CST Dutch auction durations; initial duration until main prize (used to calculate `mainPrizeTime` on the first bid in a round); `mainPrizeTime` increment (by how much `mainPrizeTime` gets extended on each subsequent bid in a round).

### Cosmic Signature and Random Walk NFT Staking

NFTs from both our NFT contracts can be staked. Stakers receive designated prizes/rewards, as specified in "./cosmic-signature-game-prizes.md".

An NFT may be staked only once. Once unstaked, the same NFT may no longer be staked again.

### Actions Logic

#### Contract owner upgrades the `CosmicSignatureGame` contract.

- If the caller is not contract owner: revert.

- If the current bidding round is active: revert.

#### A user places an ETH bid.

- Parameters:
	- Random Walk NFT ID (optional).
	- Message (optional).

- If the provided message is too long: revert.

- If the current bidding round is inactive: revert.

- Calculate the current ETH bid price.

- Calculate the price the user is required to pay. It will be (1) the same as above or (2) a half of it if the user provided an RW NFT.

- If `msg.value` is less than required: revert.

- If an RW NFT has been provided:

	- if the NFT already was used for bidding or the caller is not the NFT owner: revert.

- Mint a configurable CST amount for the user.

- Update `mainPrizeTime`.

- If the user sent us more ETH than required: send the excess back to them. But don't do it if the refund amount is less than or equal than what it would cost to transfer it.

#### A user places a CST bid.

- Parameters:
	- Max CST price the user is willing to pay.
	- Message (optional).

- If the provided message is too long: revert.

- If no bid placed in the current round yet: revert. (An ETH bid shall happen first. So provided it happened, we know that the current bidding round is active.)

- Calculate the current CST bid price.

- If the provided max price the user is willing to pay or the user's CST balance is less than required: revert.

- Burn the current CST bid price from the user's CST balance.

- Mint a configurable CST amount for the user.

- Update `mainPrizeTime`.


#### TODO-0 More actions. Start with copying from listed methods in the old document.
