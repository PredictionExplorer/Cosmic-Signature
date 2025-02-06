import subprocess

# ===================== Configuration =====================
CONFIG = {
    'program_path': './target/release/three_body_problem',
    'base_seed_hex': 'beef16',  # Adjust as desired
    'num_runs': 1000           # Number of distinct seeds
}

def main():
    """
    For each seed, run four times:
      1) no flags (default additive)
      2) --color-dodge
      3) --color-burn
      4) --overlay

    Always do --num-sims=3000, no --special.
    """
    base_hex = CONFIG['base_seed_hex']
    for i in range(CONFIG['num_runs']):
        # Build the seed string (e.g. "0xBEEF130000", "0xBEEF130001", etc.)
        seed_str = f"0x{base_hex}{i:04X}"

        # ---------- 1) No flags ----------
        file_name_noflags = f"seed-{seed_str[2:]}-noflags"
        cmd_noflags = [
            CONFIG['program_path'],
            "--seed", seed_str,
            "--file-name", file_name_noflags,
            "--num-sims", "3000"
        ]
        print("Running command (no flags):", " ".join(cmd_noflags))
        subprocess.run(cmd_noflags, check=True)

        # ---------- 2) Color Dodge ----------
        file_name_dodge = f"seed-{seed_str[2:]}-color-dodge"
        cmd_dodge = [
            CONFIG['program_path'],
            "--seed", seed_str,
            "--file-name", file_name_dodge,
            "--num-sims", "3000",
            "--color-dodge"
        ]
        print("Running command (color-dodge):", " ".join(cmd_dodge))
        subprocess.run(cmd_dodge, check=True)

        # ---------- 3) Color Burn ----------
        file_name_burn = f"seed-{seed_str[2:]}-color-burn"
        cmd_burn = [
            CONFIG['program_path'],
            "--seed", seed_str,
            "--file-name", file_name_burn,
            "--num-sims", "3000",
            "--color-burn"
        ]
        print("Running command (color-burn):", " ".join(cmd_burn))
        subprocess.run(cmd_burn, check=True)

        # ---------- 4) Overlay ----------
        file_name_overlay = f"seed-{seed_str[2:]}-overlay"
        cmd_overlay = [
            CONFIG['program_path'],
            "--seed", seed_str,
            "--file-name", file_name_overlay,
            "--num-sims", "3000",
            "--overlay"
        ]
        print("Running command (overlay):", " ".join(cmd_overlay))
        subprocess.run(cmd_overlay, check=True)


if __name__ == "__main__":
    main()