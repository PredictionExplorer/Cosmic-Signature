---
title: Cosmic Signature
subtitle: White paper 1.3 | A procedural art protocol on Arbitrum One
author: Taras Bobrovytsky
date: October 17, 2026
lang: en-US
papersize: letter
fontsize: 11pt
geometry: margin=0.85in
colorlinks: true
linkcolor: blue
urlcolor: blue
---

**White paper 1.3 | Canonical English edition | Proposed contract V3**

The main description below specifies the proposed V3 implementation at commit
[`9d1a6447`][source] on branch
`v3.1-2026-10-13`. V2 remains deployed in the chain snapshot used here. Publication
of this paper does not activate V3. The deployment history and version comparisons
are in Sections 10 and 11; Appendix A identifies the deployed contracts.

# Abstract

Cosmic Signature connects timed participation on Arbitrum One with procedural
art. Participants make **Gestures** using ETH or CST, the protocol's ERC-20 token.
Gestures extend a **Performance Cycle**, establish time-based recognition, and
record participation in **Stellar Selections**. A successful finalization
distributes configured portions of the ETH reserve, creates Cosmic Signature
NFTs with seeds recorded on-chain, and schedules the next cycle. The remaining
reserve carries forward; growth from one cycle to the next is not guaranteed.

V3 changes how participation is recognized. Participation CST accrues linearly
with elapsed time and is created for the previous participant when the next
Gesture arrives. Participant selections use the ETH base cost at each Gesture
as a weight. A late-cycle premium increases the cost of acting close to the
deadline without increasing that Gesture's selection weight. V3 also changes
the ETH allocation split, expands the main NFT allocation, and replaces the CST
window's duration adjustment with an adjustable decline rate.

The contracts determine timing, ownership, allocation, and seed provenance.
Artwork is computed off-chain by an open-source three-body simulation and
renderer. Reproduction depends on the generator version and its inputs as well
as the seed. The protocol remains upgradeable and owner-configurable within the
constraints described below; neither governance transfer nor removal of owner
powers happens automatically in V3.

# 1 Design and terminology

The design combines three things: a public clock that participation can extend,
explicit rules for distributing a shared ETH reserve, and artwork derived from
recorded seeds. ETH Gestures add to the reserve. CST Gestures consume CST instead
of adding ETH. Finalization links the completed cycle to a new set of NFTs.

The two currencies have different cost schedules. ETH base costs step upward
with ETH participation after the opening Gesture. CST base costs decline with
time, while participation adjusts the decline rate. These mechanisms create
different ways to participate; the code does not enforce a fixed ETH-to-CST
exchange rate or guarantee a balanced mix of the two currencies.

The paper uses reader-facing names. The Solidity interfaces retain older names,
so the following mapping helps readers inspect the implementation.

| In this paper | In the contracts |
| --- | --- |
| Gesture | `bidWithEth`, `bidWithCst`, and related methods |
| Performance Cycle | `roundNum` and the current round state |
| Cycle Finalization Time | `mainPrizeTime` |
| Signature Allocation | The main allocation distributed by `claimMainPrize` |
| Stellar Selection | The participant and anchored-NFT selection functions |
| Anchoring | The two `StakingWallet` contracts |
| Imprint and Retrieve | Token creation and asset-retrieval operations |
| Cosmic Council | `CosmicSignatureDao` |
| Public Goods Vault | `CharityWallet` |
| Outreach Reserve | `MarketingWallet` |
| Allocations Wallet | `PrizesWallet` |

All ETH and CST arithmetic uses integer smallest units: one ETH and one CST each
contain `10^18` units. Time in transaction logic is measured in seconds, except
the stored cycle increment, which is in microseconds. Division of positive
integers rounds down unless stated otherwise. Numeric defaults describe the
reviewed configuration, not immutable promises about every future cycle.

# 2 System architecture

An existing UUPS proxy is the protocol's stable interaction address. V3 replaces
its implementation while retaining its storage. The implementation inherits
common and V2 base contracts for much of its behavior; the V3-specific source
files alone are not the entire protocol.

| Component | Responsibility |
| --- | --- |
| Protocol proxy and implementation | Gesture pricing, the cycle clock, ETH reserve, participation records, and finalization |
| CST token | ERC-20 balances, protocol-authorized creation and burns, holder-authorized burns, and delegated voting checkpoints |
| Cosmic Signature NFT | ERC-721 ownership, stored seeds and names, creation events linking NFTs to cycles, and configurable metadata references |
| Random Walk NFT | Existing external collection used for the ETH reduction and a separate Anchoring track |
| Allocations Wallet | Secondary ETH balances, attached NFTs, cycle beneficiary records, and retrieval permissions |
| Per-cycle token holders | Custody of attached ERC-20s, controlled through the Allocations Wallet |
| Anchoring wallets | NFT custody and eligibility for ETH distributions or anchored-NFT selections |
| Public Goods Vault and Outreach Reserve | Configured ETH forwarding and treasurer-directed CST distribution |
| Cosmic Council | Proposals and execution using delegated CST voting power |

The website and indexer help people discover state and prepare transactions.
They do not determine what a transaction does. Similarly, storing a seed on-chain
does not store the rendered image or video on-chain. Generator execution,
metadata publication, and media hosting are separate services.

An implementation upgrade does not redeploy the token, NFT collections, Council,
or other companion contracts. Their existing code and state remain in effect
unless a separate deployment or configuration transaction changes the relevant
component. This distinction matters particularly for the Allocations Wallet;
Section 10.4 describes its optional replacement.

# 3 The Performance Cycle

## 3.1 Opening a cycle

A cycle becomes available at `roundActivationTime`. Its first Gesture must use
ETH, optionally with the Random Walk NFT reduction. That first Gesture starts
the countdown and the CST Calibration Window. A CST Gesture cannot open a cycle.

Except for the original cycle's fixed opening base cost of 0.0001 ETH, an ETH
Calibration Window determines the opening base cost. It starts at a stored
ceiling and decreases to a floor. At default parameters the ceiling is twice
the preceding cycle's opening **undiscounted base cost**, and the floor is
`floor(ceiling / 200) + 1 wei`. The next ceiling does not include a swallowed
overpayment or the Random Walk NFT reduction.

