"use strict";

const { expect } = require("chai");
// const { waitForTransactionReceipt } = require("../../../src/Helpers.js");

async function validateCosmicSignatureDao(
	cosmicSignatureDao_,
	// ownerAddress_,
	cosmicSignatureTokenAddress_
) {
	// expect(await cosmicSignatureDao_.owner()).equal(ownerAddress_);
	expect(await cosmicSignatureDao_.token()).equal(cosmicSignatureTokenAddress_);
}

module.exports = {
	validateCosmicSignatureDao,
};
