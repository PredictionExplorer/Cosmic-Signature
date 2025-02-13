import subprocess

# ===================== Minimal Configuration =====================
CONFIG = {
    'program_path': './target/release/three_body_problem',
    'base_seed_hex': 'cafe20',
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
        seed_str = f"0x{base_hex}{i:04X}"

        # 1) Normal run
        file_name_nm = f"seed_{seed_str[2:]}_nm"  # remove "0x" in the seed for file_name
        cmd_normal = [
            CONFIG['program_path'],
            "--seed", seed_str,
            "--file-name", file_name_nm
        ]
        print("Running command (normal):", " ".join(cmd_normal))
        subprocess.run(cmd_normal, check=True)

        # 2) Special run
        file_name_sp = f"seed_{seed_str[2:]}_sp"
        cmd_special = [
            CONFIG['program_path'],
            "--seed", seed_str,
            "--file-name", file_name_sp,
            "--special"
        ]
        print("Running command (special):", " ".join(cmd_special))
        subprocess.run(cmd_special, check=True)

if __name__ == "__main__":
    main()