The descent uses the following integer interpolation, where `C` is the ceiling,
`F` the floor, `u` elapsed seconds since activation, and `T` the window duration:

```text
opening base cost = C                              when u <= 0
opening base cost = C - floor((C - F) * u / T)     when 0 < u < T
opening base cost = F                              when u >= T
```

Here `T = floor(I / ethDutchAuctionDurationDivisor)`, where `I` is the stored
increment in microseconds. At the initial one-hour increment the duration is
approximately two days. If no one opens the cycle, the opening cost remains at
the floor after the window elapses, unless the owner changes the applicable
configuration. After the window has elapsed and before the first Gesture, the
owner can use `halveEthDutchAuctionEndingBidPrice` to lower the floor further;
that operation changes both the floor divisor and window duration divisor.

## 3.2 Extending the clock

The opening Gesture sets the deadline to the current timestamp plus
`floor(I / initialDurationUntilMainPrizeDivisor)`, approximately one day at
initial settings. Every subsequent Gesture adds `floor(I / 1,000,000)` seconds
to the **stored deadline**. It does not reset the deadline to an interval after
the latest transaction.

The increment began at one hour. On finalization it becomes
`I + floor(I / mainPrizeTimeIncrementIncreaseDivisor)`. The default divisor is
100, giving approximately 1% growth per completed cycle, subject to rounding.
There is no fixed maximum cycle length.

An expired countdown does not close participation. Until finalization succeeds,
another Gesture can become the Final Gesture and extend the stored deadline.
If the deadline was far enough in the past, it can remain expired after that
extension. A participant can then make a Gesture and finalize in the same
transaction through a contract. This behavior is present in V2 and retained in
V3.

## 3.3 Finalization

The Final Gesture participant can finalize once the deadline has arrived. Other
addresses can finalize after an additional timeout, currently 48 hours in the
V2 snapshot and retained by V3 initialization. The successful caller becomes
the cycle beneficiary and receives the Signature Allocation. When that caller
differs from the Final Gesture participant, the endurance and Chrono-Warrior
calculations still use the participation history.

Finalization updates the recognition records, distributes allocations, creates
the NFTs and fixed CST allocations, and prepares the next cycle. It is an
explicit transaction; merely reaching a timestamp does not execute it. Failed
finalization reverts the transaction's state changes and transfers.

The next activation is scheduled from the finalization timestamp using
`delayDurationBeforeRoundActivation`. Its Solidity default is 30 minutes, but
the checked V2 deployment uses **seven days**. V3 initialization preserves that
live setting. The owner can change this delay separately.

# 4 Gesture costs and participation

## 4.1 ETH Gestures

Every ETH Gesture, including the opening Gesture, sets the next ETH base cost to
`base + floor(base / ethBidPriceIncreaseDivisor) + 1 wei`. The default divisor
is 100. CST Gestures do not advance this ETH base-cost sequence.

The amount due is the base cost plus any late-cycle premium. A Random Walk NFT
owner can use an eligible NFT for a reduction to `ceil(amount due / 2)`.
The NFT stays with its owner; the protocol marks its ID as used for this
reduction permanently. Transferring it does not restore eligibility. This
one-time reduction and the NFT's one-time Anchoring eligibility are separate
records.

ETH sent above the amount due is refunded when the excess exceeds
`ethBidRefundAmountInGasToSwallowMaxLimit * tx.gasprice`. Otherwise the excess
stays in the reserve and is recorded as paid. The default threshold parameter is
6,843 gas units. A refund failure reverts the Gesture. Neither the excess nor
the late premium increases the next base cost or selection weight.

## 4.2 The CST Calibration Window

Let `B` be the current window's beginning cost, `a` its beginning timestamp,
`m` the decline rate in CST smallest units per second, and `t` the current time.
The V3 base cost is:

```text
CST base cost = max(0, B - (t - a) * m)
```

The late-cycle premium is added to that base. The full paid amount is burned
from the participant's CST balance. The participant specifies a maximum allowed
CST cost; the transaction reverts if the amount due exceeds it. Protocol-directed
burning does not require an ERC-20 spending approval to the protocol.

The decline rate changes on Gestures. With change divisor `d` (default 100):

```text
ETH candidate rate = m + floor(m / d)
CST updated rate   = m - floor(m / (d + 1))
```

Every ETH Gesture, including the opening Gesture, attempts the rate increase
and adopts its candidate only if `candidate * 180 <= B`. After the opening
Gesture has started the CST window, further ETH Gestures do not restart it:
the updated rate applies to the entire elapsed interval `t - a`, so an accepted
increase can immediately lower the CST base cost. A CST Gesture adopts its
updated rate (which integer rounding can leave
unchanged) and restarts the window at:

```text
new B = max(2 * premium-free CST base cost,
            configured beginning-cost minimum,
            updated rate * 180)
```

The configured minimum is set to 1 CST by V3 initialization. The additional
rate-based floor gives a restarted window a theoretical duration of at least
three minutes. It is **not a cooldown**: another Gesture can arrive immediately,
and the safeguard does not promise three minutes of remaining time after an
ETH rate adjustment. The first window of a later cycle can be shorter because
its carried-over beginning cost was established at an earlier rate.

The beginning cost created by the first CST Gesture in a cycle is carried into
the next cycle's first CST window. The decline rate also carries between cycles.
If a cycle has no CST Gesture, its carried beginning cost stays unchanged.
V3 initialization preserves V2's existing carried beginning cost of 200 CST;
it does not immediately replace that first-window cost with 1 CST.

At sufficient elapsed time the base cost reaches zero. A zero-cost CST Gesture
remains valid, and a zero base also produces zero late premium. Gas and other
transaction requirements still apply. Participation is not subject to a
one-Gesture-per-second restriction.

## 4.3 The late-cycle premium

V3 makes late participation more expensive without allowing the premium to
increase selection weight or ratchet later base costs. It applies to ETH and
CST Gestures after the opening Gesture.

The window length is `L = floor(I / D)`, where `D` is
`roundLateBidDurationDivisor`, initialized to 3,000,000. At the original
one-hour increment this is 20 minutes; with the checked live increment it is
1,236 seconds. The window grows as the increment grows.

