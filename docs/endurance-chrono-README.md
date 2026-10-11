### Endurance Champion and Chrono-Warrior

#### Overview

In each bidding round, the Game awards two titles based on how long bids remain unbeaten.

- **Endurance Champion** -- the bid that remained the last bid for the longest continuous time.

- **Chrono-Warrior** -- the Endurance Champion bid that held the Endurance Champion record for the longest time.

Each title belongs to an individual bid, and the prize goes to the address that placed it. If the same address places multiple bids, each bid is evaluated separately. Durations of different bids are never added up.

The titles become final on main prize claim. The prizes awarded to the title holders are listed in [cosmic-signature-game-prizes.md](cosmic-signature-game-prizes.md).

The logic is the same in all Game contract versions, except that V3+ also saves the final results in `roundStats`, as described below.

#### Terms

- **Last bid duration** -- how long a bid remained the last bid. It starts when the bid is placed. It ends when the next bid is placed or, for the final bid in the round, when the main prize is claimed. It can be zero, because the Game allows multiple bids within the same block or second.

- **Endurance record** -- the longest last bid duration observed so far in the current bidding round. The bid that set it is the current Endurance Champion.

- **Chrono-Warrior duration** of an Endurance Champion bid -- how long that bid held the endurance record. It starts when the bid's last bid duration reached the previous endurance record (for the first Endurance Champion in the round, when the bid was placed). It ends when the next Endurance Champion bid's last bid duration reached this bid's record or, for the final Endurance Champion in the round, when the main prize is claimed.

All comparisons are strict. On a tie, the earlier title holder keeps the title.

#### What Happens When a Bid Is Placed

The contract does not update the titles continuously. It updates them only when a bid is placed (except the first bid in a round) and when the main prize is claimed. A bid's own last bid duration is evaluated only after the bid has been outbid, or on main prize claim.

When a bid is placed, before it becomes the last bid, the contract evaluates the bid being outbid (`_updateChampionsIfNeeded`). Let `T` be the time the outbid bid was placed and `now` be the current block timestamp.

1. The outbid bid's last bid duration is `now - T`.

2. If there is no Endurance Champion yet, the outbid bid becomes the Endurance Champion. This happens on the second bid in a round.

3. Otherwise, if the outbid bid's last bid duration is strictly greater than the endurance record (`enduranceChampionDuration`):

	1. The current Endurance Champion's Chrono-Warrior duration becomes known (`_updateChronoWarriorIfNeeded`). It starts at `enduranceChampionStartTimeStamp + prevEnduranceChampionDuration` and ends at `T + enduranceChampionDuration` -- the moment the outbid bid's last bid duration reached the record. If this duration is strictly greater than `chronoWarriorDuration`, the current Endurance Champion becomes the Chrono-Warrior.

	2. The outbid bid becomes the new Endurance Champion. `prevEnduranceChampionDuration` gets the old record. `enduranceChampionAddress`, `enduranceChampionStartTimeStamp`, and `enduranceChampionDuration` get the outbid bid's address, `T`, and `now - T`.

4. Otherwise, nothing changes.

#### What Happens on Main Prize Claim

`claimMainPrize` finalizes the titles before distributing prizes.

1. It evaluates the final bid exactly as described in the previous section, with its last bid duration ending at the claim time. As a result, the final bid can become the Endurance Champion.

2. It then evaluates the final Endurance Champion's Chrono-Warrior duration, which ends at the claim time: `now - (enduranceChampionStartTimeStamp + prevEnduranceChampionDuration)`. If it is strictly greater than `chronoWarriorDuration`, the final Endurance Champion also becomes the Chrono-Warrior.

3. In V3+, the final durations are saved to `roundStats(roundNum).enduranceChampionDuration` and `roundStats(roundNum).chronoWarriorDuration`. If step 2 changed the Chrono-Warrior, the same bid has earned both titles, and the `1 << 2` bit (`SAME_BID_EARNED_ENDURANCE_CHAMPION_AND_CHRONO_WARRIOR_TITLES`) is set in `roundStats(roundNum).flags`. Only step 2 can award both titles to the same bid, because every earlier Chrono-Warrior was an Endurance Champion bid that was subsequently replaced.

