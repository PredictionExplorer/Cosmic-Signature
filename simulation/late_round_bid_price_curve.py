#!/usr/bin/env python3
"""
Explore a late-round bid price increase curve.

The default formula is shaped for a simple Solidity implementation:

    elapsedSeconds2 = elapsedSeconds * elapsedSeconds
    elapsedSeconds4 = elapsedSeconds2 * elapsedSeconds2
    elapsedSeconds8 = elapsedSeconds4 * elapsedSeconds4
    adjustedPrice =
        normalPrice +
        normalPrice * premiumMultiplier * elapsedSeconds8 /
        priceIncreaseDenominator

For the default 20-minute window, 10x final price, and exponent 8:

    PRICE_INCREASE_DENOMINATOR = 1200 ** 8
    adjustedPrice = normalPrice + normalPrice * 9 * elapsedSeconds8 / PRICE_INCREASE_DENOMINATOR

The script uses integer math for prices. This means the premium term floors in
the same way Solidity integer division floors.
"""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass
from decimal import Decimal, ROUND_DOWN, getcontext
from pathlib import Path
from typing import Iterable, List, Sequence


getcontext().prec = 80

WEI_PER_ETH = 10**18
CST_BASE_UNIT = 10**18
RANDOMWALK_NFT_BID_PRICE_DIVISOR = 2

DEFAULT_WINDOW_MINUTES = "20"
DEFAULT_PREMIUM_MULTIPLIER = 9
DEFAULT_EXPONENT = 8
DEFAULT_NORMAL_ETH_PRICE = "0.01"
DEFAULT_NORMAL_CST_PRICE = "200"
DEFAULT_SAMPLE_EVERY_SECONDS = 60


@dataclass(frozen=True)
class Sample:
    elapsed_seconds: int
    remaining_seconds: int
    multiplier: Decimal
    eth_bid_price_wei: int
    eth_plus_random_walk_bid_price_wei: int
    cst_bid_price: int


def decimal_arg(value: str) -> Decimal:
    try:
        result = Decimal(value)
    except Exception as exc:
        raise argparse.ArgumentTypeError(f"invalid decimal value: {value}") from exc
    if not result.is_finite():
        raise argparse.ArgumentTypeError(f"invalid decimal value: {value}")
    return result


def positive_decimal_arg(value: str) -> Decimal:
    result = decimal_arg(value)
    if result <= 0:
        raise argparse.ArgumentTypeError("value must be greater than zero")
    return result


def positive_int_arg(value: str) -> int:
    try:
        result = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"invalid integer value: {value}") from exc
    if result <= 0:
        raise argparse.ArgumentTypeError("value must be greater than zero")
    return result


def parse_token_amount(value: Decimal, base_unit: int, label: str) -> int:
    scaled = (value * base_unit).to_integral_value(rounding=ROUND_DOWN)
    result = int(scaled)
    if result <= 0:
        raise SystemExit(f"{label} must be greater than zero.")
    return result


def parse_window_seconds(window_minutes: Decimal) -> int:
    seconds = window_minutes * 60
    integral_seconds = seconds.to_integral_value(rounding=ROUND_DOWN)
    if seconds != integral_seconds:
        raise SystemExit("--window-minutes must resolve to a whole number of seconds.")
    result = int(integral_seconds)
    if result <= 0:
        raise SystemExit("--window-minutes must be greater than zero.")
    return result


def parse_exponents(raw: str) -> List[int]:
    exponents: List[int] = []
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        exponent = positive_int_arg(item)
        if exponent not in exponents:
            exponents.append(exponent)
    if not exponents:
        raise argparse.ArgumentTypeError("--compare-exponents must contain at least one exponent")
    return exponents


def parse_sample_seconds(raw: str) -> List[int]:
    sample_seconds: List[int] = []
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        sample_second = int(item)
        if sample_second < 0:
            raise argparse.ArgumentTypeError("--sample-seconds entries must be >= 0")
        if sample_second not in sample_seconds:
            sample_seconds.append(sample_second)
    if not sample_seconds:
        raise argparse.ArgumentTypeError("--sample-seconds must contain at least one second value")
    return sorted(sample_seconds)


