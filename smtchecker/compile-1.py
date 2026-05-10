import os
import subprocess
import datetime
import time
import sys
import threading

def run_command(command, output_file_name = None, timeout = None):
    try:
        if output_file_name is None:
            subprocess.run(command, check = True, shell = True, timeout = timeout)
        else:
            with open(output_file_name, "a", encoding = "utf8") as output_file:
                process = subprocess.Popen(command, shell = True, stdout = subprocess.PIPE, stderr = subprocess.STDOUT, text = True)
                def forward_output():
                    assert process.stdout is not None
                    for line in iter(process.stdout.readline, ""):
                        print(line, end = "")
                        output_file.write(line)
                        output_file.flush()
                output_thread = threading.Thread(target = forward_output)
                output_thread.start()
                try:
                    return_code = process.wait(timeout = timeout)
                except subprocess.TimeoutExpired:
                    process.kill()
                    output_thread.join(timeout = 5)
                    output_file.write(f"\nTimed out after {timeout} seconds.\n")
                    print(f"\nTimed out after {timeout} seconds.")
                    return False
                output_thread.join(timeout = 5)
                if return_code != 0:
                    return False
        return True
    except subprocess.CalledProcessError:
        return False
    except subprocess.TimeoutExpired:
        print(f"Timed out after {timeout} seconds.")
        return False

def set_default_environment_variable(name, value):
    if len(os.environ.get(name, "")) <= 0:
        os.environ[name] = value

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
    set_default_environment_variable('HARDHAT_MODE_CODE', '1')
    set_default_environment_variable('ENABLE_HARDHAT_PREPROCESSOR', 'true')
    set_default_environment_variable('ENABLE_ASSERTS', 'true')
    set_default_environment_variable('ENABLE_SMTCHECKER', '2')
    set_default_environment_variable('SMTCHECKER_TIMEOUT_MS', str(5 * 60 * 1000))
    set_default_environment_variable('SMTCHECKER_ENGINE', 'bmc')

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
    output_file = open(output_file_name, "w", encoding = "utf8")
    output_file.write("SMTChecker environment:\n")
    for name in [
        "HARDHAT_MODE_CODE",
        "ENABLE_HARDHAT_PREPROCESSOR",
        "ENABLE_ASSERTS",
        "ENABLE_SMTCHECKER",
        "SMTCHECKER_CONTRACTS",
        "SMTCHECKER_ENGINE",
        "SMTCHECKER_TIMEOUT_MS",
        "SMTCHECKER_SHOW_PROVED",
    ]:
        output_file.write(f"{name}={os.environ.get(name, '')}\n")
        print(f"{name}={os.environ.get(name, '')}")
    output_file.write("\n")
    output_file.close()

    direct_solc_file_name = os.environ.get('SMTCHECKER_DIRECT_SOLC_FILE', '')
    direct_solc_contract_name = os.environ.get('SMTCHECKER_DIRECT_SOLC_CONTRACT', '')

    # Run SMTChecker
    start_time = time.time()
    timeout_seconds = max(1, int(os.environ['SMTCHECKER_TIMEOUT_MS']) // 1000 + 60)
    if len(direct_solc_file_name) > 0:
        if len(direct_solc_contract_name) <= 0:
            print('Error. SMTCHECKER_DIRECT_SOLC_CONTRACT is required when SMTCHECKER_DIRECT_SOLC_FILE is provided.')
            return 2
        command = (
            'solc '
            f'--model-checker-engine "{os.environ["SMTCHECKER_ENGINE"]}" '
            f'--model-checker-contracts "{direct_solc_file_name}:{direct_solc_contract_name}" '
            '--model-checker-targets assert,overflow,underflow,divByZero '
            f'--model-checker-timeout "{os.environ["SMTCHECKER_TIMEOUT_MS"]}" '
            '--base-path . --include-path node_modules --allow-paths . --evm-version osaka '
            f'"{direct_solc_file_name}"'
        )
    else:
        command = 'npx hardhat compile --force'
    result = run_command(command, output_file_name, timeout_seconds)
    end_time = time.time()

    print(f"Compilation took {end_time - start_time:.2f} seconds")

    if not result:
        print('Error. Hardhat Compile failed.')
        return 2

    return 0

if __name__ == "__main__":
    exit_code = main()
    exit(exit_code)
