#!/bin/bash

'/usr/bin/clear'

(
	export HARDHAT_MODE_CODE='2'

	# [Comment-202509093]
	# This is an example that shows how to execute this task.
	# [/Comment-202509093]
	'npx' 'hardhat' 'deploy-cosmic-signature-contracts' '--deployconfigfilepath' '../tasks/config/deploy-cosmic-signature-contracts-config-hardhat.json' '--network' 'localhost'

	if [ $? -ne 0 ]; then
		read '-r' '-n' '1' '-s' '-p' 'Error. The deploy-cosmic-signature-contracts task failed. Press any key to finish.'
	fi
)
