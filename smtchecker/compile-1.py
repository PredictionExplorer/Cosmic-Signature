import os
import subprocess
import datetime
import time

def run_command(command):
    try:
        subprocess.run(command, check = True, shell = True)
        return True
    except subprocess.CalledProcessError:
        return False

def main():
    # Generate unique ID
    unique_id_number = datetime.datetime.now().strftime('%Y%m%d%H%M%S')

    # Change directory
    try:
        os.chdir('..')
    except OSError:
        print('Error 202409019.')
        return 2

    # Set environment variables
    os.environ['HARDHAT_MODE_CODE'] = '1'
    os.environ['ENABLE_HARDHAT_PREPROCESSOR'] = 'true'
    os.environ['ENABLE_ASSERTS'] = 'true'
    os.environ['ENABLE_SMTCHECKER'] = '2'

    # Run Hardhat clean commands
    # Comment-202409012 applies.
    # Slither executes the cleans in this order. We do the same.
    if not run_command('npx hardhat clean && npx hardhat clean --global'):
        print('Error 202409015.')
        return 2

    # [Comment-202409014]
    # This folder name exists in multiple places.
    # [/Comment-202409014]
    smt_checker_output_folder_name = 'smtchecker/compile-1-output'

    # Create output directory
    os.makedirs(smt_checker_output_folder_name, exist_ok = True)

    output_file_name = f"{smt_checker_output_folder_name}/{unique_id_number}.txt"

    # Run Hardhat compile
    start_time = time.time()
    result = run_command(f'npx hardhat compile --force >> "{output_file_name}" 2>&1')
    end_time = time.time()

    print(f"Compilation took {end_time - start_time:.2f} seconds")

    if not result:
        print('Error. Hardhat Compile failed.')
        return 2

    return 0

if __name__ == "__main__":
    exit_code = main()
    exit(exit_code)
