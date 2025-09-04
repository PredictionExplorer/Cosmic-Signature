#!/usr/bin/bash

'/usr/bin/clear'

(
	export HARDHAT_MODE_CODE='2'
	export ENABLE_HARDHAT_PREPROCESSOR='true'
	export ENABLE_ASSERTS='true'
	export ENABLE_SMTCHECKER='1'
	'npx' 'hardhat' 'upgrade-cosmic-signature-game' '--upgradeconfigfilepath' '../config/upgrade-cosmic-signature-game-config-arbitrumSepolia.json' '--network' 'arbitrumSepolia'
	if [ $? -ne 0 ]; then
		read '-r' '-n' '1' '-s' '-p' 'Error. The upgrade-cosmic-signature-game task failed. Press any key to finish.'
	fi
)
