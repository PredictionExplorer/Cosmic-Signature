import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

def run_program(command):
    try:
        result = subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        sys.stderr.write(f'Error: {e}\n')
        return None

def main():
    # Set the program path, N (number of times you want to run the program), and max_concurrent_executions
    program_path = './target/release/rust_3body'
    max_concurrent_executions = 4
    N = 200

    # Specify the different parameters for each execution
    const_params = []
    parameters = []
    for i in range(N):
        cur = list(const_params)
        cur.append('--seed')
        cur.append(f'0x1500{i:06}')
        cur.append('--file-name')
        cur.append(f'0x1500{i:06}')
        parameters.append(cur)

    # Run the program N times in parallel with different parameters, limiting concurrent executions
    with ThreadPoolExecutor(max_workers=max_concurrent_executions) as executor:
        futures = {executor.submit(run_program, [program_path] + params): params for params in parameters}

        for future in as_completed(futures):
            params = futures[future]
            try:
                output = future.result()
                print(f'Result with parameters {params}: {output}')
            except Exception as e:
                sys.stderr.write(f'Error running program with parameters {params}: {e}\n')

if __name__ == '__main__':
    main()
