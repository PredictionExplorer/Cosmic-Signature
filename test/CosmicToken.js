"use strict";

const hre = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { expect } = require("chai");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

describe("CosmicToken tests", function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
	async function deployCosmic(deployerAcct) {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNFT,
			stakingWalletCosmicSignatureNft,
			marketingWallet,
		} = await basicDeployment(contractDeployerAcct, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		return {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNFT,
			stakingWalletCosmicSignatureNft,
			marketingWallet,
		};
	}
	const bidParamsEncoding = {
		type: "tuple(string,int256)",
		name: "BidParams",
		components: [
			{ name: "message", type: "string" },
			{ name: "randomWalkNFTId", type: "int256" },
		],
	};
	it("ERC20 nonces() function exists", async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicGameErrors");
		await expect(
			cosmicToken.nonces(owner.address),
		).not.to.be.reverted;
	});
});
