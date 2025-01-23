"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
// const { basicDeployment } = require("../src/Deploy.js");
const { deployContractsForTesting } = require("../src/ContractTestingHelpers.js");

describe("CharityWallet", function () {
	it("CharityWallet is sending the right amount", async function () {
		const {signers, charityWallet,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1, addr2,] = signers;
		
		let amountSent = hre.ethers.parseEther("9");
		let receiverAddress_ = await charityWallet.charityAddress();
		await addr2.sendTransaction({ to: await charityWallet.getAddress(), value: amountSent });
		let balanceBefore = await hre.ethers.provider.getBalance(receiverAddress_);
		await charityWallet.send();
		let balanceAfter = await hre.ethers.provider.getBalance(receiverAddress_);
		expect(balanceAfter).to.equal(balanceBefore+amountSent);
	});
	it("It is not possible to withdraw from CharityWallet if transfer to the destination fails", async function () {
		const {signers, charityWallet,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1,] = signers;

		const BrokenCharity = await hre.ethers.getContractFactory("BrokenCharity");
		const brokenCharity = await BrokenCharity.deploy();
		await brokenCharity.waitForDeployment();

		await owner.sendTransaction({ to: await charityWallet.getAddress(), value: hre.ethers.parseEther("3")});
		await charityWallet.setCharityAddress(await brokenCharity.getAddress());
		await expect(charityWallet.send()).to.be.revertedWithCustomError(charityWallet, "FundTransferFailed");

		const BrokenCharityWallet = await hre.ethers.getContractFactory("BrokenCharityWallet");
		const brokenCharityWallet = await BrokenCharityWallet.deploy();
		await brokenCharityWallet.waitForDeployment();
		await brokenCharityWallet.clearCharityAddress();
		await expect(brokenCharityWallet.send()).to.be.revertedWithCustomError(brokenCharityWallet, "ZeroAddress");
		await brokenCharityWallet.setCharityAddress(addr1.address);
		// await expect(brokenCharityWallet.send()).to.be.revertedWithCustomError(brokenCharityWallet, "ZeroBalance");
		await brokenCharityWallet.send();
	});
});
