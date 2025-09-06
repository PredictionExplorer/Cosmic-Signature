"use strict";

const { expect } = require("chai");
// const { waitForTransactionReceipt } = require("../../../src/Helpers.js");

async function validateStakingWalletRandomWalkNft(
	stakingWalletRandomWalkNft_,
	// ownerAddress_,
	randomWalkNftAddress_
) {
	// expect(await stakingWalletRandomWalkNft_.owner({blockTag: "pending",})).equal(ownerAddress_);
	expect(await stakingWalletRandomWalkNft_.randomWalkNft({blockTag: "pending",})).equal(randomWalkNftAddress_);
}

module.exports = {
	validateStakingWalletRandomWalkNft,
};