Because the final bid's last bid duration and the final Endurance Champion's Chrono-Warrior duration both end at the claim time, the time of the claim transaction can affect who gets the titles.

The `EnduranceChampionPrizePaid` and `ChronoWarriorPrizePaid` events report the winners.

#### Example

Times are in seconds. Alice places 2 bids, which are evaluated separately.

| Time | Event | Evaluation | Endurance Champion After | Chrono-Warrior After |
|------|-------|------------|--------------------------|----------------------|
| 1000 | Alice places the first bid in the round. | Nothing is evaluated on the first bid. | None. | None. |
| 1100 | Bob bids. | Alice's bid lasted 100. There is no Endurance Champion yet. | Alice's bid: started at 1000, duration 100, previous record 0. | None. |
| 1250 | Carol bids. | Bob's bid lasted 150, which is greater than 100. Alice's bid held the record from 1000 + 0 = 1000 to 1100 + 100 = 1200, which is 200. | Bob's bid: started at 1100, duration 150, previous record 100. | Alice, 200. |
| 1300 | Dave bids. | Carol's bid lasted 50, which is not greater than 150. | Bob's bid, unchanged. | Alice, 200. |
| 1700 | Alice bids again. | Dave's bid lasted 400, which is greater than 150. Bob's bid held the record from 1100 + 100 = 1200 to 1300 + 150 = 1450, which is 250, which is greater than 200. | Dave's bid: started at 1300, duration 400, previous record 150. | Bob, 250. |
| 1900 | Alice claims the main prize. | Alice's second bid lasted 200, which is not greater than 400. Dave's bid has held the record from 1300 + 150 = 1450 to 1900, which is 450, which is greater than 250. | Dave, 400. | Dave, 450. |

Final results: Alice wins the main prize, Dave is both the Endurance Champion and the Chrono-Warrior, and in V3+ `roundStats(roundNum)` records the durations 400 and 450, with the same-bid flag set.

#### Real-Time Standings

To find out who would get the titles if the round ended at the current block timestamp, call `tryGetCurrentChampions()`. It performs steps 1 and 2 of the main prize claim logic in memory, without saving anything, and returns the Endurance Champion address and duration and the Chrono-Warrior address and duration. Before the first bid in a round, it returns zeros. After one bid, the only bidder is both the Endurance Champion and the Chrono-Warrior.

Do not use the `enduranceChampionAddress`, `enduranceChampionDuration`, `chronoWarriorAddress`, and `chronoWarriorDuration` state variables for this purpose. They reflect only the evaluations performed by the bids placed so far, so they do not account for the ongoing last bid duration of the current last bid or the ongoing Chrono-Warrior duration of the current Endurance Champion.

For example, at time 1600 in the above example:

- The state variables still say that the Endurance Champion is Bob's bid with duration 150 and the Chrono-Warrior is Alice with duration 200.

- `tryGetCurrentChampions()` evaluates Dave's ongoing bid, which has lasted 1600 - 1300 = 300. That's greater than 150, so it calculates Bob's Chrono-Warrior duration as 250 and returns Dave with 300 as the Endurance Champion and Bob with 250 as the Chrono-Warrior. Dave's ongoing Chrono-Warrior duration, 1600 - 1450 = 150, is not greater than 250.

The real-time standings can change at any second, even when nobody bids. For example, the current last bid can become the Endurance Champion, and the current Endurance Champion can become the Chrono-Warrior.

#### Notes

- Between bidding rounds, use `roundStats` (V3+) or the prize events to find out past results. On a main prize claim, some champion state variables are reset for the next round, while others remain stale until updated during the next round.

- See relevant tests near Comment-202610172.
