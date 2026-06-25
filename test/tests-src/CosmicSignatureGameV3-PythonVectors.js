"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const path = require("path");
const { execFileSync } = require("child_process");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	LATE_ROUND_BID_PRICE_INCREASE_DURATION,
	activateCurrentRound,
	deployV1CompleteRoundZeroUpgradeToV2AndV3,
	getLatestBlockTimestamp,
	mineAtOrAfter,
} = require("../src/V3UpgradeTestHelpers.js");

const SECONDS_PER_DAY = 24n * 60n * 60n;

function formatTokenAmount(amount_) {
	return hre.ethers.formatUnits(amount_, 18);
}

function pythonVector(normalEthPriceWei_, normalCstPrice_, elapsedSeconds_) {
	const output_ = execFileSync(
		"python3",
		[
			path.join("simulation", "late_round_bid_price_curve.py"),
			"--json", "-",
			"--normal-eth-price", formatTokenAmount(normalEthPriceWei_),
			"--normal-cst-price", formatTokenAmount(normalCstPrice_),
			"--sample-seconds", elapsedSeconds_.toString(),
		],
		{
			cwd: path.join(__dirname, "..", ".."),
			encoding: "utf8",
		}
	);
	const payload_ = JSON.parse(output_);
	const sample_ = payload_.samples.find((item_) => BigInt(item_.elapsed_seconds) === elapsedSeconds_);
	expect(sample_, `Python sample ${elapsedSeconds_}`).not.equal(undefined);
	return sample_;
}

async function startRoundWithFirstEthBid(game_, contracts_) {
	await activateCurrentRound(game_, contracts_.ownerSigner);
	const firstBidder_ = contracts_.signers[2];
	const firstBidPrice_ = await game_.getNextEthBidPrice();
	await waitForTransactionReceipt(game_.connect(firstBidder_).bidWithEth(-1n, "first", 0n, { value: firstBidPrice_ }));
}

async function mineAtLateElapsed(game_, elapsedSeconds_) {
	const mainPrizeTime_ = await game_.mainPrizeTime();
	const targetTimestamp_ =
		(elapsedSeconds_ <= LATE_ROUND_BID_PRICE_INCREASE_DURATION) ?
		(mainPrizeTime_ - (LATE_ROUND_BID_PRICE_INCREASE_DURATION - elapsedSeconds_)) :
		(mainPrizeTime_ + (elapsedSeconds_ - LATE_ROUND_BID_PRICE_INCREASE_DURATION));
	await mineAtOrAfter(targetTimestamp_);
}

async function currentBaseCstBidPrice(game_) {
	const cstDutchAuctionDuration_ = await game_.cstDutchAuctionDuration();
	const cstDutchAuctionBeginningTimeStamp_ = await game_.cstDutchAuctionBeginningTimeStamp();
	const now_ = await getLatestBlockTimestamp();
	const elapsed_ = now_ - cstDutchAuctionBeginningTimeStamp_;
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

describe("CosmicSignatureGameV3-PythonVectors", function () {
	it("matches the Python curve reference for ETH, ETH+RW, and CST payable prices", async function () {
		const contracts_ = await deployV1CompleteRoundZeroUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;

		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setCstDutchAuctionDuration(4n * SECONDS_PER_DAY));
		await startRoundWithFirstEthBid(game_, contracts_);

		const baseEthPrice_ = await game_.nextEthBidPrice();
		for (const elapsedSeconds_ of [0n, 1n, 60n, 240n, 600n, 960n, 1199n, 1200n, 1300n]) {
			await mineAtLateElapsed(game_, elapsedSeconds_);
			const baseCstPrice_ = await currentBaseCstBidPrice(game_);
			const sample_ = pythonVector(baseEthPrice_, baseCstPrice_, elapsedSeconds_);

			expect(await game_.getNextEthBidPrice(), `ETH ${elapsedSeconds_}`).equal(BigInt(sample_.eth_bid_price_wei));
			expect(await game_.getNextEthPlusRandomWalkNftBidPrice(), `ETH+RW ${elapsedSeconds_}`).equal(BigInt(sample_.eth_plus_random_walk_bid_price_wei));
			expect(await game_.getNextCstBidPrice(), `CST ${elapsedSeconds_}`).equal(BigInt(sample_.cst_bid_price_base_units));
		}
	});
});