For positive base cost `p`, elapsed time `e` within that window is clamped between
zero and `L`. The exact implementation uses these integer operations:

```text
e       = clamp(L - (deadline - now), 0, L)
q       = floor(e * M / I)
premium = floor(q^k * p / 2^(13*k))
due     = p + premium
```

The implementation skips the premium calculation when `e` is zero or no
Gesture has yet opened the cycle; in either case the premium is zero.

Here `M = 29,228,998,656` and `k = 8` at V3 initialization. The approximate
shape is `due / p = 1 + 4 * (e / L)^8`. The exact integer formula is
authoritative. The table shows the smooth approximation, rather than exact
smallest-unit amounts from a particular cycle.

| Fraction of late window elapsed | Approximate total cost relative to base |
| --- | --- |
| 0% | 1.00 times |
| 50% | 1.016 times |
| 75% | 1.40 times |
| 90% | 2.72 times |
| 100% and overtime | 5.00 times |

For example, with a 1 ETH base cost, the exact total at the deadline is
5.000050302627095474 ETH at the original one-hour increment. At the snapshot
increment of 3,709,083,600 microseconds, it is 4.993485445647992173 ETH. The
integer window length and intermediate rounding account for the difference;
five times the base is an approximation, not an exact fixed multiplier.

The Random Walk NFT reduction applies after adding the premium. The premium is
a one-time cost: subsequent ETH base costs, restarted CST base costs, and
selection weights use premium-free values. Total paid-amount statistics include
the premium. Inside the window, the amount due may change between a quote and
execution; in particular, the CST amount due need not decrease monotonically.

## 4.4 Messages and attached assets

A Gesture can include a message of up to 280 bytes under the default setting.
Bytes are not necessarily characters. Combined methods also accept an attached
ERC-20 amount or ERC-721 NFT. Approval must be granted to the contract that
actually transfers the attached asset, the Allocations Wallet.

Attached assets stay separate from the ETH reserve. The Allocations Wallet
holds attached NFTs; a dedicated token holder for each cycle holds attached
ERC-20s. The cycle beneficiary has the first right to retrieve them after
finalization. The `donateEth` and `donateEthWithInfo` methods can also add ETH
to the reserve without creating a Gesture, selection weight, or Participation
CST. A plain ETH transfer with empty calldata instead invokes the protocol's
receive function and attempts an ETH Gesture with default arguments.

# 5 CST creation and supply

## 5.1 Participation CST goes to the previous participant

Suppose Alice makes a Gesture and Bob makes the next one. Bob's transaction
creates Participation CST for **Alice**, based on the elapsed time between the
two Gestures. This is true whether either Gesture uses ETH or CST. If Alice
makes both Gestures, the same address receives the new CST. When CST is used,
the cost is burned before the Participation CST is created; an anticipated
creation cannot substitute for the balance needed to pay that cost.

For elapsed seconds `s`, multiplier `R`, and increment `I` in microseconds:

```text
Participation CST, in smallest units = floor(s * R / I)
```

V3 initializes `R` to `60,000,000,000,000,000,000,000,000` (`6 * 10^25`). At the
original one-hour increment, this corresponds to 1 CST per elapsed minute.

| Time between Gestures | CST created for the previous participant at the original increment |
| --- | --- |
| Same timestamp | 0 |
| 1 minute | 1 |
| 1 hour | 60 |
| 1 day | 1,440 |

These are examples at the original increment, not a fixed rate for all cycles.
The checked deployment's larger increment would give approximately 0.971 CST
per minute after V3 initialization. Increasing the increment reduces the rate
unless the multiplier is separately adjusted.

The opening Gesture creates no Participation CST. Finalization does not settle
an additional Participation CST amount for the Final Gesture participant, so
elapsed time alone does not produce a claimable balance. The existing minimum
Participation CST argument now constrains the amount created for the previous
participant, not an amount promised to the sender; V3 skips that check on the
opening ETH Gesture.

## 5.2 Fixed allocations and burns

At default settings, finalization creates 1,000 CST for each recognition or
NFT-selection allocation and 3,000 CST for the Outreach Reserve. The main
allocation receives 1,000 CST **in total**, even though V3 gives it three NFTs.
A typical cycle therefore still creates 27,000 CST in fixed allocations, plus
Participation CST created during the cycle. Section 6 explains omitted tracks.

The token starts with zero supply. There is no protocol schedule that fixes its
future total supply or guarantees an inflationary or deflationary outcome.
Supply changes reflect Participation CST, fixed allocations, and burns. Holders
can also burn their own CST, and approved spenders can use the inherited
allowance-based burn function. Protocol-authorized creation and burns use the
token's immutable protocol address.

There is a technical supply ceiling: the inherited `ERC20Votes` implementation
rejects creation that would raise supply above `2^208 - 1` CST smallest units.
This representation limit is not a scheduled economic supply cap or a promise
about the amount that will circulate.

# 6 Reserve distribution and recognition

## 6.1 ETH allocation

The reserve is the protocol's ETH balance, including retained ETH and direct
contributions. Finalization computes each allocation against that balance
before making its outgoing transfers. V3 initialization sets these percentages:

| Track | Share | Destination |
| --- | --- | --- |
| Signature Allocation | 20% | Successful finalization caller |
| Chrono-Warrior | 15% | Recipient's balance in the Allocations Wallet |
| Participant ETH Stellar Selection | 5% total | Three equal allocations in the Allocations Wallet |
| Cosmic Signature Anchor Distribution | 5% | Cosmic Signature Anchoring Wallet |
| Public Goods | 5% | Configured Public Goods destination |
| Retained reserve | Remainder | Protocol contract for later cycles |

The configured outgoing percentages sum to 50%. Actual outgoing ETH is affected
by integer rounding and exceptions: if no Cosmic Signature NFTs are anchored,
the Anchor Distribution stays in the protocol; if the Public Goods transfer
fails, that amount also stays. Splitting the participant ETH allocation can
leave additional wei in the reserve. Retention is not a promise that later
cycles start with a larger reserve.

