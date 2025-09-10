### Cosmic Signature Contracts: Functional Requirements

#### About This Document

We wrote this document by request of contract auditors. It's not meant to be comprehensive. A comprehensive wall of text would have to be a few times higher. It describes only the most important functionalities. We recommned that you also read other documents seen in this project, including `${workspaceFolder}/README.md`.

#### Overview

The Cosmic Signature project consists of multiple contracts to be deployed on the Arbitrum One blockchain. The main contract is named `CosmicSignatureGame`. There are a number of other contracts providing specific functionalities. Those include: `CosmicSignatureToken`, `CosmicSignatureNft`, `PrizesWallet`, among others. `RandomWalkNFT` is a special third party contract deployed long ago. It's not considered a part of this project, but it plays an important role.

**`CosmicSignatureGame` workflow** supports and/or is driven by the passage of time, users placing bids and eventually the winner claiming main prize. Each point in time is located within a bidding round, or simply round. Each round has a sequential number, starting with zero. Round zero begins the moment the contract gets deployed. Each round begins in the inactive mode, when the owner is allowed to call configurable parameter setters, while users are not yet allowed to place bids. When the current block timestamp reaches `roundActivationTime` (the Game contract state variable), the round becomes active. From that moment on, the owner is no longer allowed to call the setters, while users are allowed to place bids. When someone places the first bid in a round, `mainPrizeTime` gets calculated as the current block timestamp plus a configurable duration. When another bid is placed, `mainPrizeTime` gets extended by an additional shorter configurable duration. When the current block timestamp reaches `mainPrizeTime`, the last bidder gets the right to claim main prize. The Game contract method to call in this case is `claimMainPrize`. When the last bidder calls it, they are declared the round's main prize winner and receive main ETH prize, the current round ends and the next one begins, at first in the inactive mode. But until it happens, any user still has the right to place another bid, which would kick `mainPrizeTime` further forward.

There are 2 **bid types**: ETH and CST (the `CosmicSignatureToken` contract symbol). The first bid in a round is required to be ETH. When placing an ETH bid, the current ETH bid price gets transferred from the bidder to the Game contract. When placing a CST bid, the current CST bid price gets burned from the bidder's CST balance. When someone places a bid of any type, a configurable amount of CST is minted for the bidder.

**What incentivates users to place bids?** Prizes distributed among multiple winners at the end of each round. Some winners get picked based on chance and others deterministically. Supported prize types are ETH, newly minted CST token amount, newly minted CSN (the `CosmicSignatureNft` contract symbol) NFT. The way the Game is configured, distributes only a half of its ETH balance to winners. Besides, as noted above, each bidder gets rewarded with CST at the moment they place a bid. In addition, our Game supports ETH donations (typically paid ad requests) that add to the Game contract balance and ERC-20 token and ERC-721 NFT donations that will be awarded to the current bidding round main prize winner.

**Prizes** distributed by the Game are listed in `./cosmic-signature-game-prizes.md`.

**How do the project founders make money?** They own another already deployed NFT contract, named `RandomWalkNFT`, with symbol RWLK. When someone places an ETH bid, if they also provide an RW NFT they will pay only a half of the current ETH bid price. An RW NFT may be used only once for bidding. In adition, at the end of each round, a configurable number of staked RW NFTs get picked randomly and new CS NFTs get minted for their stakers. As a result, the value of Random Walk NFTs increases, which benefits the project founders.

CSN and RWLK NFTs can be staked. The stakers receive designated prizes.

#### Bid Price Formation

The `CosmicSignatureGame` contract dictates bid prices. Bidders have no control over that. However it's still under their control when to bid, which affects the prices.

Round zero **ETH bid price** equals a hardcoded constant. It does not change.\
In any round, ETH bid price of the second and further bids increases exponentially as the previous bid paid price plus a configurable fraction of it. (It does not change over time.)\
Beginning with round 1, the first bid starting ETH bid price equals 2x of the first bid paid price in the previous round. Over a configurable duration, the price declines linearly from the maximum to the minimum. The minimum is a configurable fraction of the first bid paid price in the previous round. If the price reaches its minimum and nobody bid yet it will stay at its minimum indefinitely. That's a Dutch auction.

Every **CST bid price** is formed using a Dutch auction.\
The starting CST bid price of round zero equals a configurable minimum. Then over a configurable duration it declines lineraly down to zero. As soon as someone places a bid, the new starting price is calculated as 2x of the paid price, but no lower than the same configurable minimum. After each bid the Dutch auction repeats.\
The starting CST bid price of the first bid in a nonzero round equals starting price of the second bid in the previous round.

Again, a **Dutch auction** is used for: (1) the first ETH bid price in a nonzero round; (2) each CST bid price.

#### `CosmicSignatureGame` Functionality

This is our main Game contract. Its main part (not inherited) is responsible for upgrading the contract. Besides, it inherits functionality from multiple abstract contracts listed in further sections.

