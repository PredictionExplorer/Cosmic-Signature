# Why Every Bidding Round Ends

This document proves that, starting with `CosmicSignatureGameV3`, every bidding round of the Cosmic Signature Game is guaranteed to end — assuming only that people like money. It also explains *why* the CST Dutch auction is designed the way it is (Comment-202607165, Comment-202607166): the design was chosen so that this proof is a one-liner.

The mechanism under discussion lives in `contracts/production/BiddingV3.sol`. The invariant is exercised by `test/tests-src/CosmicSignatureGameV3-TerminationInvariant.js` and by the fuzz campaign (`test/tests-src/FuzzTest.js`).

## 1. The mechanism, in four rules

Within a bidding round, let:

| Symbol | Meaning | Value at defaults |
|---|---|---|
| `I` | `mainPrizeTimeIncrementInMicroSeconds` | 1 hour (grows ~1% per round) |
| `h` | `getMainPrizeTimeIncrement()` = `I / 10^6`, seconds | 3,600 s |
| `M` | `bidCstRewardAmountMultiplier` | `6 * 10^25` |
| `rate` | the CST accrual rate, `M / I` CST Wei per second | 1 CST per minute |
| `R` | CST accrued over one increment, `rate * h` | 60 CST |
| `F` | the CST Dutch auction beginning bid price min limit, `3 * M / 10^6` | 180 CST |
| `S(t)` | the round's *slack*, `mainPrizeTime - now` | — |
| `sigma(t)` | total CST supply | — |

The four rules (all in `BiddingV3.sol`):

