#!/usr/bin/bash

# Comment-202503282 relates.

'/usr/bin/clear'

(
	OutcomeCode=0

	# export FORCE_COLOR='0'
	# export NO_COLOR=''

	# todo-0 Comment this out.
	# export SKIP_LONG_TESTS='true'

	SafeTryHardhatTest() {
		if [ ${OutcomeCode} -lt 2 ]; then
			export ENABLE_HARDHAT_PREPROCESSOR="${1}"
			export ENABLE_ASSERTS="${2}"
			export ENABLE_SMTCHECKER="${3}"

			# todo-0 Uncomment the command line with no arguments.
			# 'npx' 'hardhat' 'test' '--grep' '^StakingWalletCosmicSignatureNft '
			'npx' 'hardhat' 'test' '--grep' '^StakingWalletCosmicSignatureNft The stakeMany and unstakeMany methods$'
			# 'npx' 'hardhat' 'test' '--grep' '(?<!\bLong-term aggressive bidding behaves correctly)$'
			# 'npx' 'hardhat' 'test' '--grep' '^PrizesWallet-\d |^StakingWalletCosmicSignatureNft |^CharityWallet |^SystemManagement |^BidStatistics |^Bidding |^MainPrize |^CosmicSignatureGame-\d |^BidderContract |^BlockTimeStamps '
			# 'npx' 'hardhat' 'test' '--grep' '^[^ ]+(?<!-Old) '
			# 'npx' 'hardhat' 'test'

			if [ $? -ne 0 ]; then
				read '-r' '-n' '1' '-s' '-p' 'Error. Hardhat Test failed. We will skip any remaining tests. Press any key to finish.'
				OutcomeCode=2
			fi
		fi
	}

	if [ ${OutcomeCode} -lt 2 ]; then
		cd '--' '..'
		if [ $? -ne 0 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error 202409026. Press any key to finish.'
			OutcomeCode=2
		fi
	fi

	# Preprocessor, asserts, no SMTChecker.
	# Running in this mode first because we enable Hardhat console in this mode.
	SafeTryHardhatTest 'true' 'true' '0'

	# Preprocessor, asserts, preprocess for SMTChecker, don't run SMTChecker.
	SafeTryHardhatTest 'true' 'true' '1'

	# Preprocessor, no asserts, no SMTChecker.
	# This combination of arguments generates a warning near Comment-202409025.
	SafeTryHardhatTest 'true' 'false' '0'

	# No preprocessor.
	# Comment-202408155 relates and/or applies.
	# Comment-202410099 relates and/or applies.
	SafeTryHardhatTest 'false' 'false' '0'
)
