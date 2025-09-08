"use strict";

const { expect } = require("chai");
// const { waitForTransactionReceipt } = require("../../../src/Helpers.js");

async function validateStakingWalletCosmicSignatureNft(
	stakingWalletCosmicSignatureNft_,
	ownerAddress_,
	cosmicSignatureNftAddress_,
	cosmicSignatureGameProxyAddress_
) {
	expect(await stakingWalletCosmicSignatureNft_.owner({blockTag: "pending",})).equal(ownerAddress_);
	expect(await stakingWalletCosmicSignatureNft_.nft({blockTag: "pending",})).equal(cosmicSignatureNftAddress_);
	expect(await stakingWalletCosmicSignatureNft_.game({blockTag: "pending",})).equal(cosmicSignatureGameProxyAddress_);
}

module.exports = {
	validateStakingWalletCosmicSignatureNft,
};
