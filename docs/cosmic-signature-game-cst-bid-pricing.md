### Cosmic Signature Game CST Bid Pricing

#### Introduction

This document explains how the Cosmic Signature Token (CST) side of the bidding game is priced in Game contract V3 and later, and, more importantly, why. The rules were designed to be permanent: they are stated in a single unit, they add no configurable parameters, and they carry no state from one bidding round to the next, so they do not need to be retuned as the game's other parameters grow.

The authoritative source is the code: `contracts/production/BiddingV3.sol`, whose header comment Comment-202611022 lists the rules, and the numbered comments it refers to. This document restates the rules in prose, records the reasoning and the alternatives that were rejected, and lists the properties that tests enforce.

V3 has not been deployed at the time of writing, so these rules are part of the V3 upgrade. `docs/v3-vs-v2-changes.md` describes the resulting ABI and behavior changes for frontend and backend developers.

#### Background: How the CST Side Works

Players place bids with ETH or with CST. Each bid extends the round deadline, `mainPrizeTime`, by one main prize time increment. The last bidder when the deadline passes claims the main prize.

A CST bid burns the current CST bid price from the bidder's balance. The price is set by a Dutch auction: it begins at some beginning bid price and declines linearly over time, possibly to zero. After every CST bid, the auction restarts at a new beginning bid price. (In V2-, the restart doubled the price paid, with a configurable minimum.)

In V3+, whoever holds the last bidder position earns a bid CST reward for as long as they hold it. The reward accrues linearly in time and is minted to the previous bidder when the next bid is placed. Its rate is `bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds` CST Wei per second, which is a fixed amount per main prize time increment, regardless of how long an increment is.

Within a configurable late-bid window before `mainPrizeTime`, every bid price gets an exponentially growing premium of up to about four times the price, so that last-second bidding is expensive.

#### The Problem Being Solved

The first V3 draft priced the CST Dutch auction with a separate decline rate in CST Wei per second. The rate was anchored to one reward per increment once, and then moved by one percent on every bid (up on ETH bids, down on CST bids), in an attempt to balance the number of bids of each type. The restart after a CST bid was twice the premium-free base price paid, with a minimum of one CST.

That design had two independent flaws:

- **Drift.** The reward is defined per increment, while the decline rate was defined per second and was nudged by the bid mix. Increments grow one percent per round, and the bid mix is whatever players choose. So the ratio between "what a CST bid costs" and "what holding the position earns" wandered without bound over rounds, and the design would have needed periodic manual retuning.

- **Free bids.** The minimum restart price of one CST was far below one increment of decline, so the price collapsed to zero within hours of the round's first bid and stayed at zero until someone bid with CST. Analysis of the live round-2 data (1,257 bids) and of the deployed V3 parameters showed that for most of every round a CST bid would cost nothing, yet grant a full raffle ticket, extend the deadline by an hour, pay nothing into the pot, and bypass the late-bid premium, which multiplies a zero. V2 had masked the structural issue with its 200 CST minimum.

Any fix that kept two independent rates would eventually have to be revisited, and any minimum set exactly at the marginal value is a knife edge. The rules below remove both problems.

#### The Rules

All amounts are in CST Wei and all durations in seconds. Let:

- `reward(e) = e * bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds` be the bid CST reward earned by holding the last bidder position for `e` seconds.
- `R = reward(one main prize time increment) = bidCstRewardAmountMultiplier / 1e6`. With the default parameters, 60 CST.
- `C = reward(initial duration until main prize) = bidCstRewardAmountMultiplier / initialDurationUntilMainPrizeDivisor`. With the default parameters, about 1440 CST, which is 24 R, because the initial duration until main prize is 24 increments.
- `S` be the beginning bid price of the current CST Dutch auction and `T0` its beginning timestamp.

`R` and `C` are derived, not stored. The game stores only `S` (`cstDutchAuctionBeginningBidPrice`) and `T0` (`cstDutchAuctionBeginningTimeStamp`).

1. **Decline** (Comment-202611023). The CST bid price base is `max(0, S - reward(now - T0))`. The price declines at exactly the rate the holder of the last bidder position earns.

2. **Restart** (Comment-202611024 and Comment-202611025). On a CST bid at base `b`, the next auction begins at `S = min(2 * (b + R), C)` and `T0 = now`. Every round's first CST Dutch auction begins at `C`, when the round's first ETH bid is placed.

