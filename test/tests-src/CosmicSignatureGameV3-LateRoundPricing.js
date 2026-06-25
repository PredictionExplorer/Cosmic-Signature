"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	LATE_ROUND_BID_PRICE_INCREASE_DURATION,
	activateCurrentRound,
	applyLateRoundBidPriceIncrease,
	deployV1CompleteRoundZeroUpgradeToV2AndV3,
	findParsedEvent,
	getLatestBlockTimestamp,
	mineAtOrAfter,
} = require("../src/V3UpgradeTestHelpers.js");

const SECONDS_PER_DAY = 24n * 60n * 60n;

function rwPrice(baseEthPrice_) {
	return (baseEthPrice_ + 1n) / 2n;
}

async function startRoundWithFirstEthBid(game_, contracts_) {
	await activateCurrentRound(game_, contracts_.ownerSigner);
	const firstBidder_ = contracts_.signers[2];
	const firstBidPrice_ = await game_.getNextEthBidPrice();
	await waitForTransactionReceipt(game_.connect(firstBidder_).bidWithEth(-1n, "first", 0n, { value: firstBidPrice_ }));
	return { firstBidder_, firstBidPrice_ };
}

async function mineAtLateElapsed(game_, elapsedSeconds_) {
	const mainPrizeTime_ = await game_.mainPrizeTime();
	const targetTimestamp_ =
		(elapsedSeconds_ <= LATE_ROUND_BID_PRICE_INCREASE_DURATION) ?
		(mainPrizeTime_ - (LATE_ROUND_BID_PRICE_INCREASE_DURATION - elapsedSeconds_)) :
		(mainPrizeTime_ + (elapsedSeconds_ - LATE_ROUND_BID_PRICE_INCREASE_DURATION));
	await mineAtOrAfter(targetTimestamp_);
}

async function currentBaseCstBidPrice(game_, offsetSeconds_ = 0n) {
	const cstDutchAuctionDuration_ = await game_.cstDutchAuctionDuration();
	const cstDutchAuctionBeginningTimeStamp_ = await game_.cstDutchAuctionBeginningTimeStamp();
	const now_ = await getLatestBlockTimestamp();
	const elapsed_ = now_ + offsetSeconds_ - cstDutchAuctionBeginningTimeStamp_;
	const remaining_ = cstDutchAuctionDuration_ - elapsed_;
	if (remaining_ <= 0n) {
		return 0n;
	}
	const beginningPrice_ =
		(await game_.lastCstBidderAddress()) === hre.ethers.ZeroAddress ?
		await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice() :
		await game_.cstDutchAuctionBeginningBidPrice();
	return beginningPrice_ * remaining_ / cstDutchAuctionDuration_;
}