def iter_sample_seconds(window_seconds: int, step_seconds: int) -> Iterable[int]:
    elapsed = 0
    while elapsed < window_seconds:
        yield elapsed
        elapsed += step_seconds
    yield window_seconds


def normalize_sample_seconds(sample_seconds: Iterable[int], window_seconds: int) -> List[int]:
    normalized = sorted(set(sample_seconds) | {0, window_seconds})
    return normalized


def price_increase_denominator(window_seconds: int, exponent: int) -> int:
    return seconds_to_power(window_seconds, exponent)


def seconds_to_power(seconds: int, exponent: int) -> int:
    if exponent == 8:
        seconds2 = seconds * seconds
        seconds4 = seconds2 * seconds2
        return seconds4 * seconds4
    return seconds**exponent


def curve_multiplier(
    elapsed_seconds: int,
    premium_multiplier: int,
    exponent: int,
    denominator: int,
) -> Decimal:
    premium = (
        Decimal(premium_multiplier)
        * Decimal(seconds_to_power(elapsed_seconds, exponent))
        / Decimal(denominator)
    )
    return Decimal(1) + premium


def apply_late_round_curve(
    normal_price: int,
    elapsed_seconds: int,
    premium_multiplier: int,
    exponent: int,
    denominator: int,
) -> int:
    premium = (
        normal_price
        * premium_multiplier
        * seconds_to_power(elapsed_seconds, exponent)
        // denominator
    )
    return normal_price + premium


def eth_plus_random_walk_nft_bid_price(eth_bid_price_wei: int) -> int:
    return (
        eth_bid_price_wei + (RANDOMWALK_NFT_BID_PRICE_DIVISOR - 1)
    ) // RANDOMWALK_NFT_BID_PRICE_DIVISOR


def build_samples(
    window_seconds: int,
    sample_every_seconds: int,
    premium_multiplier: int,
    exponent: int,
    normal_eth_price_wei: int,
    normal_cst_price: int,
    sample_seconds: Sequence[int] | None = None,
) -> List[Sample]:
    denominator = price_increase_denominator(window_seconds, exponent)
    normal_eth_plus_random_walk_price_wei = eth_plus_random_walk_nft_bid_price(
        normal_eth_price_wei
    )
    samples: List[Sample] = []

    elapsed_seconds_iterable = (
        normalize_sample_seconds(sample_seconds, window_seconds)
        if sample_seconds is not None
        else iter_sample_seconds(window_seconds, sample_every_seconds)
    )

    for elapsed_seconds in elapsed_seconds_iterable:
        curve_elapsed_seconds = min(elapsed_seconds, window_seconds)
        multiplier = curve_multiplier(
            curve_elapsed_seconds, premium_multiplier, exponent, denominator
        )
        samples.append(
            Sample(
                elapsed_seconds=elapsed_seconds,
                remaining_seconds=max(window_seconds - elapsed_seconds, 0),
                multiplier=multiplier,
                eth_bid_price_wei=apply_late_round_curve(
                    normal_eth_price_wei,
                    curve_elapsed_seconds,
                    premium_multiplier,
                    exponent,
                    denominator,
                ),
                eth_plus_random_walk_bid_price_wei=apply_late_round_curve(
                    normal_eth_plus_random_walk_price_wei,
                    curve_elapsed_seconds,
                    premium_multiplier,
                    exponent,
                    denominator,
                ),
                cst_bid_price=apply_late_round_curve(
                    normal_cst_price,
                    curve_elapsed_seconds,
                    premium_multiplier,
                    exponent,
                    denominator,
                ),
            )
        )

    return samples


def fmt_duration(seconds: int) -> str:
    minutes, secs = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours > 0:
        return f"{hours:d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:d}:{secs:02d}"


def fmt_multiplier(multiplier: Decimal) -> str:
    if multiplier < Decimal("1.01"):
        return f"{multiplier:.9f}x"
    if multiplier < Decimal("2"):
        return f"{multiplier:.6f}x"
    return f"{multiplier:.4f}x"


