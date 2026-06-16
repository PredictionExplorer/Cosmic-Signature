// #region Header

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
// campaigns (fresh deploy -> V1 fuzz -> real V2 upgrade -> V2 fuzz), with each campaign usually split
// ~50/50 between V1 and V2 rounds. About half of campaigns upgrade immediately after round zero
// completes, matching the intended production upgrade timing. Actors have finite, human-like budgets
// (no infinite refills) and skip actions they cannot afford, so values stay in a realistic,
// non-astronomical range.
//
// The model treats unexpected uint256 wraparound inside unchecked arithmetic as a harness failure.
// Explicit exceptions are the random seed helper and documented owner-adversarial paths such as
// Comment-202606235 and Comment-202606264. Owner parameter choices that are only possible before a bid
// in the current round are modeled as accepted misconfiguration boundaries; a malicious owner can still
// shorten `PrizesWallet.timeoutDurationToWithdrawPrizes`, which remains an accepted benevolent-owner risk.
// todo-ai-1 So wrap-arounds near Comment-202606235 and Comment-202606264 and when incrementing a random number seed
// todo-ai-1 are to be ignored by the test. There are no other wrap-arounds that should be ignored, right?
//
// Environment (optional):
//   FUZZ_SEED=0x<hex>       fixed uint256 seed for reproducibility (a fresh random one is printed otherwise).
//   FUZZ_MAX_SECONDS=<n>    soak wall-clock budget (default 1200 = 20 min); set 0 for a single bounded campaign.
//   FUZZ_V1_ROUNDS=<n>      V1 rounds per campaign (defaults equal to V2 for a 50/50 split).
//   FUZZ_V2_ROUNDS=<n>      V2 rounds per campaign.
//   FUZZ_ACTORS=<n>         number of participant actors.
//   FUZZ_PROFILE=medium     a larger single bounded campaign (between SKIP_LONG_TESTS and the full soak).
//   SKIP_LONG_TESTS=true    short CI profile (single quick bounded campaign).
//
// Chaos and overflow-targeting modes are derived from the campaign seed with profile-specific
// probabilities. A default multi-campaign run therefore has a high chance to exercise those paths
// without additional environment variables.
//
// Recommended deep run (with Solidity asserts compiled in):
//   HARDHAT_MODE_CODE=1 ENABLE_HARDHAT_PREPROCESSOR=true ENABLE_ASSERTS=true \
//     npx hardhat test test/tests-src/FuzzTest.js
//
// Reproducibility caveat: a printed `FUZZ_SEED` reproduces a failure ONLY when the BUILD FLAGS match
// the original run (HARDHAT_MODE_CODE, ENABLE_HARDHAT_PREPROCESSOR, ENABLE_ASSERTS, ENABLE_SMTCHECKER),
// because they change the compiled bytecode (e.g. assert-enabled paths) and thus gas, and they may
// alter revert kinds (panic vs custom error). The active flags and the exact reproduction command
// are printed at the start of and on failure of each campaign.

// #endregion
// #region

"use strict";

const { describe, it } = require("mocha");
const { generateRandomUInt256 } = require("../../src/Helpers.js");
const { SKIP_LONG_TESTS } = require("../../src/ContractTestingHelpers.js");
const { parseFuzzSeedFromEnvironment } = require("../src/fuzz/FuzzSeed.js");
const { readEnvOverrides, buildProfile, runFuzzCampaigns } = require("../src/fuzz/FuzzCampaign.js");

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
