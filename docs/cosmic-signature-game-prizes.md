### Cosmic Signature Game Prizes

#### Overview

This document lists all prizes awarded by our game.

#### Prize Types

- ETH.

- A newly minted Cosmic Signature Token (CST) amount.

- A newly minted Cosmic Signature NFT (CSN).

- A third party ERC-20 token amount.

- A third party ERC-721 NFT.

#### Prize Groups

1. Prizes awarded to the bidder when placing a bid.

2. Prizes awarded to main prize winner and other users at the end of each bidding round. This is done by the `MainPrize._distributePrizes` method. Prizes in this group are broken down into main ETH prize and secondary, a.k.a. special prizes.

3. Additional prizes that do not belong to the above groups.

#### Additional Prizes (Group 3)

- ETH donations made to the `CosmicSignatureGame` contract. They will be shared by all winners in the current and future bidding rounds.

- Third party ERC-20 token amount and ERC-721 NFT donations that accompany bids. They will be claimable by the current bidding round main prize winner.

---

The rest of this document lists prizes from groups 1 and 2.

#### Variables

- `gameEthBalance` -- the `CosmicSignatureGame` contract ETH balance at the end of the bidding round.

- `numStakedCosmicSignatureNfts` -- the total number of staked Cosmic Signature NFTs at the end of the bidding round. It can be zero.

- Any other variables not listed here are implied to be the `CosmicSignatureGame` contract publicly visible properties. For example, `mainEthPrizeAmountPercentage`.

#### Prize List

| Prize Winner | Prize Type | Prize Count | Prize Amount | Notes |
|----------------|-------------|--------------|----------------|--------|
| Main Prize Winner (Last Bidder) | Main ETH Prize | 1 | `gameEthBalance * mainEthPrizeAmountPercentage / 100` |  |
|  | CST | 1 | `cstPrizeAmount` |  |
|  | Cosmic Signature NFT | 1 | 1 |  |
|  |  |  |  |  |
| Last CST Bidder | CST | 0 or 1 | `cstPrizeAmount` | If nobody placed a CST bid, nobody would get this prize. |
|  | Cosmic Signature NFT | 0 or 1 | 1 | If nobody placed a CST bid, nobody would get this prize. |
|  |  |  |  |  |
| Endurance Champion | CST | 1 | `cstPrizeAmount` |  |
|  | Cosmic Signature NFT | 1 | 1 |  |
|  |  |  |  |  |
| Chrono-Warrior | ETH | 1 | `gameEthBalance * chronoWarriorEthPrizeAmountPercentage / 100` |  |
|  | CST | 1 | `cstPrizeAmount` |  |
|  | Cosmic Signature NFT | 1 | 1 |  |
|  |  |  |  |  |
| Bidders | CST | 1 per bid | `cstRewardAmountForBidding` | On each bid, the bidder gets CST. |
|  |  |  |  |  |
| Bidders Picked Via ETH Prize Raffle | ETH | `numRaffleEthPrizesForBidders` | `gameEthBalance * raffleTotalEthPrizeAmountForBiddersPercentage / 100 / numRaffleEthPrizesForBidders` | Bids are picked randomly. |
|  |  |  |  |  |
| Bidders Picked Via CST And CS NFT Prize Raffle | CST | `numRaffleCosmicSignatureNftsForBidders` | `cstPrizeAmount` | Bids are picked randomly. Each winner gets both CST and CS NFT. |
|  | Cosmic Signature NFT | `numRaffleCosmicSignatureNftsForBidders` | 1 | Bids are picked randomly. Each winner gets both CST and CS NFT. |
|  |  |  |  |  |
| Random Walk NFT Stakers | CST | 0 or `numRaffleCosmicSignatureNftsForRandomWalkNftStakers` | `cstPrizeAmount` | Staked RW NFTs are picked randomly. Each winner gets both CST and CS NFT. If there are no staked RW NFTs, nobody would get this prize. |
|  | Cosmic Signature NFT | 0 or `numRaffleCosmicSignatureNftsForRandomWalkNftStakers` | 1 | Staked RW NFTs are picked randomly. Each winner gets both CST and CS NFT. If there are no staked RW NFTs, nobody would get this prize. |
|  |  |  |  |  |
| Cosmic Signature NFT Stakers | ETH | `numStakedCosmicSignatureNfts` | `gameEthBalance * cosmicSignatureNftStakingTotalEthRewardAmountPercentage / 100 / numStakedCosmicSignatureNfts` | The same amount is awarded per staked CS NFT.  If there are no staked CS NFTs, this prize would be transferred to Charity Wallet. |
|  |  |  |  |  |
| Marketing Wallet | CST | 1 | `marketingWalletCstContributionAmount` |  |
|  |  |  |  |  |
| Charity Wallet | ETH | 1 | `gameEthBalance * charityEthDonationAmountPercentage / 100` |  |

#### Notes

- Prize Count often equals the number of winners, each getting 1 prize of the given type. But if Prize Count is greater than 1, a winner can get multiple prizes of the given type, which would reduce the number of winners.

- In a division result, any fractional part is truncated. Therefore, for example, 299 / 100 equals 2.