def fmt_units(amount: int, base_unit: int, symbol: str) -> str:
    value = Decimal(amount) / Decimal(base_unit)
    if amount == 0:
        return f"0 {symbol}"
    if value == value.to_integral_value():
        return f"{int(value):,} {symbol}"
    if value >= Decimal("0.001"):
        return f"{value:,.6f} {symbol}"
    return f"{amount:,} base units ({value:.3E} {symbol})"


def print_table(headers: Sequence[str], rows: Sequence[Sequence[str]]) -> None:
    widths = [
        max(len(str(row[i])) for row in ([headers] + list(rows)))
        for i in range(len(headers))
    ]
    print("  ".join(header.ljust(widths[i]) for i, header in enumerate(headers)))
    print("  ".join("-" * width for width in widths))
    for row in rows:
        print("  ".join(str(cell).rjust(widths[i]) for i, cell in enumerate(row)))


def print_price_report(
    samples: Sequence[Sample],
    window_seconds: int,
    premium_multiplier: int,
    exponent: int,
    normal_eth_price_wei: int,
    normal_cst_price: int,
) -> None:
    denominator = price_increase_denominator(window_seconds, exponent)
    final_multiplier = Decimal(1) + Decimal(premium_multiplier)

    print("=" * 88)
    print("Cosmic Signature - Late-Round Bid Price Curve")
    print("=" * 88)
    print()
    print("Formula:")
    if exponent == 8:
        print("  elapsed_seconds2 = elapsed_seconds * elapsed_seconds")
        print("  elapsed_seconds4 = elapsed_seconds2 * elapsed_seconds2")
        print("  elapsed_seconds8 = elapsed_seconds4 * elapsed_seconds4")
        print(
            "  adjusted = normal + normal"
            f" * {premium_multiplier} * elapsed_seconds8"
            f" // {denominator}"
        )
    else:
        print(
            "  adjusted = normal + normal"
            f" * {premium_multiplier} * elapsed_seconds^{exponent}"
            f" // {denominator}"
        )
    print(f"  denominator = {window_seconds}^{exponent} = {denominator:,}")
    print()
    print("Assumptions:")
    print(f"  Window                  : {fmt_duration(window_seconds)}")
    print(f"  Final multiplier         : {final_multiplier:.4f}x")
    print(f"  Normal ETH bid price     : {fmt_units(normal_eth_price_wei, WEI_PER_ETH, 'ETH')}")
    print(
        "  Normal ETH+RW bid price  : "
        f"{fmt_units(eth_plus_random_walk_nft_bid_price(normal_eth_price_wei), WEI_PER_ETH, 'ETH')}"
    )
    print(f"  Normal CST bid price     : {fmt_units(normal_cst_price, CST_BASE_UNIT, 'CST')}")
    print()

    headers = (
        "Elapsed",
        "Remaining",
        "Multiplier",
        "ETH bid",
        "ETH+RW bid",
        "CST bid",
    )
    rows = [
        (
            fmt_duration(sample.elapsed_seconds),
            fmt_duration(sample.remaining_seconds),
            fmt_multiplier(sample.multiplier),
            fmt_units(sample.eth_bid_price_wei, WEI_PER_ETH, "ETH"),
            fmt_units(sample.eth_plus_random_walk_bid_price_wei, WEI_PER_ETH, "ETH"),
            fmt_units(sample.cst_bid_price, CST_BASE_UNIT, "CST"),
        )
        for sample in samples
    ]
    print_table(headers, rows)
    print()
    print("Note: ETH+RW starts from the rounded 50% Random Walk NFT bid price, then applies the same curve.")


def print_exponent_comparison(
    window_seconds: int,
    sample_every_seconds: int,
    premium_multiplier: int,
    exponents: Sequence[int],
) -> None:
    headers = ["Elapsed", "Remaining"] + [f"exp {exponent}" for exponent in exponents]
    rows: List[Sequence[str]] = []

    for elapsed_seconds in iter_sample_seconds(window_seconds, sample_every_seconds):
        values = []
        for exponent in exponents:
            denominator = price_increase_denominator(window_seconds, exponent)
            multiplier = curve_multiplier(
                elapsed_seconds, premium_multiplier, exponent, denominator
            )
            values.append(fmt_multiplier(multiplier))
        rows.append(
            [
                fmt_duration(elapsed_seconds),
                fmt_duration(window_seconds - elapsed_seconds),
                *values,
            ]
        )

    print()
    print("Multiplier Comparison")
    print("---------------------")
    print_table(headers, rows)


