from concurrent.futures import ThreadPoolExecutor, as_completed
import itertools
import os
import random
import subprocess
import sys

def run_program(command):
    try:
        result = subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        sys.stderr.write(f'Error: {e}\n')
        return None

def main():
    print("starting")
    # Set the program path, N (number of times you want to run the program), and max_concurrent_executions
    program_path = './target/release/rust_3body'
    max_concurrent_executions = 6
    N = 8

    # Specify the different parameters for each execution
    const_params = []
    parameters = []

    possible_num_steps = [200000, 400000, 800000, 1600000]
    possible_locations = [50, 100, 200, 400]
    possible_velocities = [2, 4, 8, 16]
    possible_min_mass = [100, 50, 25, 10]
    possible_max_mass = [50, 100, 200, 400, 800]

    values = [possible_num_steps, possible_locations, possible_velocities, possible_min_mass, possible_max_mass]

    for num_steps, location, velocity, min_mass, max_mass in itertools.product(*values):

        for i in range(N):
            file_name = f'{num_steps:08}_{location:03}_{velocity:02}_{min_mass:03}_{max_mass:03}_0x1503{i:06}'

            if os.path.isfile(f'vids/{file_name}.mp4'):
                continue

            cur = list(const_params)
            cur.append('--seed')
            cur.append(f'0x1503{i:06}')

            cur.append('--num-steps')
            cur.append(str(num_steps))

            cur.append('--avoid-effects')

            cur.append('--location')
            cur.append(str(float(location)))

            cur.append('--velocity')
            cur.append(str(float(velocity)))

            cur.append('--min-mass')
            cur.append(str(float(min_mass)))

            cur.append('--max-mass')
            cur.append(str(float(max_mass)))

            cur.append('--file-name')
            cur.append(file_name)

            parameters.append(cur)

    random.shuffle(parameters)
    print(len(parameters))

    # Run the program N times in parallel with different parameters, limiting concurrent executions
    with ThreadPoolExecutor(max_workers=max_concurrent_executions) as executor:
        futures = {executor.submit(run_program, [program_path] + params): params for params in parameters}

        for future in as_completed(futures):
            params = futures[future]
            try:
                output = future.result()
                print(output)
            except Exception as e:
                sys.stderr.write(f'Error running program with parameters {params}: {e}\n')

if __name__ == '__main__':
    main()
