"use strict";

const nodeOsModule = require("node:os");
// const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");

async function finalizeTesting(selfDestructibleCosmicSignatureGameProxy_, ownerSigner_) {
	console.info(`${nodeOsModule.EOL}finalizeTesting`);
	/** @type {Promise<hre.ethers.TransactionResponse>} */
	let transactionResponsePromise_ = selfDestructibleCosmicSignatureGameProxy_.connect(ownerSigner_).finalizeTesting();
	await waitForTransactionReceipt(transactionResponsePromise_);
}

module.exports = {
	finalizeTesting,
};
