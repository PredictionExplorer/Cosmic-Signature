"use strict";

const { expect } = require("chai");
// const { waitForTransactionReceipt } = require("../../src/Helpers.js");

async function validateCharityWallet(
	charityWallet_,
	ownerAddress_,
	charityAddress_
) {
	expect(await charityWallet_.owner()).equal(ownerAddress_);
	expect(await charityWallet_.charityAddress()).equal(charityAddress_);
}

module.exports = {
	validateCharityWallet,
};
