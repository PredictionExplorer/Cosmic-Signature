### Cosmic Signature Ecosystem: Functional Requirements

#### Overview

The Cosmic Signature Ecosystem consists of multiple contracts deployed on the Arbitrum One blockchain. The main contract is named `CosmicSignatureGame`. There are a number of other contracts providing specific functionalities. Those include: `CosmicSignatureToken`, `CosmicSignatureNft`, `PrizesWallet`, among others.

`CosmicSignatureGame` functionality supports and is driven by primarily the passage of time, users placing bids and eventually claiming main prize. Each point in time is located within a bidding round, or simply round. Each round has a number, starting with zero. Round zero begins the moment the contract gets deployed. Each round begins in the inactive mode, when the owner is allowed to call configurable param setters, while users are not allowed to play bids. When the current block reaches `roundActivationTime` (the game contract state variable), the round becomes active. From that moment, the owner is no longer allowed to call config param setters, while users are allowed to place bids. When someone places the first bid in a round, `mainPrizeTime` gets calculated as the current block timestamp plus a configurable duration. When another person bids, `mainPrizeTime` gets extended by another shorter configurable duration. When the current block timestamp reaches `mainPrizeTime`, the last bidder gets the right to end the round and get main prize. The method to call in this case is named `claimMainPrize`.

There are 2 **bid types**: ETH and CST (the `CosmicSignatureToken` contract symbol). The first bid in a round is required to be ETH. When placing a CST bid, the current CST bid price gets burned from the bidder's CST balance. When someone places a bid (ETH or CST), a configurable amount is CST is minted for the bidder.

When the last bidder claims main prize the current round ends and the next one begins, at first in the inactive mode.

What incentivates users to place bids? Prizes distributed among multiple winners at the end of each round. Some winners get picked based on chance and others deterministically. Supported prize types are ETH, newly minted CST amounts, newly minted CSN (the `CosmicSignatureNft` contract symbol) NFTs. The way the game is configured, distributes only a half of its ETH balance. Besides, our game supports ETH, ERC-20 token, ERC-721 NFT donations from anybody, which are also then distributed among winners.

Prizes distributed by the game are listed in `./cosmic-signature-game-prizes.md`.

How do the project founders make money? They own another NFT contract, named `RandomWalkNFT`, with symbol RWLK. When someone places an ETH bid, if they also provide an RW NFT they pay only a half of the current ETH bid price. Each RW NFT may be used only once for bidding. In adition, at the end of each round, a configurable number of RW NFTs get picked randomly and new CS NFTs get minted for their stakers. As a result, the value of Random Walk NFTs increases, which is how the project founders benefit.

CSN and RWLK NFTs can be staked. The stakers receive designated prizes.

#### Glossary

- User. An Ethereum account capable of signing transactions with a private key.

#### Bid Price Formation

ETH TODO write text

CST TODO write text

#### `CosmicSignatureGame` Functionality

TODO write text

#### `CosmicSignatureGame.BiddingBase` Functionality

TODO write text

#### `CosmicSignatureGame....` Functionality

TODO write text for all parts of the game

#### `...` Functionality

TODO write text for all contracts
