todo-0 Review the old Nick's document again.

## Cosmic Signature Contracts: Functional Requirements

### Glossary

- User. An Ethereum account capable of signing transactions with a private key.

### Contracts.

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

- `roundActivationTime`. 

- `mainPrizeTime`. 

### Bidding Rounds

Each point in time is located within a bidding round, or simply round. Each round has a sequential number, starting with zero. Round zero begins the moment the contracts get deployed. A round begins in the inactive mode. When the current block timestamp reaches `roundActivationTime`, the round becomes active. The active mode is divided into 2 parts: before and after a bid is placed.

So a round has 3 stages: (1) inactive; (2) active before a bid; (3) active after a bid.

Only during the inactive stage the contract owner is allowed to call most `CosmicSignatureGame` configurable parameter setters. But there are setters that are in addition allowed to be called during stage 2 and some at any time. Some other contracts also have configurable parameter setters, and those are OK to call at any time.

Users are allowed to place bids during the active stage.

When a bid is placed, `mainPrizeTime` gets updated (the logic is described in a separate section). 

When the current block timestamp reaches `mainPrizeTime`, the last bidder gets the right to claim main prize. When they do it, they are declared the round's main prize winner and receive main ETH prize, other winners are selected and awarded with their prizes, the current round ends and the next one begins in the inactive mode by changing `roundActivationTime` to `block.timestamp` plus a configurable duration.

### Bid Types

There are 2 **bid types**, defined by bid currency: ETH and CST. ETH bid is broken down into 2 subtypes: with and without a Random Walk NFT.

### Bid Price Formation

The `CosmicSignatureGame` contract dictates bid prices. Bidders have no control over that. However it's still under their control when to bid, which affects the prices.

Round zero **ETH bid price** equals a hardcoded constant. It does not change.\
In any round, ETH bid price of the second and further bids increases exponentially as the previous bid paid price plus a configurable fraction of it. (It does not change over time.)\
Beginning with round 1, the first bid starting ETH bid price equals 2x of the first bid paid price in the previous round. Over a configurable duration, the price declines linearly from the maximum to the minimum. The minimum is a configurable fraction of the first bid paid price in the previous round. If the price reaches its minimum and nobody bid yet it will stay at its minimum indefinitely. That's a Dutch auction.

If an ETH bid is accompanied by a Random Walk NFT, the bid price becomes a half of its normal value.

Every **CST bid price** is formed using a Dutch auction.\
The starting CST bid price of round zero equals a configurable minimum. Then over a configurable duration it declines lineraly down to zero. As soon as someone places a bid, the new starting price is calculated as 2x of the paid price, but no lower than the same configurable minimum. After each bid the Dutch auction repeats.\
The starting CST bid price of the first bid in a nonzero round equals starting price of the second bid in the previous round.

Again, a **Dutch auction** is used for: (1) the first ETH bid price in a nonzero round; (2) each CST bid price.

### Bid Monetary Effects

When placing an ETH bid, the current ETH bid price gets transferred from the bidder to the Game contract.\
When placing a CST bid, the current CST bid price gets burned from the bidder's CST balance.\
When someone places a bid of any type, a configurable amount of CST is minted for the bidder.

### `mainPrizeTime` Update Logic

When someone places the first bid in a round, `mainPrizeTime` gets calculated as `block.timestamp` plus a configurable duration. When another bid is placed, `mainPrizeTime` gets calculated as `max(mainPrizeTime, block.timestamp)` plus a shorter configurable duration.

### Bidding Mechanics

- Bidding is allowed only if the current round is in the active mode.

- Each bid changes bid price, as described in a separate section.

- Each bid changes `mainPrizeTime`, as described in a separate section.

- The first bid in a round is required to be ETH.

- A given Random Walk NFT may be used only once for bidding.

### Endurance Champion and Chrono-Warrior

Those winners are defined in `${workspaceFolder}/README.md`. Use the following reg-ex pattern to find the right text (case insensitive, not whole word):\b
`\b(?:ec|cw)\b|endurance|chrono`

### Prizes

Prizes are distributed among multiple winners at the end of each round. Some winners get picked based on chance and others deterministically. Supported prize types are ETH, newly minted CST token amount, newly minted CSN NFT. The way the Game is configured, distributes only a half of its ETH balance to winners. Besides, as noted above, each bidder gets rewarded with CST the moment they place a bid. In addition, our Game supports ETH donations that add to the Game contract balance and ERC-20 token and ERC-721 NFT donations that will be awarded to the current bidding round main prize winner.

All prizes are listed in "./cosmic-signature-game-prizes.md".

### Withdrawing Prizes

- The main ETH prize is transfered directly to main prize winner on main prize claim. So there is nothing to withdraw in this case.

- Other (secondary) ETH prizes are transferred to `PrizesWallet`. Even main prize winner can get their secondary ETH prizes this way.

- Donated ERC-20 token amounts and ERC-721 NFTs are transferred to `PrizesWallet`. They are claimable by main prize winner.

- CST and CSN prizes are minted by respective token contracts to the winner address. So there is nothing to withdraw in this case.

- Winners are required to withdraw their prizes held in `PrizesWallet`. They are given a configurable timeout window to do so.

### Cosmic Signature NFT Staking

todo-0 Write more

### Random Walk NFT Staking

At the end of each round, a configurable number of staked RW NFTs get picked randomly and new CS NFTs get minted for their stakers.

todo-0 Write more

### Actions Logic

#### Contract owner upgrades the `CosmicSignatureGame` contract.

- If the caller is not contract owner: revert.

- If the current bidding round is active: revert.

#### A user places an ETH bid.

- Calculate the current normal ETH bid price.

- Calculate the price the user needs to pay. It will be a half if the user has provided an RW NFT.

- If `msg.value` is less than required: revert.

- If an RW NFT has been provided:
	- if the NFT already was used for bidding or `msg.sender` is not the NFT owner: revert.

- Mint a configurable CST amount for the user.

- If the provided message is too long: revert.

- If the current bidding round is inactive: revert.

- Update `mainPrizeTime`.

#### A user places a CST bid.

- If no bid placed in the current round yet: revert.

- todo-0 write more

#### TODO-0 More actions. Start with copying from listed methods in the old document.
