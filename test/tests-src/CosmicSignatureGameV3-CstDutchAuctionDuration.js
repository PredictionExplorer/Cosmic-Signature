"use strict";

// Enforces the CST Dutch auction duration invariants (Comment-202606101), which V3 must satisfy
// IDENTICALLY to V2:
//
//    1. An ETH bid -- of every flavor -- reduces the stored `cstDutchAuctionDuration` by exactly
//       `tryReduceValueExponentially(duration, cstDutchAuctionDurationChangeDivisor)` (~0.4% at the
//       default divisor of 250).
//    2. A CST bid -- of every flavor, at any price point, including the zero-price floor after an
//       arbitrarily long bid-free wait -- increases it by exactly
//       `tryIncreaseValueExponentially(duration, cstDutchAuctionDurationChangeDivisor)` (~0.4%).
//    3. Nothing else ever changes it: not the passage of time without bids (hours, days, weeks),
//       not main prize claims or round transitions, not donations or other non-bid actions,
//       and not `halveEthDutchAuctionEndingBidPrice`.
//
// The final test replays one identical relative-time scenario on a fresh V2 deployment and on a fresh
// V3 deployment and requires the two duration trajectories to match step for step.

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	INITIAL_CST_DUTCH_AUCTION_DURATION,
	DEFAULT_CST_DUTCH_AUCTION_DURATION_CHANGE_DIVISOR,
	getLatestBlockTimestamp,
	setNextBlockTimeToAtLeast,
	mineAtOrAfter,
	activateCurrentRound,
	completeRoundZero,
	deployV1CompleteRoundZeroAndUpgradeToV2,
	upgradeToV2,
	findParsedEvent,
} = require("../src/V2UpgradeTestHelpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");
const {
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
	upgradeToV3,
	findTimeStampWithAffordableCstBidPrice,
	tryIncreaseValueExponentially,
	tryReduceValueExponentially,
} = require("../src/V3UpgradeTestHelpers.js");

// #region Helpers.

/**
Reads the stored `cstDutchAuctionDuration` and asserts that the `getCstDutchAuctionDurations` view
reports exactly it (the view is the stored variable, like in V2; a divergence here was the V3 bug).
@returns {Promise<bigint>}
*/
async function readCstDutchAuctionDuration(game_) {
	const storedDuration_ = await game_.cstDutchAuctionDuration();
	const [reportedDuration_,] = await game_.getCstDutchAuctionDurations();
	expect(reportedDuration_, "getCstDutchAuctionDurations()[0] must equal the stored cstDutchAuctionDuration")
		.equal(storedDuration_);
	return storedDuration_;
}

/** Asserts that the receipt's `BidPlaced` event reports the given post-bid duration in its 8th field. */
function expectBidPlacedDuration(game_, transactionReceipt_, expectedDuration_) {
	const bidPlaced_ = findParsedEvent(transactionReceipt_, game_, "BidPlaced");
	expect(bidPlaced_, "BidPlaced event not found").not.equal(undefined);
	expect(bidPlaced_.args.cstDutchAuctionDuration, "BidPlaced.cstDutchAuctionDuration").equal(expectedDuration_);
}

/**
Asserts that the given transaction receipt's bid reduced the duration by exactly the ETH bid formula.
@returns {Promise<bigint>} The new duration.
*/
async function expectEthBidReducedDuration(game_, transactionReceipt_, durationBefore_, label_) {
	const expectedDuration_ = tryReduceValueExponentially(durationBefore_, DEFAULT_CST_DUTCH_AUCTION_DURATION_CHANGE_DIVISOR);
	const durationAfter_ = await readCstDutchAuctionDuration(game_);
	expect(durationAfter_, `${label_}: an ETH bid must reduce the duration by exactly ~0.4%`).equal(expectedDuration_);
	expect(durationAfter_, `${label_}: an ETH bid must strictly reduce the duration`).lessThan(durationBefore_);
	expectBidPlacedDuration(game_, transactionReceipt_, expectedDuration_);
	return durationAfter_;
}

