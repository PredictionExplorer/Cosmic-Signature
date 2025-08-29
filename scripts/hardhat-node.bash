#!/usr/bin/bash

'/usr/bin/clear'

(
	OutcomeCode=0

	if [ ${OutcomeCode} -lt 2 ]; then
		export HARDHAT_MODE_CODE='2'
		# 'npx' 'hardhat' 'node' '--verbose'
		'npx' 'hardhat' 'node'
		if [ $? -ne 0 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error. "hardhat node" failed. Press any key to finish.'
			OutcomeCode=2
		fi
	fi
)
