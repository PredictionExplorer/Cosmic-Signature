#!/usr/bin/env python3
"""
Cosmic Signature bidding game — wall-clock, round-duration, and NFT supply simulator.

Integer math mirrors the production Solidity contracts (CosmicSignatureConstants,
MainPrizeBase, MainPrize._prepareNextRound, Bidding._bidCommon, Bidding.getNextEthBidPriceAdvanced).


Round timeline (what one round looks like in wall-clock time)
-------------------------------------------------------------

    1. Previous round ends.  The last bidder claims the main prize immediately
       (we assume zero claim delay — no use of the 1-day exclusivity timeout).
    2. `delay_duration_before_round_activation` elapses.
       Default: 30 minutes (CosmicSignatureConstants: `(1 hours) / 2`).
    3. Rounds 1+: the ETH Dutch auction descends from
            begin  = previous_first_bid_price * 2
            floor  = previous_first_bid_price / 100
       over a duration of roughly 2 days (scaling +1% per round with the main
       prize time increment).  Competitive bidders wait until the price is
       "fair" and then race to place the first bid.  See below for why that
       point is the auction midpoint.
       Round 0 skips this step and uses `FIRST_ROUND_INITIAL_ETH_BID_PRICE`
       (0.0001 ETH) as the first-bid price.
    4. First bid lands.  mainPrizeTime := now + initial_countdown,
       where `initial_countdown ≈ 1 day` in round 0 (scaling +1% per round).
    5. Subsequent bids extend mainPrizeTime by `time_per_bid` each
       (1 hour in round 0; +1% per round).  Each bid's ETH price steps up
       via `next = price + price // 100 + 1` (Bidding.sol line 313) until
       it reaches a rational ceiling at which further bidding is unprofitable.
    6. Last bidder claims immediately once mainPrizeTime elapses.


Why first-bid price ≈ previous-round first-bid price (Dutch auction fixed point)
--------------------------------------------------------------------------------

Starting from round 1, `ethDutchAuctionBeginningBidPrice = 2 * P` where P is
the previous round's first-bid price, and the floor is `P / 100`.  The price
descends linearly.  Solving P(t) = P gives t/T = 100/199 ≈ 0.5025, so the
descending curve crosses the previous round's first-bid price at almost
exactly the auction midpoint.  Rational competitive bidders therefore
converge on paying ~P again this round — a self-consistent equilibrium
where first-bid prices stay roughly constant across rounds.

The corollary for wall-clock time: each post-round-0 round silently absorbs
about half of the Dutch auction's duration as pure waiting time before the
first bid is placed.  This simulator counts that (configurable via
`--dutch-wait-fraction`, default 0.5).


What this simulator does and doesn't model
-------------------------------------------

Models faithfully:
  * ETH bid price ladder (+1% + 1 wei per bid), integer math.
  * Main prize time increment growth (+1% per round).
  * Initial countdown on first bid of a round.
  * Inter-round activation delay.
  * ETH Dutch auction wait time (midpoint equilibrium by default).

Simplifications (intentional):
  * Ceiling is a behavioural parameter, not an on-chain constant.  Given a
    fixed start and ceiling, bids-per-round is constant; the real ceiling
    is set by each bidder's marginal expected prize value and is endogenous.
  * CST bids are not modelled.  In production, CST bids extend mainPrizeTime
    too, so real rounds are at least as long as what this simulator reports.
  * Random Walk NFT 50% bid discount is not modelled.
  * Last bidder is assumed to claim instantly (no +1 day claim window).
  * NFTs per round defaults to 24, the upper bound (all optional prize
    categories — last CST bidder and Random Walk NFT stakers — filled).
    Lower in practice if a CST bid didn't occur (-1) or no one stakes RW NFTs
    (-10).


NFT breakdown per round (from MainPrize._distributePrizes)
-----------------------------------------------------------
    1  main prize beneficiary
    1  endurance champion
    1  chrono-warrior
    1  last CST bidder              (only if >=1 CST bid occurred)
   10  raffle NFTs for bidders      (numRaffleCosmicSignatureNftsForBidders)
   10  raffle NFTs for RW stakers   (only if RW NFT stakers exist)
   --
   24  total upper bound            (configurable via --nfts-per-round)


Run
---
    python3 simulation/bidding_simulator.py
        [--start-eth-price 0.01]
        [--max-eth-price 1.0]
        [--nfts-per-round 24]
        [--dutch-wait-fraction 0.5]
        [--years 1,10,100]
"""