/**
Asserts that the given transaction receipt's bid increased the duration by exactly the CST bid formula.
@returns {Promise<bigint>} The new duration.
*/
async function expectCstBidIncreasedDuration(game_, transactionReceipt_, durationBefore_, label_) {
	const expectedDuration_ = tryIncreaseValueExponentially(durationBefore_, DEFAULT_CST_DUTCH_AUCTION_DURATION_CHANGE_DIVISOR);
	const durationAfter_ = await readCstDutchAuctionDuration(game_);
	expect(durationAfter_, `${label_}: a CST bid must increase the duration by exactly ~0.4%`).equal(expectedDuration_);
	expect(durationAfter_, `${label_}: a CST bid must strictly increase the duration`).greaterThan(durationBefore_);
	expectBidPlacedDuration(game_, transactionReceipt_, expectedDuration_);
	return durationAfter_;
}

/** Warps past the whole CST Dutch auction, so the next CST bid price is zero (the price floor). */
async function warpPastCstDutchAuctionEnd(game_, extraDuration_ = 3_600n) {
	const cstDutchAuctionEndTimeStamp_ =
		(await game_.cstDutchAuctionBeginningTimeStamp()) + (await game_.getCstDutchAuctionDurations())[0];
	await mineAtOrAfter(cstDutchAuctionEndTimeStamp_ + extraDuration_);
	expect(await game_.getNextCstBidPrice(), "the CST bid price must have declined to zero").equal(0n);
}

/** Deploys the mock donation tokens and grants the PrizesWallet allowances, for the donation bid flavors. */
async function deployMockDonationTokensFor(contracts_, donorSigner_) {
	const mockErc20Factory_ = await hre.ethers.getContractFactory("FuzzTestMockErc20", donorSigner_);
	const mockErc20_ = await mockErc20Factory_.deploy();
	await mockErc20_.waitForDeployment();
	await waitForTransactionReceipt(mockErc20_.connect(donorSigner_).mint(donorSigner_.address, 10n ** 21n));
	await waitForTransactionReceipt(mockErc20_.connect(donorSigner_).approve(contracts_.prizesWalletAddress, 10n ** 21n));

	const mockErc721Factory_ = await hre.ethers.getContractFactory("FuzzTestMockErc721", donorSigner_);
	const mockErc721_ = await mockErc721Factory_.deploy();
	await mockErc721_.waitForDeployment();
	const mockNftId_ = await mockErc721_.connect(donorSigner_).mint.staticCall(donorSigner_.address);
	await waitForTransactionReceipt(mockErc721_.connect(donorSigner_).mint(donorSigner_.address));
	await waitForTransactionReceipt(mockErc721_.connect(donorSigner_).setApprovalForAll(contracts_.prizesWalletAddress, true));

	return { mockErc20_, mockErc721_, mockNftId_, };
}

// #endregion