The Signature Allocation is transferred directly to the caller. A caller that
cannot receive ETH causes finalization to revert. Secondary ETH recipients do
not have to receive ETH during finalization because their amounts are escrowed.
The Public Goods transfer has a specific failure-tolerant path; that does not
make every external call during finalization failure-tolerant.

## 6.2 NFT and CST allocation

| Track | Cosmic Signature NFTs | CST |
| --- | --- | --- |
| Signature Allocation | 3 | 1,000 total |
| Endurance Champion | 1 | 1,000 |
| Chrono-Warrior | 1 | 1,000 |
| Final CST Gesture, if present | 1 | 1,000 |
| Participant NFT Stellar Selection | 10 | 10 allocations of 1,000 |
| Anchored Random Walk NFT selection, if eligible NFTs exist | 10 | 10 allocations of 1,000 |
| Outreach Reserve | 0 | 3,000 |

With all tracks present, a V3 cycle creates **26 NFTs and 27,000 fixed CST**.
If there was no CST Gesture, subtract one NFT and 1,000 CST. If no Random Walk
NFTs are anchored at finalization, subtract ten NFTs and 10,000 CST. Multiple
allocations can go to the same address. NFT and CST counts are counts of
allocations, not necessarily distinct recipients.

The table uses the V3 main NFT count and the retained standard allocation
settings shown in Appendix B. Those configurable counts and amounts can change.

NFTs and CST are created directly for recipients during finalization. The main
allocation's NFTs have consecutive IDs; its event reports the first ID and
count. Token creation does not invoke ERC-721 receiver callbacks. A contract
address receiving an NFT must therefore have its own means to manage it.

## 6.3 Endurance Champion and Chrono-Warrior

The Endurance Champion recognizes the Gesture that remains the most recent for
the longest interval. Chrono-Warrior recognizes the Gesture whose Endurance
Champion record then stands for the longest interval. These are related but
different measures: a long quiet interval can establish a new record late in
the cycle, while an earlier, smaller record may have stood longer.

The implementation evaluates records when later Gestures or finalization run.
It reconstructs when a new record overtook the previous one instead of simply
starting the reign at the transaction that notices it. Strict comparisons and
second-level rounding determine ties; repeated Gestures by one address remain
distinct events. The final quiet interval is considered at finalization, which
can change the recipients then. A delayed finalization can therefore affect
recognition. The [endurance and Chrono-Warrior specification][endurance]
provides the exact algorithm and boundary examples.

## 6.4 Weighted Stellar Selections

Each Gesture receives a weight equal to the **undiscounted, premium-free ETH
base cost quoted at that moment**, in wei. This rule applies to ETH Gestures,
ETH Gestures with the Random Walk NFT reduction, and CST Gestures, including
zero-cost CST Gestures. Weight is not the actual amount paid in either currency.

At finalization, the implementation samples the cumulative weights to choose
the three participant ETH allocations and ten participant NFT allocations.
Selections allow repeats. Under uniformly distributed random inputs, relative
weights describe the intended selection proportions, with the integer modulo
sampling used by the code. The block-derived input limitations in Section 9
still apply; weighting does not make the process cryptographically unbiased.

Anchored Random Walk NFT selections remain separate. They select among active
NFT anchoring records, so an address with more eligible NFTs has more entries.
They do not use the participant ETH weights and carry no ETH allocation.

## 6.5 Retrieval and expiry

Secondary ETH and attached assets have retrieval rules implemented by the
Allocations Wallet. At cycle end, the wallet stores a deadline using its
configured timeout, currently five weeks. The designated recipient or cycle
beneficiary has priority before expiry. At or after expiry, another caller can retrieve
eligible uncollected assets for themselves. Expiry grants permission; it does
not automatically send the assets.

ETH balances are tracked separately for each cycle and recipient. Multiple
allocations to an address in one cycle accumulate in that cycle's balance;
an allocation in a later cycle does not extend an earlier cycle's deadline.
Attached assets also use their cycle's stored deadline.
Changing the timeout setting affects later cycle-end registrations, rather than
rewriting deadlines already recorded. Always identify the wallet that holds a
historical allocation; replacing the wallet does not migrate its balances.

# 7 Anchoring and coordination

## 7.1 Anchoring NFTs

Anchoring transfers an NFT into the relevant wallet. Only the recorded original
staker can release that anchor. Each NFT can be anchored
only once in that wallet over its lifetime. Releasing it returns the NFT but
does not restore its eligibility, even after ownership changes.

Cosmic Signature NFTs share each successful ETH Anchor Distribution equally
across the active NFT records. The accounting accumulates distributions per NFT;
the participant receives the accrued ETH when releasing the anchor. Failed ETH
delivery or NFT return reverts the release. Integer rounding can leave residual
ETH. Once no NFTs remain anchored, the wallet owner can send its remaining
ETH to a chosen nonzero address, including its own; owner powers therefore do
extend to this residual balance.

Random Walk NFT Anchoring gives eligibility for the separate NFT/CST selections
and does not accrue ETH distributions. Its eligibility record is independent
of the protocol's once-per-NFT ETH cost reduction.

## 7.2 The Cosmic Council

CST uses timestamp-based voting checkpoints. Holding CST and delegating its
voting power are separate actions; delegation can be to oneself or another
address. Voting uses the applicable historical checkpoint rather than simply
reading the current transferable balance.

The checked Council configuration uses a 100 CST proposal threshold, a two-day
voting delay, a two-week voting period, and a quorum of 3% of total CST supply
at the proposal snapshot. Support must exceed opposition, and support plus
abstention count toward quorum. The Governor has no separate execution timelock;
after voting ends, a successful proposal can execute directly. It can change
its own governance settings through proposals. The Governor can
execute successful proposals against assets and permissions that it actually
controls. It does not acquire ownership of the protocol or its wallets merely
because it exists.

## 7.3 Public Goods and Outreach

At the snapshot, the protocol's Public Goods destination is a vault whose
configured beneficiary is the Protocol Guild address listed in Appendix A.
Finalization sends ETH to the vault; a separate permissionless vault operation
forwards its accumulated balance to the beneficiary. This is not an automatic
same-transaction transfer from every cycle to the final beneficiary.

