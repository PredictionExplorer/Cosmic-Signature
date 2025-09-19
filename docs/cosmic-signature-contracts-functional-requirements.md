## Cosmic Signature Contracts: Functional Requirements

### About This Document

This document goes a little bit beyond purely functional requirements. It's intended to provide important details to the auditor.

### Glossary

- User. An Ethereum account capable of signing transactions with a private key.

### Contracts

- `CosmicSignatureGame`. This is our main Game contract. Its main part (not inherited) is responsible for upgrading the contract. It inherits OpenZeppelin's `UUPSUpgradeable`. Besides, it inherits multiple abstract contracts listed below.

- `CosmicSignatureGame is CosmicSignatureGameStorage`. This contract contains all state variables that `CosmicSignatureGame` and the contracts that it inherits access.

- `CosmicSignatureGame is BiddingBase`. This contract contains a few simple methods.

- `CosmicSignatureGame is MainPrizeBase`. This contract contains a few simple methods.

- `CosmicSignatureGame is SystemManagement`. This contract contains `CosmicSignatureGame` configurable parameter setters to be called only by the contract owner. With some exceptions, a typical setter requires that the current bidding round wasn't active yet.

- `CosmicSignatureGame is EthDonations`. Processes ETH donations made to `CosmicSignatureGame`.

- `CosmicSignatureGame is BidStatistics`. This contract supports updating and getting game playing statistics, including Endurance Champion and Chrono-Warrior.

- `CosmicSignatureGame is Bidding`. This contract supports bid price formation, processing arriving bids, as well as donated third party ERC-20 token amounts and ERC-721 NFTs that accompany the bids.

- `CosmicSignatureGame is SecondaryPrizes`. Secondary Prizes. This contract contains a few simple methods.

- `CosmicSignatureGame is MainPrize`. This contract supports claiming bidding round main prize.

- `CosmicSignatureToken`. The Official ERC-20 Token for the Cosmic Signature Ecosystem. Its symbol is CST. It's used by our DAO for voting power. Only the `CosmicSignatureGame` contract is permitted to mint and burn token amounts (although a token holder also has an option to burn own funds).

- `RandomWalkNFT`. It's an ERC-721 NFT contract that has already been deployed. Its symbol is RWLK. It can be considered a third party contract that is not a part of this project, but it plays an important role. This contract does not need to be audited.

- `CosmicSignatureNft`. The Official ERC-721 NFT for the Cosmic Signature Ecosystem. Its symbol is CSN. Only the `CosmicSignatureGame` contract is permitted to mint new NFTs.

- `PrizesWallet`. A wallet to hold the Cosmic Signature Game prizes and donations. It supports depositing ETH, donating third party ERC-20 token amounts and ERC-721 NFTs, and allows prize winners (and after a timeout anybody) to withdraw their prizes.

- `DonatedTokenHolder`. This contract acts as an account holding all third party ERC-20 token balances donated during a particular bidding round.

- `StakingWalletRandomWalkNft`. Staking Wallet for Random Walk NFTs. Supports random picking of staked NFTs.

- `StakingWalletCosmicSignatureNft`. Staking Wallet for Cosmic Signature NFTs. It holds ETH to be distributed to stakers. It tracks the cumulative amount of ETH rewards earned by each staked NFT and pays it to the staker on NFT unstake.

- `MarketingWallet`. This wallet holds CST funds and facilitates their distribution to fund marketing activities. The `CosmicSignatureGame` contract mints a configurable CST amount for this wallet at the end of each bidding round. Only the appointed by the DAO treasurer is permitted to transfer funds out of this wallet.

- `CharityWallet`. This contract holds an ETH balance to be donated to charity. The DAO decides which charity to donate the funds to. `CosmicSignatureGame` deposits a configurable percentage of its ETH to this wallet at the end of each bidding round. As noted in Comment-202409273, this contract lets anybody to periodically transfer accumulated donations to the designated charity.

- `CosmicSignatureDao`. This contract implements the governance mechanism for the Cosmic Signature ecosystem. `${workspaceFolder}/test/tests-src/CosmicSignatureDao.js` shows what our DAO can be used for.

