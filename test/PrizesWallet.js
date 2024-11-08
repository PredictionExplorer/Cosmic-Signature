"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment } = require("../src/Deploy.js");

describe("PrizesWallet", function () {
	/// ToDo-202411224-1 applies.
	async function deployCosmic() {
		const signers = await hre.ethers.getSigners();
		const [owner,] = signers;
		const contracts = await basicDeployment(owner, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		contracts.signers = signers;
		return contracts;
	}
	// const bidParamsEncoding = {
	// 	type: "tuple(string,int256)",
	// 	name: "BidParams",
	// 	components: [
	// 		{ name: "message", type: "string" },
	// 		{ name: "randomWalkNFTId", type: "int256" },
	// 	],
	// };
	it("depositEth works correctly", async function () {
		const {signers,} = await loadFixture(deployCosmic);
		const [owner, addr1,] = signers;
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicGameErrors");

		const NewPrizesWallet = await hre.ethers.getContractFactory("PrizesWallet");
		let newPrizesWallet = await NewPrizesWallet.deploy(owner.address);
		await newPrizesWallet.waitForDeployment();

		await expect(newPrizesWallet.connect(addr1).depositEth(addr1.address, {value: 1000000n})).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "CallDenied");

		// // Comment-202411084 relates and/or applies.
		// // I have observed that this now reverts with panic when asserts are enabled.
		// await expect(newPrizesWallet.depositEth(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");

		// Comment-202409215 relates.
		// await expect(newPrizesWallet.depositEth(addr1.address)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "NonZeroValueRequired");
		await expect(newPrizesWallet.depositEth(addr1.address)).not.to.be.reverted;

		// // Someone forgot to pass an address to this call.
		// await expect(newPrizesWallet.depositEth({value:1000000n})).not.to.be.reverted;
	});
	it("withdrawEth works correctly", async function () {
		const {signers,} = await loadFixture(deployCosmic);
		const [owner, addr1, addr2,] = signers;
		// const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicGameErrors");

		const NewPrizesWallet = await hre.ethers.getContractFactory("PrizesWallet");
		let newPrizesWallet = await NewPrizesWallet.deploy(owner.address);
		await newPrizesWallet.waitForDeployment();

		await newPrizesWallet.depositEth(addr1.address, {value: 1000n});

		// Comment-202409215 relates.
		// await expect(newPrizesWallet.connect(addr2).withdrawEth()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroBalance");
		await expect(newPrizesWallet.connect(addr2).withdrawEth()).not.to.be.reverted;
	});
});
