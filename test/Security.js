"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("Security", function () {
	// // todo-1 This test is now broken because I have moved NFT donations to `PrizesWallet`.
	// // todo-1 Besides, `PrizesWallet.donateNft` is not non-reentrant.
	// it("The donateNft method is confirmed to be non-reentrant", async function () {
	// 	// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
	// 	const {deployerAcct, signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);
	// 	const [signer0,] = signers;
	//
	// 	// todo-1 Why do we need this donation here? Comment it out?
	// 	const ethDonationAmount_ = 10n * 10n ** 18n;
	// 	await expect(cosmicSignatureGameProxy.connect(signer0).donateEth({value: ethDonationAmount_})).not.reverted;
	//
	// 	const maliciousNftFactory = await hre.ethers.getContractFactory("MaliciousNft1", deployerAcct);
	// 	const maliciousNft = await maliciousNftFactory.deploy("Bad NFT", "BAD");
	// 	await maliciousNft.waitForDeployment();
	// 	const maliciousNftAddr = await maliciousNft.getAddress();
	//
	// 	// todo-1 This will probably now revert due to `_onlyGame`.
	// 	await expect(cosmicSignatureGameProxy.connect(signer0).donateNft(maliciousNftAddr, 0n)).revertedWithCustomError(cosmicSignatureGameProxy, "ReentrancyGuardReentrantCall");
	// });
	
	// todo-0 Do we need a similar test for `bidWithCstAndDonateNft`? Maybe not, but think.
	it("The bidWithEthAndDonateNft method is non-reentrant", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {deployerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, prizesWallet,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0,] = signers;
	
		const ethBidAmount_ = 10n ** 18n;
		const ethDonationAmount_ = ethBidAmount_ * 10n;
		// await expect(cosmicSignatureGameProxy.connect(signer0).donateEth({value: ethDonationAmount_})).not.reverted;
	
		const maliciousNftFactory = await hre.ethers.getContractFactory("MaliciousNft2", deployerAcct);
		const maliciousNft = await maliciousNftFactory.deploy(cosmicSignatureGameProxyAddr, "Bad NFT", "BAD");
		await maliciousNft.waitForDeployment();
		const maliciousNftAddr = await maliciousNft.getAddress();

		await expect(signer0.sendTransaction({to: maliciousNftAddr, value: ethDonationAmount_,})).not.reverted;
		await expect(cosmicSignatureGameProxy.connect(signer0).bidWithEthAndDonateNft((-1n), "", maliciousNftAddr, 0n, {value: ethBidAmount_,})).revertedWithCustomError(cosmicSignatureGameProxy, "ReentrancyGuardReentrantCall");
	});
});
