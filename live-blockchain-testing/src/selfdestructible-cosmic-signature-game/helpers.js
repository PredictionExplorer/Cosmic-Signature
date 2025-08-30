"use strict";

const nodeOsModule = require("node:os");
// const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../../src/Helpers.js");

async function finalizeTestingIfEthBalanceIsNonZero(selfDestructibleCosmicSignatureGameProxy_, selfDestructibleCosmicSignatureGameProxyAddress_, ownerSigner_) {
	const selfDestructibleCosmicSignatureGameProxyEthBalanceAmount_ = await hre.ethers.provider.getBalance(selfDestructibleCosmicSignatureGameProxyAddress_, "pending");
	console.info(`${nodeOsModule.EOL}SelfDestructibleCosmicSignatureGame proxy ETH balance is ${hre.ethers.formatEther(selfDestructibleCosmicSignatureGameProxyEthBalanceAmount_)} ETH.`);
	if (selfDestructibleCosmicSignatureGameProxyEthBalanceAmount_ <= 0n) {
		return;
	}
	await finalizeTesting(selfDestructibleCosmicSignatureGameProxy_, ownerSigner_);
}

async function finalizeTesting(selfDestructibleCosmicSignatureGameProxy_, ownerSigner_) {
	console.info("finalizeTesting");
	const timeStamp1_ = performance.now();
	/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
	let transactionResponsePromise_ = selfDestructibleCosmicSignatureGameProxy_.connect(ownerSigner_).finalizeTesting();
	await waitForTransactionReceipt(transactionResponsePromise_);
	const timeStamp2_ = performance.now();
	console.info(`Took ${(timeStamp2_ - timeStamp1_).toFixed(1)} ms.`);
}

module.exports = {
	finalizeTestingIfEthBalanceIsNonZero,
	// finalizeTesting,
};
