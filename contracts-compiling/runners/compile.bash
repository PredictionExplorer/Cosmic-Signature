#!/usr/bin/bash

'/usr/bin/clear'

(
	export HARDHAT_MODE_CODE='1'
	# export ENABLE_HARDHAT_PREPROCESSOR='???'
	# export ENABLE_ASSERTS='???'
	# export ENABLE_SMTCHECKER='???'
	'npx' 'hardhat' 'compile'
	if [ $? -ne 0 ]; then
		read '-r' '-n' '1' '-s' '-p' 'Error. Hardhat Compile failed. Press any key to finish.'
	fi
)
