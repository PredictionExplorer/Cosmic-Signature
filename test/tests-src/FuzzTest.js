// #region Header

// todo-ai-1 Add type annotations for each variable, parameter, function return value, etc.
// todo-ai-1 An annotation is unnecessary if the type can anyway be inferred.
// todo-ai-1 For example, in this eample the `@returns` annotation is unnecessary.
// todo-ai-1 /**
// todo-ai-1 @param {number} a
// todo-ai-1 @param {number} b
// todo-ai-1 */
// todo-ai-1 function add(a, b) {
// todo-ai-1   return a + b;
// todo-ai-1 }

// Cosmic Signature - world-class unified protocol fuzz campaign (Hardhat + Mocha + Chai).
//
// A single phased campaign:
//   1. Fuzz the V1 game for several complete rounds.
//   2. Perform the real UUPS V1 -> V2 upgrade mid-campaign, asserting full state-diff preservation,
//      V2 re-initialization, dead-selector removal, and double-initialize rejection.
//   3. Continue fuzzing the V2 game for several more complete rounds.
//
// The campaign is model-based: a JS `GameModel` reimplements the deterministic on-chain math
// exactly (prices, sqrt CST reward, CST Dutch-auction duration drift, mainPrize timing, champion
// automaton, round advancement), and `ShadowState` ledgers track every ETH/CST/NFT/donation flow.
// Every action verifies its exact event set and exact ledger deltas; negative probes assert exact
// custom errors. Adversarial actors (reentrancy, broken charity receiver, malicious token donations)
// and Arbitrum-precompile chaos are mixed in. See `test/src/fuzz/` for the engine.
//
// By default (no SKIP_LONG_TESTS) this runs a 20-minute wall-clock soak: repeated independent bounded
// campaigns (fresh deploy -> V1 fuzz -> real V2 upgrade -> V2 fuzz), with each campaign split ~50/50
// between V1 and V2 rounds. Actors have finite, human-like budgets (no infinite refills) and skip
// actions they cannot afford, so values stay in a realistic, non-astronomical range. The model is
// EVM-exact, including uint256 wraparound in the contracts' `unchecked` price/reward math.
// todo-ai-1 In almost all cases, if a wrap-around occurs within an `unchecked` block, it would indicate an error or a bug
// todo-ai-1 and therefoire should trigger a test failure.
// todo-ai-1 One exception is a random number seed increment.
// todo-ai-1 Another exception: wrap-arounds near Comment-202606235 and Comment-202606264 are theoretically possible and intentional behavior.
// todo-ai-1 They can be caused only by an adversarial action done by the contract owner.
// todo-ai-1 It's also possible to cause overflows and other incorrect behaviors by setting params of contracts to specific values,
// todo-ai-1 and we are OK with that if it's impossible to do it after a bid has been placed in the curent round.
// todo-ai-1 One known issue is that it's possible to set `PrizesWallet.timeoutDurationToWithdrawPrizes` to a bad value,
// todo-ai-1 not necessarily one that will overflow, after a bid has been placed in the curent round.
//
// todo-ai-1 In the production, the V1 -> V2 upgrade is to happen after round zero completes. That exact case needs testing too.
// todo-ai-1 So maybe with a 50% chance upgrade after one V1 round completes.
//
// The campaign also performs the V1 -> V2 upgrade for ~half of its campaigns and the alternate
// V1 -> OpenBid upgrade for the other half (the soak alternates by parity; a single campaign chooses
// by seeded probability or `FUZZ_UPGRADE_TARGET`).
//
// Environment (optional):
//   FUZZ_SEED=0x<hex>       fixed uint256 seed for reproducibility (a fresh random one is printed otherwise).
//   FUZZ_MAX_SECONDS=<n>    soak wall-clock budget (default 1200 = 20 min); set 0 for a single bounded campaign.
//   FUZZ_V1_ROUNDS=<n>      V1 rounds per campaign (defaults equal to V2 for a 50/50 split).
//   FUZZ_V2_ROUNDS=<n>      V2 / OpenBid rounds per campaign.
//   FUZZ_ACTORS=<n>         number of participant actors.
//   FUZZ_CHAOS=true|false   toggle Arbitrum-precompile chaos.
// todo-ai-1 Arbitrum-precompile chaos tests are disabled by default, right?
// todo-ai-1 I would enable them by default. The Arbitrum precompile calls should fail occasionally, based on a random number.
// todo-ai-1 Maybe it's better to simplify the logic by eliminating the evaluation of the `FUZZ_CHAOS` environment variable.
//   FUZZ_OPENBID=true       force every campaign to upgrade V1 -> OpenBid (instead of V1 -> V2).
//   FUZZ_OPENBID_PERCENT=<n> per-campaign probability of the OpenBid upgrade target (single-campaign mode).
//   FUZZ_UPGRADE_TARGET=v2|openBid  force a specific upgrade target (used by the repro hint).
//   FUZZ_OVERFLOW=true      drive the ETH price into the high / unchecked-wraparound regime.
// todo-ai-1 The logic depending on `FUZZ_OVERFLOW` should run occasionally, based on a random number.
// todo-ai-1 The `FUZZ_OVERFLOW` environment variable is not needed.
// todo-ai-1 When the user runs the test, all modes should get a chance to get executed.
// todo-ai-1 In other words, code coverage for the test code should have a high chance to be 100%
// todo-ai-1 if the user supplies no environment variables.
//   FUZZ_PROFILE=medium     a larger single bounded campaign (between SKIP_LONG_TESTS and the full soak).
//   SKIP_LONG_TESTS=true    short CI profile (single quick bounded campaign).
//
// Recommended deep run (with Solidity asserts compiled in):
//   HARDHAT_MODE_CODE=1 ENABLE_HARDHAT_PREPROCESSOR=true ENABLE_ASSERTS=true \
//     npx hardhat test test/tests-src/FuzzTest.js
//
// Reproducibility caveat: a printed `FUZZ_SEED` reproduces a failure ONLY when the BUILD FLAGS match
// the original run (HARDHAT_MODE_CODE, ENABLE_HARDHAT_PREPROCESSOR, ENABLE_ASSERTS, ENABLE_SMTCHECKER),
// because they change the compiled bytecode (e.g. assert-enabled paths) and thus gas, and they may
// alter revert kinds (panic vs custom error). The active flags and the exact reproduction command
// (including `FUZZ_UPGRADE_TARGET`) are printed at the start of and on failure of each campaign.

// #endregion
// #region

"use strict";

const { describe, it } = require("mocha");
const { SKIP_LONG_TESTS } = require("../../src/ContractTestingHelpers.js");
const { parseFuzzSeedFromEnvironment } = require("../src/fuzz/FuzzSeed.js");
const { generateRandomUInt256, readEnvOverrides, buildProfile, runFuzzCampaigns } = require("../src/fuzz/FuzzCampaign.js");

// #endregion
// #region

describe("FuzzTest", function () {
	it("Unified model-based campaign: fuzz V1, upgrade to V2, fuzz V2, with exact invariants and negative probes", async function () {
		const seed_ = parseFuzzSeedFromEnvironment(process.env.FUZZ_SEED) ?? generateRandomUInt256();
		const profile_ = buildProfile(SKIP_LONG_TESTS, readEnvOverrides());
		await runFuzzCampaigns(profile_, seed_);
	});
});

// #endregion