Method: `initialize`.\
Functionality: Initializes this upgradeable contract's state variables.

Method: `_authorizeUpgrade`.\
Description: Implements an abstract method inherited from OpenZeppelin's `UUPSUpgradeable`.

#### `CosmicSignatureGame is CosmicSignatureGameStorage` Functionality

This contract contains all state variables that `CosmicSignatureGame` and the contracts that it inherits access.

#### `CosmicSignatureGame is BiddingBase` Functionality

This contract contains a few simple methods.

#### `CosmicSignatureGame is MainPrizeBase` Functionality

This contract contains a few simple methods.

#### `CosmicSignatureGame is SystemManagement` Functionality

This contract contains `CosmicSignatureGame` configurable parameter setters to be called only by the owner. With some exceptions, a typical setter requires that the current bidding round wasn't active yet.

#### `CosmicSignatureGame is EthDonations` Functionality

Anybody can make an ETH donation to the `CosmicSignatureGame` contract without placing a bid, with or without providing a message.

#### `CosmicSignatureGame is BidStatistics` Functionality

This contract is responsible for updating and getting game playing statistics.

Methods: `_updateChampionsIfNeeded`, `_updateChronoWarriorIfNeeded`.\
Functionality: Updates the Endurance Champion and Chrono-Warrior info if needed. Those champions are defined in `${workspaceFolder}/README.md`.

Method: `tryGetCurrentChampions`.\
Functionality: Calculates and returns the current Endurance Champion and Crono-Warrior info. The result changes over time, even if the contract state doesn't change.

#### `CosmicSignatureGame is Bidding` Functionality

This contract is responsible for bid price formation, processing arriving bids, processing donated assets that accompany the bids.

Methods: `getNextEthBidPrice`, `getNextCstBidPrice`.\
Functionality: These calculate and return the current ETH and CST prices that a bidder is required to pay to place a bid. The bid price formation logic is described above.

Methods: `bidWithEth`, `bidWithCst`.\
Functionality: These place ETH and CST bids respectively. `bidWithEth` also accepts an optional Random Walk NFT, which halves ETH bid price to be paid. A Random Walk NFT may be used for bidding only once. The methods would revert if the current round is not active yet.

Method: `receive`.\
Functionality: Calling this method is equivalent to calling `bidWithEth` with default parameters.

Methods: `bidWithEthAndDonateToken`, `bidWithEthAndDonateNft`, `bidWithCstAndDonateToken`, `bidWithCstAndDonateNft`.\
Functionality: Besides placing a bid, these methods allow to donate a third party ERC-20 token amount or an ERC-721 NFT. The donated asset will be transferred to `PrizesWallet`.

Method: `halveEthDutchAuctionEndingBidPrice`.\
Functionality: This is a more sophisticated configurable parameter setter that changes the params the way that results in ETH bid price continuing gradually falling down to a half of its current minimum value. It's allowed to be called only by the contract owner after ETH bid price has reached its minimum and nobody placed a bid yet.

#### `CosmicSignatureGame is SecondaryPrizes` Functionality

Secondary, a.k.a. Special (Non-Main) Prizes.
This contract contains a few simple methods.

#### `CosmicSignatureGame is MainPrize` Functionality

This contract supports claiming bidding round main prize.

Method: `claimMainPrize`.\
Functionality: Claims the current bidding round main prize. This method distributes main and secondary, a.k.a. special (non-main) prizes and updates the Game contract state to start another bidding round. Only the last bidder is permitted to call this method after `mainPrizeTime` comes, but after a timeout expires anybody is welcomed to.

#### `CosmicSignatureToken` Functionality

The Official ERC-20 Token for the Cosmic Signature Ecosystem.\
It inherits a few OpenZeppelin abstract contracts.

Method: `mint`.\
Functionality: Mints a token amount and assigns it to the given account. Only the `CosmicSignatureGame` contract is permitted to call this method.

Method: `burn`.\
Functionality: Burns the given token amount from the given account. Only the `CosmicSignatureGame` contract is permitted to call this method.

Methods: `CLOCK_MODE`, `clock`.\
Functionality: These methods instruct the OpenZeppelin `Governor` contract to express durations in seconds. By default, it would use block numbers.

Methods: `mintMany`, `burnMany`, `mintAndBurnMany`, `transferMany`.\
Functionality: These methods do the same as their non-"many" counterparts. Their purpose is to save gas by performing multiple actions within a single transaction.

#### `CosmicSignatureNft` Functionality

The Official ERC-721 NFT for the Cosmic Signature Ecosystem.

Methods: `setNftBaseUri`, `_baseURI`.\
Functionality: The setter and getter for the base URI for NFT metadata.

Method: `setNftGenerationScriptUri`.\
Functionality: Sets an IPFS link to a script that generates NFT images and videos based on the given seed.

