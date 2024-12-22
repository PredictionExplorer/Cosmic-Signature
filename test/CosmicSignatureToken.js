"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

describe("CosmicSignatureToken", function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
	async function deployCosmicSignature(deployerAcct) {
		const [owner, addr1, , , , , , addr7,] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			// marketingWallet,
		} = await basicDeployment(owner, "", addr7.address, addr1.address, true, 1);
		return {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			// marketingWallet,
		};
	}
	// const bidParamsEncoding = {
	// 	type: "tuple(string,int256)",
	// 	name: "BidParams",
	// 	components: [
	// 		{ name: "message", type: "string" },
	// 		{ name: "randomWalkNftId", type: "int256" },
	// 	],
	// };
	it("ERC20 nonces() function exists", async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicSignatureGameProxy, cosmicSignatureToken, charityWallet, randomWalkNft } =
			await loadFixture(deployCosmicSignature);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
		await expect(
			cosmicSignatureToken.nonces(owner.address),
		).not.to.be.reverted;
	});
});