### Variables

- `roundActivationTime`. The current bidding round activation time. Starting at this point in time, people will be allowed to place bids.

- `mainPrizeTime`. The time when the last bidder will be granted the premission to claim main prize.

- `charityAddress`. This variable exists in `CharityWallet`, where it contains the address to donate ETH to. The same named variable exists in `CosmicSignatureGameStorage`, where it actually points at our own `CharityWallet`. See Comment-202411078 for details.

### Bidding Rounds

Each point in time is located within a bidding round, or simply round. Each round has a sequential number, starting with zero. Round zero begins the moment the contract gets deployed. A round begins in the inactive mode. When `block.timestamp` reaches `roundActivationTime`, the round becomes active. The active mode/stage is divided into 2 substages: before and after a bid is placed.

So a round has 3 stages: (1) inactive; (2) active before a bid; (3) active after a bid.

Only during the inactive stage the contract owner is allowed to call most `CosmicSignatureGame` configurable parameter setters. But there are setters that are in addition allowed to be called during stage 2 and some at any time. Some other contracts also have configurable parameter setters, and those are OK to call at any time.

Users are allowed to place bids during the active stage.

When a bid is placed, `mainPrizeTime` gets updated (the logic is described in a separate section). 

When `block.timestamp` reaches `mainPrizeTime`, the last bidder is granted the right to claim main prize. But if they do not do so by the time `block.timestamp` reaches `mainPrizeTime` plus a configurble timeout, main prize becomes available to claim by anybody.

When main prize gets claimed, the caller is declared the round's main prize winner and receives main ETH prize, other winners are selected and awarded with their prizes, the current round ends and the next one begins in the inactive mode by changing `roundActivationTime` to `block.timestamp` plus a configurable duration.

### Bid Types

There are 2 bid types, depending on bid currency: ETH and CST.\
ETH bid is broken down into 2 subtypes: with and without a Random Walk NFT.

### Bid Price Formation

The `CosmicSignatureGame` contract dictates bid prices. Bidders have no control over that. However it's still under their control when to bid, which affects the prices.

Round zero **ETH bid price** equals a hardcoded constant. It does not change.\
In any round, ETH bid price of the second and further bids increases exponentially as the previous bid paid price plus a configurable fraction of it. (The price does not change over time.)\
Starting with round 1, the first bid beginning ETH bid price equals 2x of the first bid paid price in the previous round. Beginning at `roundActivationTime` and over a configurable duration, the price declines linearly from the maximum to the minimum. The minimum is a configurable fraction of the first bid paid price in the previous round. If bid price reaches its minimum and nobody bid yet it will stay at its minimum indefinitely (but the `halveEthDutchAuctionEndingBidPrice` method gives the contract owner an option to lower it further). That's a Dutch auction.

If an ETH bid is accompanied by a Random Walk NFT, the bid price becomes a half of its normal value.

Every **CST bid price** is formed using a Dutch auction. The first CST Dutch auction in a given round begins when a user places the first ETH bid.\
The beginning CST bid price of round zero equals a configurable beginning minimum. Then over a configurable duration it declines lineraly down to zero. As soon as someone places a bid, the new beginning price is calculated as 2x of the paid price, but no lower than the same configurable beginning minimum. After each bid the Dutch auction repeats.\
The beginning CST bid price of the first bid in a nonzero round equals beginning price of the second bid in the previous round.

Again, a Dutch auction is used for: (1) the first ETH bid price in a nonzero round; (2) each CST bid price, but with at least a floor beginning price. Round zero first ETH bid price is a constant. Any round non-first ETH bid price increases exponentially.

### Bid Monetary Effects

- When placing an ETH bid, the current ETH bid price gets transferred from the bidder to the Game contract.

- When placing a CST bid, the current CST bid price gets burned from the bidder's CST balance.

- When someone places a bid of any type, a configurable CST amount is minted for the bidder.

### `mainPrizeTime` Update Logic

When someone places the first bid in a round, `mainPrizeTime` gets calculated as `block.timestamp` plus a configurable duration.\
When another bid is placed, `mainPrizeTime` gets calculated as `max(mainPrizeTime, block.timestamp)` plus a shorter configurable duration.