The vault owner can change the beneficiary. The Outreach Reserve receives its
configured CST allocation, and its appointed treasurer distributes CST. The
wallet owner appoints that treasurer. At the snapshot, the relevant owners and
treasurer are the deploying address, not the Council. These are distinct
administrative powers, not powers conferred on every CST holder.

# 8 The artwork

## 8.1 On-chain provenance and off-chain rendering

Each Cosmic Signature NFT stores a 32-byte seed at creation. Its `NftMinted`
event records the cycle; the cycle is not a field in the token's stored data.
The NFT contract uses Keccak-256 to derive each seed from a supplied counter,
which starts from a value derived during finalization and increments for each
NFT. It stores the resulting seed. This Keccak-256 step is distinct from the
renderer's SHA3-256 stream below. The protocol does not enforce seed uniqueness;
a hash-based construction does not constitute a uniqueness check.

The renderer initializes a SHA3-256 pseudorandom stream from the seed to explore
gravitational three-body trajectories and select an orbit. Participation affects
when finalization occurs and the chain context from which seeds are derived.
Messages and individual Gesture amounts are not instructions for drawing
particular features.

The description here uses generator revision
`59b324d035252c7db503743441d04d0355b81f3b`. It is a separate software release from
contract V3. Upgrading the contract does not install that renderer or prove that
every hosted token has been regenerated with it.

## 8.2 Simulation and the main spectral edition

The generator's default search considers 100,000 candidates per batch with a
configurable one-million-step setting for each of the warmup and recording
phases. Candidates may be rejected before completing those phases. A
fourth-order Yoshida integrator advances the three-body system. Selection uses
Borda-style ranking across chaos, equilateralness, and spatial interest,
followed by an image-space aesthetic
stage over a shortlist of up to 24 candidates, with up to three retry batches.

The selected orbit is rendered through seed-dependent layers and camera
parameters. Color is sampled from a continuous perceptual palette, including
hue dispersion and variation; it is not fixed at 120-degree spacing. The main
spectral edition uses 64 wavelength bins from 380 to 700 nanometers, with AgX
tonemapping and configured finishing effects such as halation, prism, spikes,
and stardust.

The package includes a 16-bit Display P3 master image, web derivatives, reveal
films in web H.264 and archival HEVC formats, spectral images, a spectral sweep
film, and metadata. A roughly 30-second main film is a target, with actual
duration determined by frame count and schedule.

## 8.3 The Ember edition

The same selected orbit also drives the Ember edition: tidally shaped bodies
move through a two-dimensional fluid, carrying black sumi ink over a modeled
kozo surface. Ember follows the main edition's recorded view. Its optical
model uses 36 spectral bands, distinct from the main edition's 64 bins.

The reviewed algorithm is `ember-v4`. Its outputs include a still, a normal
film, a four-times-slower medium film, a ten-times-slower film, and a determinism
certificate. The additional frames in the slower films are simulated, not
interpolated. Ember can be omitted from a generation run, and a failure in that
edition can leave the main package available without it; the asset manifest
records the available outputs. Ember is an off-chain rendering edition of the
same NFT; it does not create additional NFTs or alter a cycle's allocation count.

## 8.4 Reproducing a Signature

Reproduction requires the generator revision, configuration, orbit/view inputs
where applicable, and relevant runtime information as well as the NFT seed.
The main spectral renderer uses architecture-specific numerical paths that can
differ slightly across machines. A promise of universal pixel identity for the
entire pipeline would be too strong.

Ember uses controlled arithmetic and records SHA-256 digests of raw pixel
streams, along with the inputs on which they depend. Its golden tests run across
CPU architectures and thread configurations. That guarantee applies to the
recorded Ember inputs and raw pixels, not universally to encoded PNG, MP4, or
WebP bytes, which depend on encoder versions.

The contract and reviewed generator repositories carry CC0 licenses for their
own code. Dependencies retain their own licenses. NFT metadata and generator
URIs remain owner-configurable; on-chain seed provenance and the availability
or immutability of hosted files are different properties.

# 9 Security assumptions and administrative powers

## 9.1 Randomness and transaction ordering

Finalization mixes the previous block hash, base fee, and available Arbitrum
precompile values, including the previous Arbitrum block hash, gas backlog, and
L1 pricing counters. Successive hashes of an incremented seed provide values
for selections and NFT creation. Failed precompile reads omit that contribution
and emit a diagnostic event.

This construction uses block-derived inputs. It is not a verifiable-randomness
service or a commit-and-reveal protocol. Inputs can be predictable or influenced
by transaction timing and block production. Calls within the same transaction
can obtain the same initial seed; same-block values may be correlated. Hashing
does not remove those trust assumptions. Timing, cost, and percentage formulas
are deterministic, while selections and NFT seeds depend on this construction.

## 9.2 Contract and operational risks

Gesture and finalization paths use reentrancy protection, but not every external
function is guarded. Escrow prevents secondary ETH recipients from blocking
finalization through their receive functions; the direct main ETH transfer and
other external dependencies still have failure paths. Token creation without
receiver callbacks avoids one class of callback, while also allowing NFTs to
be delivered to contracts that cannot later move them.

Owner-configurable values are not all range-checked. Invalid divisors, counts,
percentages, or destination contracts can cause reverts or make operations
unusable. The absence of a mid-cycle setter does not establish that all possible
owner-selected configurations are safe. Participants also depend on Arbitrum
execution and transaction ordering, timely finalization and retrieval, and
off-chain availability for the rendered art.

The retained Allocations Wallet uses checked arithmetic when adding its
configured timeout to the cycle-end timestamp. An excessively large timeout
can therefore revert that registration and finalization. Replacing the Game
implementation alone does not change this separately deployed wallet's code.

The [Hacken report][hacken], published January 9, 2026, identifies reviewed commit
`9385ddb`. That is historical evidence about its
stated scope, not an audit of this V3 commit. Source verification establishes a
relationship between source and deployed bytecode, not freedom from defects.
The repository's older Certora material is explicitly historical and does not
establish complete formal verification of V3.

## 9.3 Ownership and future governance

