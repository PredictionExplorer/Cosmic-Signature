import subprocess

# ===================== Minimal Configuration =====================
CONFIG = {
    'program_path': './target/release/three_body_problem',
    'base_seed_hex': 'cafe',
    'num_runs': 1000
}

def main():
    """
    Runs the Rust three_body_problem binary for a series of seeds.
    For each seed, it runs only once (no --special).
    Passes --seed, --file-name, --num-sims 3000.
    """
    base_hex = CONFIG['base_seed_hex']
    for i in range(CONFIG['num_runs']):
        # Build the seed string (e.g. 0xCAFE0000, 0xCAFE0001, etc.)
        seed_str = f"0x{base_hex}{i:04X}"

        # Construct a file name from the hex part after "0x"
        file_name = f"seed_{seed_str[2:]}"  # remove "0x"

        # Single run per seed
        cmd = [
            CONFIG['program_path'],
            "--seed", seed_str,
            "--file-name", file_name,
            "--num-sims", "3000"
        ]

        print("Running command:", " ".join(cmd))
        subprocess.run(cmd, check=True)

if __name__ == "__main__":
    main()