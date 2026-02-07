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
DEFAULT_WORKERS = 4
DEFAULT_SUBPROCESS_TIMEOUT = 16000  # 100 minutes per simulation
BINARY_PATH = Path('./target/release/three_body_problem')
DEFAULT_LOGS_DIR = Path("./runner_logs")
DEFAULT_BINARY_LOG_LEVEL = "info"
DEFAULT_DIAGNOSTIC_TAIL_BYTES = 32 * 1024
DEFAULT_TOP_PROCESSES = 20

# Global state for graceful shutdown
shutdown_event = threading.Event()
stats_lock = threading.Lock()
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
    args = parser.parse_args()
    if args.workers < 1:
        parser.error("--workers must be at least 1")
    if args.timeout < 1:
        parser.error("--timeout must be at least 1")
    if args.diagnostic_tail_bytes < 256:
        parser.error("--diagnostic-tail-bytes must be at least 256")
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


def generate_random_seed() -> str:
    """Generate a random 6-byte hex seed."""
    return "0x" + secrets.token_hex(6)


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


def run_simulation(
    task_id: int,
    binary_path: str,
    mode_arg: str,
    timeout: int,
    runs_dir: Path,
    runs_index_path: Path,
    session_events_path: Path,
    binary_log_level: str,
    binary_log_format: str,
    diagnostic_tail_bytes: int,
) -> dict[str, Any]:
    """Run a single simulation with random parameters.

    Returns a structured result payload for stats and diagnostics.
    """
    if shutdown_event.is_set():
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
            process = subprocess.Popen(
                command,
                stdout=stdout_file,
                stderr=stderr_file,
                start_new_session=True,
            )
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
    print("\n\nShutting down... waiting for running tasks to complete.")
    shutdown_event.set()


def main():
    """Run simulations indefinitely with random seeds and modes."""
    args = parse_args()

    binary_path = args.binary
    num_workers = args.workers
    mode_arg = args.mode
    timeout = args.timeout
    logs_layout = ensure_logs_layout(Path(args.logs_dir))
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

    with ThreadPoolExecutor(max_workers=num_workers) as executor:
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
                args.binary_log_format,
                args.diagnostic_tail_bytes,
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
                        args.binary_log_format,
                        args.diagnostic_tail_bytes,
                    )
                    futures[new_future] = task_id
                    task_id += 1

        # Wait for remaining tasks to complete
        if futures:
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


if __name__ == "__main__":
    main()