Most core configuration setters and the UUPS upgrade authorization require the
owner and an inactive cycle, determined by the activation timestamp. Some
controls have different rules: the next-cycle delay is adjustable at any time;
activation can be changed before the first Gesture; ownership transfer and
renunciation have their own inherited permissions. Companion-contract owners
can separately change settings such as metadata references, the Public Goods
beneficiary, the Outreach treasurer, and future retrieval timeouts.

The upgrade power is substantial. An owner can install different implementation
logic when the current authorization conditions permit it. Constraints in
today's implementation are not a guarantee that an authorized future
implementation preserves them.

The previous paper described an intention to remove the deploying address's
privileges after development. V3 contains no automatic sunset, scheduled
renunciation, or compulsory Council transfer. Transferring ownership to the
Council preserves the relevant powers under collective control; renouncing an
ownership role disables that role's owner-only operations. They are different
outcomes and must be handled for each contract separately. Any future change
should be described as completed only after its transaction is observable.

# 10 Deployment history and the V3 transition

## 10.1 V1 launched the current proxy

The current proxy was deployed on **April 24, 2026 at 06:42:34 UTC**, in block
455767589. Its initial implementation was
`0x7739148013777c485AD9f3d971e1005Eca686661`. The [deployment transaction][v1-tx]
records that implementation. This is the launch date of the current proxy;
references to a March launch in older repository text do not describe this
transaction.

V1 introduced the cycles, ETH and CST participation, recognition tracks,
selections, Anchoring, and supporting contracts. Its default Participation CST
was a flat 100 CST paid to the participant making each Gesture. Its CST window
duration was derived from the cycle increment. Overtime Gestures set the new
deadline from the later of the old deadline and the current timestamp, then
added an increment. The launch default for the main finalization exclusivity
timeout was one day.

## 10.2 V2 changed timing and Participation CST

The [V2 upgrade][v2-tx] executed on **June 21, 2026 at 19:38:53 UTC**, in block
475913365. June 22 is the V2 implementation's source-verification date, not the
upgrade date. V2 remains active at the October 17 snapshot.

Its principal changes were:

- **Elapsed-time Participation CST.** The flat amount became
  `floor(sqrt(floor(elapsed * multiplier / I)))`, paid to the current
  participant, in CST smallest units. V2 initializes the multiplier to
  `1.08 * 10^46`. At the original one-hour increment, this is approximately
  `sqrt(3 * elapsed seconds)` CST: about 13.416 CST after one minute and
  103.923 CST after one hour. For a cycle's first Gesture, elapsed time starts
  at activation; a non-positive elapsed interval produces zero.
- **Minimum-amount protection.** Gesture methods gained a minimum accepted
  Participation CST argument.
- **Adaptive CST duration.** A stored duration begins at 12 hours on V2
  initialization and changes with participation. At divisor 250, ETH Gestures
  reduce it by approximately 0.398%, while CST Gestures increase it by
  approximately 0.4%, subject to integer rounding. The exact updates are
  `duration - floor(duration / 251)` and
  `duration + floor(duration / 250)`, respectively. This duration carries
  between cycles instead of growing with the cycle increment as it did in V1.
- **Stored-deadline extension.** Later Gestures add to the existing deadline,
  even in overtime, rather than always putting it in the future.
- **Longer exclusivity.** The finalization timeout becomes 48 hours.
- **Next-cycle arithmetic.** Arithmetic in next-cycle preparation, including
  the scheduling addition, uses wrapping arithmetic instead of reverting on
  overflow. This addresses that particular overflow path; it does not make
  every parameter configuration safe.

V2 retained equal-weight participant entries, one main NFT, and the
25/8/4/6/7 ETH split for main, Chrono-Warrior, participant selections, Anchoring,
and Public Goods respectively.

The verified V1 and V2 sources also show integration and storage changes:

- All six explicit Gesture methods, including the attached-asset variants,
  gained the minimum Participation CST argument and therefore changed
  function selectors. Direct plain-ETH transfers still call the ETH path with
  default arguments, including a zero minimum in V2. V2 adds reward quote
  getters and the `BidCstRewardAmountMinLimitNotReached` error.
- `BidPlaced` gained the Participation CST amount and updated CST duration,
  changing its event signature. Configuration getters, setters, and events
  changed from the fixed CST amount and duration divisor to the reward
  multiplier, stored duration, and duration-change divisor.
- V2 retained the proxy and existing populated storage positions. It reused
  the old CST duration-divisor slot for the stored duration and the fixed CST
  amount slot for its multiplier, and took one reserved slot for the new
  duration-change divisor. Its reserved gap was normalized without moving
  populated fields. `initializeV2()` replaced the V1 initialization entry
  point and initialized those three values plus the 48-hour timeout.
- The V2 implementation assumes an already-initialized proxy beyond its
  original cycle. It omits the original-cycle fixed-price branch and replaces
  the first-cycle guard with assertions used in diagnostic builds. It also
  checks activation before rejecting a CST opening Gesture, whereas V1
  checked those conditions in the reverse order. Owner-only upgrade and
  configuration restrictions otherwise remain in place.

These implementation changes did not replace the companion contracts or
change the Endurance Champion and Chrono-Warrior selection rules.

## 10.3 What V3 changes from deployed V2

| Mechanism | Deployed V2 | Proposed V3 |
| --- | --- | --- |
| Participation CST formula | Square root of scaled elapsed time | Linear scaled elapsed time |
| Participation CST recipient | Current participant | Previous participant |
| Opening Participation CST | Calculated from activation time | None |
| Late-cycle cost | No premium | Capped eighth-power premium under default settings |
| CST window adaptation | Stored duration, divisor 250 | Decline rate, divisor 100, with duration safeguards |
| Configured CST beginning minimum | 200 CST | 1 CST plus the rate-based restart floor |
| Participant selection weights | One equal entry per Gesture | Contemporary ETH base cost |
| Main NFTs | 1 | 3 |
| Typical total NFTs | 24 | 26 |
| Typical fixed CST | 27,000 | 27,000 |
| ETH split, in the order above | 25/8/4/6/7 | 20/15/5/5/5 |
| Per-cycle data | Legacy participant/address records | Expanded `roundStats` and individual Gesture records |

