### Cosmic Signature Game Prizes

#### Overview

This document lists all prizes awarded by our game.

V3 describes the upcoming implementation in this branch. A Game upgrade preserves the separately deployed token, NFT, and wallets unless they are explicitly replaced. The [white paper](white-paper/cosmic-signature-white-paper-v1.3.md) records the reviewed source and deployed V2 baseline. Values below are defaults or formulas over contract settings, not promises that settings never change.

#### Default ETH Split and Mint Totals

| Allocation | V2 default | V3 reinitialization value |
|------------|------------|--------------------------|
| Main prize | 25% | 20% |
| Chrono-Warrior | 8% | 15% |
| Bidder ETH raffle | 4% | 5% |
| Cosmic Signature NFT staking | 6% | 5% |
| Charity address | 7% | 5% |
| Retained balance before rounding or skipped transfers | 50% | 50% |

`CosmicSignatureGameV3.reinitialize` sets the V3 percentages and the main prize NFT count to 3. Other retained settings, including the raffle counts, CST recognition amount, and marketing amount, remain their configured values. With the standard 10 bidder NFT selections, 10 Random Walk staking selections, and at least one CST bid, V3 mints 26 NFTs and 27,000 fixed CST. The main recipient receives 3 NFTs but only one 1,000 CST recognition allocation. A round without CST bids omits 1 NFT and 1,000 CST; a round without staked Random Walk NFTs omits 10 NFTs and 10,000 CST at those standard settings. Time-dependent bid CST rewards are additional.

#### Prize Types

- ETH.

- A newly minted Cosmic Signature Token (CST) amount.

- A newly minted Cosmic Signature NFT (COSMIC).

- A third party ERC-20 token amount.

- A third party ERC-721 NFT.

#### Prize Groups

1. Prizes awarded when a bid is placed.

2. Prizes awarded to main prize winner and other bidders at the end of each bidding round (on main prize claim). This is done by the `MainPrize._distributePrizes` method and its later-version implementations. Prizes in this group are broken down into main ETH prize and secondary, a.k.a. special prizes.

3. Additional prizes that do not belong to the above groups.

#### Group 3 Prizes

- ETH donations made to the `CosmicSignatureGame` contract. They will be shared by all winners in the current and future bidding rounds.

- Third party ERC-20 token amount and ERC-721 NFT donations that accompany bids. The registered main prize claimant has priority to retrieve them after finalization, until the `PrizesWallet` timeout opens retrieval to anyone.

---

The rest of this document lists prizes from groups 1 and 2.

#### Bidder Raffle Weight in V3+

In V2-, every bid has equal weight in bidder raffles. In V3+, a bid's weight is the ETH bid price without the late-bid premium when the bid is placed (Comment-202609098):

- A plain ETH bid has the base ETH bid price as its weight.
- An ETH plus Random Walk NFT bid has the full undiscounted base ETH bid price as its weight.
- A CST bid has the concurrent base ETH bid price as its weight.
- A swallowed ETH overpayment does not increase the weight.

The late-bid premium increases payment only. It does not increase raffle weight, the next ETH price, or the CST auction beginning price carried into the next round.

Each `BidInfo.raffleCumulativeWeight`, available through `getBidInfoAt`, is the sum of that bid's weight and all preceding bid weights in the round. A raffle draw selects a random weight unit and binary-searches these cumulative values. A bidder's total weight is the sum of their bids' weights.

Selections are with replacement: a bid or address can receive multiple allocations. The separate Random Walk staking selection samples currently staked NFTs with replacement, rather than using bidder weights. These are block-derived selections, not oracle-certified randomness.

#### Variables

- `secondsSinceLastBid` -- the number of seconds since the previous bid. It can be zero. Used only in V2+. For the first bid in V2, it is measured since `roundActivationTime`. The first bid in V3+ mints no bid CST reward, so the value to be used for this variable is not calculated for the first bid.

- `gameEthBalance` -- the `CosmicSignatureGame` contract ETH balance at the end of the bidding round.

- `numStakedCosmicSignatureNfts` -- the total number of staked Cosmic Signature NFTs at the end of the bidding round. It can be zero.

- Any other variables not listed here are implied to be the `CosmicSignatureGame` contract publicly visible properties. For example, `mainEthPrizeAmountPercentage`.

#### Prize List

