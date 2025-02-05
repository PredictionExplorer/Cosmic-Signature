import subprocess

# ===================== Configuration =====================
CONFIG = {
    'program_path': './target/release/three_body_problem',
    'base_seed_hex': 'beef13',   # Adjust if desired
    'num_runs': 1000              # Number of distinct seeds you want to run
}

def main():
    """
    For each seed, run four times:
      1) no new flags
      2) --log_blend only
      3) --hue_shift only
      4) both --log_blend and --hue_shift

    We always do --num_sims=3000, no --special.
    """
    base_hex = CONFIG['base_seed_hex']
    for i in range(CONFIG['num_runs']):
        # Build the seed string (e.g. "0xBEEF120000", "0xBEEF120001", etc.)
        seed_str = f"0x{base_hex}{i:04X}"

        # ---------- 1) No flags ----------
        file_name_noflags = f"seed_{seed_str[2:]}_noflags"  # remove "0x" from seed for the file_name
        cmd_noflags = [
            CONFIG['program_path'],
            "--seed", seed_str,
            "--file-name", file_name_noflags,
            "--num_sims", "3000"
        ]
        print("Running command (no flags):", " ".join(cmd_noflags))
        subprocess.run(cmd_noflags, check=True)

        # ---------- 2) Log blend only ----------
        file_name_log = f"seed_{seed_str[2:]}_log"
        cmd_log = [
            CONFIG['program_path'],
            "--seed", seed_str,
            "--file-name", file_name_log,
            "--num_sims", "3000",
            "--log_blend"
        ]
        print("Running command (log_blend only):", " ".join(cmd_log))
        subprocess.run(cmd_log, check=True)

        # ---------- 3) Hue shift only ----------
        file_name_hue = f"seed_{seed_str[2:]}_hue"
        cmd_hue = [
            CONFIG['program_path'],
            "--seed", seed_str,
            "--file-name", file_name_hue,
            "--num_sims", "3000",
            "--hue_shift"
        ]
        print("Running command (hue_shift only):", " ".join(cmd_hue))
        subprocess.run(cmd_hue, check=True)

        # ---------- 4) Both log blend & hue shift ----------
        file_name_both = f"seed_{seed_str[2:]}_both"
        cmd_both = [
            CONFIG['program_path'],
            "--seed", seed_str,
            "--file-name", file_name_both,
            "--num_sims", "3000",
            "--log_blend",
            "--hue_shift"
        ]
        print("Running command (log_blend + hue_shift):", " ".join(cmd_both))
        subprocess.run(cmd_both, check=True)

if __name__ == "__main__":
    main()