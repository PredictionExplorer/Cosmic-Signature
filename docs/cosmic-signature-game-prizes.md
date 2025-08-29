### Cosmic Signature Game Prizes

This document lists all prizes awarded by the `CosmicSignatureGame` contract, and, more specifically, by the `MainPrize._distributePrizes` method at the end of each bidding round.

#### Variables

- `gameEthBalance` -- the `CosmicSignatureGame` contract ETH balance at the end of the bidding round.

- `numBids` -- the total number of bids placed during the bidding round.

- `numStakedCosmicSignatureNfts` -- the total number of staked Cosmic Signature NFTs at the end of the bidding round. It can be zero.

- Any other variables not listed here are implied to be the `CosmicSignatureGame` contract publicly visible properties. For example, `mainEthPrizeAmountPercentage`.

#### Prize List

| Prize Winner | Prize Type | Prize Count | Prize Amount | Notes |
|----------------|-------------|--------------|----------------|--------|
| Main Prize Winner | Main ETH Prize | 1 | `gameEthBalance * mainEthPrizeAmountPercentage / 100` |  |
|  | Cosmic Signature NFT | 1 | 1 |  |
|  |  |  |  |  |
| Endurance Champion | CST | 1 | `numBids * cstPrizeAmountMultiplier` |  |
|  | Cosmic Signature NFT | 1 | 1 |  |
|  |  |  |  |  |
| Chrono-Warrior | ETH | 1 | `gameEthBalance * chronoWarriorEthPrizeAmountPercentage / 100` |  |
|  |  |  |  |  |
| Last CST Bidder | CST | 0 or 1 | `numBids * cstPrizeAmountMultiplier` | If nobody placed a CST bid, nobody would get this prize. |
|  | Cosmic Signature NFT | 0 or 1 | 1 | If nobody placed a CST bid, nobody would get this prize. |
|  |  |  |  |  |
| Bidders | ETH | `numRaffleEthPrizesForBidders` | `gameEthBalance * raffleTotalEthPrizeAmountForBiddersPercentage / 100 / numRaffleEthPrizesForBidders` | Bids are picked randomly. |
|  | Cosmic Signature NFT | `numRaffleCosmicSignatureNftsForBidders` | 1 | Bids are picked randomly. |
|  |  |  |  |  |
| Random Walk NFT Stakers | Cosmic Signature NFT | 0 or `numRaffleCosmicSignatureNftsForRandomWalkNftStakers` | 1 | Staked RW NFTs are picked randomly. If there are no staked RW NFTs, nobody would get this prize. |
|  |  |  |  |  |
| Cosmic Signature NFT Stakers | ETH | `numStakedCosmicSignatureNfts` | `gameEthBalance * cosmicSignatureNftStakingTotalEthRewardAmountPercentage / 100 / numStakedCosmicSignatureNfts` | The same amount is awarded per staked CS NFT.  If there are no staked CS NFTs, this prize would be transferred to Charity Wallet. |
|  |  |  |  |  |
| Marketing Wallet | CST | 1 | `marketingWalletCstContributionAmount` |  |
|  |  |  |  |  |
| Charity Wallet | ETH | 1 | `gameEthBalance * charityEthDonationAmountPercentage / 100` |  |

#### Notes

- In a division result, any fractional part is truncated. Therefore, for example, 299 / 100 equals 2.
