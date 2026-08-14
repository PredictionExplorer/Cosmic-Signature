#!/usr/bin/bash

# Comment-202608128 applies.
# This rehearses the CosmicSignatureGame V2 -> V3 upgrade on an in-process fork of Arbitrum One.
# It only reads from the fork RPC; it never sends live transactions and needs no private keys.

'/usr/bin/clear'

(
	export HARDHAT_MODE_CODE='1'
	export FORK_RPC_URL='https://arb1.arbitrum.io/rpc'
	# export FORK_BLOCK_NUMBER=''
	# export COSMIC_SIGNATURE_GAME_PROXY_ADDRESS='0x6a714Ae7B5b6eA520F6BCA23d2E609C4Fd5863F2'

	'npx' 'hardhat' 'run' '../src/fork-rehearse-cosmic-signature-game-v3-upgrade.js'
	if [ $? -ne 0 ]; then
		read '-r' '-n' '1' '-s' '-p' 'Error. The fork upgrade rehearsal failed. Press any key to finish.'
	fi
	echo
)
