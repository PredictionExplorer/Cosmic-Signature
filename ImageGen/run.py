#!/usr/bin/env python3
"""
Parallel infinite runner for Three Body Problem simulations.
Generates random seeds and alternates between special/regular mode by default.
Runs multiple instances in parallel.

Filename format:  {mode}_{sequence:04d}_{seed_hex}
  Examples:       special_0001_a3f19c2b7e01
                  regular_0002_d8e4b10f6c93

This makes it easy to sort output by mode (special groups first/last)
and by generation order within each mode.
"""

import argparse
import json
import os
import platform
import random
import re
import shlex
import secrets
import signal
import socket
import subprocess
import sys
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Defaults
DEFAULT_WORKERS = 3
DEFAULT_SUBPROCESS_TIMEOUT = 160000  # ~44.4 hours per simulation
BINARY_PATH = Path('./target/release/three_body_problem')
DEFAULT_LOGS_DIR = Path("./runner_logs")
DEFAULT_BINARY_LOG_LEVEL = "info"
DEFAULT_DIAGNOSTIC_TAIL_BYTES = 32 * 1024
DEFAULT_TOP_PROCESSES = 20
DEFAULT_STOP_WAIT_SECONDS = 6.0
DEFAULT_RAYON_THREADS_AUTO = 0

# Global state for graceful shutdown
shutdown_event = threading.Event()
force_shutdown_event = threading.Event()
stats_lock = threading.Lock()
active_processes_lock = threading.Lock()
interrupt_lock = threading.Lock()
active_processes: dict[int, subprocess.Popen] = {}
interrupt_count = 0
stats = {
    'started': 0,
    'successful': 0,
    'failed': 0,
    'total_elapsed': 0.0,
    'special_ok': 0,
    'special_fail': 0,
    'regular_ok': 0,
    'regular_fail': 0,
}

# Thread-safe sequence counter for filenames
_seq_lock = threading.Lock()
_seq_counter = 0
_log_lock = threading.Lock()


def next_sequence_number() -> int:
    """Return the next global sequence number (thread-safe)."""
    global _seq_counter
    with _seq_lock:
        _seq_counter += 1
        return _seq_counter


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Parallel infinite runner for Three Body Problem simulations."
    )
    parser.add_argument(
        '-w', '--workers',
        type=int,
        default=DEFAULT_WORKERS,
        help=f"Number of parallel instances (default: {DEFAULT_WORKERS})",
    )
    parser.add_argument(
        '-m', '--mode',
        choices=['both', 'special', 'regular', 'random'],
        default='both',
        help=(
            "Simulation mode: 'both' (default, alternates special/regular), "
            "'special' (only special), 'regular' (only regular), "
            "'random' (random coin flip each run)"
        ),
    )
    parser.add_argument(
        '-t', '--timeout',
        type=int,
        default=DEFAULT_SUBPROCESS_TIMEOUT,
        help=f"Per-simulation timeout in seconds (default: {DEFAULT_SUBPROCESS_TIMEOUT})",
    )
    parser.add_argument(
        '--binary',
        type=str,
        default=str(BINARY_PATH),
        help=f"Path to the simulation binary (default: {BINARY_PATH})",
    )
    parser.add_argument(
        '--pics-dir',
        type=str,
        default='pics',
        help="Output directory for images (default: pics)",
    )
    parser.add_argument(
        '--vids-dir',
        type=str,
        default='vids',
        help="Output directory for videos (default: vids)",
    )
    parser.add_argument(
        '--logs-dir',
        type=str,
        default=str(DEFAULT_LOGS_DIR),
        help=f"Directory for per-run debug logs (default: {DEFAULT_LOGS_DIR})",
    )
    parser.add_argument(
        '--binary-log-level',
        type=str,
        default=DEFAULT_BINARY_LOG_LEVEL,
        help=f"Log level passed to binary via --log-level (default: {DEFAULT_BINARY_LOG_LEVEL})",
    )
    parser.add_argument(
        '--binary-args',
        type=str,
        default='',
        help=(
            'Extra args appended to the binary command (example: "--no-curation --variants 16 --style-family \"Bronze Mirage\"")'
        ),
    )
    parser.add_argument(
        '--binary-log-format',
        choices=['json', 'text'],
        default='json',
        help="Binary log format for captured logs (default: json)",
    )
    parser.add_argument(
        '--diagnostic-tail-bytes',
        type=int,
        default=DEFAULT_DIAGNOSTIC_TAIL_BYTES,
        help=(
            "Bytes of stdout/stderr tail captured in per-run diagnostics "
            f"(default: {DEFAULT_DIAGNOSTIC_TAIL_BYTES})"
        ),
    )
    parser.add_argument(
        '--rayon-threads',
        type=int,
        default=DEFAULT_RAYON_THREADS_AUTO,
        help=(
            "RAYON_NUM_THREADS passed to each renderer process. "
            "Use 0 to auto-size from cpu_count/workers."
        ),
    )
    parser.add_argument(
        '--stop-all',
        action='store_true',
        help=(
            "Stop active run.py sessions and their renderer child processes "
            "for this repository, then exit"
        ),
    )
    parser.add_argument(
        '--stop-wait-seconds',
        type=float,
        default=DEFAULT_STOP_WAIT_SECONDS,
        help=(
            "How long to wait after graceful stop signals before escalation "
            f"(default: {DEFAULT_STOP_WAIT_SECONDS})"
        ),
    )
    args = parser.parse_args()
    if args.workers < 1:
        parser.error("--workers must be at least 1")
    if args.timeout < 1:
        parser.error("--timeout must be at least 1")
    if args.diagnostic_tail_bytes < 256:
        parser.error("--diagnostic-tail-bytes must be at least 256")
    if args.stop_wait_seconds < 0.1:
        parser.error("--stop-wait-seconds must be at least 0.1")
    if args.rayon_threads < 0:
        parser.error("--rayon-threads must be >= 0")
    return args