### Bidding Rules

- Bidding is allowed only if the current round is in the active mode.

- The first bid in a round is required to be ETH.

- Each bid changes `mainPrizeTime`, as described in a separate section.

- Each bid changes bid price, as described in a separate section.

- A given Random Walk NFT may be used for bidding only once.

### Endurance Champion and Chrono-Warrior

These winners/champions are defined in `${workspaceFolder}/README.md`. Use the following reg-ex pattern to find the right text (case sensitive, not whole word):
```regex
\bECs?\b|(?:ew|ld|rev)EC|\bCW\b|ENDURANCE|[Ee]ndurance|CHRONO|[Cc]hrono
```
todo-0 Make sure the above pattern is correct.

There are designated storage variables to store the current Endurance Champion and Chrono-Warrior. They are updated on each bid, except the first bid in a round, and then last time on main prize claim. The variables actually contain outdated values. Provided the first bid has been placed in the current bidding round, the actual real-time values specifying who the champions are and their durations change over time, even if the contract state does not change. Relevant logic is implemented in the `BidStatistics` contract.

### Donating Assets

- Anybody can make an ETH donation to the `CosmicSignatureGame` contract without placing a bid, with or without providing a message.

- A bid may include a third party ERC-20 token amount or ERC-721 NFT donation. The donated asset will be transferred to `PrizesWallet`.

### Prizes

Most prizes are awarded to multiple winners at the end of each round. Some winners get picked randomly and others deterministically. The way the Game is configured, distributes only a half of its ETH balance to winners.

All prizes are listed in "./cosmic-signature-game-prizes.md".

### Prize Transfer Reversals

