#!/usr/bin/bash

'/usr/bin/clear'

(
	export HARDHAT_MODE_CODE='2'
	'npx' 'hardhat' 'register-cosmic-signature-contracts' '--deployconfigfilepath' '../tasks/config/deploy-cosmic-signature-contracts-config-arbitrumOne.json' '--network' 'arbitrumOne'
	if [ $? -ne 0 ]; then
		read '-r' '-n' '1' '-s' '-p' 'Error. The register-cosmic-signature-contracts task failed. Press any key to finish.'
	fi
)