from __future__ import annotations

import argparse
from typing import List, Tuple

# ---------------------------------------------------------------------------
# Constants aligned with CosmicSignatureConstants.sol (default values)
# ---------------------------------------------------------------------------

WEI_PER_ETH = 10**18
MICROSECONDS_PER_SECOND = 1_000_000
SECONDS_PER_HOUR = 3_600
SECONDS_PER_DAY = 86_400
SECONDS_PER_YEAR = 365.25 * SECONDS_PER_DAY

# Initial `mainPrizeTimeIncrementInMicroSeconds` = 1 hour expressed in microseconds.
INITIAL_MAIN_PRIZE_TIME_INCREMENT_MICROSECONDS = SECONDS_PER_HOUR * MICROSECONDS_PER_SECOND

# +1% per round, mirroring _prepareNextRound and DEFAULT_MAIN_PRIZE_TIME_INCREMENT_INCREASE_DIVISOR.
MAIN_PRIZE_TIME_INCREMENT_INCREASE_DIVISOR = 100

# Mirrors DEFAULT_INITIAL_DURATION_UNTIL_MAIN_PRIZE_DIVISOR. Round-trips 1 day in round 0.
DEFAULT_INITIAL_DURATION_UNTIL_MAIN_PRIZE_DIVISOR = (
    INITIAL_MAIN_PRIZE_TIME_INCREMENT_MICROSECONDS + SECONDS_PER_DAY // 2
) // SECONDS_PER_DAY  # 41667

# Mirrors DEFAULT_ETH_DUTCH_AUCTION_DURATION_DIVISOR. Round-trips ~2 days in round 0.
DEFAULT_ETH_DUTCH_AUCTION_DURATION_DIVISOR = (
    INITIAL_MAIN_PRIZE_TIME_INCREMENT_MICROSECONDS + (2 * SECONDS_PER_DAY) // 2
) // (2 * SECONDS_PER_DAY)  # 20833

# `ethDutchAuctionBeginningBidPrice = previous_first_bid_price * 2`.
ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER = 2

# Default `ethDutchAuctionEndingBidPriceDivisor`: floor = begin / 200 = previous_first_bid / 100.
DEFAULT_ETH_DUTCH_AUCTION_ENDING_BID_PRICE_DIVISOR = 100 * ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER

# DEFAULT_DELAY_DURATION_BEFORE_ROUND_ACTIVATION = (1 hours) / 2.
DEFAULT_DELAY_DURATION_BEFORE_ROUND_ACTIVATION = SECONDS_PER_HOUR // 2

# DEFAULT_ETH_BID_PRICE_INCREASE_DIVISOR: nextPrice = price + price // 100 + 1.
ETH_BID_PRICE_INCREASE_DIVISOR = 100

# FIRST_ROUND_INITIAL_ETH_BID_PRICE = 0.0001 ether. Only used for round 0.
FIRST_ROUND_INITIAL_ETH_BID_PRICE_ETH = 0.0001

# Upper-bound NFT count per round (all optional prize categories filled).
DEFAULT_NFTS_PER_ROUND = 24

# Midpoint-equilibrium fraction of the Dutch auction duration that elapses
# before the first bid lands (rounds 1+). See module docstring.
DEFAULT_DUTCH_WAIT_FRACTION = 0.5