describe("CosmicSignatureGameV3-LateRoundPricing", function () {
	it("applies the 20-minute x^8 curve to ETH, ETH+RW, and nonzero CST getters", async function () {
		const contracts_ = await deployV1CompleteRoundZeroUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;

		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setCstDutchAuctionDuration(4n * SECONDS_PER_DAY));
		await startRoundWithFirstEthBid(game_, contracts_);

		const baseEthPrice_ = await game_.nextEthBidPrice();
		for (const elapsedSeconds_ of [0n, 1n, 60n, 240n, 600n, 960n, 1199n, 1200n, 1300n]) {
			await mineAtLateElapsed(game_, elapsedSeconds_);
			const clampedElapsedSeconds_ =
				elapsedSeconds_ > LATE_ROUND_BID_PRICE_INCREASE_DURATION ?
				LATE_ROUND_BID_PRICE_INCREASE_DURATION :
				elapsedSeconds_;
			const expectedEthPrice_ = applyLateRoundBidPriceIncrease(baseEthPrice_, clampedElapsedSeconds_);
			const expectedRwPrice_ = applyLateRoundBidPriceIncrease(rwPrice(baseEthPrice_), clampedElapsedSeconds_);
			const baseCstPrice_ = await currentBaseCstBidPrice(game_);
			const expectedCstPrice_ = applyLateRoundBidPriceIncrease(baseCstPrice_, clampedElapsedSeconds_);

			expect(await game_.getNextEthBidPrice(), `ETH elapsed ${elapsedSeconds_}`).equal(expectedEthPrice_);
			expect(await game_.getNextEthPlusRandomWalkNftBidPrice(), `RW elapsed ${elapsedSeconds_}`).equal(expectedRwPrice_);
			expect(await game_.getNextCstBidPrice(), `CST elapsed ${elapsedSeconds_}`).equal(expectedCstPrice_);
		}
	});

	it("threads currentTimeOffset through the late-round premium", async function () {
		const contracts_ = await deployV1CompleteRoundZeroUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await startRoundWithFirstEthBid(game_, contracts_);

		const baseEthPrice_ = await game_.nextEthBidPrice();
		await mineAtLateElapsed(game_, 0n);

		expect(await game_.getNextEthBidPriceAdvanced(0n)).equal(baseEthPrice_);
		expect(await game_.getNextEthBidPriceAdvanced(60n)).equal(applyLateRoundBidPriceIncrease(baseEthPrice_, 60n));
		expect(await game_.getNextEthPlusRandomWalkNftBidPriceAdvanced(60n)).equal(applyLateRoundBidPriceIncrease(rwPrice(baseEthPrice_), 60n));

		await mineAtLateElapsed(game_, 1n);
		expect(await game_.getNextEthBidPriceAdvanced(-1n)).equal(baseEthPrice_);
	});

	it("charges premium ETH bids but advances the stored ETH ladder from the base price", async function () {
		const contracts_ = await deployV1CompleteRoundZeroUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await startRoundWithFirstEthBid(game_, contracts_);

		const baseEthPrice_ = await game_.nextEthBidPrice();
		await mineAtLateElapsed(game_, 960n);
		let paidEthPrice_ = await game_.getNextEthBidPriceAdvanced(1n);

		await expect(game_.connect(contracts_.signers[3]).bidWithEth(-1n, "underpay", 0n, { value: paidEthPrice_ - 1n }))
			.revertedWithCustomError(game_, "InsufficientReceivedBidAmount");

		paidEthPrice_ = await game_.getNextEthBidPriceAdvanced(1n);
		const receipt_ = await waitForTransactionReceipt(
			game_.connect(contracts_.signers[3]).bidWithEth(-1n, "premium eth", 0n, { value: paidEthPrice_ })
		);
		const parsed_ = findParsedEvent(receipt_, game_, "BidPlaced");
		expect(parsed_).not.equal(undefined);
		expect(parsed_.args.paidEthPrice).equal(paidEthPrice_);
		expect(await game_.nextEthBidPrice()).equal(baseEthPrice_ + baseEthPrice_ / (await game_.ethBidPriceIncreaseDivisor()) + 1n);
	});

	it("charges premium on the rounded Random Walk NFT discounted base price", async function () {
		const contracts_ = await deployV1CompleteRoundZeroUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await startRoundWithFirstEthBid(game_, contracts_);

		const randomWalkNftMintPrice_ = await contracts_.randomWalkNft.getMintPrice();
		await waitForTransactionReceipt(contracts_.randomWalkNft.connect(contracts_.signers[4]).mint({ value: randomWalkNftMintPrice_ }));
		const randomWalkNftId_ = 0n;

		const baseEthPrice_ = await game_.nextEthBidPrice();
		await mineAtLateElapsed(game_, 960n);
		const paidRwPrice_ = await game_.getNextEthPlusRandomWalkNftBidPriceAdvanced(1n);
		expect(paidRwPrice_).equal(applyLateRoundBidPriceIncrease(rwPrice(baseEthPrice_), 961n));

		const receipt_ = await waitForTransactionReceipt(
			game_.connect(contracts_.signers[4]).bidWithEth(randomWalkNftId_, "premium rw", 0n, { value: paidRwPrice_ })
		);
		const parsed_ = findParsedEvent(receipt_, game_, "BidPlaced");
		expect(parsed_).not.equal(undefined);
		expect(parsed_.args.paidEthPrice).equal(paidRwPrice_);
		expect(parsed_.args.randomWalkNftId).equal(randomWalkNftId_);
		expect(await game_.usedRandomWalkNfts(randomWalkNftId_)).equal(1n);
	});

	it("does not revive zero CST prices in the late-round window", async function () {
		const contracts_ = await deployV1CompleteRoundZeroUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await startRoundWithFirstEthBid(game_, contracts_);

		await mineAtLateElapsed(game_, 600n);
		expect(await currentBaseCstBidPrice(game_)).equal(0n);
		expect(await game_.getNextCstBidPrice()).equal(0n);
	});

	it("enforces premium CST priceMaxLimit and records the premium paid CST amount", async function () {
		const contracts_ = await deployV1CompleteRoundZeroUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;

		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setCstDutchAuctionDuration(4n * SECONDS_PER_DAY));
		await startRoundWithFirstEthBid(game_, contracts_);

		await mineAtLateElapsed(game_, 600n);
		const ethPrice_ = await game_.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(
			game_.connect(contracts_.signers[3]).bidWithEth(-1n, "fund with cst reward", 0n, { value: ethPrice_ })
		);

		await mineAtLateElapsed(game_, 600n);
		let paidCstPrice_ = await game_.getNextCstBidPriceAdvanced(1n);
		expect(await contracts_.cosmicSignatureToken.balanceOf(contracts_.signers[3].address)).gte(paidCstPrice_);

		await expect(game_.connect(contracts_.signers[3]).bidWithCst(paidCstPrice_ - 1n, "underpay cst", 0n))
			.revertedWithCustomError(game_, "InsufficientReceivedBidAmount");

		paidCstPrice_ = await game_.getNextCstBidPriceAdvanced(1n);
		const receipt_ = await waitForTransactionReceipt(
			game_.connect(contracts_.signers[3]).bidWithCst(paidCstPrice_, "premium cst", 0n)
		);
		const parsed_ = findParsedEvent(receipt_, game_, "BidPlaced");
		expect(parsed_).not.equal(undefined);
		expect(parsed_.args.paidCstPrice).equal(paidCstPrice_);
		expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(paidCstPrice_ * 2n);
	});
});
