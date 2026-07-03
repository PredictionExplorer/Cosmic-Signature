#!/usr/bin/bash

'/usr/bin/clear'

(
	OutcomeCode=0
	export HARDHAT_MODE_CODE='2'
	# export ENABLE_HARDHAT_PREPROCESSOR='true'
	# export ENABLE_ASSERTS='true'
	# export ENABLE_SMTCHECKER='1'

	# [Comment-202607131]
	# For production deployments, ensuring that Hardhat will not forget to compile any recent contract refactorings
	# and that Hardhat global cache is not corrupt.
	# [/Comment-202607131]
	if [ ${OutcomeCode} -lt 2 ]; then
		'npx' 'hardhat' 'clean'
		if [ $? -ne 0 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error. Hardhat Clean failed. Press any key to finish.'
			OutcomeCode=2
		fi
		echo
	fi
	if [ ${OutcomeCode} -lt 2 ]; then
		'npx' 'hardhat' 'clean' '--global'
		if [ $? -ne 0 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error. Hardhat Clean Global failed. Press any key to finish.'
			OutcomeCode=2
		fi
		echo
	fi

	if [ ${OutcomeCode} -lt 2 ]; then
		'npx' 'hardhat' 'deploy-cosmic-signature-contracts' '--deployconfigfilepath' '../config/deploy-cosmic-signature-contracts-config-arbitrumOne.json' '--network' 'arbitrumOne'
		if [ $? -ne 0 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error. The deploy-cosmic-signature-contracts task failed. Press any key to finish.'
			OutcomeCode=2
		fi
		echo
	fi
)
