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
    max_concurrent_executions = 1
    N = 20

    # Specify the different parameters for each execution
    const_params = []
    parameters = []

    possible_num_steps = [1000000]
    possible_locations = [250]
    possible_velocities = [2]
    possible_min_mass = [100]
    possible_max_mass = [300]
    possible_special = [True, False]

    seed = '0x10' + ''.join(random.choice("0123456789abcdef") for _ in range(6))

    values = [possible_num_steps, possible_locations, possible_velocities, possible_min_mass, possible_max_mass, possible_special]

    for num_steps, location, velocity, min_mass, max_mass, special in itertools.product(*values):

        for i in range(N):
            file_name = f'{num_steps:08}_{location:03}_{velocity:02}_{min_mass:03}_{max_mass:03}_{seed}{i:06}_{"sp" if special else "nm"}'

            if os.path.isfile(f'vids/{file_name}.mp4'):
                continue

            cur = list(const_params)
            cur.append('--seed')
            cur.append(f'{seed}{i:06}')

            '''
            cur.append('--num-steps')
            cur.append(str(num_steps))


            cur.append('--location')
            cur.append(str(float(location)))

            cur.append('--velocity')
            cur.append(str(float(velocity)))

            cur.append('--min-mass')
            cur.append(str(float(min_mass)))

            cur.append('--max-mass')
            cur.append(str(float(max_mass)))

            '''

            cur.append('--avoid-effects')

            cur.append('--file-name')
            cur.append(file_name)

            cur.append('--num-sims')
            cur.append(str(1000))

            if special:
                cur.append('--special')

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
                print(params)
                print(output)
            except Exception as e:
                sys.stderr.write(f'Error running program with parameters {params}: {e}\n')

if __name__ == '__main__':
    main()
