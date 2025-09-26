### Champions: Endurance Champion and Chrono‑Warrior (precise definitions)

Simple explanation (TL;DR):
- Endurance Champion (EC): the participant who remained the last bidder for the longest single continuous period in the round.
- Chrono‑Warrior (CW): the participant who remained Endurance Champion for the longest period (i.e., held the record) across the round, with standings finalized at round end.
- Both receive special prizes (see Prize distribution details).

The game tracks two related, but distinct achievements within each round. Both are derived from the timeline of who is the last bidder and for how long.

- **Continuous last‑bid interval**: After an address A places a bid that makes them the last bidder, A’s continuous last‑bid interval starts at A’s last bid timestamp and ends when someone else outbids A (or at the time of evaluation).

- **Endurance Champion (EC)**: The address that has achieved the longest single continuous last‑bid interval so far in the round.
  - Implementation details:
    - When there is no EC yet, the current last bidder becomes EC with duration = now − lastBidTime.
    - Whenever the current last bidder’s ongoing interval exceeds the recorded EC duration, the contract:
      1) First updates the Chrono‑Warrior candidate (see below) for the outgoing EC using the interval [EC.start + EC.prevDuration, EC.start + EC.duration].
      2) Then promotes the current last bidder to be the new EC:
         - `enduranceChampionAddress = lastBidderAddress`
         - `enduranceChampionStartTimeStamp = lastBidTimeStamp`
         - `prevEnduranceChampionDuration = old enduranceChampionDuration`
         - `enduranceChampionDuration = now − lastBidTimeStamp`

- **Chrono‑Warrior (CW)**: The address with the longest “chrono” duration, defined as the length of the most recent (latest) continuous last‑bid interval achieved by the Endurance Champion when it was last updated.
  - Intuition: CW recognizes the best “peak streak” by the ECs over time. Each time a new EC dethrones the previous EC, the previous EC’s “chrono interval” is computed as:
    - `chronoStart = enduranceChampionStartTimeStamp + prevEnduranceChampionDuration`
    - `chronoEnd = lastBidTimeStampOfNewEC + durationOfOldEC`
    - `chronoDuration = chronoEnd − chronoStart`
    - If `chronoDuration` exceeds the recorded CW duration, update CW to the old EC and record this new `chronoDuration`.
  - On finalization (e.g., main‑prize claim), the logic also evaluates the current EC’s ongoing chrono at “now” to ensure the best streak is captured if it ends the round as EC:
    - `chronoStart = enduranceChampionStartTimeStamp + prevEnduranceChampionDuration`
    - `chronoEnd = now`
    - `chronoDuration = chronoEnd − chronoStart`
    - If larger than the current CW duration, CW becomes the current EC with this duration.

These roles are maintained in `BidStatistics`:
- `_updateChampionsIfNeeded()` evaluates, on bids after the first, whether the current last‑bidder’s active interval surpasses the recorded EC duration. If so, it first closes and scores the previous EC’s chrono segment, then promotes the current last‑bidder to EC.
- `_updateChronoWarriorIfNeeded(chronoEndTime)` computes the chrono duration based on the EC state and updates CW if it’s an improvement.
- On main prize claim, the code calls `_updateChampionsIfNeeded()` and `_updateChronoWarriorIfNeeded(block.timestamp)` to finalize standings before prizes.

#### Example timeline

1) Address A bids at t=100; A is last bidder. Suppose no prior EC exists:
   - EC := A, EC.start=100, EC.duration=now−100, prevEC.duration=0.
2) Address B outbids at t=140 (becomes last bidder). When B's active interval grows and exceeds EC.duration (which belonged to A), the contract:
   - First sets CW candidate using A's chrono window [A.start + 0, A.start + A.duration].
   - Promotes B to EC with EC.start=t(B's last bid), prevEC.duration = A.duration.
3) Near the end of the round, suppose C becomes EC and at claim time we finalize using "now" as chronoEnd; if C's current chrono segment is the longest of all, C becomes CW.

### Concrete Examples

#### Example 1: ETH Dutch Auction Pricing
**Scenario**: Round starts, no bids yet
- Starting price: 0.0002 ETH (previous round's first bid × 2)
- Ending price: 0.00001 ETH (start ÷ 20 + 1 wei)
- Duration: 2 days (3,600 seconds × 1,000,000 microseconds ÷ divisor)

**Timeline**:
- t=0: Price = 0.0002 ETH
- t=1 day: Price ≈ 0.00011 ETH (roughly halfway)
- t=2 days: Price = 0.00001 ETH (floor reached)
- Alice bids 0.00015 ETH at t=12 hours
- Next ETH price = 0.00015 + 0.00015/100 + 1 wei ≈ 0.0001515 ETH

#### Example 2: Prize Distribution
**Scenario**: Round ends with 10 ETH contract balance, 50 total bids
- Main prize (25%): 2.5 ETH → Last bidder
- Chrono-Warrior (7%): 0.7 ETH → Longest EC streak holder
- Bidder raffles (5% ÷ 3): 0.166 ETH each → 3 random bidders
- CSN staking (10%): 1 ETH → Distributed to all CSN stakers
- Charity (10%): 1 ETH → Charity address
- Remaining (43%): 4.3 ETH → Stays for next round

**CST rewards**:
- Each bidder: 100 CST immediate reward
- Endurance Champion: 50 × 10 = 500 CST bonus
- Last CST bidder: 50 × 10 = 500 CST bonus
- Marketing wallet: 1000 CST

#### Example 3: Champions Tracking
**Detailed timeline with timestamps**:
```
t=1000: Alice bids (first bid, becomes EC immediately)
  - EC: Alice, start=1000, duration=0
  - CW: none (initialized to max uint256)

t=1100: Bob bids (Alice was EC for 100 seconds)
  - EC: still Alice, duration=100
  - Last bidder: Bob

t=1250: Bob's streak reaches 150 seconds > Alice's 100
  - Update CW candidate: Alice's chrono = [1000+0, 1100+100] = 100 seconds
  - New EC: Bob, start=1100, duration=150, prevDuration=100
  - CW: Alice with 100 seconds

t=1300: Charlie bids
  - EC: Bob, duration=200
  - Last bidder: Charlie

t=1350: Charlie's streak reaches 50 seconds < Bob's 200
  - No champion changes

t=1600: David bids when Charlie has 300 > Bob's 200
  - Update CW: Bob's chrono = [1100+100, 1300+200] = 200 seconds
  - New EC: Charlie, start=1300, prevDuration=200
  - CW: Bob with 200 seconds

Round ends at t=2000:
  - Final EC: David (if he remained last bidder)
  - Final CW: Evaluated comparing all chrono windows
```

