#!/usr/bin/bash

'/usr/bin/clear'

(
	export HARDHAT_MODE_CODE='2'
	'npx' 'hardhat' 'upgrade-cosmic-signature-game' '--upgradeconfigfilepath' '../config/upgrade-cosmic-signature-game-config-arbitrumOne.json' '--network' 'arbitrumOne'
	if [ $? -ne 0 ]; then
		read '-r' '-n' '1' '-s' '-p' 'Error. The upgrade-cosmic-signature-game task failed. Press any key to finish.'
	fi
)
