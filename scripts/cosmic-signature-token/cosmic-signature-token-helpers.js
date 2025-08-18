"use strict";

const { expect } = require("chai");
// const { waitForTransactionReceipt } = require("../../src/Helpers.js");

async function validateCosmicSignatureToken(
	cosmicSignatureToken_,
	// ownerAddress_,
	cosmicSignatureGameProxyAddress_
) {
	// expect(await cosmicSignatureToken_.owner()).equal(ownerAddress_);
	expect(await cosmicSignatureToken_.game()).equal(cosmicSignatureGameProxyAddress_);
}

module.exports = {
	validateCosmicSignatureToken,
};
