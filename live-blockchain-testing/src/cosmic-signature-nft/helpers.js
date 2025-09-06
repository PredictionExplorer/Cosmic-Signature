"use strict";

const { expect } = require("chai");
// const { waitForTransactionReceipt } = require("../../../src/Helpers.js");

async function validateCosmicSignatureNft(
	cosmicSignatureNft_,
	ownerAddress_,
	cosmicSignatureGameProxyAddress_
) {
	expect(await cosmicSignatureNft_.owner({blockTag: "pending",})).equal(ownerAddress_);
	expect(await cosmicSignatureNft_.game({blockTag: "pending",})).equal(cosmicSignatureGameProxyAddress_);
}

module.exports = {
	validateCosmicSignatureNft,
};
