// todo-1 Consider moving these tests to where we test specific contracts.

"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
// const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");
const { deployContractsForTesting } = require("../src/ContractTestingHelpers.js");

describe("ZeroAddressChecking", function () {
	// todo-1 We now allow a zero address in this case.
	it("Shouldn't be possible to set a zero-address for CharityWallet", async function () {
		const {charityWallet,} = await loadFixture(deployContractsForTesting);

		// await expect(charityWallet.setCharityAddress(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		await charityWallet.setCharityAddress(hre.ethers.ZeroAddress);
	});

	it("Shouldn't be possible to set a zero charity address in CosmicSignatureGame", async function () {
		const {cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);

		await cosmicSignatureGameProxy.setRoundActivationTime(123_456_789_012n);
		await expect(cosmicSignatureGameProxy.setCharityAddress(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "ZeroAddress");
	});
	// it("Shouldn't be possible to set MarketingWallet.token to a zero-address", async function () {
	// 	const {marketingWallet,} = await loadFixture(deployContractsForTesting);
	//	
	// 	await expect(marketingWallet.setCosmicSignatureToken(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(marketingWallet, "ZeroAddress");
	// });
	it("Shouldn't be possible to deploy StakingWalletRandomWalkNft with zero-address-ed parameters", async function () {
		const StakingWalletRandomWalkNft = await hre.ethers.getContractFactory("StakingWalletRandomWalkNft");
		await expect(StakingWalletRandomWalkNft.deploy(hre.ethers.ZeroAddress, {gasLimit: 3000000})).to.be.revertedWithCustomError(StakingWalletRandomWalkNft, "ZeroAddress");
	});
	it("Shouldn't be possible to deploy StakingWalletCosmicSignatureNft with zero-address-ed parameters", async function () {
		const signers = await hre.ethers.getSigners();
		const [owner, addr1, addr2,] = signers;

		const StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory("StakingWalletCosmicSignatureNft");
		await expect(StakingWalletCosmicSignatureNft.deploy(hre.ethers.ZeroAddress, addr1.address, /*addr2.address,*/ {gasLimit: 3000000})).to.be.revertedWithCustomError(StakingWalletCosmicSignatureNft, "ZeroAddress");
		await expect(StakingWalletCosmicSignatureNft.deploy(owner.address, hre.ethers.ZeroAddress, /*addr2.address,*/ {gasLimit: 3000000})).to.be.revertedWithCustomError(StakingWalletCosmicSignatureNft, "ZeroAddress");

		// // Comment-202409209 applies.
		// await expect(StakingWalletCosmicSignatureNft.deploy(addr1.address, addr2.address, hre.ethers.ZeroAddress, {gasLimit: 3000000})).to.be.revertedWithCustomError(StakingWalletCosmicSignatureNft, "ZeroAddress");
	});
	it("Shouldn't be possible to deploy CosmicSignatureNft with zero-address-ed parameters", async function () {
		const CosmicSignatureNft = await hre.ethers.getContractFactory("CosmicSignatureNft");
		await expect(CosmicSignatureNft.deploy(hre.ethers.ZeroAddress, {gasLimit: 3000000})).to.be.revertedWithCustomError(CosmicSignatureNft, "ZeroAddress");
	});
	it("Shouldn't be possible to deploy PrizesWallet with zero-address-ed parameters", async function () {
		const PrizesWallet = await hre.ethers.getContractFactory("PrizesWallet");
		await expect(PrizesWallet.deploy(hre.ethers.ZeroAddress, {gasLimit: 3000000})).to.be.revertedWithCustomError(PrizesWallet, "ZeroAddress");
	});
	it("Shouldn't be possible to deploy MarketingWallet with zero-address-ed parameters", async function () {
		const MarketingWallet = await hre.ethers.getContractFactory("MarketingWallet");
		await expect(MarketingWallet.deploy(hre.ethers.ZeroAddress, {gasLimit: 3000000})).to.be.revertedWithCustomError(MarketingWallet, "ZeroAddress");
	});
});
