"use strict";

const { expect } = require("chai");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");

async function validateCosmicSignatureToken(
	cosmicSignatureToken_,
	// ownerAddress_,
	cosmicSignatureGameProxyAddress_
) {
	// expect(await cosmicSignatureToken_.owner()).equal(ownerAddress_);
	expect(await cosmicSignatureToken_.game()).equal(cosmicSignatureGameProxyAddress_);
}

async function configureCosmicSignatureToken(cosmicSignatureToken_, bidder1Signer_, bidder2Signer_, bidder3Signer_, prizesWalletAddress_) {
	await waitForTransactionReceipt(cosmicSignatureToken_.connect(bidder1Signer_).approve(prizesWalletAddress_, (1n << 256n) - 1n));
	await waitForTransactionReceipt(cosmicSignatureToken_.connect(bidder2Signer_).approve(prizesWalletAddress_, (1n << 256n) - 1n));
	await waitForTransactionReceipt(cosmicSignatureToken_.connect(bidder3Signer_).approve(prizesWalletAddress_, (1n << 256n) - 1n));
}

module.exports = {
	validateCosmicSignatureToken,
	configureCosmicSignatureToken,
};
