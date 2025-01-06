import itertools
import os
import random
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

def run_program(command_list):
    """
    Helper function to run the Rust program via subprocess.
    Returns (shell_command_string, stdout_string or None if error).
    """
    shell_command = " ".join(command_list)
    try:
        result = subprocess.run(
            command_list,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        return (shell_command, result.stdout.strip())
    except subprocess.CalledProcessError:
        return (shell_command, None)

def generate_file_name(
    num_steps, num_sims,
    location, velocity,
    min_mass, max_mass,
    avoid_effects, no_video,
    dynamic_bounds, special_color,
    max_points,
    video_tail_min, video_tail_max,
    image_tail_min, image_tail_max,
    special_color_video_tail_min, special_color_video_tail_max,
    special_color_image_tail_min, special_color_image_tail_max,
    base_seed_hex, seed_suffix_hex
):
    """
    Create a file name that clearly labels each parameter.
    Example:
      "numSteps=1000000_numSims=0100_location=250_vel=200.0_minMass=100_maxMass=300_
       AE=0_NV=0_DB=0_color=gold_maxPoints=100000_vTail=0.2-2.0_iTail=0.5-0.5_
       svTail=1.0-1.0_siTail=2.0-2.0_seed=7755800001"
    """

    # Convert booleans to int for clarity (1 = true, 0 = false)
    ae_flag = int(avoid_effects)
    nv_flag = int(no_video)
    db_flag = int(dynamic_bounds)

    # If there's a special color, use that string; otherwise "nm"
    sc_str = special_color if special_color else "nm"

    # We'll embed all parameters in a verbose manner:
    file_name = (
        f"numSteps={num_steps}"
        f"_numSims={num_sims:04d}"   # zero-pad to 4 digits
        f"_location={int(location)}"
        f"_vel={velocity:.1f}"
        f"_minMass={int(min_mass)}"
        f"_maxMass={int(max_mass)}"
        f"_AE={ae_flag}_NV={nv_flag}_DB={db_flag}"
        f"_color={sc_str}"
        f"_maxPoints={max_points}"
        f"_vTail={video_tail_min}-{video_tail_max}"
        f"_iTail={image_tail_min}-{image_tail_max}"
        f"_svTail={special_color_video_tail_min}-{special_color_video_tail_max}"
        f"_siTail={special_color_image_tail_min}-{special_color_image_tail_max}"
        f"_seed={base_seed_hex}{seed_suffix_hex}"
    )

    return file_name

def main():
    print("Starting batch runs of the Rust three-body simulator...")

    # ---------------------------
    # 1. Program path & concurrency
    # ---------------------------
    program_path = './target/release/three_body_problem'
    max_concurrent_executions = 1  # run how many tasks in parallel
    N = 2  # how many times to run each parameter combo

    # ---------------------------
    # 2. Parameter Ranges
    # ---------------------------
    # Basic
    possible_num_steps = [1_000_000]
    possible_num_sims = [100]
    possible_location = [250.0]
    possible_velocity = [0.5, 2.0, 5.0]
    possible_min_mass = [100.0]
    possible_max_mass = [300.0]

    # Flags
    possible_avoid_effects = [False]
    possible_no_video = [False]
    possible_dynamic_bounds = [False]

    # Special color
    possible_special_color = [None, "gold"]

    # Analysis
    possible_max_points = [100_000]

    # Tail length params (normal)
    possible_video_tail_min = [0.2]
    possible_video_tail_max = [2.0]
    possible_image_tail_min = [0.5]
    possible_image_tail_max = [0.5]

    # Tail length params (special color)
    possible_special_color_video_tail_min = [1.0]
    possible_special_color_video_tail_max = [1.0]
    possible_special_color_image_tail_min = [2.0]
    possible_special_color_image_tail_max = [2.0]

    all_param_lists = [
        possible_num_steps,
        possible_num_sims,
        possible_location,
        possible_velocity,
        possible_min_mass,
        possible_max_mass,
        possible_avoid_effects,
        possible_no_video,
        possible_dynamic_bounds,
        possible_special_color,
        possible_max_points,
        possible_video_tail_min,
        possible_video_tail_max,
        possible_image_tail_min,
        possible_image_tail_max,
        possible_special_color_video_tail_min,
        possible_special_color_video_tail_max,
        possible_special_color_image_tail_min,
        possible_special_color_image_tail_max
    ]

    # We'll define our base seed in hex (without "0x").
    # Ensure it's an even length in hex digits, e.g. "775580" => 6 digits.
    base_seed_hex_part = "775580"

    # ---------------------------
    # 3. Construct all parameter combos
    # ---------------------------
    combos = itertools.product(*all_param_lists)
    parameter_sets = []

    for combo in combos:
        (
            num_steps,
            num_sims,
            location,
            velocity,
            min_mass,
            max_mass,
            avoid_effects,
            no_video,
            dynamic_bounds,
            special_color,
            max_points,
            video_tail_min,
            video_tail_max,
            image_tail_min,
            image_tail_max,
            special_color_video_tail_min,
            special_color_video_tail_max,
            special_color_image_tail_min,
            special_color_image_tail_max
        ) = combo

        for i in range(N):
            # We'll use 4-hex-digit suffix to keep total length even
            seed_suffix_hex = f"{i:04X}"  
            # e.g., i=1 => '0001'; i=255 => '00FF'
            full_seed = f"0x{base_seed_hex_part}{seed_suffix_hex}"

            file_name = generate_file_name(
                num_steps, num_sims,
                location, velocity,
                min_mass, max_mass,
                avoid_effects, no_video,
                dynamic_bounds, special_color,
                max_points,
                video_tail_min, video_tail_max,
                image_tail_min, image_tail_max,
                special_color_video_tail_min, special_color_video_tail_max,
                special_color_image_tail_min, special_color_image_tail_max,
                base_seed_hex_part, seed_suffix_hex
            )

            # If the video file already exists, skip
            video_path = f'vids/{file_name}.mp4'
            if os.path.isfile(video_path):
                continue

            # Build the command list
            cmd_list = [program_path]

            cmd_list.append("--seed")
            cmd_list.append(full_seed)   # e.g. "0x7755800001"

            cmd_list.append("--file-name")
            cmd_list.append(file_name)

            cmd_list.append("--num-steps")
            cmd_list.append(str(num_steps))

            cmd_list.append("--num-sims")
            cmd_list.append(str(num_sims))

            cmd_list.append("--location")
            cmd_list.append(str(location))

            cmd_list.append("--velocity")
            cmd_list.append(str(velocity))

            cmd_list.append("--min-mass")
            cmd_list.append(str(min_mass))

            cmd_list.append("--max-mass")
            cmd_list.append(str(max_mass))

            # booleans
            if avoid_effects:
                cmd_list.append("--avoid-effects")
            if no_video:
                cmd_list.append("--no-video")
            if dynamic_bounds:
                cmd_list.append("--dynamic-bounds")

            if special_color is not None:
                cmd_list.append("--special-color")
                cmd_list.append(special_color)

            cmd_list.append("--max-points")
            cmd_list.append(str(max_points))

            cmd_list.append("--video-tail-min")
            cmd_list.append(str(video_tail_min))
            cmd_list.append("--video-tail-max")
            cmd_list.append(str(video_tail_max))

            cmd_list.append("--image-tail-min")
            cmd_list.append(str(image_tail_min))
            cmd_list.append("--image-tail-max")
            cmd_list.append(str(image_tail_max))

            cmd_list.append("--special-color-video-tail-min")
            cmd_list.append(str(special_color_video_tail_min))
            cmd_list.append("--special-color-video-tail-max")
            cmd_list.append(str(special_color_video_tail_max))

            cmd_list.append("--special-color-image-tail-min")
            cmd_list.append(str(special_color_image_tail_min))
            cmd_list.append("--special-color-image-tail-max")
            cmd_list.append(str(special_color_image_tail_max))

            parameter_sets.append(cmd_list)

    random.shuffle(parameter_sets)

    # Print how many runs total
    print(f"Total runs to execute: {len(parameter_sets)}")

    # ---------------------------
    # 4. Run them in parallel
    # ---------------------------
    with ThreadPoolExecutor(max_workers=max_concurrent_executions) as executor:
        futures = {}
        for cmd in parameter_sets:
            fut = executor.submit(run_program, cmd)
            futures[fut] = cmd

        for future in as_completed(futures):
            cmd_list = futures[future]
            shell_command, output = future.result()

            # Print the exact shell command so you can copy/paste
            print(f"Finished command:\n  {shell_command}")
            if output:
                print(f"Output:\n{output}")
            else:
                print("No output or an error occurred.")

if __name__ == "__main__":
    main()
