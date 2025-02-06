import subprocess

# ===================== Configuration =====================
CONFIG = {
    'program_path': './target/release/three_body_problem',
    'base_seed_hex': 'beef17',
    'num_seeds': 7,   # We’ll generate 7 distinct seeds
    # The 7 blend/compositing modes we want to test:
    'blend_modes': [
        "add",
        "alpha1",
        "alpha2",
        "alpha3",
        "partial1",
        "partial2",
        "partial3"
    ],
    # Example: you might want a fixed number of total orbits to search
    'num_sims': 3000
}


def main():
    """
    For each of 7 seeds, run the Rust program 7 times (one per blend_mode).
    Each run will produce a distinct video/image based on that blend_mode.
    """
    program_path = CONFIG['program_path']
    base_hex = CONFIG['base_seed_hex']
    num_seeds = CONFIG['num_seeds']
    blend_modes = CONFIG['blend_modes']
    num_sims = CONFIG['num_sims']

    for i in range(num_seeds):
        # Construct a seed string in hex. Example: 0xbeef160000, 0xbeef160001, etc.
        seed_str = f"0x{base_hex}{i:04X}"

        for mode in blend_modes:
            # Build an output file name that includes the seed suffix & the blend mode
            # Example: "seed-beef160000-add", "seed-beef160000-alpha1", etc.
            file_name = f"seed-{seed_str[2:]}-{mode}"

            cmd = [
                program_path,
                "--seed", seed_str,
                "--file-name", file_name,
                "--num-sims", str(num_sims),
                "--blend-mode", mode
            ]

            print("Running command:", " ".join(cmd))
            subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()