def check_binary(binary_path: str) -> None:
    """Verify the simulation binary exists and is executable."""
    path = Path(binary_path)
    if not path.exists():
        print(f"Error: binary not found at '{binary_path}'", file=sys.stderr)
        print("  Hint: run 'cargo build --release' first.", file=sys.stderr)
        sys.exit(1)
    if not path.is_file():
        print(f"Error: '{binary_path}' is not a file.", file=sys.stderr)
        sys.exit(1)


def compute_rayon_threads(rayon_threads: int, workers: int) -> int:
    """Resolve per-process Rayon thread count."""
    if rayon_threads > 0:
        return rayon_threads
    cpu_count = os.cpu_count() or 1
    return max(1, cpu_count // max(1, workers))


def generate_random_seed() -> str:
    """Generate a random 16-byte hex seed."""
    return "0x" + secrets.token_hex(16)


def choose_mode(mode_arg: str, task_id: int) -> bool:
    """Return True for special mode, False for regular.

    In 'both' mode, alternates deterministically based on task_id so that
    special and regular runs are evenly interleaved regardless of parallelism.
    """
    if mode_arg == 'special':
        return True
    elif mode_arg == 'regular':
        return False
    elif mode_arg == 'both':
        return task_id % 2 == 0  # Even tasks = special, odd = regular
    else:  # 'random'
        return random.choice([True, False])

def build_default_binary_args(is_special: bool) -> list[str]:
    """Default binary args when --binary-args is not provided.

    Goals:
    - Generate both still image and video (relies on Rust binary defaults).
    - Museum-leaning quality defaults.
    - Always run random Borda orbit search (never reuse a fixed orbit shape).
    - Orbit search size and step count use Rust binary defaults (100k sims, 1M steps).
    """
    args: list[str] = [
        "--gallery-quality",
        "--quality-mode", "strict",
        "--candidate-count-preview", "30",
        "--finalist-count", "2",
        "--max-curation-rounds", "2",
        "--min-image-score", "0.80",
        "--min-novelty-score", "0.20",
        "--min-video-score", "0.0",
    ]
    return args


def build_filename(seq: int, seed: str, is_special: bool) -> str:
    """Build a sortable filename.

    Format: {mode}_{sequence:04d}_{seed_hex}
    Examples:
        special_0001_a3f19c2b7e01
        regular_0002_d8e4b10f6c93

    Sorting alphabetically groups by mode, then by generation order.
    """
    mode_prefix = "special" if is_special else "regular"
    seed_hex = seed[2:]  # Strip '0x' prefix
    return f"{mode_prefix}_{seq:04d}_{seed_hex}"


def utc_now_iso() -> str:
    """Return current UTC timestamp in ISO-8601 format."""
    return datetime.now(timezone.utc).isoformat()


def classify_return_code(return_code: int, timed_out: bool) -> dict[str, Any]:
    """Classify subprocess outcome for structured logging."""
    if timed_out:
        return {
            'exit_reason': 'timeout',
            'signal_number': None,
            'signal_name': None,
        }
    if return_code == 0:
        return {
            'exit_reason': 'ok',
            'signal_number': None,
            'signal_name': None,
        }
    if return_code < 0:
        signal_number = -return_code
        try:
            signal_name = signal.Signals(signal_number).name
        except ValueError:
            signal_name = f"SIG{signal_number}"
        return {
            'exit_reason': 'signal',
            'signal_number': signal_number,
            'signal_name': signal_name,
        }
    return {
        'exit_reason': 'error_exit',
        'signal_number': None,
        'signal_name': None,
    }


def read_file_tail(path: Path, max_bytes: int = 4096) -> str:
    """Read and decode the tail of a file for quick failure summaries."""
    if max_bytes <= 0 or not path.exists():
        return ""
    try:
        with path.open('rb') as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            f.seek(max(size - max_bytes, 0), os.SEEK_SET)
            data = f.read()
        return data.decode(errors='replace').strip()
    except Exception:
        return ""


def ensure_logs_layout(logs_dir: Path) -> dict[str, Path]:
    """Create required log directories and return layout paths."""
    logs_dir.mkdir(parents=True, exist_ok=True)
    runs_dir = logs_dir / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    return {
        'root': logs_dir,
        'runs': runs_dir,
        'runs_index': logs_dir / "runs.jsonl",
        'session_meta': logs_dir / "session.json",
        'session_events': logs_dir / "session_events.jsonl",
        'session_control': logs_dir / "session_control.json",
    }


def safe_check_output(command: list[str]) -> Optional[str]:
    """Run a command and return stdout if successful."""
    try:
        out = subprocess.check_output(
            command,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        return out.strip()
    except Exception:
        return None


def parse_proc_status(pid: int) -> dict[str, str]:
    """Read selected fields from /proc/<pid>/status when available."""
    path = Path(f"/proc/{pid}/status")
    if not path.exists():
        return {}
    wanted = {
        "Name",
        "State",
        "VmPeak",
        "VmSize",
        "VmRSS",
        "VmHWM",
        "Threads",
        "voluntary_ctxt_switches",
        "nonvoluntary_ctxt_switches",
    }
    data: dict[str, str] = {}
    try:
        for line in path.read_text(encoding='utf-8', errors='replace').splitlines():
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            key = key.strip()
            if key in wanted:
                data[key] = value.strip()
    except Exception:
        return {}
    return data


def parse_meminfo() -> dict[str, str]:
    """Read selected memory counters from /proc/meminfo."""
    path = Path("/proc/meminfo")
    if not path.exists():
        return {}
    wanted = {"MemTotal", "MemFree", "MemAvailable", "SwapTotal", "SwapFree"}
    data: dict[str, str] = {}
    try:
        for line in path.read_text(encoding='utf-8', errors='replace').splitlines():
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            key = key.strip()
            if key in wanted:
                data[key] = value.strip()
    except Exception:
        return {}
    return data


def collect_top_processes(limit: int = DEFAULT_TOP_PROCESSES) -> list[str]:
    """Collect top CPU processes for timeout diagnostics."""
    output = safe_check_output(
        ["ps", "-eo", "pid,ppid,%cpu,%mem,etimes,state,comm,args", "--sort=-%cpu"]
    )
    if not output:
        return []
    lines = output.splitlines()
    return lines[: max(2, limit + 1)]


def collect_system_snapshot() -> dict[str, Any]:
    """Collect lightweight host telemetry useful for remote debugging."""
    snapshot: dict[str, Any] = {
        'captured_at_utc': utc_now_iso(),
        'hostname': socket.gethostname(),
        'cpu_count': os.cpu_count(),
        'loadavg': None,
        'meminfo': parse_meminfo(),
        'top_processes': collect_top_processes(),
    }
    try:
        one, five, fifteen = os.getloadavg()
        snapshot['loadavg'] = {'1m': one, '5m': five, '15m': fifteen}
    except OSError:
        snapshot['loadavg'] = None
    uptime_text = safe_check_output(["cat", "/proc/uptime"])
    if uptime_text:
        try:
            uptime_seconds = float(uptime_text.split()[0])
            snapshot['uptime_seconds'] = uptime_seconds
        except Exception:
            pass
    return snapshot


def collect_process_snapshot(pid: Optional[int]) -> dict[str, Any]:
    """Collect process-level info for diagnostics."""
    if pid is None:
        return {}
    data: dict[str, Any] = {
        'pid': pid,
        'proc_status': parse_proc_status(pid),
    }
    ps_line = safe_check_output(
        ["ps", "-p", str(pid), "-o", "pid,ppid,%cpu,%mem,etimes,state,rss,vsz,cmd"]
    )
    if ps_line:
        data['ps'] = ps_line.splitlines()
    cgroup = safe_check_output(["cat", f"/proc/{pid}/cgroup"])
    if cgroup:
        data['cgroup'] = cgroup.splitlines()
    return data


def summarize_progress(stdout_tail: str) -> dict[str, Any]:
    """Extract high-level progress markers from renderer logs."""
    progress: dict[str, Any] = {}
    candidate_re = re.compile(r"Preview candidate (\d+)/(\d+) -> score ([0-9.]+)")
    round_re = re.compile(r"Curation round (\d+)/(\d+)")
    stage_re = re.compile(r"STAGE (\d+)/(\d+)")
    for line in reversed(stdout_tail.splitlines()):
        if 'preview_candidate' not in progress:
            m = candidate_re.search(line)
            if m:
                progress['preview_candidate'] = {
                    'index': int(m.group(1)),
                    'total': int(m.group(2)),
                    'score': float(m.group(3)),
                }
                continue
        if 'curation_round' not in progress:
            m = round_re.search(line)
            if m:
                progress['curation_round'] = {
                    'index': int(m.group(1)),
                    'total': int(m.group(2)),
                }
                continue
        if 'stage' not in progress:
            m = stage_re.search(line)
            if m:
                progress['stage'] = {
                    'index': int(m.group(1)),
                    'total': int(m.group(2)),
                }
                continue
        if 'last_log_line' not in progress and line.strip():
            progress['last_log_line'] = line.strip()
        if (
            'preview_candidate' in progress
            and 'curation_round' in progress
            and 'stage' in progress
            and 'last_log_line' in progress
        ):
            break
    return progress


def write_session_event(path: Path, event: dict[str, Any]) -> None:
    """Append a normalized session event."""
    payload = {
        'timestamp_utc': utc_now_iso(),
        **event,
    }
    append_jsonl(path, payload)


def write_json_file(path: Path, payload: dict[str, Any]) -> None:
    """Write JSON atomically to reduce risk of partial metadata files."""
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open('w', encoding='utf-8') as f:
        json.dump(payload, f, indent=2, sort_keys=True)
        f.write("\n")
    tmp_path.replace(path)


def read_json_file(path: Path) -> Optional[dict[str, Any]]:
    """Read a JSON object file if it exists and is valid."""
    if not path.exists():
        return None
    try:
        with path.open('r', encoding='utf-8') as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
    except Exception:
        return None
    return None


def update_session_control(path: Path, updates: dict[str, Any]) -> None:
    """Merge updates into session control JSON, preserving existing fields."""
    payload = read_json_file(path) or {}
    payload.update(updates)
    payload.setdefault('created_at_utc', utc_now_iso())
    payload['updated_at_utc'] = utc_now_iso()
    write_json_file(path, payload)


def register_active_process(task_id: int, process: subprocess.Popen) -> None:
    """Track active child processes for interrupt escalation."""
    with active_processes_lock:
        active_processes[task_id] = process


def unregister_active_process(task_id: int) -> None:
    """Remove a child process from active tracking."""
    with active_processes_lock:
        active_processes.pop(task_id, None)


def snapshot_active_processes() -> list[subprocess.Popen]:
    """Return a snapshot of currently tracked child processes."""
    with active_processes_lock:
        return list(active_processes.values())


def send_signal_to_process_tree(process: subprocess.Popen, sig: signal.Signals) -> bool:
    """Signal an active process tree, preferring process groups."""
    pid = process.pid
    if pid is None:
        return False
    try:
        os.killpg(pid, sig)
        return True
    except Exception:
        try:
            if sig == signal.SIGKILL:
                process.kill()
            elif sig == signal.SIGTERM:
                process.terminate()
            else:
                os.kill(pid, sig)
            return True
        except Exception:
            return False


def signal_active_processes(sig: signal.Signals) -> int:
    """Signal all active child process trees and return count signaled."""
    count = 0
    for process in snapshot_active_processes():
        if process.poll() is not None:
            continue
        if send_signal_to_process_tree(process, sig):
            count += 1
    return count


def append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    """Append a JSON object line in a thread-safe way."""
    line = json.dumps(payload, sort_keys=True)
    with _log_lock:
        with path.open('a', encoding='utf-8') as f:
            f.write(line)
            f.write("\n")


def write_session_metadata(args: argparse.Namespace, logs_layout: dict[str, Path]) -> None:
    """Persist run.py invocation and host context for remote debugging."""
    payload: dict[str, Any] = {
        'created_at_utc': utc_now_iso(),
        'argv': sys.argv,
        'args': vars(args),
        'host': {
            'hostname': socket.gethostname(),
            'platform': platform.platform(),
            'python_version': sys.version,
            'pid': os.getpid(),
            'cpu_count': os.cpu_count(),
        },
    }
    write_json_file(logs_layout['session_meta'], payload)


def is_pid_alive(pid: int) -> bool:
    """Return True if the process exists."""
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def process_cwd(pid: int) -> Optional[str]:
    """Best-effort process cwd lookup (Linux /proc)."""
    path = Path(f"/proc/{pid}/cwd")
    if not path.exists():
        return None
    try:
        return str(path.resolve())
    except Exception:
        return None


def process_cmdline(pid: int) -> str:
    """Best-effort full command line for a process."""
    proc_cmd = Path(f"/proc/{pid}/cmdline")
    if proc_cmd.exists():
        try:
            raw = proc_cmd.read_bytes()
            text = raw.replace(b"\x00", b" ").decode(errors='replace').strip()
            if text:
                return text
        except Exception:
            pass
    ps_cmd = safe_check_output(["ps", "-p", str(pid), "-o", "args="])
    return ps_cmd or ""


def process_matches_repo(pid: int, repo_root: Path) -> bool:
    """Heuristic: process cwd or command line points to this repo."""
    root_str = str(repo_root)
    cwd = process_cwd(pid)
    if cwd and (cwd == root_str or cwd.startswith(root_str + os.sep)):
        return True
    cmd = process_cmdline(pid)
    if root_str in cmd or "Cosmic-Signature/ImageGen" in cmd:
        return True
    return False


def parse_ps_table() -> list[dict[str, Any]]:
    """Parse basic process table entries from ps."""
    output = safe_check_output(["ps", "-eo", "pid,ppid,comm,args"])
    if not output:
        return []
    rows: list[dict[str, Any]] = []
    lines = output.splitlines()
    for line in lines[1:]:
        parts = line.strip().split(None, 3)
        if len(parts) < 4:
            continue
        try:
            pid = int(parts[0])
            ppid = int(parts[1])
        except ValueError:
            continue
        rows.append({'pid': pid, 'ppid': ppid, 'comm': parts[2], 'args': parts[3]})
    return rows


def tokenize_command_line(args: str) -> list[str]:
    """Split a process args string into tokens."""
    try:
        return shlex.split(args)
    except ValueError:
        return args.strip().split()


def is_python_runpy_process(comm: str, args: str) -> bool:
    """Return True if process appears to be `python ... run.py ...`."""
    if "python" not in comm.lower():
        return False
    tokens = tokenize_command_line(args)
    if not tokens:
        return False
    exe = os.path.basename(tokens[0]).lower()
    if "python" not in exe:
        return False
    for token in tokens[1:]:
        if token.endswith("run.py"):
            return True
    return False


def is_runpy_cmdline(cmdline: str) -> bool:
    """Fallback check when only full cmdline text is available."""
    tokens = tokenize_command_line(cmdline)
    if not tokens:
        return False
    exe = os.path.basename(tokens[0]).lower()
    if "python" not in exe:
        return False
    return any(token.endswith("run.py") for token in tokens[1:])


def is_renderer_process(comm: str, args: str) -> bool:
    """Return True if process appears to be the renderer binary."""
    if "three_body_problem" in comm:
        return True
    tokens = tokenize_command_line(args)
    if not tokens:
        return False
    first = os.path.basename(tokens[0]).lower()
    if first == "three_body_problem":
        return True
    if first in {"sh", "bash", "dash", "zsh"} and len(tokens) > 1:
        return os.path.basename(tokens[1]) == "three_body_problem"
    return False


def send_signal_if_alive(pid: int, sig: signal.Signals) -> bool:
    """Send a signal to a pid if it is still alive."""
    if not is_pid_alive(pid):
        return False
    try:
        os.kill(pid, sig)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return False
    except Exception:
        return False


def wait_for_exit(pids: set[int], timeout_seconds: float) -> set[int]:
    """Wait until timeout and return pids still alive."""
    if timeout_seconds <= 0:
        return {pid for pid in pids if is_pid_alive(pid)}
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        alive = {pid for pid in pids if is_pid_alive(pid)}
        if not alive:
            return set()
        time.sleep(0.2)
    return {pid for pid in pids if is_pid_alive(pid)}


def discover_runner_and_renderer_pids(
    logs_layout: dict[str, Path],
    repo_root: Path,
) -> tuple[set[int], set[int]]:
    """Discover active runner and renderer pids for this repository."""
    me = os.getpid()
    runner_pids: set[int] = set()
    renderer_pids: set[int] = set()

    control = read_json_file(logs_layout['session_control']) or {}
    control_pid = control.get('runner_pid')
    if isinstance(control_pid, int) and control_pid != me and is_pid_alive(control_pid):
        if is_runpy_cmdline(process_cmdline(control_pid)):
            runner_pids.add(control_pid)

    process_rows = parse_ps_table()
    for row in process_rows:
        pid = row['pid']
        comm = row['comm']
        args = row['args']
        if pid == me:
            continue
        if is_python_runpy_process(comm, args) and process_matches_repo(pid, repo_root):
            runner_pids.add(pid)

    for row in process_rows:
        pid = row['pid']
        ppid = row['ppid']
        comm = row['comm']
        args = row['args']
        if pid == me:
            continue
        if not is_renderer_process(comm, args):
            continue
        if ppid in runner_pids or process_matches_repo(pid, repo_root):
            renderer_pids.add(pid)

    return runner_pids, renderer_pids


def stop_all_running_tasks(logs_layout: dict[str, Path], wait_seconds: float) -> int:
    """Stop all run.py and renderer tasks associated with this repository."""
    repo_root = Path.cwd().resolve()
    runner_pids, renderer_pids = discover_runner_and_renderer_pids(logs_layout, repo_root)
    if not runner_pids and not renderer_pids:
        print("No active run.py or three_body_problem tasks found for this repository.")
        update_session_control(
            logs_layout['session_control'],
            {
                'status': 'stop_requested_no_targets',
                'repo_root': str(repo_root),
            },
        )
        return 0

    print(f"Found {len(runner_pids)} runner(s) and {len(renderer_pids)} renderer process(es).")
    if runner_pids:
        print(f"  Runner PIDs:   {', '.join(str(p) for p in sorted(runner_pids))}")
    if renderer_pids:
        print(f"  Renderer PIDs: {', '.join(str(p) for p in sorted(renderer_pids))}")

    write_session_event(
        logs_layout['session_events'],
        {
            'event': 'stop_all_requested',
            'runner_pids': sorted(runner_pids),
            'renderer_pids': sorted(renderer_pids),
            'repo_root': str(repo_root),
            'wait_seconds': wait_seconds,
        },
    )
    update_session_control(
        logs_layout['session_control'],
        {
            'status': 'stopping',
            'repo_root': str(repo_root),
            'stop_request': {
                'runner_pids': sorted(runner_pids),
                'renderer_pids': sorted(renderer_pids),
                'wait_seconds': wait_seconds,
            },
        },
    )

    for pid in sorted(runner_pids):
        send_signal_if_alive(pid, signal.SIGINT)
    runners_left = wait_for_exit(runner_pids, wait_seconds)

    for pid in sorted(runners_left):
        send_signal_if_alive(pid, signal.SIGTERM)
    runners_left = wait_for_exit(runners_left, max(1.0, wait_seconds / 2.0))

    for pid in sorted(renderer_pids):
        send_signal_if_alive(pid, signal.SIGTERM)
    renderers_left = wait_for_exit(renderer_pids, 2.0)

    still_alive = set(runners_left) | set(renderers_left)
    for pid in sorted(still_alive):
        send_signal_if_alive(pid, signal.SIGKILL)
    still_alive = wait_for_exit(still_alive, 1.0)

    stopped_runners = sorted(pid for pid in runner_pids if pid not in still_alive)
    stopped_renderers = sorted(pid for pid in renderer_pids if pid not in still_alive)

    write_session_event(
        logs_layout['session_events'],
        {
            'event': 'stop_all_finished',
            'requested_runner_pids': sorted(runner_pids),
            'requested_renderer_pids': sorted(renderer_pids),
            'stopped_runner_pids': stopped_runners,
            'stopped_renderer_pids': stopped_renderers,
            'remaining_pids': sorted(still_alive),
        },
    )

    if still_alive:
        update_session_control(
            logs_layout['session_control'],
            {
                'status': 'stop_partial',
                'remaining_pids': sorted(still_alive),
            },
        )
        print(
            "Stop command completed with remaining processes: "
            + ", ".join(str(pid) for pid in sorted(still_alive))
        )
        return 1

    update_session_control(
        logs_layout['session_control'],
        {
            'status': 'stopped_by_stop_all',
            'remaining_pids': [],
        },
    )
    print("All matching run.py and three_body_problem processes were stopped.")
    return 0


def run_simulation(
    task_id: int,
    binary_path: str,
    mode_arg: str,
    timeout: int,
    runs_dir: Path,
    runs_index_path: Path,
    session_events_path: Path,
    binary_log_level: str,
    binary_args: str,
    binary_log_format: str,
    diagnostic_tail_bytes: int,
    rayon_threads: int,
) -> dict[str, Any]:
    """Run a single simulation with random parameters.

    Returns a structured result payload for stats and diagnostics.
    """
    if shutdown_event.is_set() or force_shutdown_event.is_set():
        return {
            'task_id': task_id,
            'success': False,
            'filename': "",
            'elapsed_seconds': 0.0,
            'is_special': False,
        }

    seed = generate_random_seed()
    is_special = choose_mode(mode_arg, task_id)
    seq = next_sequence_number()
    filename = build_filename(seq, seed, is_special)
    mode_label = "SPECIAL" if is_special else "REGULAR"
    stdout_path = runs_dir / f"{filename}.stdout.log"
    stderr_path = runs_dir / f"{filename}.stderr.log"
    metadata_path = runs_dir / f"{filename}.json"
    diagnostics_path = runs_dir / f"{filename}.diagnostics.json"

    command = [
        binary_path,
        '--seed', seed,
        '--file-name', filename,
        '--log-level', binary_log_level,
    ]
    if binary_log_format == 'json':
        command.append('--json-logs')

    if is_special:
        command.append('--special')

    if binary_args.strip():
        command.extend(shlex.split(binary_args))
    else:
        command.extend(build_default_binary_args(is_special))

    with stats_lock:
        stats['started'] += 1
        current_num = stats['started']

    print(
        f"[{current_num}] Started: {filename} ({mode_label}) "
        f"[logs: {metadata_path}]"
    )
    write_session_event(
        session_events_path,
        {
            'event': 'run_started',
            'task_id': task_id,
            'sequence': seq,
            'runner_counter': current_num,
            'filename': filename,
            'seed': seed,
            'is_special': is_special,
            'mode_label': mode_label,
            'command': command,
            'timeout_seconds': timeout,
            'stdout_log': str(stdout_path),
            'stderr_log': str(stderr_path),
            'metadata_log': str(metadata_path),
        },
    )

    start_time_monotonic = time.monotonic()
    started_at_utc = utc_now_iso()
    process: Optional[subprocess.Popen] = None
    timed_out = False
    return_code: Optional[int] = None
    exception_text: Optional[str] = None
    timeout_snapshot: Optional[dict[str, Any]] = None
    try:
        with stdout_path.open('wb') as stdout_file, stderr_path.open('wb') as stderr_file:
            child_env = os.environ.copy()
            child_env["RAYON_NUM_THREADS"] = str(rayon_threads)
            process = subprocess.Popen(
                command,
                stdout=stdout_file,
                stderr=stderr_file,
                start_new_session=True,
                env=child_env,
            )
            register_active_process(task_id, process)
            if force_shutdown_event.is_set():
                send_signal_to_process_tree(process, signal.SIGTERM)
            try:
                return_code = process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                timed_out = True
                timeout_snapshot = {
                    'triggered_at_utc': utc_now_iso(),
                    'process': collect_process_snapshot(process.pid),
                    'system': collect_system_snapshot(),
                }
                try:
                    if process.pid is not None:
                        os.killpg(process.pid, signal.SIGKILL)
                except Exception:
                    process.kill()
                return_code = process.wait()

        elapsed = time.monotonic() - start_time_monotonic
        classification = classify_return_code(return_code, timed_out)
        success = classification['exit_reason'] == 'ok'
        stderr_tail = read_file_tail(stderr_path, 2048)
        stdout_tail = read_file_tail(stdout_path, 2048)
        failure_diagnostics_written = False
        progress_hint = summarize_progress(stdout_tail)
        if not success:
            diagnostics_payload: dict[str, Any] = {
                'captured_at_utc': utc_now_iso(),
                'task_id': task_id,
                'sequence': seq,
                'runner_counter': current_num,
                'filename': filename,
                'seed': seed,
                'is_special': is_special,
                'mode_label': mode_label,
                'command': command,
                'timeout_seconds': timeout,
                'rayon_threads': rayon_threads,
                'elapsed_seconds': elapsed,
                'return_code': return_code,
                'timed_out': timed_out,
                'exit_reason': classification['exit_reason'],
                'signal_number': classification['signal_number'],
                'signal_name': classification['signal_name'],
                'stdout_log': str(stdout_path),
                'stderr_log': str(stderr_path),
                'stdout_bytes': stdout_path.stat().st_size if stdout_path.exists() else None,
                'stderr_bytes': stderr_path.stat().st_size if stderr_path.exists() else None,
                'stdout_tail': read_file_tail(stdout_path, diagnostic_tail_bytes),
                'stderr_tail': read_file_tail(stderr_path, diagnostic_tail_bytes),
                'progress_hint': progress_hint,
                'process_snapshot': collect_process_snapshot(process.pid if process else None),
                'system_snapshot': collect_system_snapshot(),
                'timeout_snapshot': timeout_snapshot,
            }
            try:
                write_json_file(diagnostics_path, diagnostics_payload)
                failure_diagnostics_written = True
            except Exception:
                failure_diagnostics_written = False

        metadata: dict[str, Any] = {
            'task_id': task_id,
            'sequence': seq,
            'runner_counter': current_num,
            'filename': filename,
            'seed': seed,
            'is_special': is_special,
            'mode_label': mode_label,
            'command': command,
            'timeout_seconds': timeout,
            'rayon_threads': rayon_threads,
            'binary_path': binary_path,
            'binary_log_level': binary_log_level,
            'binary_log_format': binary_log_format,
            'started_at_utc': started_at_utc,
            'finished_at_utc': utc_now_iso(),
            'elapsed_seconds': elapsed,
            'return_code': return_code,
            'timed_out': timed_out,
            'exit_reason': classification['exit_reason'],
            'signal_number': classification['signal_number'],
            'signal_name': classification['signal_name'],
            'success': success,
            'pid': process.pid if process is not None else None,
            'stdout_log': str(stdout_path),
            'stderr_log': str(stderr_path),
            'stdout_tail': stdout_tail,
            'stderr_tail': stderr_tail,
            'progress_hint': progress_hint,
            'diagnostics_log': str(diagnostics_path) if failure_diagnostics_written else None,
        }
        write_json_file(metadata_path, metadata)
        append_jsonl(runs_index_path, metadata)
        write_session_event(
            session_events_path,
            {
                'event': 'run_finished',
                'task_id': task_id,
                'sequence': seq,
                'runner_counter': current_num,
                'filename': filename,
                'success': success,
                'elapsed_seconds': elapsed,
                'timed_out': timed_out,
                'return_code': return_code,
                'exit_reason': classification['exit_reason'],
                'signal_name': classification['signal_name'],
                'stdout_log': str(stdout_path),
                'stderr_log': str(stderr_path),
                'metadata_log': str(metadata_path),
                'diagnostics_log': str(diagnostics_path) if failure_diagnostics_written else None,
                'progress_hint': progress_hint,
            },
        )

        if success:
            print(f"[{current_num}] Completed: {filename} ({elapsed:.1f}s)")
        else:
            signal_detail = (
                f", signal={classification['signal_name']}"
                if classification['signal_name']
                else ""
            )
            print(
                f"[{current_num}] Failed (exit {return_code}{signal_detail}): "
                f"{filename} ({elapsed:.1f}s) "
                f"[stderr: {stderr_path}, diag: {diagnostics_path}]"
            )

        return {
            'task_id': task_id,
            'success': success,
            'filename': filename,
            'elapsed_seconds': elapsed,
            'is_special': is_special,
        }

    except FileNotFoundError:
        elapsed = time.monotonic() - start_time_monotonic
        failure_meta: dict[str, Any] = {
            'task_id': task_id,
            'sequence': seq,
            'runner_counter': current_num,
            'filename': filename,
            'seed': seed,
            'is_special': is_special,
            'mode_label': mode_label,
            'command': command,
            'timeout_seconds': timeout,
            'rayon_threads': rayon_threads,
            'binary_path': binary_path,
            'binary_log_level': binary_log_level,
            'binary_log_format': binary_log_format,
            'started_at_utc': started_at_utc,
            'finished_at_utc': utc_now_iso(),
            'elapsed_seconds': elapsed,
            'return_code': return_code,
            'timed_out': timed_out,
            'exit_reason': 'binary_not_found',
            'signal_number': None,
            'signal_name': None,
            'success': False,
            'pid': None,
            'stdout_log': str(stdout_path),
            'stderr_log': str(stderr_path),
            'stdout_tail': read_file_tail(stdout_path, 2048),
            'stderr_tail': read_file_tail(stderr_path, 2048),
            'progress_hint': {},
            'diagnostics_log': None,
        }
        diagnostics_payload = {
            'captured_at_utc': utc_now_iso(),
            'error': 'binary_not_found',
            'binary_path': binary_path,
            'command': command,
            'stdout_log': str(stdout_path),
            'stderr_log': str(stderr_path),
            'system_snapshot': collect_system_snapshot(),
        }
        try:
            write_json_file(diagnostics_path, diagnostics_payload)
            failure_meta['diagnostics_log'] = str(diagnostics_path)
            write_json_file(metadata_path, failure_meta)
            append_jsonl(runs_index_path, failure_meta)
        except Exception:
            pass
        write_session_event(
            session_events_path,
            {
                'event': 'run_failed_to_start',
                'task_id': task_id,
                'sequence': seq,
                'runner_counter': current_num,
                'filename': filename,
                'error': 'binary_not_found',
                'binary_path': binary_path,
                'metadata_log': str(metadata_path),
                'diagnostics_log': str(diagnostics_path),
            },
        )
        print(
            f"[{current_num}] Binary not found: {binary_path}",
            file=sys.stderr,
        )
        shutdown_event.set()
        return {
            'task_id': task_id,
            'success': False,
            'filename': filename,
            'elapsed_seconds': elapsed,
            'is_special': is_special,
        }

    except Exception as e:
        elapsed = time.monotonic() - start_time_monotonic
        exception_text = f"{type(e).__name__}: {e}"
        failure_meta: dict[str, Any] = {
            'task_id': task_id,
            'sequence': seq,
            'runner_counter': current_num,
            'filename': filename,
            'seed': seed,
            'is_special': is_special,
            'mode_label': mode_label,
            'command': command,
            'timeout_seconds': timeout,
            'rayon_threads': rayon_threads,
            'binary_path': binary_path,
            'binary_log_level': binary_log_level,
            'binary_log_format': binary_log_format,
            'started_at_utc': started_at_utc,
            'finished_at_utc': utc_now_iso(),
            'elapsed_seconds': elapsed,
            'return_code': return_code,
            'timed_out': timed_out,
            'exit_reason': 'runner_exception',
            'signal_number': None,
            'signal_name': None,
            'success': False,
            'pid': process.pid if process is not None else None,
            'stdout_log': str(stdout_path),
            'stderr_log': str(stderr_path),
            'stdout_tail': read_file_tail(stdout_path, 2048),
            'stderr_tail': read_file_tail(stderr_path, 2048),
            'progress_hint': {},
            'diagnostics_log': str(diagnostics_path),
            'exception': exception_text,
            'traceback': traceback.format_exc(),
        }
        diagnostics_payload = {
            'captured_at_utc': utc_now_iso(),
            'error': 'runner_exception',
            'exception': exception_text,
            'traceback': traceback.format_exc(),
            'task_id': task_id,
            'sequence': seq,
            'runner_counter': current_num,
            'filename': filename,
            'command': command,
            'stdout_log': str(stdout_path),
            'stderr_log': str(stderr_path),
            'stdout_tail': read_file_tail(stdout_path, diagnostic_tail_bytes),
            'stderr_tail': read_file_tail(stderr_path, diagnostic_tail_bytes),
            'process_snapshot': collect_process_snapshot(process.pid if process else None),
            'system_snapshot': collect_system_snapshot(),
        }
        try:
            write_json_file(diagnostics_path, diagnostics_payload)
            write_json_file(metadata_path, failure_meta)
            append_jsonl(runs_index_path, failure_meta)
        except Exception:
            pass
        write_session_event(
            session_events_path,
            {
                'event': 'run_runner_exception',
                'task_id': task_id,
                'sequence': seq,
                'runner_counter': current_num,
                'filename': filename,
                'exception': exception_text,
                'metadata_log': str(metadata_path),
                'diagnostics_log': str(diagnostics_path),
            },
        )
        print(f"[{current_num}] Error: {filename} - {e}")
        return {
            'task_id': task_id,
            'success': False,
            'filename': filename,
            'elapsed_seconds': elapsed,
            'is_special': is_special,
        }
    finally:
        unregister_active_process(task_id)


def record_result(success: bool, is_special: bool, elapsed: float) -> None:
    """Update global stats for a completed task (caller must hold stats_lock)."""
    if success:
        stats['successful'] += 1
        if is_special:
            stats['special_ok'] += 1
        else:
            stats['regular_ok'] += 1
    else:
        stats['failed'] += 1
        if is_special:
            stats['special_fail'] += 1
        else:
            stats['regular_fail'] += 1
    stats['total_elapsed'] += elapsed


def signal_handler(signum, frame):
    """Handle CTRL+C / SIGTERM gracefully."""
    global interrupt_count
    with interrupt_lock:
        interrupt_count += 1
        current_interrupt = interrupt_count

    if current_interrupt == 1:
        print("\n\nShutting down... waiting for running tasks to complete.")
        print("Press Ctrl+C again to force-stop active simulations.")
        shutdown_event.set()
        return

    shutdown_event.set()
    force_shutdown_event.set()

    if current_interrupt == 2:
        print("\nForce-stopping active simulations (SIGTERM)...")
        signaled = signal_active_processes(signal.SIGTERM)
        if signaled == 0:
            print("No active simulations were found to terminate.")
        print("Press Ctrl+C once more to hard-kill remaining simulations.")
        return

    print("\nHard-stopping active simulations (SIGKILL)...")
    signaled = signal_active_processes(signal.SIGKILL)
    if signaled == 0:
        print("No active simulations were found to kill.")
    shutdown_event.set()


def main():
    """Run simulations indefinitely with random seeds and modes."""
    args = parse_args()

    binary_path = args.binary
    num_workers = args.workers
    mode_arg = args.mode
    timeout = args.timeout
    logs_layout = ensure_logs_layout(Path(args.logs_dir))
    rayon_threads = compute_rayon_threads(args.rayon_threads, num_workers)

    if args.stop_all:
        sys.exit(stop_all_running_tasks(logs_layout, args.stop_wait_seconds))

    write_session_metadata(args, logs_layout)
    write_session_event(
        logs_layout['session_events'],
        {
            'event': 'session_started',
            'argv': sys.argv,
            'args': vars(args),
        },
    )

    check_binary(binary_path)
    update_session_control(
        logs_layout['session_control'],
        {
            'status': 'running',
            'runner_pid': os.getpid(),
            'runner_pgid': os.getpgrp(),
            'repo_root': str(Path.cwd().resolve()),
            'logs_root': str(logs_layout['root']),
            'runs_index': str(logs_layout['runs_index']),
            'session_events': str(logs_layout['session_events']),
        },
    )

    # Ensure output directories exist
    Path(args.pics_dir).mkdir(parents=True, exist_ok=True)
    Path(args.vids_dir).mkdir(parents=True, exist_ok=True)

    mode_desc = {
        'both': 'both (alternating special / regular)',
        'special': 'special only',
        'regular': 'regular only',
        'random': 'random (coin flip each run)',
    }

    print("\n" + "=" * 60)
    print("Three Body Problem - Parallel Infinite Runner")
    print(f"  Workers:  {num_workers}")
    print(f"  Mode:     {mode_desc.get(mode_arg, mode_arg)}")
    print(f"  Timeout:  {timeout}s per simulation")
    print(f"  Binary:   {binary_path}")
    print(f"  Rayon:    {rayon_threads} thread(s) per process")
    print(f"  Logs:     {logs_layout['root']}")
    print(f"  Events:   {logs_layout['session_events']}")
    print(f"  Files:    {{special|regular}}_NNNN_{{seed}}")
    print("=" * 60)
    print("Press Ctrl+C to stop (will wait for running tasks)")
    print("=" * 60 + "\n")

    # Set up signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    try:
        signal.signal(signal.SIGTERM, signal_handler)
    except OSError:
        pass  # SIGTERM not available on all platforms

    overall_start = time.monotonic()
    task_id = 0
    executor = ThreadPoolExecutor(max_workers=num_workers)
    try:
        futures: dict = {}

        # Submit initial batch of tasks
        for _ in range(num_workers):
            if shutdown_event.is_set():
                break
            future = executor.submit(
                run_simulation,
                task_id,
                binary_path,
                mode_arg,
                timeout,
                logs_layout['runs'],
                logs_layout['runs_index'],
                logs_layout['session_events'],
                args.binary_log_level,
                        args.binary_args,
                        args.binary_log_format,
                args.diagnostic_tail_bytes,
                rayon_threads,
            )
            futures[future] = task_id
            task_id += 1

        # Process completed tasks and submit new ones
        while futures and not shutdown_event.is_set():
            try:
                done_futures = list(as_completed(futures, timeout=1.0))
            except TimeoutError:
                continue

            for future in done_futures:
                try:
                    result = future.result()
                    success = result['success']
                    elapsed = result['elapsed_seconds']
                    is_special = result['is_special']
                    with stats_lock:
                        record_result(success, is_special, elapsed)
                except Exception as e:
                    print(f"Task error: {e}")
                    with stats_lock:
                        stats['failed'] += 1

                del futures[future]

                # Submit a new task if not shutting down
                if not shutdown_event.is_set():
                    new_future = executor.submit(
                        run_simulation,
                        task_id,
                        binary_path,
                        mode_arg,
                        timeout,
                        logs_layout['runs'],
                        logs_layout['runs_index'],
                        logs_layout['session_events'],
                        args.binary_log_level,
                        args.binary_args,
                        args.binary_log_format,
                        args.diagnostic_tail_bytes,
                        rayon_threads,
                    )
                    futures[new_future] = task_id
                    task_id += 1

        # Wait for remaining tasks to complete
        if futures:
            if force_shutdown_event.is_set():
                print(f"\nForce shutdown requested, cancelling {len(futures)} pending tasks...")
                for future in futures:
                    future.cancel()
            else:
                print(f"\nWaiting for {len(futures)} remaining tasks to complete...")
                for future in as_completed(futures):
                    try:
                        result = future.result()
                        success = result['success']
                        elapsed = result['elapsed_seconds']
                        is_special = result['is_special']
                        with stats_lock:
                            record_result(success, is_special, elapsed)
                    except Exception:
                        with stats_lock:
                            stats['failed'] += 1
    finally:
        executor.shutdown(
            wait=not force_shutdown_event.is_set(),
            cancel_futures=force_shutdown_event.is_set(),
        )

    overall_elapsed = time.monotonic() - overall_start
    completed = stats['successful'] + stats['failed']
    avg = stats['total_elapsed'] / completed if completed else 0.0

    print("\n" + "=" * 60)
    print("Stopped by user")
    print("=" * 60)
    print(f"  Total started:     {stats['started']}")
    print(f"  Successful:        {stats['successful']}")
    print(f"    Special:         {stats['special_ok']} ok, {stats['special_fail']} failed")
    print(f"    Regular:         {stats['regular_ok']} ok, {stats['regular_fail']} failed")
    print(f"  Failed:            {stats['failed']}")
    print(f"  Avg sim time:      {avg:.1f}s")
    print(f"  Wall-clock time:   {overall_elapsed:.1f}s")
    print(f"  Session metadata:  {logs_layout['session_meta']}")
    print(f"  Session control:   {logs_layout['session_control']}")
    print(f"  Run index (JSONL): {logs_layout['runs_index']}")
    print(f"  Session events:    {logs_layout['session_events']}")
    print(f"  Per-run logs:      {logs_layout['runs']}")
    print("=" * 60 + "\n")
    write_session_event(
        logs_layout['session_events'],
        {
            'event': 'session_finished',
            'total_started': stats['started'],
            'successful': stats['successful'],
            'failed': stats['failed'],
            'special_ok': stats['special_ok'],
            'special_fail': stats['special_fail'],
            'regular_ok': stats['regular_ok'],
            'regular_fail': stats['regular_fail'],
            'avg_sim_time': avg,
            'wall_clock_seconds': overall_elapsed,
        },
    )
    update_session_control(
        logs_layout['session_control'],
        {
            'status': 'stopped',
            'runner_pid': os.getpid(),
            'runner_pgid': os.getpgrp(),
            'repo_root': str(Path.cwd().resolve()),
            'logs_root': str(logs_layout['root']),
            'runs_index': str(logs_layout['runs_index']),
            'session_events': str(logs_layout['session_events']),
            'summary': {
                'total_started': stats['started'],
                'successful': stats['successful'],
                'failed': stats['failed'],
                'special_ok': stats['special_ok'],
                'special_fail': stats['special_fail'],
                'regular_ok': stats['regular_ok'],
                'regular_fail': stats['regular_fail'],
                'avg_sim_time': avg,
                'wall_clock_seconds': overall_elapsed,
            },
        },
    )


if __name__ == "__main__":
    main()
