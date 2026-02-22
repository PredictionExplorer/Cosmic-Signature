#!/usr/bin/env python3
"""
Batch runner for Three Body Problem image generation.

A/B comparison mode: each seed is rendered twice — once with museum-quality
enhancements enabled ("enhanced") and once with them disabled ("classic").
Output filenames: enhanced_{seed}.png/mp4  vs  classic_{seed}.png/mp4

Uses a rolling pool to keep exactly CONCURRENT_SIMS slots busy at all times.
Runs forever until Ctrl+C.

Screen: compact progress line every few completions.
File:   full subprocess output written to run.log for debugging.
"""

import collections
import concurrent.futures
import logging
import os
import secrets
import signal
import subprocess
import sys
import time
from pathlib import Path

CONCURRENT_SIMS = 3
BINARY = "./target/release/three_body_problem"
LOG_FILE = "run.log"
SIM_TIMEOUT = 86400  # seconds per simulation (24 hours)
REPORT_EVERY = 6     # print a status line every N completions

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

def run_one(seed: str, enhanced: bool, run_id: int) -> tuple:
    """Returns (success, filename, elapsed_secs)."""
    variant = "enhanced" if enhanced else "classic"
    filename = f"{variant}_{seed[2:]}"

    cmd = [BINARY, "--seed", seed, "--file-name", filename]
    if not enhanced:
        cmd.append("--no-enhancements")

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
# Main loop — rolling pool keeps all slots busy at all times
# ---------------------------------------------------------------------------

def main() -> None:
    check_prerequisites()

    _log_to_file(logging.INFO, f"{'=' * 60}")
    _log_to_file(logging.INFO, f"Session started  concurrency={CONCURRENT_SIMS}  mode=A/B rolling")
    _log_to_file(logging.INFO, f"{'=' * 60}")

    print(f"Three Body Problem A/B rolling runner  ({CONCURRENT_SIMS} concurrent)")
    print(f"Each seed rendered twice: enhanced vs classic")
    print(f"Detailed logs -> {LOG_FILE}")
    print("Ctrl+C to stop gracefully (twice to force)\n")

    # ---- State ----
    run_id = 0
    ok_total = 0
    fail_total = 0
    completions_since_report = 0
    t_session = time.monotonic()

    pending: collections.deque = collections.deque()
    in_flight: dict = {}

    shutdown = False
    orig_sigint = signal.getsignal(signal.SIGINT)

    def on_sigint(_sig, _frame):
        nonlocal shutdown
        if shutdown:
            signal.signal(signal.SIGINT, orig_sigint)
            raise KeyboardInterrupt
        shutdown = True
        print("\n-- stopping: draining in-flight jobs --")

    signal.signal(signal.SIGINT, on_sigint)

    def enqueue_seed():
        seed = random_seed()
        pending.append((seed, True))
        pending.append((seed, False))

    def submit_next(pool):
        nonlocal run_id
        if not pending:
            enqueue_seed()
        seed, enhanced = pending.popleft()
        run_id += 1
        fut = pool.submit(run_one, seed, enhanced, run_id)
        in_flight[fut] = (run_id, seed, enhanced)

    def print_status():
        total = ok_total + fail_total
        pct = ok_total / total * 100 if total else 0
        elapsed = fmt_duration(time.monotonic() - t_session)
        line = f"  completed {total}  (+{ok_total} ok"
        if fail_total:
            line += f"  -{fail_total} fail"
        line += f")  {elapsed}"
        print(line)
        _log_to_file(logging.INFO, line)

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENT_SIMS) as pool:
            for _ in range(CONCURRENT_SIMS):
                submit_next(pool)

            while in_flight:
                done, _ = concurrent.futures.wait(
                    in_flight, return_when=concurrent.futures.FIRST_COMPLETED
                )

                for fut in done:
                    success, _fname, _elapsed = fut.result()
                    del in_flight[fut]

                    if success:
                        ok_total += 1
                    else:
                        fail_total += 1

                    completions_since_report += 1
                    if completions_since_report >= REPORT_EVERY:
                        print_status()
                        completions_since_report = 0

                    if not shutdown:
                        submit_next(pool)

    except KeyboardInterrupt:
        pass

    finally:
        signal.signal(signal.SIGINT, orig_sigint)
        total = ok_total + fail_total
        elapsed = fmt_duration(time.monotonic() - t_session)

        summary = f"\nDone: {ok_total} ok, {fail_total} failed / {total} total in {elapsed}"
        print(summary)
        _log_to_file(logging.INFO, summary)
        _log_to_file(logging.INFO, "Session ended\n")


if __name__ == "__main__":
    main()
