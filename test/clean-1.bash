#!/usr/bin/bash

# [Comment-202503282]
# This code is similar to "test-1.bash".
# Comments there apply.
# [/Comment-202503282]

# '/usr/bin/clear'

(
	OutcomeCode=0

	SafeTryHardhatClean() {
		if [ ${OutcomeCode} -lt 2 ]; then
			export ENABLE_HARDHAT_PREPROCESSOR="${1}"
			export ENABLE_ASSERTS="${2}"
			export ENABLE_SMTCHECKER="${3}"
			'npx' 'hardhat' 'clean'
			if [ $? -ne 0 ]; then
				read '-r' '-n' '1' '-s' '-p' 'Error. Hardhat Clean failed. We will skip any remaining cleans. Press any key to finish.'
				OutcomeCode=2
			fi
			echo
		fi
	}

# todo-0 Delete this.
	# if [ ${OutcomeCode} -lt 2 ]; then
	# 	cd '--' '..'
	# 	if [ $? -ne 0 ]; then
	# 		read '-r' '-n' '1' '-s' '-p' 'Error 202503273. Press any key to finish.'
	# 		OutcomeCode=2
	# 	fi
	# fi

	export HARDHAT_MODE_CODE='1'

	SafeTryHardhatClean 'true' 'true' '0'
	SafeTryHardhatClean 'true' 'true' '1'
	SafeTryHardhatClean 'true' 'false' '0'
	SafeTryHardhatClean 'false' 'false' '0'
)
