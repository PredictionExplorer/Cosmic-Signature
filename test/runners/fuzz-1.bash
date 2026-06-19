#!/usr/bin/bash

# Runs the unified Cosmic Signature fuzz campaign (`test/tests-src/FuzzTest.js`)
# in several configurations. See the header of that file for the env knobs.
#
# Usage:
#   ./fuzz-1.bash               # one production-like run + two assert-enabled runs
#                               # (each is the default 20-minute soak of repeated V1->V2 campaigns)
#   FUZZ_SEED=0x... ./fuzz-1.bash
#   FUZZ_MAX_SECONDS=300 ./fuzz-1.bash   # shorter soak
#   FUZZ_MULTI=8 ./fuzz-1.bash  # additional N soak runs with random seeds
#   LONG_TEST_MODE_CODE=1 ./fuzz-1.bash   # quick CI profile (single bounded campaign)

'/usr/bin/clear'

(
	OutcomeCode=0

	RunFuzz() {
		# $1 = ENABLE_HARDHAT_PREPROCESSOR, $2 = ENABLE_ASSERTS, $3 = ENABLE_SMTCHECKER, $4 = label
		if [ ${OutcomeCode} -lt 2 ]; then
			echo ""
			echo "=================================================================="
			echo "  FUZZ RUN: ${4}"
			echo "=================================================================="
			export ENABLE_HARDHAT_PREPROCESSOR="${1}"
			export ENABLE_ASSERTS="${2}"
			export ENABLE_SMTCHECKER="${3}"
			'npx' 'hardhat' 'test' 'test/tests-src/FuzzTest.js'
			if [ $? -ne 0 ]; then
				read '-r' '-n' '1' '-s' '-p' "Error. Fuzz run \"${4}\" failed. Press any key to finish."
				OutcomeCode=2
			fi
		fi
	}

	if [ ${OutcomeCode} -lt 2 ]; then
		cd '--' '../..'
		if [ $? -ne 0 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error. Could not cd to the project root. Press any key to finish.'
			OutcomeCode=2
		fi
	fi

	if [ ${OutcomeCode} -lt 2 ]; then
		# export HACK_SUPPORT_BIGINT_TOJSON='true'
		export HARDHAT_MODE_CODE='1'
	fi

	# Production-like build (no preprocessor, no asserts) - closest to mainnet bytecode.
	RunFuzz 'false' 'false' '0' 'production-like'

	# Assert-enabled build - compiles in the Solidity `assert`-only internal consistency checks
	# and the `initializeV2` round-0 / prev-version guards.
	RunFuzz 'true' 'true' '0' 'asserts-enabled'

	RunFuzz 'true' 'true' '1' 'asserts-and-preprocessing-for-SMTChecker-enabled'

	# Optional multi-seed soak (production-like) for deeper coverage.
	if [ ${OutcomeCode} -lt 2 ] && [ -n "${FUZZ_MULTI}" ]; then
		export ENABLE_HARDHAT_PREPROCESSOR='false'
		export ENABLE_ASSERTS='false'
		export ENABLE_SMTCHECKER='0'
		unset FUZZ_SEED
		Index=0
		while [ ${Index} -lt ${FUZZ_MULTI} ] && [ ${OutcomeCode} -lt 2 ]; do
			Index=$((Index + 1))
			echo ""
			echo "=================================================================="
			echo "  FUZZ SOAK RUN ${Index}/${FUZZ_MULTI} (random seed)"
			echo "=================================================================="
			'npx' 'hardhat' 'test' 'test/tests-src/FuzzTest.js'
			if [ $? -ne 0 ]; then
				read '-r' '-n' '1' '-s' '-p' "Error. Fuzz soak run ${Index} failed (see the printed FUZZ_SEED to reproduce). Press any key to finish."
				OutcomeCode=2
			fi
		done
	fi

	if [ ${OutcomeCode} -lt 2 ]; then
		echo ""
		echo "All fuzz runs passed."
	fi
)
