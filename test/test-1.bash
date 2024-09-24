#!/usr/bin/bash

'clear'

(
	OutcomeCode=0

	SafeTryHardhatTest() {
		if [ ${OutcomeCode} -lt 2 ]; then
			export ENABLE_HARDHAT_PREPROCESSOR="${1}"
			export ENABLE_ASSERTS="${2}"
			export ENABLE_SMTCHECKER="${3}"
			# 'npx' 'hardhat' 'compile'
			'npx' 'hardhat' 'test'

			if [ $? -ne 0 ]; then
				echo 'Error. Hardhat Test failed. We will skip any remaining tests.'
				OutcomeCode=2
			fi
		fi
	}

	if [ ${OutcomeCode} -lt 2 ]; then
		'cd' '--' '..'

		if [ $? -ne 0 ]; then
			echo 'Error 202409026.'
			OutcomeCode=2
		fi
	fi

	# Preprocessor, asserts, preprocess for SMTChecker, don't run SMTChecker.
	SafeTryHardhatTest 'true' 'true' '1'

	# Preprocessor, asserts, no SMTChecker.
	SafeTryHardhatTest 'true' 'true' '0'

	# Preprocessor, no asserts, no SMTChecker.
	# This combination of arguments generates a warning near Comment-202409025.
	SafeTryHardhatTest 'true' 'false' '0'

	# No preprocessor.
	# Comment-202408155 relates and/or applies.
	# Comment-202410099 relates and/or applies.
	SafeTryHardhatTest 'false' 'false' '0'
)
