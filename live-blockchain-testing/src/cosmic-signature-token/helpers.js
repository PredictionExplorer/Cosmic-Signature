"use strict";

const { expect } = require("chai");
const { MAX_UINT256 } = require("../../../src/BigIntMathHelpers.js");
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
	await waitForTransactionReceipt(cosmicSignatureToken_.connect(bidder2Signer_).approve(prizesWalletAddress_, MAX_UINT256));
}

module.exports = {
	validateCosmicSignatureToken,
	configureCosmicSignatureToken,
};
