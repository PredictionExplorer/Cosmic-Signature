#!/usr/bin/bash

# Comment-202503282 applies.

'/usr/bin/clear'

(
	OutcomeCode=0

	SafeTryHardhatCompileForce() {
		if [ ${OutcomeCode} -lt 2 ]; then
			export ENABLE_HARDHAT_PREPROCESSOR="${1}"
			export ENABLE_ASSERTS="${2}"
			export ENABLE_SMTCHECKER="${3}"
			'npx' 'hardhat' 'compile' '--force'
			if [ $? -ne 0 ]; then
				read '-r' '-n' '1' '-s' '-p' 'Error. Hardhat Compile Force failed. We will skip any remaining compiles. Press any key to finish.'
				OutcomeCode=2
			fi
			echo 1>&2
		fi
	}

	export HARDHAT_MODE_CODE='1'

	SafeTryHardhatCompileForce 'true' 'true' '0'
	SafeTryHardhatCompileForce 'true' 'true' '1'
	SafeTryHardhatCompileForce 'true' 'false' '0'
	SafeTryHardhatCompileForce 'false' 'false' '0'
)
