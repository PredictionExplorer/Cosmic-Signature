#!/usr/bin/env python3
"""
Batch runner for Three Body Problem image generation.

Runs concurrent simulations with random seeds, randomly choosing
special or standard mode. Designed for long unattended runs.

Screen: compact progress line per batch.
File:   full subprocess output written to run.log for debugging.
"""

import logging
import os
import secrets
import signal
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

CONCURRENT_SIMS = 6
BINARY = "./target/release/three_body_problem"
LOG_FILE = "run.log"
SIM_TIMEOUT = 86400  # seconds per simulation (24 hours)

# ---------------------------------------------------------------------------
# Logging setup: file gets everything, console gets one-liners
# ---------------------------------------------------------------------------

logger = logging.getLogger("run")
logger.setLevel(logging.DEBUG)

_file_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
_file_handler.setLevel(logging.DEBUG)
_file_handler.setFormatter(
    logging.Formatter("%(asctime)s [%(levelname)-5s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
)
logger.addHandler(_file_handler)


def _log_to_file(level: int, msg: str) -> None:
    logger.log(level, msg)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def check_prerequisites() -> None:
    if not os.path.isfile(BINARY):
        print(f"Error: binary not found at {BINARY}")
        print("Build it first:  cargo build --release")
        sys.exit(1)
    if not os.access(BINARY, os.X_OK):
        print(f"Error: {BINARY} is not executable")
        sys.exit(1)
    for d in ("pics", "vids"):
        Path(d).mkdir(exist_ok=True)


def random_seed() -> str:
    return "0x" + secrets.token_hex(6)


def fmt_duration(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h}h{m:02d}m{s:02d}s"
    if m:
        return f"{m}m{s:02d}s"
    return f"{s}s"


# ---------------------------------------------------------------------------
# Single simulation
# ---------------------------------------------------------------------------

def run_one(seed: str, run_id: int) -> tuple:
    """Returns (success, filename, elapsed_secs)."""
    filename = seed[2:]

    cmd = [BINARY, "--seed", seed, "--file-name", filename]

    _log_to_file(logging.DEBUG, f"[{run_id}] START {filename}  cmd={' '.join(cmd)}")
    t0 = time.monotonic()

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=SIM_TIMEOUT)
        elapsed = time.monotonic() - t0

        if proc.stdout:
            _log_to_file(logging.DEBUG, f"[{run_id}] stdout:\n{proc.stdout.rstrip()}")
        if proc.stderr:
            _log_to_file(logging.DEBUG, f"[{run_id}] stderr:\n{proc.stderr.rstrip()}")

        if proc.returncode == 0:
            _log_to_file(logging.INFO, f"[{run_id}] OK    {filename}  ({fmt_duration(elapsed)})")
            return (True, filename, elapsed)

        _log_to_file(
            logging.WARNING,
            f"[{run_id}] FAIL  {filename}  exit={proc.returncode}  ({fmt_duration(elapsed)})",
        )
        return (False, filename, elapsed)

    except subprocess.TimeoutExpired:
        elapsed = time.monotonic() - t0
        _log_to_file(logging.ERROR, f"[{run_id}] TIMEOUT {filename}  ({fmt_duration(elapsed)})")
        return (False, filename, elapsed)

    except OSError as exc:
        elapsed = time.monotonic() - t0
        _log_to_file(logging.ERROR, f"[{run_id}] OS ERROR {filename}: {exc}")
        return (False, filename, elapsed)

    except Exception as exc:
        elapsed = time.monotonic() - t0
        _log_to_file(logging.ERROR, f"[{run_id}] UNEXPECTED {filename}: {exc}")
        return (False, filename, elapsed)


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main() -> None:
    check_prerequisites()

    _log_to_file(logging.INFO, f"{'=' * 60}")
    _log_to_file(logging.INFO, f"Session started  concurrency={CONCURRENT_SIMS}")
    _log_to_file(logging.INFO, f"{'=' * 60}")

    print(f"Three Body Problem batch runner  ({CONCURRENT_SIMS} concurrent)")
    print(f"Detailed logs -> {LOG_FILE}")
    print("Ctrl+C to stop gracefully (twice to force)\n")

    run_id = 0
    ok_total = 0
    fail_total = 0
    t_session = time.monotonic()

    shutdown = False
    orig_sigint = signal.getsignal(signal.SIGINT)

    def on_sigint(_sig, _frame):
        nonlocal shutdown
        if shutdown:
            signal.signal(signal.SIGINT, orig_sigint)
            raise KeyboardInterrupt
        shutdown = True
        print("\n-- finishing current batch, then stopping --")

    signal.signal(signal.SIGINT, on_sigint)

    try:
        batch_num = 0
        with ThreadPoolExecutor(max_workers=CONCURRENT_SIMS) as pool:
            while not shutdown:
                batch_num += 1
                futures = {}
                for _ in range(CONCURRENT_SIMS):
                    run_id += 1
                    seed = random_seed()
                    fut = pool.submit(run_one, seed, run_id)
                    futures[fut] = (run_id, seed)

                first = run_id - CONCURRENT_SIMS + 1
                t_batch = time.monotonic()

                batch_ok = 0
                batch_fail = 0
                for fut in as_completed(futures):
                    success, _fname, _elapsed = fut.result()
                    if success:
                        batch_ok += 1
                        ok_total += 1
                    else:
                        batch_fail += 1
                        fail_total += 1

                batch_elapsed = time.monotonic() - t_batch
                total = ok_total + fail_total
                pct = ok_total / total * 100 if total else 0
                session_elapsed = time.monotonic() - t_session

                status = f"Batch {batch_num:>3} [{first}-{run_id}]  "
                status += f"+{batch_ok} ok"
                if batch_fail:
                    status += f"  -{batch_fail} fail"
                status += f"  ({fmt_duration(batch_elapsed)})"
                status += f"  |  total {ok_total}/{total} ({pct:.0f}%)  {fmt_duration(session_elapsed)}"
                print(status)
                _log_to_file(logging.INFO, status)

    except KeyboardInterrupt:
        pass

    finally:
        signal.signal(signal.SIGINT, orig_sigint)
        session_elapsed = time.monotonic() - t_session
        total = ok_total + fail_total

        summary = (
            f"\nDone: {ok_total} ok, {fail_total} failed"
            f" / {total} total in {fmt_duration(session_elapsed)}"
        )
        print(summary)
        _log_to_file(logging.INFO, summary)
        _log_to_file(logging.INFO, "Session ended\n")


if __name__ == "__main__":
    main()
