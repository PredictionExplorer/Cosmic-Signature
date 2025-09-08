"use strict";

const { expect } = require("chai");
const { waitForTransactionReceipt } = require("../../../src/Helpers.js");

async function validateCosmicSignatureToken(
	cosmicSignatureToken_,
	// ownerAddress_,
	cosmicSignatureGameProxyAddress_
) {
	// expect(await cosmicSignatureToken_.owner({blockTag: "pending",})).equal(ownerAddress_);
	expect(await cosmicSignatureToken_.game({blockTag: "pending",})).equal(cosmicSignatureGameProxyAddress_);
}

async function configureCosmicSignatureToken(cosmicSignatureToken_, bidder2Signer_, prizesWalletAddress_) {
	await waitForTransactionReceipt(cosmicSignatureToken_.connect(bidder2Signer_).approve(prizesWalletAddress_, (1n << 256n) - 1n));
}

module.exports = {
	validateCosmicSignatureToken,
	configureCosmicSignatureToken,
};
