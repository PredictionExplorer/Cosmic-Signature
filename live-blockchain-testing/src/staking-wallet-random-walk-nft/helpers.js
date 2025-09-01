"use strict";

const { expect } = require("chai");
// const { waitForTransactionReceipt } = require("../../../src/Helpers.js");

async function validateStakingWalletRandomWalkNft(
	stakingWalletRandomWalkNft_,
	// ownerAddress_,
	randomWalkNftAddress_
) {
	// expect(await stakingWalletRandomWalkNft_.owner()).equal(ownerAddress_);
	expect(await stakingWalletRandomWalkNft_.randomWalkNft()).equal(randomWalkNftAddress_);
}

module.exports = {
	validateStakingWalletRandomWalkNft,
};
