"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { loadFixtureDeployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("BidderContract", function () {
	it("BidderContract wins the Cosmic Signature Game", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		const bidderContractFactory_ = await hre.ethers.getContractFactory("BidderContract", contracts_.deployerAcct);
		const bidderContract_ = await bidderContractFactory_.deploy(contracts_.cosmicSignatureGameProxyAddr);
		await bidderContract_.waitForDeployment();
		const bidderContractAddr_ = await bidderContract_.getAddress();

		// await expect(contracts_.randomWalkNft.connect(contracts_.signers[0]).setApprovalForAll(contracts_.prizesWalletAddr, true)).not.reverted;
		await expect(contracts_.randomWalkNft.connect(contracts_.signers[0]).setApprovalForAll(bidderContractAddr_, true)).not.reverted;
		await expect(bidderContract_.connect(contracts_.signers[0]).doSetApprovalForAll(contracts_.randomWalkNftAddr, contracts_.prizesWalletAddr, true)).not.reverted;

		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(-1n, "signer 0 bid", {value: nextEthBidPrice_,})).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "signer 1 bid", {value: nextEthBidPrice_,})).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "signer 2 bid", {value: nextEthBidPrice_,})).not.reverted;

		let randomWalkNftMintPrice_ = await contracts_.randomWalkNft.getMintPrice();
		await expect(contracts_.randomWalkNft.connect(contracts_.signers[0]).mint({value: randomWalkNftMintPrice_,})).not.reverted;
		const donatedNftId_ = 0n;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(bidderContract_.connect(contracts_.signers[0]).doBidWithEthAndDonateNft(contracts_.randomWalkNftAddr, donatedNftId_, {value: nextEthBidPrice_,})).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(bidderContract_.connect(contracts_.signers[0]).doBidWithEth({value: nextEthBidPrice_,})).not.reverted;
		randomWalkNftMintPrice_ = await contracts_.randomWalkNft.getMintPrice();
		await expect(contracts_.randomWalkNft.connect(contracts_.signers[0]).mint({value: randomWalkNftMintPrice_,})).not.reverted;
		const randomWalkNftId_ = donatedNftId_ + 1n;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		let nextEthPlusRandomWalkNftBidPrice_ = await contracts_.cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await expect(bidderContract_.connect(contracts_.signers[0]).doBidWithEthPlusRandomWalkNft(randomWalkNftId_, {value: nextEthPlusRandomWalkNftBidPrice_,})).not.reverted;
		let durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(bidderContract_.connect(contracts_.signers[0]).doClaimMainPrize()).not.reverted;

		await expect(bidderContract_.connect(contracts_.signers[0]).withdrawEverything()).not.reverted;

		expect(await contracts_.randomWalkNft.balanceOf(contracts_.signers[0].address)).equal(await contracts_.randomWalkNft.totalSupply());

		// It's possible that signers 1 and 2 (besides signer 0) won some CS NFTs.
		const numCosmicSignatureNftsOwnedByExternalBidders_ =
			await contracts_.cosmicSignatureNft.balanceOf(contracts_.signers[0].address) +
			await contracts_.cosmicSignatureNft.balanceOf(contracts_.signers[1].address) +
			await contracts_.cosmicSignatureNft.balanceOf(contracts_.signers[2].address);

		expect(numCosmicSignatureNftsOwnedByExternalBidders_).equal(await contracts_.cosmicSignatureNft.totalSupply());
	});
});
