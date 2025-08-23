"use strict";

const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { assertEvent } = require("../../src/ContractTestingHelpers.js");

async function donateEthToCosmicSignatureGame(cosmicSignatureGameProxy_, donor1Signer_, donor2Signer_, amountInEth_) {
	const roundNum_ = await cosmicSignatureGameProxy_.roundNum();
	const amountInWei_ = hre.ethers.parseEther(amountInEth_.toFixed(18));
	const amount1InWei_ = amountInWei_ / 3n;
	const amount2InWei_ = amountInWei_ - amount1InWei_;
	{
		/** @type {Promise<hre.ethers.TransactionResponse>} */
		const transactionResponsePromise_ = cosmicSignatureGameProxy_.connect(donor1Signer_).donateEth({value: amount1InWei_,})
		const transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
		assertEvent(
			transactionReceipt_.logs[0],
			cosmicSignatureGameProxy_,
			"EthDonated",
			[roundNum_, donor1Signer_.address, amount1InWei_,]
		);
	}
	{
		const numEthDonationWithInfoRecords_ = await cosmicSignatureGameProxy_.numEthDonationWithInfoRecords();
		/** @type {Promise<hre.ethers.TransactionResponse>} */
		const transactionResponsePromise_ = cosmicSignatureGameProxy_.connect(donor2Signer_).donateEthWithInfo("Donation Info", {value: amount2InWei_,})
		const transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
		assertEvent(
			transactionReceipt_.logs[0],
			cosmicSignatureGameProxy_,
			"EthDonatedWithInfo",
			[roundNum_, donor2Signer_.address, amount2InWei_, numEthDonationWithInfoRecords_,]
		);
	}
}

module.exports = { donateEthToCosmicSignatureGame, };
