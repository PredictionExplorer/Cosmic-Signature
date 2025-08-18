#!/bin/bash

'/usr/bin/clear'

(
	export HARDHAT_MODE_CODE='2'
	'npx' 'hardhat' 'register-upgraded-cosmic-signature-game' '--upgradeconfigfilepath' '../tasks/config/upgrade-cosmic-signature-game-config-arbitrumOne.json' '--network' 'arbitrumOne'
	if [ $? -ne 0 ]; then
		read '-r' '-n' '1' '-s' '-p' 'Error. The register-upgraded-cosmic-signature-game task failed. Press any key to finish.'
	fi
)
