"use strict";

const { expect } = require("chai");
// const { waitForTransactionReceipt } = require("../../../src/Helpers.js");

async function validateCosmicSignatureDao(
	cosmicSignatureDao_,
	// ownerAddress_,
	cosmicSignatureTokenAddress_
) {
	// expect(await cosmicSignatureDao_.owner({blockTag: "pending",})).equal(ownerAddress_);
	expect(await cosmicSignatureDao_.token({blockTag: "pending",})).equal(cosmicSignatureTokenAddress_);
}

module.exports = {
	validateCosmicSignatureDao,
};
