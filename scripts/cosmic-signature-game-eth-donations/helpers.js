"use strict";

const hre = require("hardhat");

async function donateEthToCosmicSignatureGame(cosmicSignatureGameProxy_, donorSigner_, amountInEth_) {
	const amountInWei_ = hre.ethers.parseEther(amountInEth_.toString());
	await cosmicSignatureGameProxy_.connect(donorSigner_).donateEth({value: amountInWei_,});
}

module.exports { donateEthToCosmicSignatureGame, };