The reward and cost changes have distinct effects. Moving Participation CST to
the previous participant recognizes the interval their Gesture remained most
recent. The premium raises late costs without buying extra weight or inflating
later base costs. Weighting recognizes the prevailing ETH base cost rather than
counting every Gesture equally. The CST safeguards limit very short restarted
windows while preserving zero-cost participation after enough elapsed time.
These are mechanical effects, not guarantees about participant strategies,
market prices, fairness, or eventual cycle duration.

V3 also changes integration details. `getDurationUntilMainPrize` returns a
signed value, including negative overtime. Legacy duration setters remain
callable by signature but revert; their stored getters are historical remnants.
`BidPlaced` keeps its event signature while its eighth field changes from a
duration to a decline rate, and its CST amount now belongs to the previous
participant. `MainPrizeClaimed` gains an NFT count and changes signature.
Several legacy getters are removed, most Game custom errors lose their text
argument, and failure events become more specific. Consumers must distinguish
historical V2 data from V3 data even when an event signature is unchanged.
Use the ordered `Upgraded` event on the proxy as the version boundary. A V2
finalization can occur earlier in the same block as the V3 upgrade, so the
block number alone is not sufficient to select the correct interpretation.

The [V2-to-V3 technical change register][delta] covers these interfaces,
storage, shared-source changes, rounding details, and failure semantics. A
change to a retained companion contract's source does not update that deployed
contract by itself.

## 10.4 Initializing V3 and handling historical assets

The owner upgrades the existing proxy with `upgradeToAndCall`, passing
`reinitialize()` in the same transaction. The old implementation's authorization
requires the owner and an inactive cycle. The reinitializer is versioned but is
not independently owner-restricted, so initialization must not be left as a
later public call.

Initialization sets the new pricing variables, linear CST multiplier, ETH
percentages, and main NFT count. It overwrites the specified V2 configuration
values. It preserves the cycle increment, the carried first CST beginning
cost, existing timeouts, next-cycle delay, and component addresses. It emits
the initialization event rather than a separate change event for each rewritten
setting. Clients must read the resulting configuration.

The expanded statistics reuse storage compatibly, but historical cycles do not
gain data that was never stored. Their new fields are not retroactively
populated, and legacy per-Gesture records have no V3 weights. The V3
`BidInfo` record contains an address and cumulative weight, not a timestamp.
Complete Gesture timing must be reconstructed from events and their blocks;
`biddersInfo` stores only each address's latest Gesture timestamp in each cycle.
Historical event reconstruction must remain version-aware.

A new Allocations Wallet is an **explicit additional operator action**. The
default upgrade does not replace it. If a new wallet is selected, the operator
deploys it for the same proxy and sets the proxy's wallet address while the
cycle is inactive. The old wallet retains its assets, deadlines, beneficiary
records, and retrieval functions. The new wallet starts with empty records and
a fresh attached-NFT index, so an index is meaningful together with its wallet
address. Ownership and any customized timeout require separate configuration.

# 11 White paper revision history

## 11.1 The original English edition

The previous English white paper is version **1.0**, with **August 2026** on its
title block and `2026-08-24` as its ISO date in the frontend source. The retained
source snapshot is frontend commit
`893368318d58a6c13add49336fd8fc2fb17ba45a`. That edition describes live V2 and
an earlier V3 proposal. Its existing files and translations remain in their
original repository as historical editions.

## 11.2 What changed in edition 1.3

Edition **1.3** is the canonical English paper in the Solidity repository.
The suffix aligns with the proposed contract V3; paper and contract version
numbers are separate. This revision follows the retained 1.0 edition and does
not assert intervening published editions numbered 1.1 or 1.2.

| Earlier paper section | Revision in 1.3 |
| --- | --- |
| Abstract and design | Separates on-chain provenance from off-chain rendering; removes guaranteed reserve growth and automatic decentralization claims |
| Cycles and Gestures | Explains exact stored-deadline behavior, opening base cost, live delay versus default, and V3 pricing |
| Reserve and recognition | Updates ETH percentages, main NFT count, weighted selections, custody, conditional allocations, and retrieval deadlines |
| CST | Replaces the square-root/current-participant model with the linear/previous-participant model; explains opening and finalization exceptions |
| Art | Updates selection and palette descriptions, adds Ember v4, and separates the two editions' reproducibility guarantees |
| Anchoring and Council | Clarifies residual ETH, actual ownership, voting delegation, and Council authority |
| Public Goods | Distinguishes transfer to the vault from forwarding to its configured beneficiary |
| Security | Scopes historical reviews, corrects universal guard/failure claims, and states randomness and configuration assumptions |
| V3 proposal | Replaces the obsolete one-change, 10-times-premium proposal with the full reviewed V3 behavior |
| History and appendices | Adds chain-backed V1/V2 dates, V3 transition requirements, version comparisons, and a fixed-block deployment record |

The earlier V3 expression `1 + 9 * (t / T)^8` described a 10-times total cost.
The reviewed implementation instead produces approximately a five-times total
cost at default settings, with the exact integer formula in Section 4.3.
Likewise, the new main NFT count does not justify multiplying the main CST
allocation or increasing typical fixed CST from 27,000 to 29,000.

Future editions should record the contract commit they describe, whether it has
been deployed, and both protocol changes and corrections to the paper. A future
translation should identify the English edition from which it was translated.

# Appendix A Deployed contracts and source evidence

The following addresses and configuration observations refer to **Arbitrum One,
chain 42161, block 515784460**, timestamp **October 17, 2026, 21:25:00 UTC**.
The proxy points to V2 at that block. A future V3 implementation address is not
assigned by this paper.

| Component | Address |
| --- | --- |
| Protocol proxy | `0x6a714Ae7B5b6eA520F6BCA23d2E609C4Fd5863F2` |
| V2 implementation | `0x50eB3d05d2C463949DE9238D419385594f7AdB97` |
| CST | `0xAD91843e6A58Ba560F577E676986AFb1dba6FBA0` |
| Cosmic Signature NFT | `0xbb84Be3500A63581d3F2d5AC3bdF8685AAedad25` |
| Random Walk NFT | `0x895a6F444BE4ba9d124F61DF736605792B35D66b` |
| Allocations Wallet | `0xE1b619e9B39ea4109D2F429Ea5eAA307759b0011` |
| Cosmic Signature Anchoring | `0x6308A405B4FF1eA890870Efe2a6D036750B81F7C` |
| Random Walk Anchoring | `0x5EB3396092841E6c5b0b51141699F6711E830529` |
| Public Goods Vault | `0x96bB0ADB414d5350f435E52f94946B6C7A0760a9` |
| Outreach Reserve | `0xa3802c799f5e3D3D3562A9B513a41C6aAF92e25e` |
| Cosmic Council | `0xF3D52E1c681949be7E624778dB13DaD7F8c729db` |

