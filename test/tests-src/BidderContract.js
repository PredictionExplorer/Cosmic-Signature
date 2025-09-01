"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");

describe("BidderContract", function () {
	it("BidderContract wins the Cosmic Signature Game", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		const bidderContractFactory_ = await hre.ethers.getContractFactory("BidderContract", contracts_.deployerSigner);
		const bidderContract_ = await bidderContractFactory_.deploy(contracts_.cosmicSignatureGameProxyAddress);
		await bidderContract_.waitForDeployment();
		const bidderContractAddress_ = await bidderContract_.getAddress();

		// await waitForTransactionReceipt(contracts_.randomWalkNft.connect(contracts_.signers[0]).setApprovalForAll(contracts_.prizesWalletAddress, true));
		await waitForTransactionReceipt(contracts_.randomWalkNft.connect(contracts_.signers[0]).setApprovalForAll(bidderContractAddress_, true));
		await waitForTransactionReceipt(bidderContract_.connect(contracts_.signers[0]).doSetApprovalForAll(contracts_.randomWalkNftAddress, contracts_.prizesWalletAddress, true));

		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(-1n, "signer 0 bid", {value: nextEthBidPrice_,}));
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "signer 1 bid", {value: nextEthBidPrice_,}));
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "signer 2 bid", {value: nextEthBidPrice_,}));

		let randomWalkNftMintPrice_ = await contracts_.randomWalkNft.getMintPrice();
		await waitForTransactionReceipt(contracts_.randomWalkNft.connect(contracts_.signers[0]).mint({value: randomWalkNftMintPrice_,}));
		const donatedNftId_ = 0n;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(bidderContract_.connect(contracts_.signers[0]).doBidWithEthAndDonateNft(contracts_.randomWalkNftAddress, donatedNftId_, {value: nextEthBidPrice_,}));
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(bidderContract_.connect(contracts_.signers[0]).doBidWithEth({value: nextEthBidPrice_,}));
		randomWalkNftMintPrice_ = await contracts_.randomWalkNft.getMintPrice();
		await waitForTransactionReceipt(contracts_.randomWalkNft.connect(contracts_.signers[0]).mint({value: randomWalkNftMintPrice_,}));
		const randomWalkNftId_ = donatedNftId_ + 1n;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		let nextEthPlusRandomWalkNftBidPrice_ = await contracts_.cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await waitForTransactionReceipt(bidderContract_.connect(contracts_.signers[0]).doBidWithEthPlusRandomWalkNft(randomWalkNftId_, {value: nextEthPlusRandomWalkNftBidPrice_,}));
		let durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(bidderContract_.connect(contracts_.signers[0]).doClaimMainPrize());

		await waitForTransactionReceipt(bidderContract_.connect(contracts_.signers[0]).withdrawEverything());

		expect(await contracts_.randomWalkNft.balanceOf(contracts_.signers[0].address)).equal(await contracts_.randomWalkNft.totalSupply());

		// It's possible that signers 1 and 2 (besides signer 0) won some CS NFTs.
		const numCosmicSignatureNftsOwnedByExternalBidders_ =
			await contracts_.cosmicSignatureNft.balanceOf(contracts_.signers[0].address) +
			await contracts_.cosmicSignatureNft.balanceOf(contracts_.signers[1].address) +
			await contracts_.cosmicSignatureNft.balanceOf(contracts_.signers[2].address);

		expect(numCosmicSignatureNftsOwnedByExternalBidders_).equal(await contracts_.cosmicSignatureNft.totalSupply());
	});
});