1. **Every bid extends the round by one increment.** `mainPrizeTime += h` (`MainPrizeCommonV2._extendMainPrizeTime`). The first bid of a round instead sets `mainPrizeTime = now + initialDuration` (about 1 day).
2. **Every bid mints the time it consumed.** The bid CST reward is `elapsed * M / I` = `rate * elapsed`, where `elapsed` is the time since the previous bid. Rewards therefore *telescope*: over any stretch of a round, total minting is at most `rate * (elapsed time)` — at most `R` per increment of real time, no matter how many bids land.
3. **The CST bid price declines at exactly the same rate.** `price(t) = max(0, P0 - rate * t)`, where `t` is the time since the CST Dutch auction beginning and `P0 = cstDutchAuctionBeginningBidPrice`. (Two adjustments can only help: the V3 late-bid premium increases the price near `mainPrizeTime`, and when `P0` exceeds 12 increments' worth of accrual the price declines *faster* — proportionally, reaching zero at the 12-increment duration cap, Comment-202607170 — so `price(t) >= F - rate * t` keeps holding, which is all the proof uses.)
4. **A CST bid burns its price and re-arms the auction at `P0' = max(2 * paidPrice, F)`,** with the floor `F` equal to **3** increments' worth of accrual (`CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT_INCREMENT_REWARD_MULTIPLE = 3`). The auction clock restarts. `P0 >= F` always holds, including across rounds.

The picture to keep in mind — between CST bids, two lines race at the same speed:

```
CST
 P0 +.
    |  `.
    |    `.  price:  P0 - rate*t                      reward:  rate*t
    |      `.                                    .-'
    |        `.                             .-'
2R -|          `.                      .-'
    |            `.               .-'
    |              `.        .-'
R  -|                `. .-'
    |               .-'`.       <-- breakeven at  t* = P0 / (2*rate)  >=  1.5h
    |          .-'      `.
    |     .-'             `.
  0 +--.-'------+-----------`-.-------+------> t since the CST auction restart
    0           h            t*      P0/rate
```

A CST bid placed *left* of the crossing burns more than it mints (you pay net CST for round-life). A bid placed *right* of it mints more than it burns (you are paid for patience) — but patience lets the round die, because a bid only buys `h` of life. Since `P0 >= F = 3R`, the crossing sits at `t* = P0/(2*rate) >= 1.5h`: **the breakeven wait always exceeds the hour a bid buys.** That inequality is the entire theorem; the rest is bookkeeping.

## 2. Assumptions

- **(A1) People like money.** If the main prize is claimable *by everybody* and remains so for one continuous hour, then somebody claims it. (Once `now >= mainPrizeTime + timeoutDurationToClaimMainPrize`, `claimMainPrize` awards the main prize — 25% of the game's ETH balance, plus NFTs and CST — to any caller. The balance is positive in any round with bids, because the first bid of every round is an ETH bid. So this is "at least one person or bot will pick up free money within an hour".)
- **(A2) ETH supply is finite.**
- **(A3) The contract owner does not change configuration mid-round.** (Configuration setters are gated by `_onlyRoundIsInactive`, so this holds by construction; see §6 for what a misconfigured `M` would do.)

Remarkably, **bidders are not assumed to be rational.** Even a cartel deliberately trying to keep a round alive forever fails: the proof below is mechanical for CST (you cannot burn CST you do not collectively hold) and physical for ETH.

## 3. Three lemmas

**Lemma 0 (reduction to bids).** *If bidding stops, the round ends. Consequently, a round that never ends contains infinitely many bids, and its slack satisfies `S(t) > -(timeout + 1h)` at all times.*

*Proof.* If no bid arrives after some moment, `mainPrizeTime` freezes, so `S` sinks below `-timeout` and stays there; by (A1) someone claims within an hour and the round ends. For the slack bound: `S` decreases at rate 1 between bids and jumps up at bids. For `S` to reach `-(timeout + 1h) - x` for any `x >= 0`, it must first cross `-timeout` downward and then spend at least one hour continuously below `-timeout` (the descent rate is at most 1). During that entire hour the prize is claimable by everybody, so by (A1) the round ends. Hence a live round keeps `S` above `-(timeout + 1h)`. ∎

**Lemma 1 (ETH bids are finitely many).** *A single round can contain at most a few thousand ETH bids.*

*Proof.* Within a round, after each ETH bid the game sets `nextEthBidPrice = paid + paid/100 + 1` (`BiddingV2._bidWithEth`), and nothing ever decreases it until the round resets. So the ETH bid price grows at least 1% per ETH bid, monotonically. Each bid must actually transfer `msg.value` covering the price (half of it with a Random Walk NFT discount). After `n` ETH bids the price is at least `p_1 * 1.01^n`; this exceeds the entire ETH supply (~1.2 * 10^8 ETH) for `n` in the low thousands, no matter how small `p_1` was. Note that this is a *physical* cap — no rationality needed. ∎

**Lemma 2 (CST minting is metered).** *Over any time window of duration `D` inside a round, the game mints at most `rate * D` CST Wei of bid rewards, regardless of the number of bids.*

*Proof.* Each bid's reward is `floor(g * M / I)` where `g` is the time since the previous bid. Consecutive gaps tile the window, and `sum(floor(g_i * M / I)) <= floor(sum(g_i) * M / I) <= rate * D`. (This is precisely why the reward is linear in `g`. A fixed reward per bid, like V1's 100 CST, or any concave formula, like V2's square root, lets rapid bids mint faster per unit of time.) End-of-round prize mints happen only at `claimMainPrize`, which by hypothesis never happens in a never-ending round. ∎

## 4. The theorem

**Theorem.** *Under (A1)–(A3), every bidding round ends.*

*Proof.* Suppose some round never ends. By Lemma 0 it contains infinitely many bids, and by Lemma 1 only finitely many of them are ETH bids, so infinitely many are CST bids.

Define the potential (units: CST Wei * seconds)

```
Phi  =  h * sigma  +  2R * S .
```

`Phi` is bounded below in a live round: `sigma >= 0` mechanically (a CST bid burns the price from the bidder's balance, which requires the balance to exist), and `S > -(timeout + 1h)` by Lemma 0.

Cut the round into *windows*: each window starts when the CST Dutch auction (re)starts — at the round's first bid or at a CST bid — and ends with the next CST bid. Consider a window of duration `Dt` containing `m` ETH bids and then the terminal CST bid.

- Minted during the window (Lemma 2): at most `rate * Dt`.
- Burned by the terminal CST bid: the price after `Dt` of decline from `P0 >= F`, so at least `max(0, F - rate * Dt)`; in both cases (clamped or not), `burned >= F - rate * Dt`. The late-bid premium only increases the burn.
- Slack change: `+(m + 1) * h - Dt`.

Therefore

```
DPhi  <=  h * (rate*Dt - (F - rate*Dt))  +  2R * ((m+1)*h - Dt)
      =   2*Dt*(h*rate - R)  -  h*F  +  2R*(m+1)*h
      =   -h*(F - 2R)  +  2R*m*h                          [since R = rate*h]
      =   -R*h  +  2R*m*h .                               [since F = 3R]
```

So **every CST bid decreases `Phi` by at least `R*h`**, uniformly, from the very first bid of the round — while each of the finitely many ETH bids increases it by at most `2R*h` (and the single round-opening bid adds a bounded one-time amount: `S` jumps to the initial ~1 day). With infinitely many CST bids, `Phi` sinks below every bound — contradiction. Hence bids stop, and by Lemma 0 the round ends. ∎

Concretely, at defaults: a CST bid that arrives within an hour of the auction restart burns at least `F - R = 120` CST while at most `R = 60` CST was minted since the restart — every hour of round-life bought with CST costs the ecosystem a net 60+ CST, and CST balances are finite. The theorem also yields an explicit bound: the number of CST bids in a round is at most `Phi_start / (R*h) + 2 * N_eth + O(1)`.

### Integer rounding

The contract works in integers; the proof above works in reals. All roundings point the safe way except one: rewards and price declines round *down* (minting less, keeping prices higher), while the floor satisfies `F = floor(3M/10^6) >= 3 * floor(h*M/I) = 3R_int` because `h = floor(I/10^6)`. The only slop is `h*rate - R_int < 1` Wei per second of window time, worth `< 2*Dt` Wei-seconds per window; summed over a live round this is dwarfed by the `R*h` (~2 * 10^23 Wei-seconds) decay per CST bid — by more than twenty orders of magnitude. The margin `F - 2R = R` exists precisely so that no rounding analysis needs to be exact.

## 5. Why the floor multiple must exceed 2 — and why it is 3

Write `F = k * R`. The theorem needs `k > 2`; here is what each regime means:

- **`k > 2` (chosen: `k = 3`).** Every round-sustaining CST bid strictly net-burns. `Phi` decays by `(k - 2) * R * h` per CST bid. Rounds provably end.
- **`k = 2` (the knife edge).** The breakeven wait from the floor is exactly `h`. A cartel bidding at *exactly* hourly cadence, at *exactly* the breakeven price, keeps slack and supply constant forever: minting and burning balance exactly — this is the "CST is emitted and burned at the same rate" perpetual round. The orbit is unstable (one late block and the slack deficit compounds) and gas makes it a money-losing hobby, but the guarantee would rest on rationality rather than mechanics.
- **`k < 2`.** Hourly CST bids near the floor mint more than they burn. Keeping the round alive forever is *profitable*. The round genuinely may never end.
- **`F = 0` (no floor).** Catastrophic: after one free bid (`paidPrice = 0`), `P0' = max(0, 0) = 0` and every subsequent CST bid is free forever.

There is a second, self-consistency reading of `k`, visible in the X-diagram: a bidder who waits for breakeven pays `P0 / 2`, so the auction re-arms at `max(2 * P0/2, F) = P0` — breakeven bidding reproduces the auction exactly. Urgent (early) bidders ratchet `P0` up; patient (late) bidders let it decay toward `F`. The floor is not an arbitrary clamp — it is the attractor of the system's own dynamics, pinned one notch above the perpetual-motion point.

### What `V1`'s 200 CST was

In V1 the bid reward was a flat 100 CST per bid, and the hardcoded floor was `200 = 2 * 100`: the same invariant — *an immediate re-bid must burn at least twice what a bid mints* — expressed in per-bid units. When V2 and V3 moved minting onto a time basis, the correct floor became a time quantity, `k * R`, but the constant 200 never followed; it kept working only because `200 > 2 * 60`. V3 replaces the fossil with the derived floor `3R` (180 CST at defaults — nearly the same number, but now it scales with `M` and `I` automatically and *means* something).

## 6. Remarks

- **Where "people like money" is genuinely needed.** Only in (A1), for claiming. The CST side terminates mechanically (supply-gated burns), the ETH side physically (supply-gated bids). No assumption about bidder behavior, collusion, or flash-anything is required.
- **V2 terminated too, but not elegantly.** Under V2, the auction duration was a stored value that shrank on ETH bids (floor: 250 seconds) and grew on CST bids. Termination held, but the proof needed an asymptotic argument (wait for the duration to regrow), and the 250-second floor admitted a bounded "zombie window": after a sufficiently extreme ETH bidding war, free CST bids could sustain and even *extend* a round for weeks while minting rewards. In V3 the duration is emergent (`P0 / rate >= 3h`), so a free CST bid always requires waiting at least 3 increments — strictly more than the 1 increment it buys. The zombie mode is impossible by construction, and the proof holds uniformly from the first bid.
- **The late-bid premium** (Comment-202607119) multiplies prices by up to ~5x near `mainPrizeTime`. It only increases burns, so it strengthens every inequality above.
- **Owner misconfiguration.** `setBidCstRewardAmountMultiplier(0)` stops reward accrual entirely; the wage-rate decline degenerates, so the price declines over the 12-increment duration cap instead, and the derived floor becomes 0, making CST bids eventually free. That state mints no CST at all, so it is deflationary — rounds still end via Lemma 1 (the ETH ratchet), with Lemma 2 trivially satisfied. Setting `M` absurdly high (order `2^190`+) could overflow the unchecked arithmetic, as already documented for V3's other parameters in `docs/v3-vs-v2-changes.md`.
- **Timestamps.** The proof only uses that block timestamps are non-decreasing.

## 7. The design principle, for future changes

Sustaining a round requires *impatience* (bids at most one increment apart, amortized); profiting in CST requires *patience* (bids past the breakeven crossing). Any redesign of the CST economy must keep those two regions disjoint:

> The CST bid price must fall with patience while the reward rises with patience, and the price floor after a restart must exceed **twice** the reward accrued per main prize time increment.

Everything else — the exact rate, the restart multiplier, the floor multiple — is a choice of units and margins. If a future version changes the reward formula, re-derive `F` from it; `Phi = h*sigma + 2R*S` is the quantity to watch.
