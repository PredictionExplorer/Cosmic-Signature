#!/usr/bin/bash

# [Comment-202503282]
# This script uses the same build configurations as `${workspaceFolder}/test/runners/test.bash`.
# Comments there apply.
# [/Comment-202503282]

# '/usr/bin/clear'

(
	OutcomeCode=0

	SafeTryHardhatClean() {
		if [ ${OutcomeCode} -lt 2 ]; then
			export ENABLE_HARDHAT_PREPROCESSOR="${2}"
			export ENABLE_ASSERTS="${3}"
			export ENABLE_SMTCHECKER="${4}"
			'npx' 'hardhat' 'clean'
			if [ $? -ne 0 ]; then
				if [[ "${1}" == '-b' ]] ; then
					printf '%s' 'Error. Hardhat Clean failed. We will skip any remaining cleans.' 1>&2
				else
					read '-r' '-n' '1' '-s' '-p' 'Error. Hardhat Clean failed. We will skip any remaining cleans. Press any key to finish.'
				fi
				OutcomeCode=2
			fi
			echo 1>&2
		fi
	}

	export HARDHAT_MODE_CODE='1'

	SafeTryHardhatClean "${1}" 'true' 'true' '0'
	SafeTryHardhatClean "${1}" 'true' 'true' '1'
	SafeTryHardhatClean "${1}" 'true' 'false' '0'
	SafeTryHardhatClean "${1}" 'false' 'false' '0'

	exit "${OutcomeCode}"
)