DEFAULT_MILESTONE_YEARS = (1, 10, 100, 1000)


# ---------------------------------------------------------------------------
# Core helpers (exact Solidity integer math)
# ---------------------------------------------------------------------------

def advance_main_prize_increment(current_us: int) -> int:
    """_prepareNextRound: mainPrizeTimeIncrementInMicroSeconds += self // 100."""
    return current_us + current_us // MAIN_PRIZE_TIME_INCREMENT_INCREASE_DIVISOR


def time_per_bid_seconds(main_prize_inc_us: int) -> int:
    """getMainPrizeTimeIncrement() — seconds added to mainPrizeTime per bid."""
    return main_prize_inc_us // MICROSECONDS_PER_SECOND


def initial_countdown_seconds(main_prize_inc_us: int) -> int:
    """getInitialDurationUntilMainPrize() — set on first bid of round."""
    return main_prize_inc_us // DEFAULT_INITIAL_DURATION_UNTIL_MAIN_PRIZE_DIVISOR


def eth_dutch_auction_duration_seconds(main_prize_inc_us: int) -> int:
    """Bidding._getEthDutchAuctionDuration() — full duration of the descending first-bid auction."""
    return main_prize_inc_us // DEFAULT_ETH_DUTCH_AUCTION_DURATION_DIVISOR


def compute_bids_to_ceiling(start_wei: int, ceiling_wei: int) -> int:
    """
    Count how many bids fit between start_wei and ceiling_wei using the
    contract step function: next = price + price // 100 + 1.

    The first bid is at start_wei.  Returns total bid count (>= 1 if
    start_wei < ceiling_wei).
    """
    if start_wei >= ceiling_wei:
        return 0
    price = start_wei
    count = 1
    while True:
        price = price + price // ETH_BID_PRICE_INCREASE_DIVISOR + 1
        if price >= ceiling_wei:
            break
        count += 1
    return count


def round_duration_seconds(
    main_prize_inc_us: int,
    bids: int,
    dutch_wait_fraction: float,
    is_first_round: bool,
) -> int:
    """
    Wall-clock seconds from the start of a round's activation delay through
    the main prize being claimed.

    Timeline:
        delay  +  dutch_wait (rounds 1+ only)  +  initial  +  (bids-1) * time_per_bid
    """
    initial = initial_countdown_seconds(main_prize_inc_us)
    inc = time_per_bid_seconds(main_prize_inc_us)
    active = initial + max(bids - 1, 0) * inc

    dutch_wait = 0
    if not is_first_round and dutch_wait_fraction > 0.0:
        dutch_wait = int(
            eth_dutch_auction_duration_seconds(main_prize_inc_us) * dutch_wait_fraction
        )

    return DEFAULT_DELAY_DURATION_BEFORE_ROUND_ACTIVATION + dutch_wait + active


# ---------------------------------------------------------------------------
# Formatting
# ---------------------------------------------------------------------------

def fmt_duration(seconds: float) -> str:
    if seconds < 120:
        return f"{seconds:.0f} s"
    if seconds < SECONDS_PER_DAY:
        return f"{seconds / 3600:.2f} h"
    if seconds < SECONDS_PER_YEAR:
        return f"{seconds / SECONDS_PER_DAY:.1f} d"
    return f"{seconds / SECONDS_PER_YEAR:.2f} y"


def fmt_eth(wei: int) -> str:
    eth = wei / WEI_PER_ETH
    if eth >= 100:
        return f"{eth:.4e} ETH"
    if eth >= 0.001:
        return f"{eth:.6f} ETH"
    return f"{wei} wei  ({eth:.2e} ETH)"


# ---------------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------------

