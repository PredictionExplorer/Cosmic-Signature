"use strict";

const { expect } = require("chai");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");

async function validatePrizesWallet(
	prizesWallet_,
	ownerAddress_,
	cosmicSignatureGameProxyAddress_
) {
	expect(await prizesWallet_.owner()).equal(ownerAddress_);
	expect(await prizesWallet_.game()).equal(cosmicSignatureGameProxyAddress_);
}

async function configurePrizesWallet(prizesWallet_, ownerSigner_, timeoutDurationToWithdrawPrizes_) {
	await waitForTransactionReceipt(prizesWallet_.connect(ownerSigner_).setTimeoutDurationToWithdrawPrizes(timeoutDurationToWithdrawPrizes_));
}

async function withdrawEverything(prizesWallet_, bidderSigner_, withdrawEth_, donatedTokensToClaim_, donatedNftIndexes_) {
	console.info("withdrawEverything");
	const timeStamp1_ = performance.now();
	await waitForTransactionReceipt(prizesWallet_.connect(bidderSigner_).withdrawEverything(withdrawEth_, donatedTokensToClaim_, donatedNftIndexes_));
	const timeStamp2_ = performance.now();
	console.info(`Took ${(timeStamp2_ - timeStamp1_).toFixed(1)} ms.`);
}

module.exports = {
	validatePrizesWallet,
	configurePrizesWallet,
	withdrawEverything,
};
