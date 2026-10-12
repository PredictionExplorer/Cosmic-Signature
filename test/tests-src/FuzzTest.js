// #region Header

// Cosmic Signature - world-class unified protocol fuzz campaign (Hardhat + Mocha + Chai).
//
// A single phased campaign:
//   1. Fuzz the V1 game for several complete rounds.
//   2. Perform the real UUPS V1 -> V2 upgrade mid-campaign, asserting full state-diff preservation,
//      V2 re-initialization, dead-selector removal, and double-initialize rejection.
//   3. Continue fuzzing the V2 game (half of the campaigns for exactly 1 round; the rest for zero,
//      2, 3, ... rounds).
//   4. Perform the real UUPS V2 -> V3 upgrade, asserting full state-diff preservation (including the
//      V2 parameters), V3 re-initialization, and double-initialize rejection. Half of the campaigns
//      then deploy a fresh `PrizesWallet` and point the game at it via `setPrizesWallet`, after draining
//      the old wallet. Assert-enabled builds bypass missing history for its first claim (Comment-202610038).
//   5. Continue fuzzing the V3 game for several more complete rounds.
//
// The campaign is model-based: a JS `GameModel` reimplements the deterministic on-chain math
// exactly (prices, the V2 square-root CST bid reward and V3 linear reward paid entirely to the outbid bidder,
// the V2 CST Dutch-auction duration drift, the V3 CST Dutch auction priced in bid CST reward units
// (Comment-202611022: decline at the reward rate, additive capped restart, premium floor, proportional raffle weight),
// the V3 late-bid price premium, mainPrize timing, champion automaton, round advancement,
// the V3 multi-NFT main prize), and `ShadowState` ledgers track every ETH/CST/NFT/donation flow.
// Every action verifies its exact event set and exact ledger deltas; negative probes assert exact
// custom errors (and, for the V3 CST probes, exact error arguments). Adversarial actors (reentrancy,
// broken charity receiver, malicious token donations, a CST deadline holder, a CST camper)
// and Arbitrum-precompile chaos are mixed in. See `test/src/fuzz/` for the engine.
//
// V3 CST bid pricing (`docs/cosmic-signature-game-cst-bid-pricing.md`) is also checked independently of the model,
// after every V3 CST bid, from chain reads and `BidPlaced` events alone (`Invariants.checkV3CstBidInvariants`):
//   I1  the next auction begins within `[2R, C]`, computed from the live parameters;
//   I2  conservation: `ShadowState` rebuilds each CST Dutch auction (`S`, `T0`, the rewards minted since `T0`)
//       from the events, and the premium-free base paid plus those rewards equals `S` up to one Wei per reward
//       while the base is positive;
//   I4  a CST bid within one increment of the previous CST bid restarts an uncapped auction strictly higher;
//   I5  a zero base buys zero raffle weight, a positive base a positive one (barring integer truncation,
//       which is counted), and every ETH bid's weight is positive.
// Corner paths (capped and uncapped restarts, zero-base bids, premiums at zero and positive bases, self-outbids,
// a round's first CST bid, bids within one increment, degenerate-multiplier rounds) are counted and reported;
// the ones the actors reach by design are coverage floors. V3 negative probes: the retired setters revert with
// `NotImplemented`; a CST bid before a round's first bid reverts with the exact token or bid-type error the
// contract order yields (Comment-202501045); `cstPriceMaxLimit_` below the exact price and
// `bidCstRewardAmountMinLimit_` above the exact reward revert with the exact arguments. A seed-picked minority of
// campaigns plays one V3 round with a degenerate `bidCstRewardAmountMultiplier` (zero, or below one million),
// set and later restored by the owner between rounds.
//
// By default (LONG_TEST_MODE_CODE is 3) this runs a 20-minute wall-clock soak: repeated independent bounded
// campaigns (fresh deploy -> V1 fuzz -> real V2 upgrade -> V2 fuzz -> real V3 upgrade -> V3 fuzz), with
// each campaign usually splitting its rounds roughly evenly across the three code versions. About half
// of campaigns upgrade to V2 immediately after round zero completes, matching the production upgrade
// timing. Actors have finite, human-like budgets (no infinite refills) and skip actions they cannot
// afford, so values stay in a realistic, non-astronomical range.
//
// The model treats unexpected uint256 wraparound inside unchecked arithmetic as a harness failure.
// The only fuzz-owned wraparound exceptions are the random seed helper and the documented V2+
// owner-adversarial round-activation path at Comment-202606235. Related PrizesWallet concern
// Comment-202606264 is covered by targeted tests/docs rather than an additional model allowlist.
// Owner parameter choices that are only possible before a bid in the current round are modeled as
// accepted misconfiguration boundaries; a malicious owner can still shorten
// `PrizesWallet.timeoutDurationToWithdrawPrizes`, which remains an accepted benevolent-owner risk.
//
// Environment (optional):
//   FUZZ_SEED=0x<hex>       fixed uint256 seed for reproducibility (a fresh random one is printed otherwise).
//   FUZZ_MAX_SECONDS=<n>    soak wall-clock budget (default 1200 = 20 min); set 0 for a single bounded campaign.
//   FUZZ_V1_ROUNDS=<n>      V1 rounds per campaign (defaults equal to V2/V3 for an even split).
//   FUZZ_V2_ROUNDS=<n>      V2 rounds per campaign (the upper bound; the V2 -> V3 upgrade timing varies per campaign).
//   FUZZ_V3_ROUNDS=<n>      V3 rounds per campaign.
//   FUZZ_ACTORS=<n>         number of participant actors.
//   LONG_TEST_MODE_CODE    Comment-202606305 applies.
//   - Quick mode: short CI profile (single quick bounded campaign).
//   - Medium mode: a larger single bounded campaign (between the quick and full soak).
//   - Full soak mode.
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
const { expect } = require("chai");
const { generateRandomUInt256 } = require("../../src/Helpers.js");
const { LONG_TEST_MODE_CODE, loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");
const { parseFuzzSeedFromEnvironment } = require("../src/fuzz/FuzzSeed.js");
const { buildProfile, readEnvOverrides, runFuzzCampaigns } = require("../src/fuzz/FuzzCampaign.js");

// #endregion
// #region

describe("FuzzTest", function () {
	it("Unified model-based campaign: fuzz V1, upgrade to V2, fuzz V2, upgrade to V3, fuzz V3, with exact invariants and negative probes", async function () {
		const fixtureContracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		// In strict mode, the cached fixture must reject additions, replacements, and deletions.
		expect(Object.isFrozen(fixtureContracts_)).equal(true);
		expect(() => { fixtureContracts_.cosmicSignatureGameV2Proxy = fixtureContracts_.cosmicSignatureGameProxy; }).to.throw(TypeError);
		expect(() => { fixtureContracts_.prizesWallet = fixtureContracts_.cosmicSignatureGameProxy; }).to.throw(TypeError);
		expect(() => { delete fixtureContracts_.prizesWallet; }).to.throw(TypeError);

		const originalContractReferences_ = { ...fixtureContracts_ };
		const seed_ = parseFuzzSeedFromEnvironment(process.env.FUZZ_SEED) ?? generateRandomUInt256();
		const profile_ = buildProfile(LONG_TEST_MODE_CODE, readEnvOverrides());
		await runFuzzCampaigns(profile_, seed_);

		// Snapshot restoration does not undo mutations of the fixture's cached JavaScript object.
		// Check added fields too, so this regression does not depend on a random wallet swap.
		expect(Object.keys(fixtureContracts_)).deep.equal(Object.keys(originalContractReferences_));
		for (const [name_, reference_] of Object.entries(originalContractReferences_)) {
			expect(fixtureContracts_[name_], `Fuzz changed fixture field ${name_}`).equal(reference_);
		}

		// Ordinary tests use both activation-time arguments; both must restore the original wallet.
		for (const roundActivationTime_ of [2n, -1_000_000_000n]) {
			const restoredContracts_ = await loadFixtureDeployContractsForTesting(roundActivationTime_);
			expect(restoredContracts_).equal(fixtureContracts_);
			expect(Object.isFrozen(restoredContracts_)).equal(true);
			expect(restoredContracts_.prizesWallet).equal(originalContractReferences_.prizesWallet);
			expect(restoredContracts_.prizesWalletAddress).equal(originalContractReferences_.prizesWalletAddress);
			expect(await restoredContracts_.cosmicSignatureGameProxy.prizesWallet()).equal(restoredContracts_.prizesWalletAddress);
			expect(await restoredContracts_.prizesWallet.mainPrizeBeneficiaryAddresses(0n)).equal(await restoredContracts_.cosmicSignatureGameProxy.lastBidderAddress());
		}
	});
});

// #endregion
