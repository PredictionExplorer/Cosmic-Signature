#!/bin/bash

'/usr/bin/clear'

(
	export HARDHAT_MODE_CODE='2'
	'npx' 'hardhat' 'deploy-cosmic-signature-contracts' '--deployconfigfilepath' '../tasks/config/deploy-cosmic-signature-contracts-config-hardhat.json' '--network' 'localhost'
	if [ $? -ne 0 ]; then
		read '-r' '-n' '1' '-s' '-p' 'Error. The deploy-cosmic-signature-contracts task failed. Press any key to finish.'
	fi
)