Method: `mint`.\
Functionality: Mints a new Cosmic Signature NFT. Only the `CosmicSignatureGame` contract is permitted to call this method.

Method: `mintMany`.\
Functionality: This method does the same as its non-"many" counterpart. Its purpose is to save gas by performing multiple actions within a single transaction.

Methods: `getNftInfo`, `setNftName`, `getNftName`, `getNftSeed`.\
Functionality: Getters and setters for a given NFT parameters.

#### `PrizesWallet` Functionality

A wallet to hold the Cosmic Signature Game prizes and donations. It supports depositing ETH, donating ERC-20 tokens and ERC-721 NFTs, and allows prize winners (and after a timeout anybody) to withdraw their prizes.

Method: `registerRoundEnd`.\
Functionality: Registers the end of a bidding round.

Method: `depositEth`.\
Functionality: Receives an ETH prize for a prize winner.

Method: `withdrawEth()` (without parameters).\
Functionality: A prize winner calls this method to withdraw their ETH balance.

Method: `withdrawEth(address prizeWinnerAddress_)`.\
Functionality: Anybody is welcomed to call this method after a timeout expires to withdraw a prize winner's unclaimed ETH.

Method: `donateToken`.\
Functionality: This method allows anybody to make an ERC-20 token donation.

Method: `claimDonatedToken`.\
Functionality: Claims an ERC-20 token donateion.

Method: `donateNft`.\
Functionality: This method allows anybody to donate an ERC-721 NFT.

Method: `claimDonatedNft`.\
Functionality: Claims a donated ERC-721 NFT.

Methods: `registerRoundEndAndDepositEthMany`, `withdrawEverything`, `claimManyDonatedTokens`, `claimManyDonatedNfts`.\
Functionality: These methods do the same as their non-"many" counterparts. Their purpose is to save gas by performing multiple actions within a single transaction.

#### `DonatedTokenHolder` Functionality

This contract acts as an account holding all ERC-20 token balances donated during a particular bidding round.

Methods: `constructor`, `authorizeDeployerAsMyTokenSpender`.\
Functionality: Authorizes the `DonatedTokenHolder` contract deployer to spend the `DonatedTokenHolder` contract's token balance held in the given ERC-20 token contract.

#### `StakingWalletRandomWalkNft` Functionality

Staking Wallet for Random Walk NFTs.

Method: `stake`.\
Functionality: Stakes an NFT. This method would revert if it already staked the given NFT in the past.

Method: `unstake`.\
Functionality: Unstakes an NFT.

Method: `pickRandomStakerAddressesIfPossible`.\
Functionality: Randomly picks zero or more NFTs and returns their owner addresses.

Methods: `stakeMany`, `unstakeMany`.\
Functionality: These methods do the same as their non-"many" counterparts. Their purpose is to save gas by performing multiple actions within a single transaction.

#### `StakingWalletCosmicSignatureNft` Functionality

Staking Wallet for Cosmic Signature NFTs.

Method: `stake`.\
Functionality: Stakes an NFT. This method would revert if it already staked the given NFT in the past.

Method: `unstake`.\
Functionality: Unstakes an NFT and pays a staking reward to the staker.

Method: `deposit`.\
Functionality: Receives an ETH deposit to be distributed to stakers.

Method: `tryPerformMaintenance`.\
Functionality: If eventually all stakers unstake their NFTs, the owner of this contract has an option to call this method to transfer a small remaining balance to charity.

Methods: `stakeMany`, `unstakeMany`.\
Functionality: These methods do the same as their non-"many" counterparts. Their purpose is to save gas by performing multiple actions within a single transaction.

#### `MarketingWallet` Functionality

This wallet holds a CST balance and facilitates its distribution to fund marketing activities.

Method: `setTreasurerAddress`.\
Functionality: Sets address of an account whose role is to distribute marketing rewards.

Method: `payReward`.\
Functionality: Pays a CST reward to a marketer.

Method: `payManyRewards` (overloaded).\
Functionality: These methods do the same as their non-"many" counterparts. Their purpose is to save gas by performing multiple actions within a single transaction.

#### `CharityWallet` Functionality

This contract holds an ETH balance to be donated to charity.

Method: `receive`.\
Functionality: Receives ETH to be donated to charity.

Method: `setCharityAddress`.\
Functionality: Sets designated charity address.

Method: `send` (overloaded).\
Functionality: Sends ETH to the designated charity.

#### `CosmicSignatureDao` Functionality

This contract implements the governance mechanism for the Cosmic Signature ecosystem.\
It inherits a few OpenZeppelin abstract contracts.\
It doesn't add anything to the inherited functionality.\
`${workspaceFolder}/test/tests-src/CosmicSignatureDao.js` shows what our DAO contract can be used for.

#### Glossary

- User. An Ethereum account capable of signing transactions with a private key.