def write_csv(
    path: Path,
    samples: Sequence[Sample],
    window_seconds: int,
    premium_multiplier: int,
    exponent: int,
) -> None:
    denominator = price_increase_denominator(window_seconds, exponent)
    with path.open("w", newline="") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=(
                "elapsed_seconds",
                "remaining_seconds",
                "multiplier",
                "eth_bid_price_wei",
                "eth_bid_price_eth",
                "eth_plus_random_walk_bid_price_wei",
                "eth_plus_random_walk_bid_price_eth",
                "cst_bid_price_base_units",
                "cst_bid_price_cst",
                "premium_multiplier",
                "exponent",
                "price_increase_denominator",
            ),
        )
        writer.writeheader()
        for sample in samples:
            writer.writerow(
                {
                    "elapsed_seconds": sample.elapsed_seconds,
                    "remaining_seconds": sample.remaining_seconds,
                    "multiplier": str(sample.multiplier),
                    "eth_bid_price_wei": sample.eth_bid_price_wei,
                    "eth_bid_price_eth": str(Decimal(sample.eth_bid_price_wei) / WEI_PER_ETH),
                    "eth_plus_random_walk_bid_price_wei": sample.eth_plus_random_walk_bid_price_wei,
                    "eth_plus_random_walk_bid_price_eth": str(
                        Decimal(sample.eth_plus_random_walk_bid_price_wei) / WEI_PER_ETH
                    ),
                    "cst_bid_price_base_units": sample.cst_bid_price,
                    "cst_bid_price_cst": str(Decimal(sample.cst_bid_price) / CST_BASE_UNIT),
                    "premium_multiplier": premium_multiplier,
                    "exponent": exponent,
                    "price_increase_denominator": denominator,
                }
            )


def build_json_payload(
    samples: Sequence[Sample],
    window_seconds: int,
    premium_multiplier: int,
    exponent: int,
    normal_eth_price_wei: int,
    normal_cst_price: int,
) -> dict:
    denominator = price_increase_denominator(window_seconds, exponent)
    normal_eth_plus_random_walk_price_wei = eth_plus_random_walk_nft_bid_price(
        normal_eth_price_wei
    )
    return {
        "window_seconds": window_seconds,
        "premium_multiplier": premium_multiplier,
        "exponent": exponent,
        "price_increase_denominator": str(denominator),
        "normal_eth_price_wei": str(normal_eth_price_wei),
        "normal_eth_plus_random_walk_bid_price_wei": str(normal_eth_plus_random_walk_price_wei),
        "normal_cst_price_base_units": str(normal_cst_price),
        "samples": [
            {
                "elapsed_seconds": sample.elapsed_seconds,
                "remaining_seconds": sample.remaining_seconds,
                "multiplier": str(sample.multiplier),
                "eth_bid_price_wei": str(sample.eth_bid_price_wei),
                "eth_plus_random_walk_bid_price_wei": str(sample.eth_plus_random_walk_bid_price_wei),
                "cst_bid_price_base_units": str(sample.cst_bid_price),
            }
            for sample in samples
        ],
    }


