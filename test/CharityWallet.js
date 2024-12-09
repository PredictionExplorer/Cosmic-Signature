"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment } = require("../src/Deploy.js");

describe("CharityWallet", function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
	async function deployCosmicSignature(deployerAcct) {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWallet,
			marketingWallet,
		} = await basicDeployment(contractDeployerAcct, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		return {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWallet,
			marketingWallet,
		};
	}
	const bidParamsEncoding = {
		type: "tuple(string,int256)",
		name: "BidParams",
		components: [
			{ name: "message", type: "string" },
			{ name: "randomWalkNftId", type: "int256" },
		],
	};
	it("CharityWallet is sending the right amount", async function () {
		const { cosmicSignatureGameProxy, cosmicSignatureToken, charityWallet, prizesWallet, randomWalkNft } =
			await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		let amountSent = hre.ethers.parseUnits("9",18);
		let receiverAddress_ = await charityWallet.charityAddress();
		await addr2.sendTransaction({ to: await charityWallet.getAddress(), value: amountSent });
		let balanceBefore = await hre.ethers.provider.getBalance(receiverAddress_);
		await charityWallet.send();
		let balanceAfter = await hre.ethers.provider.getBalance(receiverAddress_);
		expect(balanceAfter).to.equal(balanceBefore+amountSent);
	});
	it("It is not possible to withdraw from CharityWallet if transfer to the destination fails", async function () {
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();
		const transferOwnership = false;
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			charityWallet,
			prizesWallet,
			randomWalkNft,
			stakingWallet,
			marketingWallet,
		} = await basicDeployment(owner, "", 1, addr1.address, transferOwnership);

		const BrokenCharity = await hre.ethers.getContractFactory("BrokenCharity");
		const brokenCharity = await BrokenCharity.deploy();
		await brokenCharity.waitForDeployment();

		await owner.sendTransaction({ to: await charityWallet.getAddress(), value: hre.ethers.parseUnits("3",18)});
		await charityWallet.setCharityAddress(await brokenCharity.getAddress());
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
		await expect(charityWallet.send()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "FundTransferFailed");

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