def run_simulation(
    bids_per_round: int,
    nfts_per_round: int,
    dutch_wait_fraction: float,
    milestone_years: Tuple[int, ...],
) -> List[dict]:
    milestones = sorted((y, y * SECONDS_PER_YEAR) for y in milestone_years)
    results: List[dict] = []

    elapsed = 0.0
    round_num = 0
    total_nfts = 0
    main_inc_us = INITIAL_MAIN_PRIZE_TIME_INCREMENT_MICROSECONDS
    mi = 0

    while mi < len(milestones):
        _, target_s = milestones[mi]
        while elapsed < target_s:
            dur = round_duration_seconds(
                main_inc_us,
                bids_per_round,
                dutch_wait_fraction,
                is_first_round=(round_num == 0),
            )
            elapsed += dur
            total_nfts += nfts_per_round
            main_inc_us = advance_main_prize_increment(main_inc_us)
            round_num += 1

        year_label = milestones[mi][0]
        results.append({
            "milestone_years": year_label,
            "elapsed_seconds": elapsed,
            "rounds": round_num,
            "total_nfts": total_nfts,
            "round_duration_s": round_duration_seconds(
                main_inc_us, bids_per_round, dutch_wait_fraction, is_first_round=False
            ),
            "time_per_bid_s": time_per_bid_seconds(main_inc_us),
            "initial_countdown_s": initial_countdown_seconds(main_inc_us),
            "dutch_wait_s": int(
                eth_dutch_auction_duration_seconds(main_inc_us) * dutch_wait_fraction
            ),
        })
        mi += 1

    return results


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def print_report(
    results: List[dict],
    bids_per_round: int,
    nfts_per_round: int,
    start_wei: int,
    ceiling_wei: int,
    dutch_wait_fraction: float,
) -> None:
    print("=" * 80)
    print("Cosmic Signature — Bidding Simulator")
    print("=" * 80)
    print()
    print("Assumptions:")
    print(f"  First bid price each round  : {fmt_eth(start_wei)}")
    print(f"  Bidding stops at            : {fmt_eth(ceiling_wei)}")
    print(f"  Bids per round              : {bids_per_round}")
    print(f"  NFTs minted per round       : {nfts_per_round}  (upper bound)")
    print(f"    breakdown: 1 winner + 1 endurance + 1 chrono")
    print(f"             + 1 last-CST-bidder (if CST bid occurred)")
    print(f"             + 10 raffle-bidders")
    print(f"             + 10 raffle-RW-stakers (if any RW NFTs staked)")
    print(f"  Time added per bid (round 0): {time_per_bid_seconds(INITIAL_MAIN_PRIZE_TIME_INCREMENT_MICROSECONDS)} s")
    print(f"  Time increment growth       : +1% per round (compounds)")
    print(f"  Inter-round delay           : {DEFAULT_DELAY_DURATION_BEFORE_ROUND_ACTIVATION} s")
    dutch_r0 = int(
        eth_dutch_auction_duration_seconds(INITIAL_MAIN_PRIZE_TIME_INCREMENT_MICROSECONDS)
        * dutch_wait_fraction
    )
    print(f"  Dutch-auction wait fraction : {dutch_wait_fraction:.2f}  "
          f"(round-0 wait: {fmt_duration(dutch_r0)}, rounds 1+)")
    print()

    hdr = (
        f"{'Milestone':>10}  {'Rounds':>8}  {'Total NFTs':>11}  "
        f"{'Round len':>12}  {'Time/bid':>10}  {'Countdown':>12}  {'Dutch wait':>12}"
    )
    print(hdr)
    print("-" * len(hdr))

    for r in results:
        print(
            f"{r['milestone_years']:>8} y  "
            f"{r['rounds']:>8,}  "
            f"{r['total_nfts']:>11,}  "
            f"{fmt_duration(r['round_duration_s']):>12}  "
            f"{fmt_duration(r['time_per_bid_s']):>10}  "
            f"{fmt_duration(r['initial_countdown_s']):>12}  "
            f"{fmt_duration(r['dutch_wait_s']):>12}"
        )

    print()
    print("Column key:")
    print("  Rounds     — completed bidding rounds by that wall-clock time")
    print("  Total NFTs — cumulative Cosmic Signature NFTs in existence")
    print("  Round len  — duration of one round at that point")
    print("  Time/bid   — seconds added to mainPrizeTime per bid")
    print("  Countdown  — initial countdown set on first bid of a round")
    print("  Dutch wait — wall-clock time spent waiting for the first bid")
    print("               in the ETH Dutch auction (rounds 1+)")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    p = argparse.ArgumentParser(
        description="Cosmic Signature bidding / NFT supply simulator."
    )
    p.add_argument(
        "--start-eth-price", type=float, default=0.01,
        help=(
            "Assumed first-bid price each round, in ETH (default: 0.01). "
            "See module docstring: the Dutch-auction midpoint equilibrium makes "
            "first-bid price roughly constant across rounds. The contract's own "
            "round-0 constant is 0.0001 ETH (FIRST_ROUND_INITIAL_ETH_BID_PRICE)."
        ),
    )
    p.add_argument(
        "--max-eth-price", type=float, default=1.0,
        help="ETH ceiling at which rational bidding stops, in ETH (default: 1.0)",
    )
    p.add_argument(
        "--nfts-per-round", type=int, default=DEFAULT_NFTS_PER_ROUND,
        help=(
            f"NFTs minted per completed round (default: {DEFAULT_NFTS_PER_ROUND}, "
            "upper bound assuming a CST bid occurred and >=1 RW-NFT staker exists)"
        ),
    )
    p.add_argument(
        "--dutch-wait-fraction", type=float, default=DEFAULT_DUTCH_WAIT_FRACTION,
        help=(
            f"Fraction of the ETH Dutch-auction duration spent waiting before the "
            f"first bid in each round (default: {DEFAULT_DUTCH_WAIT_FRACTION}, the "
            "midpoint equilibrium). Set 0.0 to ignore Dutch-auction wait time, "
            "1.0 to assume bidders wait for the auction floor."
        ),
    )
    p.add_argument(
        "--years", type=str,
        default=",".join(str(y) for y in DEFAULT_MILESTONE_YEARS),
        help="Comma-separated milestone years (default: 1,10,100)",
    )
    args = p.parse_args()

    start_wei = int(args.start_eth_price * WEI_PER_ETH)
    ceiling_wei = int(args.max_eth_price * WEI_PER_ETH)
    if start_wei <= 0 or ceiling_wei <= 0 or start_wei >= ceiling_wei:
        raise SystemExit("start-eth-price must be > 0 and < max-eth-price.")

    if not (0.0 <= args.dutch_wait_fraction <= 1.0):
        raise SystemExit("dutch-wait-fraction must be in [0.0, 1.0].")

    if args.nfts_per_round < 0:
        raise SystemExit("nfts-per-round must be >= 0.")

    try:
        milestone_years = tuple(
            int(x.strip()) for x in args.years.split(",") if x.strip()
        )
    except ValueError as exc:
        raise SystemExit(f"Invalid --years: {args.years}") from exc

    if not milestone_years:
        raise SystemExit("--years must contain at least one positive integer.")
    if any(y <= 0 for y in milestone_years):
        raise SystemExit("--years entries must all be positive integers.")

    bids = compute_bids_to_ceiling(start_wei, ceiling_wei)
    if bids == 0:
        raise SystemExit("Start price already >= ceiling. No bids would occur.")

    results = run_simulation(
        bids_per_round=bids,
        nfts_per_round=args.nfts_per_round,
        dutch_wait_fraction=args.dutch_wait_fraction,
        milestone_years=milestone_years,
    )

    print_report(
        results, bids, args.nfts_per_round, start_wei, ceiling_wei,
        args.dutch_wait_fraction,
    )


if __name__ == "__main__":
    main()
