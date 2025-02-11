import subprocess

# ===================== Minimal Configuration =====================
CONFIG = {
    'program_path': './target/release/three_body_problem',
    'base_seed_hex': 'cafe07',
    'num_runs': 1000
}

def main():
    """
    Runs the Rust three_body_problem binary for a series of seeds.
    For each seed, runs twice: normal (no --special) and special (with --special).
    Only passes --seed, --file-name, and --special (when needed).
    """
    base_hex = CONFIG['base_seed_hex']
    for i in range(CONFIG['num_runs']):
        # Build the seed string (e.g. 0x1555560000, 0x1555560001, ...)
        seed_str = f"0x{base_hex}{i:04}"
        alpha_denom = int(10**8)
        file_name = f"seed_{seed_str[2:]}_{alpha_denom}"  # remove "0x" in the seed for file_name
        cmd_normal = [
            CONFIG['program_path'],
            "--seed", seed_str,
            "--file-name", file_name,
            "--num-sims", "3000",
            "--alpha-denom", str(alpha_denom),
            "--width", "1920",
            "--height", "1080"
        ]
        print("Running command:", " ".join(cmd_normal))
        subprocess.run(cmd_normal, check=True)

if __name__ == "__main__":
    main()
