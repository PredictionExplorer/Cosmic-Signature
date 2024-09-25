import os
import subprocess
import datetime
import time

def run_command(command):
    try:
        subprocess.run(command, check=True, shell=True)
        return True
    except subprocess.CalledProcessError:
        return False

def main():
    outcome_code = 0

    # Generate unique ID
    unique_id_number = datetime.datetime.now().strftime('%Y%m%d%H%M%S')

    # Change directory
    try:
        os.chdir('..')
    except OSError:
        print('Error 202409019.')
        return 2

    # Set environment variables
    os.environ['ENABLE_HARDHAT_PREPROCESSOR'] = 'true'
    os.environ['ENABLE_ASSERTS'] = 'true'
    os.environ['ENABLE_SMTCHECKER'] = '2'

    # Run Hardhat clean commands
    if not run_command('npx hardhat clean && npx hardhat clean --global'):
        print('Error 202409015.')
        return 2

    # Create output directory
    smt_checker_output_folder = 'smtchecker/compile-1-output'
    os.makedirs(smt_checker_output_folder, exist_ok=True)

    # Run Hardhat compile
    output_file = f"{smt_checker_output_folder}/{unique_id_number}.txt"
    start_time = time.time()
    result = run_command(f'npx hardhat compile --force > "{output_file}" 2>&1')
    end_time = time.time()

    print(f"Compilation took {end_time - start_time:.2f} seconds")

    if not result:
        print('Error. Hardhat Compile failed.')
        return 2

    return 0

if __name__ == "__main__":
    exit_code = main()
    exit(exit_code)
