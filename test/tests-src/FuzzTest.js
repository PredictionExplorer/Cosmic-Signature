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
// Environment (optional):
//   FUZZ_SEED=0x<hex>       fixed uint256 seed for reproducibility (a fresh random one is printed otherwise).
//   FUZZ_V1_ROUNDS=<n>      number of V1 rounds before the upgrade.
//   FUZZ_V2_ROUNDS=<n>      number of V2 rounds after the upgrade.
//   FUZZ_ACTORS=<n>         number of participant actors.
//   FUZZ_CHAOS=true|false   toggle Arbitrum-precompile chaos.
//   SKIP_LONG_TESTS=true    short CI profile.
//
// Recommended deep run (with Solidity asserts compiled in):
//   HARDHAT_MODE_CODE=1 ENABLE_HARDHAT_PREPROCESSOR=true ENABLE_ASSERTS=true \
//     npx hardhat test test/tests-src/FuzzTest.js

// #endregion
// #region

"use strict";

const { describe, it } = require("mocha");
const { SKIP_LONG_TESTS } = require("../../src/ContractTestingHelpers.js");
const { parseFuzzSeedFromEnvironment } = require("../src/fuzz/FuzzSeed.js");
const { runFuzzCampaigns, buildProfile, readEnvOverrides, generateRandomUInt256 } = require("../src/fuzz/FuzzCampaign.js");

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