| Prize Winner | Prize Type | Prize Count | Prize Amount | Notes |
|----------------|-------------|--------------|----------------|--------|
| Main Prize Winner | Main ETH Prize | 1 | `gameEthBalance * mainEthPrizeAmountPercentage / 100` | Normally the last bidder; after the claim timeout, anyone can claim. |
|  | CST | 1 | `cstPrizeAmount` |  |
|  | Cosmic Signature NFT | 1 | V2-: 1<br>V3+: `mainPrizeNumCosmicSignatureNfts` |  |
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
| Bidders | CST | 0 or 1 per bid | V1: `bidCstRewardAmount`<br>V2: `sqrt(secondsSinceLastBid * bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds)`<br>V3+: `secondsSinceLastBid * bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds` | In V2-, the bidder placing the bid gets the reward. In V3+, the previous bidder in the current round gets the reward: the first bid mints none; no bid CST reward is earned for the last bid. |
|  |  |  |  |  |
| Bidders Picked Via ETH Prize Raffle | ETH | `numRaffleEthPrizesForBidders` | `gameEthBalance * raffleTotalEthPrizeAmountForBiddersPercentage / 100 / numRaffleEthPrizesForBidders` | Bids are picked randomly: with equal weights in V2-, and with the bidder raffle weights described above in V3+. |
|  |  |  |  |  |
| Bidders Picked Via CST And CS NFT Prize Raffle | CST | `numRaffleCosmicSignatureNftsForBidders` | `cstPrizeAmount` | Bids are picked randomly and are weighted in V3+. Each winner gets both CST and CS NFT. |
|  | Cosmic Signature NFT | `numRaffleCosmicSignatureNftsForBidders` | 1 | Bids are picked randomly and are weighted in V3+. Each winner gets both CST and CS NFT. |
|  |  |  |  |  |
| Random Walk NFT Stakers | CST | 0 or `numRaffleCosmicSignatureNftsForRandomWalkNftStakers` | `cstPrizeAmount` | Staked RW NFTs are picked randomly. Each winner gets both CST and CS NFT. If there are no staked RW NFTs, nobody would get this prize. |
|  | Cosmic Signature NFT | 0 or `numRaffleCosmicSignatureNftsForRandomWalkNftStakers` | 1 | Staked RW NFTs are picked randomly. Each winner gets both CST and CS NFT. If there are no staked RW NFTs, nobody would get this prize. |
|  |  |  |  |  |
| Cosmic Signature NFT Stakers | ETH | `numStakedCosmicSignatureNfts` | `gameEthBalance * cosmicSignatureNftStakingTotalEthRewardAmountPercentage / 100 / numStakedCosmicSignatureNfts` | The same amount is awarded per staked CS NFT.  If there are no staked CS NFTs, nobody would get this prize. |
|  |  |  |  |  |
| `MarketingWallet` | CST | 1 | `marketingWalletCstContributionAmount` |  |
|  |  |  |  |  |
| `CharityWallet` | ETH | 1 | `gameEthBalance * charityEthDonationAmountPercentage / 100` |  |

#### Group 2 Prizes -- an Alternative View

- ETH Transferred Directly To The Winner
	- Main Prize Winner (normally the Last Bidder)
	- `CharityWallet`

- ETH Transferred To `PrizesWallet`
	- Chrono-Warrior
	- Bidders Picked Via ETH Prize Raffle

- ETH Transferred To `StakingWalletCosmicSignatureNft`
	- CS NFT Stakers (not guaranteed to exist)

- CST
	- Each recipient role or selection below receives one `cstPrizeAmount`, including the main recipient who receives multiple NFTs in V3+
	- `MarketingWallet`

- CS NFT
	- Main Prize Winner (normally the Last Bidder) (in V3+, multiple NFTs)
	- Last CST Bidder (not guaranteed to exist)
	- Endurance Champion
	- Chrono-Warrior
	- Bidders Picked Via CST And CS NFT Prize Raffle
	- RW NFT Stakers (not guaranteed to exist)

#### Notes

- Prize Count likely equals the number of winners, each getting 1 prize of the given type. But if Prize Count is greater than 1, a winner can get multiple prizes of the given type, which would reduce the number of winners.

- In a division result, any fractional part is truncated. Therefore, for example, 299 / 100 equals 2.

- Amounts are calculated before the distribution transfers. Dividing the bidder ETH allocation into equal shares leaves its rounding remainder in the Game. Dividing the Cosmic Signature staking deposit leaves its rounding remainder in that staking wallet.

- If no Cosmic Signature NFTs are staked, the staking deposit's division-by-zero panic is caught and that allocation stays in the Game. A failed transfer to the configured charity address also leaves its allocation in the Game and emits a failure event. Other transfer or mint failures can revert finalization, including a main recipient that rejects its direct ETH payment.

- Sending ETH to `CharityWallet` does not immediately send it to its ultimate beneficiary. Anybody can later call `send`; the wallet owner selects the beneficiary. `MarketingWallet` payments require its treasurer, who is appointed by its owner. These roles belong to the DAO only if the relevant ownership has been transferred to it.

- `PrizesWallet` records the round's main claimant and an absolute retrieval deadline at finalization, using its then-current timeout duration (5 weeks by default). After that deadline, another caller can retrieve an unclaimed allocation for themselves. ERC-721 donations are held by the wallet; ERC-20 donations are held in a separate `DonatedTokenHolder` per round and retrieved through the wallet. Changing the timeout duration does not alter already recorded deadlines.

- Cosmic Signature staking ETH is paid when the original staker unstakes, without the escrow retrieval timeout. If the payout fails, the unstake reverts. Once no NFTs remain staked, the owner can send residual ETH from that staking wallet to a chosen address.