3. **Late-bid premium** (Comment-202611026). The CST price paid is `base + premium(max(base, R))`, where `premium(x)` is the existing late-bid premium function of `x`. The premium is never calculated from less than one increment of reward. ETH pricing is unchanged: `ethBase + premium(ethBase)`.

4. **Raffle weight** (Comment-202611027 and Comment-202611029). The raffle weight of a CST bid is `ethBase * base / S`, where `ethBase` is the concurrent ETH bid price without the premium, i.e. the ETH weight scaled by the fraction of the asking price the bid paid. It is zero if `S` is zero, which requires a degenerate configuration. ETH bids keep the weight `ethBase`, undiscounted for ETH + Random Walk NFT bids.

Everything else is unchanged: the reward goes to the previous bidder; the first bid of a round must be ETH; every bid extends the deadline by one increment; titles, prizes, ETH pricing, the premium curve, and overpayment handling.

Retired: `cstBidPriceDeclineMultiplier` and `cstBidPriceDeclineMultiplierChangeDivisor` (never deployed; removed from the V3 storage layout together with their setters, events, and constants), and the V1/V2 variables `cstDutchAuctionBeginningBidPriceMinLimit` and `nextRoundFirstCstDutchAuctionBeginningBidPrice`, which stay in storage but are neither read nor written by V3+. The setter of the former, `setCstDutchAuctionBeginningBidPriceMinLimit`, reverts with `NotImplemented` in V3+.

#### Invariants

The following properties are enforced by `test/tests-src/CosmicSignatureGameV3-Bidding.js`, `CosmicSignatureGameV3-BidCstReward.js`, and `CosmicSignatureGameV3-BidRaffle.js` (rule by rule), `CosmicSignatureGameV3-CstPricingProperties.js` (seeded property and differential tests of the getters and of random bid sequences against the JS mirrors in `test/src/V3UpgradeTestHelpers.js`), `CosmicSignatureGameV3-CstAdversarial.js` (the economic scenarios of the table below, contract bidders, owner misconfiguration, raffle integrity, and a gas regression guard), and the model-based fuzz harness under `test/src/fuzz/` driven by `FuzzTest.js` (an independent conservation check from the emitted events, the invariants below, coverage counters for the CST corner paths, negative probes, and adversarial actors that hold the deadline with CST or camp on free bids).

- **I1, bounded auction life.** Every CST Dutch auction lasts between 2 and 24 increments (more precisely, between `2R / rate` and `C / rate`), because `S` is at least `2R` and at most `C`. A free CST bid is therefore available at most once per two increments, and after any price war the CST side is back to zero within one initial duration until main prize.

- **I2, conservation.** At the moment of a CST bid placed while the base is still positive, the base it burns plus all bid CST rewards minted since `T0`, including the reward that bid itself mints, equals `S` up to one Wei of rounding per reward, whatever mix of ETH and CST bids happened in between. A CST bid consumes the whole auction: what it burns plus what has been paid to holders since `T0` equals `S`. Once the base has reached zero, rewards keep accruing, so the rewards alone exceed `S` from then on.

- **I3, no drift.** The CST side carries no state across rounds except `S` and `T0`, and `S` is always within `[2R, C]`. The only scale knobs are `bidCstRewardAmountMultiplier` and `initialDurationUntilMainPrizeDivisor`, and they move the reward rate, `R`, and `C` together, so the free-bid cadence (two increments) and the ceiling (one initial duration until main prize) are the same in round 3 and in round 3000.

- **I4, no stationary hold.** Any sequence of CST bids spaced at most one increment apart doubles the asking price on every move until it reaches `C`. With the default parameters, holding the deadline with CST costs 60, 180, 420, 900, 1380, 1380, ... CST per increment, of which the displaced holder gets back 60. Free bids exist only at spacings of two increments or more, where the deadline advances one increment per cycle, so a round cannot be held open for free.

- **I5, proportional tickets.** Raffle weight is the fraction of the asking price paid. A free bid buys the last bidder position and the reward stream, not a raffle ticket.

#### Why Each Decision

**Decline equals the reward rate (rule 1).** This is the symmetry the first V3 draft already aimed at, made exact and permanent. It deletes the second rate and with it the bid-mix adjustment. The adjustment bought nothing a player could perceive: the perceptible coupling between the currencies is that an ETH bid lets the CST clock keep running (see "Alternation" below), and that survives. With one rate, the conservation invariant I2 holds exactly and the CST side scales automatically with the increment.

