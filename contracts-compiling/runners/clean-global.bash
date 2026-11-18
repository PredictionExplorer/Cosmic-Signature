#!/usr/bin/bash

# '/usr/bin/clear'

(
	OutcomeCode=0
	export HARDHAT_MODE_CODE='1'
	if [ ${OutcomeCode} -lt 2 ]; then
		'npx' 'hardhat' 'clean' '--global'
		if [ $? -ne 0 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error. Hardhat Clean Global failed. Press any key to finish.'
			OutcomeCode=2
		fi
		echo 1>&2
	fi
)
