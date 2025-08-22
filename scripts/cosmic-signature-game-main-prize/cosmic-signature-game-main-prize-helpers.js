"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { sleepForMilliSeconds, waitForTransactionReceipt } = require("../../src/Helpers.js");

async function waitUntilMainPrizeTime(cosmicSignatureGameProxy_) {
	for (;;) {
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy_.getDurationUntilMainPrizeRaw({blockTag: "pending",});
		console.info(`${durationUntilMainPrize_} seconds until main prize.`);
		if (durationUntilMainPrize_ <= 0n) {
			break;
		}
		await sleepForMilliSeconds(Number(durationUntilMainPrize_) * 1000 - 500);
	}
}

async function claimMainPrize(cosmicSignatureGameProxy_, bidderSigner_) {
	console.info("claimMainPrize");
	const cosmicSignatureGameProxyMainPrizeClaimedTopicHash_ = cosmicSignatureGameProxy_.interface.getEvent("MainPrizeClaimed").topicHash;
	let mainEthPrizeAmount_ = await cosmicSignatureGameProxy_.getMainEthPrizeAmount();
	const timeStamp1_ = performance.now();
	/** @type {Promise<hre.ethers.TransactionResponse>} */
	let transactionResponsePromise_ = cosmicSignatureGameProxy_.connect(bidderSigner_).claimMainPrize();
	let transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
	const timeStamp2_ = performance.now();
	let log_ = transactionReceipt_.logs.find((log_) => (log_.topics.indexOf(cosmicSignatureGameProxyMainPrizeClaimedTopicHash_) >= 0));
	let parsedLog_ = cosmicSignatureGameProxy_.interface.parseLog(log_);
	expect(parsedLog_.args.beneficiaryAddress).equal(bidderSigner_.address);
	expect(parsedLog_.args.ethPrizeAmount).equal(mainEthPrizeAmount_);
	console.info(`Completed bidding round ${parsedLog_.args.roundNum}. claimMainPrize took ${(timeStamp2_ - timeStamp1_).toFixed(1)} ms.`);
}

module.exports = {
	waitUntilMainPrizeTime,
	claimMainPrize,
};