One of the prizes is a charitable donation ETH to be transferred to `CosmicSignatureGameStorage.charityAddress`. (It's not really a prize to be awarded to someone, but we can consider it a prize.) If the transfer reverts we will not revert the main prize claim. In fact, one might argue that this feature is unnecessary because the ETH transfer goes to our own `CharityWallet`, which cannot, realistically, revert. But we have no plans to refactor this. See Comment-202411078, Comment-202411077 for details.

### Withdrawing Prizes

- The main ETH prize is transfered directly to main prize winner claiming main prize. There is nothing to withdraw in this case.

- Other (secondary) ETH prizes are transferred to `PrizesWallet`. Even main prize winner can get their secondary ETH prizes this way.

- Donated third party ERC-20 token amounts and ERC-721 NFTs are transferred to `PrizesWallet`. They are claimable by main prize winner.

- CST and CSN prizes are minted to the winner addresses by making calls to respective token contracts. There is nothing to withdraw in this case.

- Winners are required to withdraw/claim their prizes held in `PrizesWallet`. They are given a configurable timeout window after the round end to do so before anybody is allowed to withdraw/claim unclaimed prizes.

### Random Number Generation

Some prize winners are picked randomly. We have done our best to generate high quality random numbers purely on-chain. We have found 2 Arbitrum precompile methods that return different values after each transaction. We use them besides some other lower quality sources of randomness to generate random numbers. Therefore it's practically impossible to develop a script that sends transaction requests in such a way that it knows what random number will be generated. Additionally, we believe that this game does not offer a sufficient profit incentive for someone to attempt developing such a script.

### Exponential Duration Increase

At the end of each round, the following configurable durations automatically increase exponentially by a configurable fraction: ETH and CST Dutch auction durations; initial duration until main prize (used to calculate `mainPrizeTime` on the first bid in a round); `mainPrizeTime` increment (by how much `mainPrizeTime` gets extended on each subsequent bid in a round).

### Cosmic Signature and Random Walk NFT Staking

NFTs from both our NFT contracts can be staked. Stakers receive designated prizes/rewards, as specified in "./cosmic-signature-game-prizes.md".

An NFT may be staked only once. Once unstaked, the same NFT may not be staked again.

### Asset Types and Their Flows

#### ETH

- At any time, a user can donate ETH to the Game contract.\
A user also can force-send ETH to the Game contract by `selfdestruct`ing a contract, which would result in the same outcome as a donation, except a respective event won't be emitted.

- While a round is active, a user can place an ETH bid. The current ETH bid price, or a half of it if an RWLK was provided, is transferred to the Game contract.

- At the end of each round, a half of the Game contract ETH balance is awarded to various beneficiaries: main prize winner gets paid directly to their address; CSN staking awards are transferred to `StakingWalletCosmicSignatureNft`; ETH to be donated to charity is tansferred to `CharityWallet`; other winners' ETH prizes, including any secondary prizes won by main prize winner, are transferred to `PrizesWallet`.

- At any time, a user can withdraw their ETH balance from `PrizesWallet`. After a timeout, anybody is allowed to withdraw unclaimed assets from there.

- At any time, a user can transfer ETH from `CharityWallet` to the charity.

- At any time, a staker can unstake their CSN and get their staking ETH rewards.

#### Cosmic Signature Token (Symbol = "CST")

- While a round is active, a user can place a CST bid. The current CST bid price gets burned.

- When a user places a bid of any type, they get rewarded with a configurable amount of CST.

- At the end of a round, various amounts of CST are minted for various beneficiaries, including `MarketingWallet`.

- The treasurer uses CST in `MarketingWallet` to fund marketing activities, such as rewarding people for marketing the project on social media.

- CST is used by our DAO for voting power.

#### Random Walk NFT (Symbol = "RWLK")

- While a round is active, an RWLK can be provided with an ETH bid, which halves ETH price the bidder is required to pay. An RWLK is allowed to be used for bidding only once.

- At any time, an RWLK can be staked. An RWLK is allowed to be staked only once.

- At any time, a staker can unstake their RWLK.

#### Cosmic Signature NFT (Symbol = "CSN")

- At the end of a round, a number of CSNs are minted for various beneficiaries.

- At any time, a CSN can be staked. A CSN is allowed to be staked only once.

- At any time, a staker can unstake their CSN and get their staking ETH rewards.

#### Third party ERC-20 token amount and ERC-721 NFT

- When a bidding round is active, one or the other asset can be provided/donated together with a bid of any type. The donated asset is transferred to `PrizesWallet`.

- At any time, a particular round main prize winner can claim the ERC-20s and ERC-721s donated during the round and held in `PrizesWallet`. After a timeout, anybody is allowed to withdraw unclaimed assets from there.

### Actions Logic

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

- If this is not the first bid in the current bidding round: update Endurance Champion and Chrono-Warrior.

- Update `mainPrizeTime`.

- If the user sent us more ETH than required: transfer the excess back to them. But don't do it if the refund amount is less than or equal than what it would cost to transfer it.

#### A user places a CST bid.

- Parameters:
	- Max CST price the user is willing to pay.
	- Message (optional).

- If the provided message is too long: revert.

- If no bid placed in the current bidding round yet: revert. (An ETH bid shall happen first. So provided it happened, we know that the current bidding round is active, therefore it's unnecessary to check that.)

- Calculate the current CST bid price.

- If the provided max price the user is willing to pay or the user's CST balance is less than required: revert.

- Burn the current CST bid price from the user's CST balance.

- Mint a configurable CST amount for the user.

- Update Endurance Champion and Chrono-Warrior. (We have already checked that this is not the first bid in the current bidding round, so it's unnecessary to check that again.)

- Update `mainPrizeTime`.

#### A user claims the current bidding round main prize.

- If the caller is the last bidder:

	- Note that at this point we know that someone has already placed a bid in the current round. So it's unnecessary to check that.

	- If `block.timestamp < mainPrizeTime`: revert.

- Else:

	- If no bid placed in the current round yet: revert.

	- Note that at this point we know that someone who is not the last bidder is trying to claim main prize. They do actually have a chance to succeed.

	- If timeout to claim main prize has not expired yet, that's if `block.timestamp < mainPrizeTime + timeout`: revert.

- Update Endurance Champion and Chrono-Warrior.

- Distribute prizes. All prizes distributed on main prize claim, or, in other words, at the end of a round, are listed in "./cosmic-signature-game-prizes.md".

- Update contract state to begin the next round, which includes:

	- `roundActivationTime = block.timestamp` plus a configurable duration.
