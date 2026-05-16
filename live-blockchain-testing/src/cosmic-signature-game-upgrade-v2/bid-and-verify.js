"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { sleepForMilliSeconds, waitForTransactionReceipt } = require("../../../src/Helpers.js");
const { computeBidCstRewardAmount } = require("../../../src/BidCstRewardHelpers.js");

async function makeNextBlockTimeDeterministic(currentSecondRemainingDurationMinLimitInMilliSeconds_ = 300) {
	const currentSecondRemainingDurationInMilliSeconds_ = 1000 - Date.now() % 1000;
	if (currentSecondRemainingDurationInMilliSeconds_ < currentSecondRemainingDurationMinLimitInMilliSeconds_) {
		await sleepForMilliSeconds(currentSecondRemainingDurationInMilliSeconds_ + 1);
	}
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

	await makeNextBlockTimeDeterministic();
	const expectedRewardAmount_ = await cosmicSignatureGameProxy_.getBidCstRewardAmountAdvanced(1n, {blockTag: "pending",});
	if (lastBidderAddress_ != hre.ethers.ZeroAddress) {
		const roundNum_ = await cosmicSignatureGameProxy_.roundNum({blockTag: "pending",});
		const bidderInfo_ = await cosmicSignatureGameProxy_.biddersInfo(roundNum_, lastBidderAddress_, {blockTag: "pending",});
		const lastBidTimeStamp_ = bidderInfo_.lastBidTimeStamp ?? bidderInfo_[2];
		const pendingBlock_ = await hre.ethers.provider.getBlock("pending");
		const elapsedDurationInSeconds_ = BigInt(pendingBlock_.timestamp) + 1n - lastBidTimeStamp_;
		expect(expectedRewardAmount_).equal(computeBidCstRewardAmount(elapsedDurationInSeconds_, await cosmicSignatureGameProxy_.cstRewardAmountForBidding({blockTag: "pending",})));
	}

	const balanceBefore_ = await cosmicSignatureToken_.balanceOf(bidderSigner_.address, {blockTag: "pending",});
	const ethBidPrice_ = await cosmicSignatureGameProxy_.getNextEthBidPrice({blockTag: "pending",});
	console.info("%s", `Submitting ETH bid with price ${ethBidPrice_}. Expected CST reward: ${expectedRewardAmount_}.`);
	await makeNextBlockTimeDeterministic();
	const receipt_ =
		await waitForTransactionReceipt(
			cosmicSignatureGameProxy_.bidWithEth(-1n, "cosmic-signature-game-v2-rehearsal", expectedRewardAmount_, {value: ethBidPrice_,})
		);
	const balanceAfter_ = await cosmicSignatureToken_.balanceOf(bidderSigner_.address);
	const actualRewardAmount_ = balanceAfter_ - balanceBefore_;

	expect(actualRewardAmount_).equal(expectedRewardAmount_);
	const bidPlacedEventTopic_ = cosmicSignatureGameProxy_.interface.getEvent("BidPlaced").topicHash;
	const bidPlacedLog_ = receipt_.logs.find((log_) => log_.topics[0] == bidPlacedEventTopic_);
	expect(bidPlacedLog_).not.equal(undefined);
	const parsedBidPlacedLog_ = cosmicSignatureGameProxy_.interface.parseLog(bidPlacedLog_);
	expect(parsedBidPlacedLog_.args.lastBidderAddress).equal(bidderSigner_.address);
	expect(parsedBidPlacedLog_.args.bidCstRewardAmount).equal(expectedRewardAmount_);

	console.info("%s", `Verified CST reward: ${actualRewardAmount_}.`);
}

main()
	.catch((errorObject_) => {
		console.error("%o", errorObject_);
		process.exitCode = 1;
	});
