"use strict";

const { expect } = require("chai");
// const { waitForTransactionReceipt } = require("../../src/Helpers.js");

async function validateCosmicSignatureNft(
	cosmicSignatureNft_,
	ownerAddress_,
	cosmicSignatureGameProxyAddress_
) {
	expect(await cosmicSignatureNft_.owner()).equal(ownerAddress_);
	expect(await cosmicSignatureNft_.game()).equal(cosmicSignatureGameProxyAddress_);
}

module.exports = {
	validateCosmicSignatureNft,
};
