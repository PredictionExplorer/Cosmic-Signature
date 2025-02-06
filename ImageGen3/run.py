import subprocess

# ===================== Configuration =====================
CONFIG = {
    'program_path': './target/release/three_body_problem',
    'base_seed_hex': 'beef13',  # Adjust as desired
    'num_runs': 1000           # Number of distinct seeds
}

def main():
    """
    For each seed, run four times:
      1) no flags (default additive)
      2) --painterly
      3) --heatmap
      4) --watercolor

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

        # ---------- 2) Painterly ----------
        file_name_painterly = f"seed-{seed_str[2:]}-painterly"
        cmd_painterly = [
            CONFIG['program_path'],
            "--seed", seed_str,
            "--file-name", file_name_painterly,
            "--num-sims", "3000",
            "--painterly"
        ]
        print("Running command (painterly):", " ".join(cmd_painterly))
        subprocess.run(cmd_painterly, check=True)

        # ---------- 3) Heatmap ----------
        file_name_heatmap = f"seed-{seed_str[2:]}-heatmap"
        cmd_heatmap = [
            CONFIG['program_path'],
            "--seed", seed_str,
            "--file-name", file_name_heatmap,
            "--num-sims", "3000",
            "--heatmap"
        ]
        print("Running command (heatmap):", " ".join(cmd_heatmap))
        subprocess.run(cmd_heatmap, check=True)

        # ---------- 4) Watercolor ----------
        file_name_water = f"seed-{seed_str[2:]}-watercolor"
        cmd_water = [
            CONFIG['program_path'],
            "--seed", seed_str,
            "--file-name", file_name_water,
            "--num-sims", "3000",
            "--watercolor"
        ]
        print("Running command (watercolor):", " ".join(cmd_water))
        subprocess.run(cmd_water, check=True)


if __name__ == "__main__":
    main()