**Additive restart (rule 2).** A restart of the form `max(2b, k * R)` has a stationary point. At `k = 2`, a bid placed one increment after the previous one costs exactly what the previous holder is paid back, so two accounts could hold the deadline forever at zero net cost. This was found independently by several reviewers of the first draft and confirmed by simulation, in which an adversary held a round open for 172 days at a net cost of 48 CST. Adding `R` inside the doubling removes every stationary point: the recurrence `S' = 2 * (S - reward(d) + R)` has no fixed point for any spacing `d` of at most one increment. The restart after a free bid is `2R`, the free-bid cadence is two increments, and the deadline advances.

**Cap and seed at one initial duration until main prize (rule 2).** Doubling without a cap would let a single very large CST bid lock CST out for weeks under a linear decline. Capping `S` at `C` bounds any dormancy to about a day with the default parameters, and seeding each round at `C` gives the round a clean shape: the CST price and the initial countdown to `mainPrizeTime` start together on the round's first bid and would reach zero together. It also removes the cross-round carry of `nextRoundFirstCstDutchAuctionBeginningBidPrice`, which could otherwise be pumped by whoever placed a round's first CST bid.

**Premium floor at one increment of reward (rule 3).** In a price war the base is far above `R`, so the CST premium behaves exactly like the ETH premium (proportional to the price). The floor matters only for an idle auction: a snipe at the deadline after the price has reached zero costs about `4R` (240 CST) instead of nothing. `S` and `2R` were considered as alternative floors; `R` is the right scale, because it is what the sniper's victim is owed for the last increment.

**Weight by fraction paid (rule 4).** This separates the two goods the CST auction sells. Pay early and you buy raffle weight; wait for zero and you buy only the position and the reward stream. The alternative `(base + R) / (S + R)` was tested and rejected because it reopens a free-weight channel. Zero-weight bids are safe for the winner picker: the binary search in `BidRaffleWeightHelpers.findBidIndex` can never select a bid whose cumulative weight equals its predecessor's, and the total weight stays positive because the round's first bid is ETH.

**No new parameters.** Every quantity is derived from `bidCstRewardAmountMultiplier`, `mainPrizeTimeIncrementInMicroSeconds`, and `initialDurationUntilMainPrizeDivisor`, which the game already has. A separate decline rate, a separate minimum, or a separate cap would each be a knob that has to track the others.

#### How It Plays With the Default Parameters

The figures below assume a one-hour increment, 60 CST of reward per increment, a 24-hour initial duration until main prize, and the default late-bid window of about 20 minutes. They are rounded.

| Situation | Cost | Note |
| --- | --- | --- |
| Round opening | The first CST bid asks 1440 CST, falling 60 CST per hour | ETH is the opening currency; CST becomes attractive during the first day; the price reaches zero exactly when the initial countdown would have ended |
| Camper (free bids only) | First free bid after 24 hours, then one per 2 hours | Earns at most 120 CST per cycle, gets zero raffle weight, and the deadline advances one increment per cycle, so a camped round still ends |
| A full raffle ticket in CST | 120 CST right after a free bid, up to 1440 CST right after the round seed | Half the asking price buys half a ticket |
| Holding the deadline with CST, one bid per hour | 60, 180, 420, 900, 1380, 1380, ... CST | Net of the 60 CST the other side receives: 0, 120, 360, 840, 1320, ... The free loop of the first draft is gone |
| CST-vs-CST end-game war, each response at its cheapest moment (48 to 52 minutes after the previous bid) | 71, 212, 496, 1064, 1394, 1394, ... CST | Net of the holder reward: 21, 164, 448, 1017, 1347, ... The cap makes the fifth and later moves flat at about 23 hours of holding each |
| Alternation: a CST bid answered by ETH, answered by CST 82 minutes after the previous CST bid | The CST side pays 40, 120, 280, 600, 1240, then 1360 CST per move at the cap (the cap minus the decline over 82 minutes); the ETH side pays its base plus one percent per bid into the pot | An ETH answer defuses the CST escalation once, then both sides escalate |
| Snipe at the deadline | 240 CST on an idle auction (the premium of `R`); about 300 CST at the next deadline after a zero-base CST bid placed at a deadline; about five times the base in ETH | No currency snipes for free |
| Longest CST dormancy after a war | 24 hours | Equal to the round's initial duration until main prize, by construction |

