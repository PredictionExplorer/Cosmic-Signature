#!/usr/bin/bash

# Comment-202511024 applies.

'/usr/bin/clear'

(
	export HARDHAT_MODE_CODE='2'
	export ENABLE_HARDHAT_PREPROCESSOR='true'
	export ENABLE_ASSERTS='true'
	export ENABLE_SMTCHECKER='1'
	'npx' 'hardhat' 'register-cosmic-signature-contracts' '--deployconfigfilepath' '../output/deploy-cosmic-signature-contracts-config-arbitrumSepolia-SelfDestructibleCosmicSignatureGame.json' '--network' 'arbitrumSepolia'
	if [ $? -ne 0 ]; then
		read '-r' '-n' '1' '-s' '-p' 'Error. The register-cosmic-signature-contracts task failed. Press any key to finish.'
	fi
)
