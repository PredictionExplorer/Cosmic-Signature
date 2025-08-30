"use strict";

const { expect } = require("chai");
const { waitForTransactionReceipt } = require("../../../src/Helpers.js");

async function validateMarketingWallet(
	marketingWallet_,
	ownerAddress_,
	cosmicSignatureTokenAddress_
) {
	expect(await marketingWallet_.owner()).equal(ownerAddress_);
	expect(await marketingWallet_.treasurerAddress()).equal(ownerAddress_);
	expect(await marketingWallet_.token()).equal(cosmicSignatureTokenAddress_);
}

async function configureMarketingWallet(marketingWallet_, ownerSigner_, treasurerAddress_) {
	await waitForTransactionReceipt(marketingWallet_.connect(ownerSigner_).setTreasurerAddress(treasurerAddress_));
}

async function payMarketingRewards(marketingWallet_, treasurerSigner_, specs_) {
	console.info("payManyRewards");
	await waitForTransactionReceipt(marketingWallet_.connect(treasurerSigner_).payManyRewards(specs_));
}

module.exports = {
	validateMarketingWallet,
	configureMarketingWallet,
	payMarketingRewards,
};
