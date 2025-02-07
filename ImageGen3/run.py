import subprocess

# ===================== Configuration =====================
CONFIG = {
    'program_path': './target/release/three_body_problem',
    'base_seed_hex': 'beef30',
    'num_seeds': 1000,   # We'll generate 7 distinct seeds
    # The new blend/compositing modes:
    'blend_modes': [
        "add",
        "screen",
        "overlay",
        "softlight",
        "multiply"
    ],
    # Example fades: you can add more or remove this if you only want 1.0
    'fade_values': [1.0, 0.998, 0.98],
    # A fixed number of orbits to search
    'num_sims': 3000
}

def main():
    """
    For each of 7 seeds, we run the Rust program once per blend_mode * fade_value.
    Each run will produce a distinct video/image based on that combination.
    """
    program_path = CONFIG['program_path']
    base_hex = CONFIG['base_seed_hex']
    num_seeds = CONFIG['num_seeds']
    blend_modes = CONFIG['blend_modes']
    fade_values = CONFIG['fade_values']
    num_sims = CONFIG['num_sims']

    for i in range(num_seeds):
        # Construct a seed string in hex. Example: 0xbeef170000, 0xbeef170001, etc.
        seed_str = f"0x{base_hex}{i:04X}"

        for mode in blend_modes:
            for fade in fade_values:
                # Build an output file name that includes seed suffix, blend mode, and fade
                # Example: "seed-beef170000-screen-fade0.98", etc.
                file_name = f"seed-{seed_str[2:]}-{mode}-fade{fade}"

                cmd = [
                    program_path,
                    "--seed", seed_str,
                    "--file-name", file_name,
                    "--num-sims", str(num_sims),
                    "--blend-mode", mode,
                    "--fade", str(fade)
                ]

                print("Running command:", " ".join(cmd))
                subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()