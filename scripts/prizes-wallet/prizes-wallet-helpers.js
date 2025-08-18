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

module.exports = {
	validatePrizesWallet,
	configurePrizesWallet,
};