def write_json(
    path: str,
    samples: Sequence[Sample],
    window_seconds: int,
    premium_multiplier: int,
    exponent: int,
    normal_eth_price_wei: int,
    normal_cst_price: int,
) -> None:
    payload = build_json_payload(
        samples=samples,
        window_seconds=window_seconds,
        premium_multiplier=premium_multiplier,
        exponent=exponent,
        normal_eth_price_wei=normal_eth_price_wei,
        normal_cst_price=normal_cst_price,
    )
    serialized = json.dumps(payload, indent=2, sort_keys=True)
    if path == "-":
        print(serialized)
    else:
        Path(path).write_text(serialized + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Experiment with the late-round bid price increase curve."
    )
    parser.add_argument(
        "--window-minutes",
        type=positive_decimal_arg,
        default=Decimal(DEFAULT_WINDOW_MINUTES),
        help=f"late-round price-increase window in minutes (default: {DEFAULT_WINDOW_MINUTES})",
    )
    parser.add_argument(
        "--premium-multiplier",
        type=positive_int_arg,
        default=DEFAULT_PREMIUM_MULTIPLIER,
        help=(
            "extra multiplier added by the end of the window. "
            "Use 9 for final price 10x normal (default: 9)"
        ),
    )
    parser.add_argument(
        "--exponent",
        type=positive_int_arg,
        default=DEFAULT_EXPONENT,
        help=f"power used for elapsed seconds (default: {DEFAULT_EXPONENT})",
    )
    parser.add_argument(
        "--normal-eth-price",
        type=positive_decimal_arg,
        default=Decimal(DEFAULT_NORMAL_ETH_PRICE),
        help=f"normal ETH bid price before the late-round curve (default: {DEFAULT_NORMAL_ETH_PRICE})",
    )
    parser.add_argument(
        "--normal-cst-price",
        type=positive_decimal_arg,
        default=Decimal(DEFAULT_NORMAL_CST_PRICE),
        help=f"normal CST bid price before the late-round curve (default: {DEFAULT_NORMAL_CST_PRICE})",
    )
    parser.add_argument(
        "--sample-every-seconds",
        type=positive_int_arg,
        default=DEFAULT_SAMPLE_EVERY_SECONDS,
        help=f"table sampling interval in seconds (default: {DEFAULT_SAMPLE_EVERY_SECONDS})",
    )
    parser.add_argument(
        "--sample-seconds",
        type=parse_sample_seconds,
        help="optional comma-separated exact elapsed-second samples, e.g. 0,1,60,240,1200,1300",
    )
    parser.add_argument(
        "--csv",
        type=Path,
        help="optional path to write the selected exponent's samples as CSV",
    )
    parser.add_argument(
        "--json",
        dest="json_path",
        help="optional path to write samples as JSON; use '-' for stdout",
    )
    parser.add_argument(
        "--compare-exponents",
        type=parse_exponents,
        help="comma-separated exponent list for multiplier comparison, e.g. 4,6,8,10",
    )
    args = parser.parse_args()

    window_seconds = parse_window_seconds(args.window_minutes)
    normal_eth_price_wei = parse_token_amount(
        args.normal_eth_price, WEI_PER_ETH, "--normal-eth-price"
    )
    normal_cst_price = parse_token_amount(
        args.normal_cst_price, CST_BASE_UNIT, "--normal-cst-price"
    )

    samples = build_samples(
        window_seconds=window_seconds,
        sample_every_seconds=args.sample_every_seconds,
        premium_multiplier=args.premium_multiplier,
        exponent=args.exponent,
        normal_eth_price_wei=normal_eth_price_wei,
        normal_cst_price=normal_cst_price,
        sample_seconds=args.sample_seconds,
    )

    if args.json_path:
        write_json(
            args.json_path,
            samples=samples,
            window_seconds=window_seconds,
            premium_multiplier=args.premium_multiplier,
            exponent=args.exponent,
            normal_eth_price_wei=normal_eth_price_wei,
            normal_cst_price=normal_cst_price,
        )
        return

    print_price_report(
        samples=samples,
        window_seconds=window_seconds,
        premium_multiplier=args.premium_multiplier,
        exponent=args.exponent,
        normal_eth_price_wei=normal_eth_price_wei,
        normal_cst_price=normal_cst_price,
    )

    if args.compare_exponents:
        print_exponent_comparison(
            window_seconds=window_seconds,
            sample_every_seconds=args.sample_every_seconds,
            premium_multiplier=args.premium_multiplier,
            exponents=args.compare_exponents,
        )

    if args.csv:
        write_csv(
            args.csv,
            samples=samples,
            window_seconds=window_seconds,
            premium_multiplier=args.premium_multiplier,
            exponent=args.exponent,
        )
        print()
        print(f"Wrote CSV: {args.csv}")


if __name__ == "__main__":
    main()