The Public Goods Vault's beneficiary is
`0xdddd576bAF106bAAe54bDE40BCac602bB4a7cf79`. The protocol, NFT, Allocations
Wallet, Public Goods Vault, and Outreach Reserve owner reads identify
`0x14c82Ce4E5713E88C9462680E9c02BF4a3089871`; that address is also the checked
Outreach treasurer.

The accompanying `deployment-snapshot.json` records the block hash, raw getter
values, deployment transactions, runtime bytecode hashes, and Sourcify records.
All listed runtime bytecodes matched those records at the snapshot. The 48
project sources in the verified V2 build match repository commit
`3f52eaaf2258ec30f61fad07bb07cb2e3b4ca8a6` exactly. Companion contracts have
their own deployment source records; current repository copies must not be
assumed to reproduce every historical deployment.

# Appendix B Important parameters and units

| Parameter | V3 initialization or retained setting |
| --- | --- |
| ETH base-cost step divisor | 100, retained |
| ETH opening floor divisor | 200, retained |
| CST decline-rate change divisor | 100, initialized |
| CST initial decline rate | 16,666,666,666,666,667 smallest units per second |
| CST beginning-cost minimum | 1 CST, initialized |
| CST restart duration safeguard | 180 seconds, constant |
| Linear Participation CST multiplier | `6 * 10^25`, initialized |
| Late-window duration divisor | 3,000,000, initialized |
| Late-premium base multiplier | 29,228,998,656, initialized |
| Late-premium exponent | 8, initialized |
| Cycle increment | 3,709,083,600 microseconds at snapshot, retained |
| Cycle increment growth divisor | 100, retained |
| Finalization exclusivity | 172,800 seconds at snapshot, retained |
| Next-cycle delay | 604,800 seconds at snapshot, retained |
| Allocations Wallet timeout | 3,024,000 seconds at snapshot; separate wallet setting |
| Main NFT count | 3, initialized |
| Fixed CST per recognition allocation | 1,000 CST, retained |
| Outreach CST per cycle | 3,000 CST, retained |
| Participant ETH / NFT selections | 3 / 10, retained |
| Anchored Random Walk selections | 10 when eligible records exist, retained |
| Gesture message limit | 280 bytes, retained |

Values retained from V2 can differ from initial launch constants. Mutable
settings should be read from the intended deployment before preparing a
transaction. The obsolete stored CST duration and its change divisor remain
in storage for compatibility but no longer govern V3 pricing.

# References

1. [Reviewed V3 contract source][source], including [pricing][bidding],
   [finalization][main-prize], [initialization][initializer], and
   [constants][constants].
2. [Verified V2 deployment record and sources][verified-v2].
3. [Current proxy deployment transaction][v1-tx] and [V2 upgrade transaction][v2-tx].
4. [Technical V2-to-V3 change register][delta] and
   [endurance and Chrono-Warrior specification][endurance].
5. [Reviewed art generator revision][generator], including its
   [Ember certificate implementation][ember].
6. [Hacken historical security report][hacken].
7. [Previous English paper source][previous-paper].

Citation: Bobrovytsky, T. (2026). *Cosmic Signature: A procedural art protocol
on Arbitrum One*. White paper 1.3, canonical English edition.

This paper is dedicated to the public domain under the repository's CC0 1.0
license. Its technical descriptions do not promise asset prices, liquidity,
future value, or a risk-free outcome from participation.

[source]: https://github.com/PredictionExplorer/Cosmic-Signature/tree/9d1a644744e0ee588ef5af1947f6decdf8bdb3f3/contracts/production
[bidding]: https://github.com/PredictionExplorer/Cosmic-Signature/blob/9d1a644744e0ee588ef5af1947f6decdf8bdb3f3/contracts/production/BiddingV3.sol
[main-prize]: https://github.com/PredictionExplorer/Cosmic-Signature/blob/9d1a644744e0ee588ef5af1947f6decdf8bdb3f3/contracts/production/MainPrizeV3.sol
[initializer]: https://github.com/PredictionExplorer/Cosmic-Signature/blob/9d1a644744e0ee588ef5af1947f6decdf8bdb3f3/contracts/production/CosmicSignatureGameV3.sol
[constants]: https://github.com/PredictionExplorer/Cosmic-Signature/blob/9d1a644744e0ee588ef5af1947f6decdf8bdb3f3/contracts/production/libraries/CosmicSignatureConstants.sol
[verified-v2]: https://sourcify.dev/server/v2/contract/42161/0x50eB3d05d2C463949DE9238D419385594f7AdB97?fields=sources,metadata,compilation,deployment
[v1-tx]: https://arbiscan.io/tx/0xb9db34c4f095e2c207e5048fdff5d539b4dcb4f56dc455f2c74dc2d8e056532f
[v2-tx]: https://arbiscan.io/tx/0xd084284f4a44452eb94f4fd2614dfdc6bbde57856d8c53265bb5c440415e5eb9
[delta]: ../v3-vs-v2-changes.md
[endurance]: ../endurance-chrono-README.md
[generator]: https://github.com/PredictionExplorer/CS-Image-Generation/tree/59b324d035252c7db503743441d04d0355b81f3b
[ember]: https://github.com/PredictionExplorer/CS-Image-Generation/blob/59b324d035252c7db503743441d04d0355b81f3b/src/ember/certificate.rs
[hacken]: https://hacken.io/audits/cosmic-signature/sca-cosmic-signature-cosmicsignature-contracts-oct2025/
[previous-paper]: https://github.com/PredictionExplorer/cosmicgame-frontend/blob/893368318d58a6c13add49336fd8fc2fb17ba45a/content/white-paper/text.en.ts