An agent-based simulation with campers, ticket buyers, ETH builders, snipers, defusers, title hunters, and an adaptive adversary found no stationary cycle, free zero-weight bids reduced from about 96 per round to between 1 and 10, rounds that end, symmetric wars pushed back onto escalating ETH, and CST burned roughly equal to CST minted.

#### Alternatives Considered and Rejected

- **A minimum at the marginal value** (a `2R` restart minimum or an `R` price floor): knife edges with a zero-net stationary loop, as described above.

- **A decline slower than the reward rate**: a second constant, and it breaks conservation.

- **Burn-equals-mint pricing** (a price of at least the reward it pays out): makes CST wars zero-sum between players, which never end.

- **A flat auction** (`S` always equal to `C`, no doubling): the most minimal design and the limit of rule 2 at the cap, but it loses demand-responsive pricing and turns CST wars into flat-priced attrition instead of decisive escalation. Rule 2 degrades gracefully into it after four contested moves.

- **Weight by net CST destroyed**: ties a bidder's ticket to how long the previous holder held, which the bidder does not control.

- **Keeping the bid-mix adjustment of the decline rate**: the source of unbounded drift, and it buys nothing perceptible.

- **Subtracting the reward from the base before doubling** (an idea recorded in a V3 draft comment): the reward goes to the previous bidder, not to the bidder restarting the auction, so there is nothing to subtract on that bidder's side. Rule 2 adds `R` instead, for the reason given above.

- **Making the retired V1/V2 getters revert**: the storage base contract is shared with the deployed versions and the project keeps retired variables public; the staleness is documented instead.

#### Accepted Properties

- The relative value of ETH and CST is set by the market, not by the rules. The rules guarantee that no move is free and that every contested move escalates; they do not and cannot guarantee which currency players prefer.

- Camping is legal and bounded: with the default parameters, at most about 12 free bids per day, each worth zero raffle weight, each advancing the deadline.

- After a hard CST war the CST side can be dormant for up to one initial duration until main prize. That is the cap doing its job: a dramatic war has a cooling-off period.

- The contract owner can configure degenerate values. A `bidCstRewardAmountMultiplier` below `1e6` makes `R` round to zero, and a zero multiplier makes `C` zero and the price constant. The weight and duration formulas are guarded against division by zero, so nothing bricks, but the CST side would be meaningless. The owner is trusted, as everywhere else in the game.

- Integer rounding: `reward(e)` is floored per bid, so the conservation invariant I2 holds up to one Wei per bid, and `C` is `bidCstRewardAmountMultiplier / initialDurationUntilMainPrizeDivisor`, which differs from `reward(getInitialDurationUntilMainPrize())` by at most rounding.

- The last CST bidder prize is unchanged by these rules. The round's last CST bidder receives `cstPrizeAmount` (1000 CST by default) and one Cosmic Signature NFT at the claim, regardless of what that bid paid, so a zero-price CST bid can win it if no CST bid follows. The position is contestable at any time: another free CST bid is possible two increments later, and inside the late-bid window a CST bid costs at least the premium of `R`, about 240 CST at the deadline. V2 guaranteed a minimum spend for this position through its 200 CST minimum; V3 does not. Whether this prize should depend on the CST paid is a separate design decision, left as is here.

#### Frontend Notes

- Quote the CST bid price base with `getNextCstBidPriceBase()` and the full price with `getNextCstBidPrice()`; the difference is the late-bid premium.

- The whole CST price curve of the current auction follows from four public values: `cstDutchAuctionBeginningBidPrice` (or `C` if `lastCstBidderAddress` is zero), `cstDutchAuctionBeginningTimeStamp`, `bidCstRewardAmountMultiplier`, and `mainPrizeTimeIncrementInMicroSeconds`. `getCstDutchAuctionDurations()` returns the time to zero and the elapsed time.

- `BidPlaced` field 8, `cstDutchAuctionBeginningBidPrice`, is the beginning price of the CST Dutch auction in effect after the bid (Comment-202611028), so an indexer can reconstruct the curve from events alone.

- Useful figures to show: the asking price `S`, the current base, the time to zero, the premium, and the raffle ticket fraction `base / S`.