describe("CosmicSignatureGameV3-CstDutchAuctionDuration", function () {
	// #region Invariant 1: ETH bids.

	it("every ETH bid flavor reduces the stored duration by exactly the V2 formula", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const [bidder1_, bidder2_, donor_,] = contracts_.signers.slice(1, 4);
		const { mockErc20_, mockErc721_, mockNftId_, } = await deployMockDonationTokensFor(contracts_, donor_);
		await waitForTransactionReceipt(
			contracts_.randomWalkNft.connect(bidder2_).mint({value: await contracts_.randomWalkNft.getMintPrice(),})
		);
		const randomWalkNftId_ = (await contracts_.randomWalkNft.totalSupply()) - 1n;
		await activateCurrentRound(game_, contracts_.ownerSigner);

		let duration_ = await readCstDutchAuctionDuration(game_);
		expect(duration_, "the V2 initialization value must have carried over").equal(INITIAL_CST_DUTCH_AUCTION_DURATION);

		// The first bid of the round (plain ETH) reduces the duration too, exactly like in V2.
		{
			const transactionReceipt_ =
				await waitForTransactionReceipt(game_.connect(bidder1_).bidWithEth(-1n, "", 0n, {value: 10n ** 18n,}));
			duration_ = await expectEthBidReducedDuration(game_, transactionReceipt_, duration_, "first ETH bid");
		}

		// A plain-ETH-transfer bid (the `receive` function).
		{
			const transactionResponse_ = await bidder2_.sendTransaction({to: contracts_.cosmicSignatureGameProxyAddress, value: 10n ** 18n,});
			const transactionReceipt_ = await transactionResponse_.wait();
			duration_ = await expectEthBidReducedDuration(game_, transactionReceipt_, duration_, "receive() ETH bid");
		}

		// An ETH + Random Walk NFT bid.
		{
			const transactionReceipt_ =
				await waitForTransactionReceipt(game_.connect(bidder2_).bidWithEth(randomWalkNftId_, "", 0n, {value: 10n ** 18n,}));
			duration_ = await expectEthBidReducedDuration(game_, transactionReceipt_, duration_, "ETH + Random Walk NFT bid");
		}

		// The bid-with-donation combinations.
		{
			const transactionReceipt_ = await waitForTransactionReceipt(
				game_.connect(donor_).bidWithEthAndDonateToken(-1n, "", 0n, mockErc20_, 1_000n, {value: 10n ** 18n,})
			);
			duration_ = await expectEthBidReducedDuration(game_, transactionReceipt_, duration_, "ETH bid + token donation");
		}
		{
			const transactionReceipt_ = await waitForTransactionReceipt(
				game_.connect(donor_).bidWithEthAndDonateNft(-1n, "", 0n, mockErc721_, mockNftId_, {value: 10n ** 18n,})
			);
			duration_ = await expectEthBidReducedDuration(game_, transactionReceipt_, duration_, "ETH bid + NFT donation");
		}

		// A long streak of plain ETH bids: the exact exponential-reduction sequence, never anything else.
		for ( let bidIndex_ = 0; bidIndex_ < 40; ++ bidIndex_ ) {
			const bidder_ = (bidIndex_ % 2 === 0) ? bidder1_ : bidder2_;
			const bidPrice_ = await game_.getNextEthBidPriceAdvanced(1n);
			const transactionReceipt_ =
				await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "", 0n, {value: bidPrice_,}));
			duration_ = await expectEthBidReducedDuration(game_, transactionReceipt_, duration_, `ETH bid streak #${bidIndex_}`);
		}
	});

	// #endregion
	// #region Invariant 2: CST bids.

	it("every CST bid flavor increases the stored duration by exactly the V2 formula, even at the zero-price floor", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const [bidder1_, bidder2_,] = contracts_.signers.slice(1, 3);
		const { mockErc20_, mockErc721_, mockNftId_, } = await deployMockDonationTokensFor(contracts_, bidder2_);
		await activateCurrentRound(game_, contracts_.ownerSigner);

		// Open the round and let `bidder1_` accumulate a bid CST reward (minted to it when it is outbid).
		await waitForTransactionReceipt(game_.connect(bidder1_).bidWithEth(-1n, "", 0n, {value: 10n ** 18n,}));
		await mineAtOrAfter((await getLatestBlockTimestamp()) + 2n * 3_600n);
		await waitForTransactionReceipt(
			game_.connect(bidder2_).bidWithEth(-1n, "", 0n, {value: await game_.getNextEthBidPriceAdvanced(1n),})
		);

		let duration_ = await readCstDutchAuctionDuration(game_);

		// A CST bid at a NONZERO price, paid from the accumulated reward.
		{
			const bidder1CstBalance_ = await contracts_.cosmicSignatureToken.balanceOf(bidder1_.address);
			expect(bidder1CstBalance_).greaterThan(0n);
			const { timeStamp: bidTimeStamp_, price: bidPrice_, } =
				await findTimeStampWithAffordableCstBidPrice(game_, bidder1CstBalance_, (await getLatestBlockTimestamp()) + 2n, true);
			expect(bidPrice_).greaterThan(0n);
			await setNextBlockTimeToAtLeast(bidTimeStamp_);
			const transactionReceipt_ = await waitForTransactionReceipt(game_.connect(bidder1_).bidWithCst(bidPrice_, "", 0n));
			duration_ = await expectCstBidIncreasedDuration(game_, transactionReceipt_, duration_, "nonzero-price CST bid");
		}

		// THE REGRESSION CASE (the reported V3 bug): players wait for a long time with no bids of any kind.
		// The duration must not move during the wait, and the eventual CST bid -- at the zero-price floor,
		// with the auction long over -- must increase the duration by exactly ~0.4%.
		// Under the reverted V3 design, this bid collapsed a multi-hour auction to about a minute
		// (the beginning price reset to 2x the decayed price, clamped at the 1 CST minimum).
		{
			const durationBeforeWait_ = duration_;
			await warpPastCstDutchAuctionEnd(game_, 10n * 86_400n);
			expect(await readCstDutchAuctionDuration(game_), "a 10-day bid-free wait must not move the duration")
				.equal(durationBeforeWait_);

			const transactionReceipt_ = await waitForTransactionReceipt(game_.connect(bidder2_).bidWithCst(1n << 255n, "", 0n));
			const bidPlaced_ = findParsedEvent(transactionReceipt_, game_, "BidPlaced");
			expect(bidPlaced_.args.paidCstPrice, "the price must have declined to the zero floor").equal(0n);
			duration_ = await expectCstBidIncreasedDuration(game_, transactionReceipt_, duration_, "zero-price-floor CST bid");

			// The beginning price clamps at the minimum; the duration is nonetheless governed only by the drift formula.
			expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(await game_.cstDutchAuctionBeginningBidPriceMinLimit());
		}

		// The CST-bid-with-donation combinations, at the zero-price floor.
		{
			await warpPastCstDutchAuctionEnd(game_);
			const transactionReceipt_ = await waitForTransactionReceipt(
				game_.connect(bidder2_).bidWithCstAndDonateToken(1n << 255n, "", 0n, mockErc20_, 1_000n)
			);
			duration_ = await expectCstBidIncreasedDuration(game_, transactionReceipt_, duration_, "CST bid + token donation");
		}
		{
			await warpPastCstDutchAuctionEnd(game_);
			const transactionReceipt_ = await waitForTransactionReceipt(
				game_.connect(bidder2_).bidWithCstAndDonateNft(1n << 255n, "", 0n, mockErc721_, mockNftId_)
			);
			duration_ = await expectCstBidIncreasedDuration(game_, transactionReceipt_, duration_, "CST bid + NFT donation");
		}

		// Losslessness (Comment-202606059): an ETH bid followed by a CST bid restores the exact duration,
		// and so does a CST bid followed by an ETH bid.
		{
			const durationBeforeRoundTrip1_ = duration_;
			await waitForTransactionReceipt(
				game_.connect(bidder1_).bidWithEth(-1n, "", 0n, {value: await game_.getNextEthBidPriceAdvanced(1n),})
			);
			await warpPastCstDutchAuctionEnd(game_);
			await waitForTransactionReceipt(game_.connect(bidder2_).bidWithCst(1n << 255n, "", 0n));
			duration_ = await readCstDutchAuctionDuration(game_);
			expect(duration_, "ETH bid + CST bid must restore the exact duration").equal(durationBeforeRoundTrip1_);

			const durationBeforeRoundTrip2_ = duration_;
			await warpPastCstDutchAuctionEnd(game_);
			await waitForTransactionReceipt(game_.connect(bidder1_).bidWithCst(1n << 255n, "", 0n));
			await waitForTransactionReceipt(
				game_.connect(bidder2_).bidWithEth(-1n, "", 0n, {value: await game_.getNextEthBidPriceAdvanced(1n),})
			);
			duration_ = await readCstDutchAuctionDuration(game_);
			expect(duration_, "CST bid + ETH bid must restore the exact duration").equal(durationBeforeRoundTrip2_);
		}
	});

	// #endregion
	// #region Invariant 3: nothing else.

	it("nothing but bids ever changes the duration: waits, claims, round transitions, and non-bid actions leave it untouched", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const [bidder1_, bidder2_,] = contracts_.signers.slice(1, 3);
		await activateCurrentRound(game_, contracts_.ownerSigner);

		let duration_ = await readCstDutchAuctionDuration(game_);
		expect(duration_).equal(INITIAL_CST_DUTCH_AUCTION_DURATION);

		// Waiting -- for hours, days, weeks -- with no bids of any kind must not move the duration,
		// while the reported elapsed duration advances by exactly the wait.
		for (const waitDuration_ of [3_600n, 86_400n, 7n * 86_400n, 30n * 86_400n,]) {
			const [, elapsedBefore_,] = await game_.getCstDutchAuctionDurations();
			const timeStampBefore_ = await getLatestBlockTimestamp();
			await mineAtOrAfter(timeStampBefore_ + waitDuration_);
			const [durationAfter_, elapsedAfter_,] = await game_.getCstDutchAuctionDurations();
			expect(durationAfter_, `a ${waitDuration_}-second bid-free wait must not move the duration`).equal(duration_);
			expect(elapsedAfter_ - elapsedBefore_, "the elapsed duration must advance by exactly the wait")
				.equal((await getLatestBlockTimestamp()) - timeStampBefore_);
			expect(await game_.cstDutchAuctionDuration()).equal(duration_);
		}

		// Non-bid transactions must not move it either.
		await waitForTransactionReceipt(game_.connect(bidder1_).donateEth({value: 10n ** 17n,}));
		expect(await readCstDutchAuctionDuration(game_), "donateEth must not move the duration").equal(duration_);
		await waitForTransactionReceipt(game_.connect(bidder1_).donateEthWithInfo("{}", {value: 10n ** 16n,}));
		expect(await readCstDutchAuctionDuration(game_), "donateEthWithInfo must not move the duration").equal(duration_);
		await waitForTransactionReceipt(
			contracts_.randomWalkNft.connect(bidder1_).mint({value: await contracts_.randomWalkNft.getMintPrice(),})
		);
		expect(await readCstDutchAuctionDuration(game_), "a Random Walk NFT mint must not move the duration").equal(duration_);

		// `halveEthDutchAuctionEndingBidPrice` (the round has no bids and the ETH auction has fully elapsed
		// after the 30-day warp above) reconfigures the ETH auction only.
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).halveEthDutchAuctionEndingBidPrice());
		expect(await readCstDutchAuctionDuration(game_), "halveEthDutchAuctionEndingBidPrice must not move the duration")
			.equal(duration_);

		// Sanity: after all of the above, the round's first bid is still the FIRST thing that moves the duration.
		await waitForTransactionReceipt(game_.connect(bidder1_).bidWithEth(-1n, "", 0n, {value: 10n ** 18n,}));
		duration_ = await readCstDutchAuctionDuration(game_);
		expect(duration_).equal(tryReduceValueExponentially(INITIAL_CST_DUTCH_AUCTION_DURATION, DEFAULT_CST_DUTCH_AUCTION_DURATION_CHANGE_DIVISOR));

		// A second bidder, so the round has a proper winner and the claim path is exercised fully.
		await waitForTransactionReceipt(
			game_.connect(bidder2_).bidWithEth(-1n, "", 0n, {value: await game_.getNextEthBidPriceAdvanced(1n),})
		);
		duration_ = await readCstDutchAuctionDuration(game_);

		// Claiming the main prize (and the round transition it performs) must not move the duration.
		// Under the reverted V3 design, the claim instantly changed the reported duration,
		// because zeroing `lastCstBidderAddress` switched the derived formula's beginning price.
		await setNextBlockTimeToAtLeast(await game_.mainPrizeTime());
		await waitForTransactionReceipt(game_.connect(bidder2_).claimMainPrize());
		expect(await readCstDutchAuctionDuration(game_), "claimMainPrize must not move the duration").equal(duration_);

		// Neither must the idle inactive gap after the claim, re-activation, nor further bid-free waiting.
		await mineAtOrAfter((await getLatestBlockTimestamp()) + 3n * 86_400n);
		expect(await readCstDutchAuctionDuration(game_), "the post-claim idle gap must not move the duration").equal(duration_);
		await activateCurrentRound(game_, contracts_.ownerSigner);
		expect(await readCstDutchAuctionDuration(game_), "re-activating the round must not move the duration").equal(duration_);
		await mineAtOrAfter((await getLatestBlockTimestamp()) + 86_400n);
		expect(await readCstDutchAuctionDuration(game_), "waiting in the new round must not move the duration").equal(duration_);

		// The next round's first bid applies exactly one more ~0.4% reduction -- nothing accumulated meanwhile.
		await waitForTransactionReceipt(game_.connect(bidder1_).bidWithEth(-1n, "", 0n, {value: 10n ** 18n,}));
		expect(await readCstDutchAuctionDuration(game_))
			.equal(tryReduceValueExponentially(duration_, DEFAULT_CST_DUTCH_AUCTION_DURATION_CHANGE_DIVISOR));
	});

	// #endregion
	// #region The V2 differential replay.

	it("an identical scenario produces an identical duration trajectory on V2 and on V3", async function () {
		// The duration drift depends only on the SEQUENCE of bids (never on timestamps or prices),
		// so one relative-time schedule replayed on both versions must produce identical trajectories.
		// CST bids are scheduled after a fixed 50-hour wait, which is beyond the auction end on both
		// versions, so they are free (a zero price) and affordable regardless of the version-specific
		// CST reward mechanics.
		const scenarioSteps_ = [
			{kind: "ethBid", bidderIndex: 1, waitDuration: 0n,},
			{kind: "ethBid", bidderIndex: 2, waitDuration: 3_600n,},
			{kind: "ethBid", bidderIndex: 1, waitDuration: 7_200n,},
			{kind: "cstBid", bidderIndex: 2, waitDuration: 50n * 3_600n,},
			{kind: "ethBid", bidderIndex: 1, waitDuration: 600n,},
			{kind: "cstBid", bidderIndex: 1, waitDuration: 50n * 3_600n,},
			{kind: "wait", waitDuration: 5n * 86_400n,},
			{kind: "claim", bidderIndex: 1,},
			{kind: "wait", waitDuration: 2n * 86_400n,},
			{kind: "activateAndEthBid", bidderIndex: 2,},
		];

		const runScenario_ = async (game_, contracts_) => {
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const durationTrajectory_ = [(await readCstDutchAuctionDuration(game_)).toString(),];
			for (const step_ of scenarioSteps_) {
				const bidder_ = (step_.bidderIndex === undefined) ? undefined : contracts_.signers[step_.bidderIndex];
				switch (step_.kind) {
					case "ethBid": {
						if (step_.waitDuration > 0n) {
							await mineAtOrAfter((await getLatestBlockTimestamp()) + step_.waitDuration);
						}
						await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "", 0n, {value: 10n ** 18n,}));
						break;
					}
					case "cstBid": {
						await mineAtOrAfter((await getLatestBlockTimestamp()) + step_.waitDuration);
						expect(await game_.getNextCstBidPrice(), "the scheduled CST bid was expected to be free").equal(0n);
						await waitForTransactionReceipt(game_.connect(bidder_).bidWithCst(1n << 255n, "", 0n));
						break;
					}
					case "wait": {
						await mineAtOrAfter((await getLatestBlockTimestamp()) + step_.waitDuration);
						break;
					}
					case "claim": {
						await setNextBlockTimeToAtLeast(await game_.mainPrizeTime());
						await waitForTransactionReceipt(game_.connect(bidder_).claimMainPrize());
						break;
					}
					case "activateAndEthBid": {
						await activateCurrentRound(game_, contracts_.ownerSigner);
						await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "", 0n, {value: 10n ** 18n,}));
						break;
					}
					default: {
						throw new Error(`Unknown scenario step kind: ${step_.kind}.`);
					}
				}
				durationTrajectory_.push((await readCstDutchAuctionDuration(game_)).toString());
			}
			return durationTrajectory_;
		};

		// The V2 leg. (`loadFixtureDeployContractsForTesting` snapshots the V1 deployment,
		// so the V3 leg below starts from a clean chain.)
		const v2Contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(2n);
		const v2DurationTrajectory_ = await runScenario_(v2Contracts_.cosmicSignatureGameV2Proxy, v2Contracts_);

		// The V3 leg.
		const v3Contracts_ = await loadFixtureDeployContractsForTesting(2n);
		await completeRoundZero(v3Contracts_);
		await upgradeToV2(v3Contracts_);
		await upgradeToV3(v3Contracts_);
		const v3DurationTrajectory_ = await runScenario_(v3Contracts_.cosmicSignatureGameV3Proxy, v3Contracts_);

		expect(v2DurationTrajectory_[0]).equal(INITIAL_CST_DUTCH_AUCTION_DURATION.toString());
		expect(v3DurationTrajectory_, "the V3 duration trajectory must be identical to the V2 one, step for step")
			.deep.equal(v2DurationTrajectory_);
	});

	// #endregion
});
