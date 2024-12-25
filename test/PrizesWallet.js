"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
// const { basicDeployment } = require("../src/Deploy.js");
// const { deployContractsForTesting } = require("../src/ContractTestingHelpers.js");

describe("PrizesWallet", function () {
	// const bidParamsEncoding = {
	// 	type: "tuple(string,int256)",
	// 	name: "BidParams",
	// 	components: [
	// 		{ name: "message", type: "string" },
	// 		{ name: "randomWalkNftId", type: "int256" },
	// 	],
	// };
	it("depositEth works correctly", async function () {
		const signers = await hre.ethers.getSigners();
		const [owner, addr1,] = signers;
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		const NewPrizesWallet = await hre.ethers.getContractFactory("PrizesWallet");
		let newPrizesWallet = await NewPrizesWallet.deploy(owner.address);
		await newPrizesWallet.waitForDeployment();

		await expect(newPrizesWallet.connect(addr1).depositEth(0, addr1.address, {value: 1000000n})).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "CallDenied");

		// // I have replaced respective `require` with an `assert`.
		// // I have observed the `assert` working. This now reverts with panic when asserts are enabled.
		// await expect(newPrizesWallet.depositEth(0, hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");

		// Comment-202409215 relates.
		// await expect(newPrizesWallet.depositEth(0, addr1.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "NonZeroValueRequired");
		await expect(newPrizesWallet.depositEth(0, addr1.address)).not.to.be.reverted;
	});
	it("withdrawEth works correctly", async function () {
		const signers = await hre.ethers.getSigners();
		const [owner, addr1, addr2,] = signers;

		const NewPrizesWallet = await hre.ethers.getContractFactory("PrizesWallet");
		let newPrizesWallet = await NewPrizesWallet.deploy(owner.address);
		await newPrizesWallet.waitForDeployment();

		await newPrizesWallet.depositEth(0, addr1.address, {value: 1000n});

		// Comment-202409215 relates.
		// await expect(newPrizesWallet.connect(addr2).withdrawEth()).to.be.revertedWithCustomError(newPrizesWallet, "ZeroBalance");
		await expect(newPrizesWallet.connect(addr2).withdrawEth()).not.to.be.reverted;
	});
});
