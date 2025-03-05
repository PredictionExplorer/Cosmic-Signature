// todo-1 Consider moving these tests to where we test specific contracts.

"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("ZeroAddressChecking", function () {
	// todo-1 We now allow a zero address in this case.
	it("Shouldn't be possible to set a zero-address for CharityWallet", async function () {
		const {ownerAcct, charityWallet,} = await loadFixture(deployContractsForUnitTesting);

		// await expect(charityWallet.connect(ownerAcct).setCharityAddress(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(charityWallet, "ZeroAddress");
		await charityWallet.connect(ownerAcct).setCharityAddress(hre.ethers.ZeroAddress);
	});

	it("Shouldn't be possible to set a zero charity address in CosmicSignatureGame", async function () {
		const {ownerAcct, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);

		await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(123_456_789_012n);
		await expect(cosmicSignatureGameProxy.connect(ownerAcct).setCharityAddress(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "ZeroAddress");
	});
	// todo-1 Uncomment this test now?
	// it("Shouldn't be possible to set MarketingWallet.token to a zero-address", async function () {
	// 	const {ownerAcct, marketingWallet,} = await loadFixture(deployContractsForUnitTesting);
	//	
	// 	await expect(marketingWallet.connect(ownerAcct).setCosmicSignatureToken(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(marketingWallet, "ZeroAddress");
	// });
	it("Shouldn't be possible to deploy StakingWalletRandomWalkNft with zero-address-ed parameters", async function () {
		const {stakingWalletRandomWalkNftFactory,} = await loadFixture(deployContractsForUnitTesting);

		await expect(stakingWalletRandomWalkNftFactory.deploy(hre.ethers.ZeroAddress, {gasLimit: 3000000})).to.be.revertedWithCustomError(stakingWalletRandomWalkNftFactory, "ZeroAddress");
	});
	it("Shouldn't be possible to deploy StakingWalletCosmicSignatureNft with zero-address-ed parameters", async function () {
		const {/*signers,*/ stakingWalletCosmicSignatureNftFactory,} = await loadFixture(deployContractsForUnitTesting);
		// const [signer0,] = signers;

		await expect(stakingWalletCosmicSignatureNftFactory.deploy(hre.ethers.ZeroAddress, /*signer0.address,*/ {gasLimit: 3000000})).to.be.revertedWithCustomError(stakingWalletCosmicSignatureNftFactory, "ZeroAddress");
		// await expect(stakingWalletCosmicSignatureNftFactory.deploy(signer0.address, hre.ethers.ZeroAddress, {gasLimit: 3000000})).to.be.revertedWithCustomError(stakingWalletCosmicSignatureNftFactory, "ZeroAddress");
	});
	it("Shouldn't be possible to deploy CosmicSignatureNft with zero-address-ed parameters", async function () {
		const {cosmicSignatureNftFactory,} = await loadFixture(deployContractsForUnitTesting);

		await expect(cosmicSignatureNftFactory.deploy(hre.ethers.ZeroAddress, {gasLimit: 3000000})).to.be.revertedWithCustomError(cosmicSignatureNftFactory, "ZeroAddress");
	});
	it("Shouldn't be possible to deploy PrizesWallet with zero-address-ed parameters", async function () {
		const {prizesWalletFactory,} = await loadFixture(deployContractsForUnitTesting);

		await expect(prizesWalletFactory.deploy(hre.ethers.ZeroAddress, {gasLimit: 3000000})).to.be.revertedWithCustomError(prizesWalletFactory, "ZeroAddress");
	});
	it("Shouldn't be possible to deploy MarketingWallet with zero-address-ed parameters", async function () {
		const {marketingWalletFactory,} = await loadFixture(deployContractsForUnitTesting);

		await expect(marketingWalletFactory.deploy(hre.ethers.ZeroAddress, {gasLimit: 3000000})).to.be.revertedWithCustomError(marketingWalletFactory, "ZeroAddress");
	});
});
