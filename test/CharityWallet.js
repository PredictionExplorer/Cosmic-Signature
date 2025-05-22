"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("CharityWallet", function () {
	it("CharityWallet is sending the right amount", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {signers, charityWallet, charityWalletAddr,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2,] = signers;
		
		let amountSent = hre.ethers.parseEther("9");
		let receiverAddress_ = await charityWallet.charityAddress();
		await expect(signer2.sendTransaction({to: charityWalletAddr, value: amountSent,})).not.reverted;
		let balanceAmountBefore = await hre.ethers.provider.getBalance(receiverAddress_);
		await charityWallet.send();
		let balanceAmountAfter = await hre.ethers.provider.getBalance(receiverAddress_);
		expect(balanceAmountAfter).to.equal(balanceAmountBefore + amountSent);
	});

	it("It is not possible to withdraw from CharityWallet if transfer to the destination fails", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {deployerAcct, ownerAcct, charityAcct, signers, charityWallet, charityWalletAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;
		// todo-0 This contract no longer exists.
		const brokenCharityFactory = await hre.ethers.getContractFactory("BrokenCharity", deployerAcct);
		const brokenCharity = await brokenCharityFactory.deploy();
		await brokenCharity.waitForDeployment();
		const brokenCharityAddr = await brokenCharity.getAddress();

		await expect(signer0.sendTransaction({to: charityWalletAddr, value: hre.ethers.parseEther("3"),})).not.reverted;
		await charityWallet.connect(ownerAcct).setCharityAddress(brokenCharityAddr);
		await expect(charityWallet.connect(signer1).send()).to.be.revertedWithCustomError(charityWallet, "FundTransferFailed");
		await charityWallet.connect(ownerAcct).setCharityAddress(hre.ethers.ZeroAddress);
		await expect(charityWallet.connect(signer1).send()).to.be.revertedWithCustomError(charityWallet, "ZeroAddress");
		await charityWallet.connect(ownerAcct).setCharityAddress(charityAcct.address);
		// await expect(charityWallet.connect(signer1).send()).to.be.revertedWithCustomError(charityWallet, "ZeroBalance");
		await charityWallet.connect(signer1).send();
	});

	it("Unauthorized access attempts to restricted methods", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureNft, cosmicSignatureToken, charityWallet,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;

		await expect(charityWallet.connect(signer1).setCharityAddress(signer1.address))
			.revertedWithCustomError(charityWallet, "OwnableUnauthorizedAccount");
	});
});
