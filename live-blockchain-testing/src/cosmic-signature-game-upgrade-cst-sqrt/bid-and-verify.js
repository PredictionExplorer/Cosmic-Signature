"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../../src/Helpers.js");

function sqrtBigInt(value_) {
	if (value_ < 2n) {
		return value_;
	}
	let x0_ = value_;
	let x1_ = (value_ >> 1n) + 1n;
	while (x1_ < x0_) {
		x0_ = x1_;
		x1_ = (x1_ + value_ / x1_) >> 1n;
	}
	return x0_;
}

function expectedCstBidRewardAmount(elapsedSeconds_) {
	return sqrtBigInt(3n * elapsedSeconds_ * 10n ** 36n);
}

async function main() {
	const proxyAddress_ = process.env.COSMIC_SIGNATURE_GAME_PROXY_ADDRESS;
	if (proxyAddress_ == undefined || proxyAddress_.length <= 0) {
		throw new Error("COSMIC_SIGNATURE_GAME_PROXY_ADDRESS is required.");
	}
	const privateKey_ = process.env.PRIVKEY;
	if (privateKey_ == undefined || privateKey_.length <= 0) {
		throw new Error("PRIVKEY is required.");
	}

	const bidderSigner_ = new hre.ethers.Wallet(privateKey_, hre.ethers.provider);
	const cosmicSignatureGameProxy_ = await hre.ethers.getContractAt("CosmicSignatureGameV2", proxyAddress_, bidderSigner_);
	const tokenAddress_ = await cosmicSignatureGameProxy_.token({blockTag: "pending",});
	const cosmicSignatureToken_ = await hre.ethers.getContractAt("CosmicSignatureToken", tokenAddress_, bidderSigner_);
	const lastBidderAddress_ = await cosmicSignatureGameProxy_.lastBidderAddress({blockTag: "pending",});

	let expectedRewardAmount_;
	if (lastBidderAddress_ == hre.ethers.ZeroAddress) {
		expectedRewardAmount_ = 0n;
	} else {
		const roundNum_ = await cosmicSignatureGameProxy_.roundNum({blockTag: "pending",});
		const bidderInfo_ = await cosmicSignatureGameProxy_.biddersInfo(roundNum_, lastBidderAddress_, {blockTag: "pending",});
		const lastBidTimeStamp_ = bidderInfo_.lastBidTimeStamp ?? bidderInfo_[2];
		const pendingBlock_ = await hre.ethers.provider.getBlock("pending");
		const elapsedSeconds_ = BigInt(pendingBlock_.timestamp) - lastBidTimeStamp_;
		expectedRewardAmount_ = expectedCstBidRewardAmount(elapsedSeconds_);
	}

	const balanceBefore_ = await cosmicSignatureToken_.balanceOf(bidderSigner_.address, {blockTag: "pending",});
	const ethBidPrice_ = await cosmicSignatureGameProxy_.getNextEthBidPrice({blockTag: "pending",});
	console.info("%s", `Submitting ETH bid with price ${ethBidPrice_}. Expected CST reward: ${expectedRewardAmount_}.`);
	const receipt_ =
		await waitForTransactionReceipt(
			cosmicSignatureGameProxy_.bidWithEth(-1n, "cst-sqrt-emission-rehearsal", {value: ethBidPrice_,})
		);
	const balanceAfter_ = await cosmicSignatureToken_.balanceOf(bidderSigner_.address);
	const actualRewardAmount_ = balanceAfter_ - balanceBefore_;

	expect(actualRewardAmount_).equal(expectedRewardAmount_);
	const rewardEventTopic_ = cosmicSignatureGameProxy_.interface.getEvent("CstBidRewardMinted").topicHash;
	const rewardLog_ = receipt_.logs.find((log_) => log_.topics[0] == rewardEventTopic_);
	expect(rewardLog_).not.equal(undefined);
	const parsedRewardLog_ = cosmicSignatureGameProxy_.interface.parseLog(rewardLog_);
	expect(parsedRewardLog_.args.bidderAddress).equal(bidderSigner_.address);
	expect(parsedRewardLog_.args.amount).equal(expectedRewardAmount_);

	console.info("%s", `Verified CST reward: ${actualRewardAmount_}.`);
}

main()
	.catch((errorObject_) => {
		console.error("%o", errorObject_);
		process.exitCode = 1;
	});
