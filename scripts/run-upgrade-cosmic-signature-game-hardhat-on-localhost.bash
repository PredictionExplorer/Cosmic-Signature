#!/bin/bash

'/usr/bin/clear'

(
	export HARDHAT_MODE_CODE='2'
	'npx' 'hardhat' 'upgrade-cosmic-signature-game' '--deployconfigfilepath' '../tasks/config/deploy-cosmic-signature-contracts-config-hardhat.json' '--upgradeconfigfilepath' '../tasks/config/upgrade-cosmic-signature-game-config-hardhat.json' '--network' 'localhost'
	if [ $? -ne 0 ]; then
		read '-r' '-n' '1' '-s' '-p' 'Error. The upgrade-cosmic-signature-game task failed. Press any key to finish.'
	fi
)
