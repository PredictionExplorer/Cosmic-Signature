"use strict";

const { expect } = require("chai");
// const { waitForTransactionReceipt } = require("../../../src/Helpers.js");

async function validateCharityWallet(
	charityWallet_,
	ownerAddress_,
	charityAddress_
) {
	expect(await charityWallet_.owner({blockTag: "pending",})).equal(ownerAddress_);
	expect(await charityWallet_.charityAddress({blockTag: "pending",})).equal(charityAddress_);
}

module.exports = {
	validateCharityWallet,
};
