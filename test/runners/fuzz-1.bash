#!/usr/bin/bash

# Runs the unified Cosmic Signature fuzz campaign (`test/tests-src/FuzzTest.js`)
# in several configurations. See the header of that file for the env knobs.
#
# Usage:
#   ./fuzz-1.bash               # one production-like run + one assert-enabled run (default seeds)
#   FUZZ_SEED=0x... ./fuzz-1.bash
#   FUZZ_MULTI=8 ./fuzz-1.bash  # additional N production-like runs with random seeds (long soak)
#   SKIP_LONG_TESTS=true ./fuzz-1.bash   # quick CI profile

'/usr/bin/clear' 2>/dev/null || true

(
	OutcomeCode=0

	RunFuzz() {
		# $1 = ENABLE_HARDHAT_PREPROCESSOR, $2 = ENABLE_ASSERTS, $3 = label
		if [ ${OutcomeCode} -lt 2 ]; then
			echo ""
			echo "=================================================================="
			echo "  FUZZ RUN: ${3}"
			echo "=================================================================="
			export ENABLE_HARDHAT_PREPROCESSOR="${1}"
			export ENABLE_ASSERTS="${2}"
			export ENABLE_SMTCHECKER='0'
			export HARDHAT_MODE_CODE='1'
			'npx' 'hardhat' 'test' 'test/tests-src/FuzzTest.js'
			if [ $? -ne 0 ]; then
				echo "Error. Fuzz run '${3}' failed."
				OutcomeCode=2
			fi
		fi
	}

	if [ ${OutcomeCode} -lt 2 ]; then
		cd '--' '../..'
		if [ $? -ne 0 ]; then
			echo 'Error. Could not cd to the project root.'
			OutcomeCode=2
		fi
	fi

	# Production-like build (no preprocessor, no asserts) - closest to mainnet bytecode.
	RunFuzz 'false' 'false' 'production-like'

	# Assert-enabled build - compiles in the Solidity `assert`-only internal consistency checks
	# and the `initializeV2` round-0 / prev-version guards.
	RunFuzz 'true' 'true' 'asserts-enabled'

	# Optional multi-seed soak (production-like) for deeper coverage.
	if [ ${OutcomeCode} -lt 2 ] && [ -n "${FUZZ_MULTI}" ]; then
		export ENABLE_HARDHAT_PREPROCESSOR='false'
		export ENABLE_ASSERTS='false'
		export ENABLE_SMTCHECKER='0'
		export HARDHAT_MODE_CODE='1'
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
				echo "Error. Fuzz soak run ${Index} failed (see the printed FUZZ_SEED to reproduce)."
				OutcomeCode=2
			fi
		done
	fi

	if [ ${OutcomeCode} -lt 2 ]; then
		echo ""
		echo "All fuzz runs passed."
	fi
)
