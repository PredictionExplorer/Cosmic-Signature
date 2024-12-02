"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

describe("CosmicSignatureGame", function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
	async function deployCosmicSignature(deployerAcct) {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureNft,
			cosmicSignatureToken,
			cosmicSignatureDao,
			charityWallet,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			cosmicSignatureGame,
		} = await basicDeployment(contractDeployerAcct, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		return {
			cosmicSignatureGameProxy,
			cosmicSignatureNft,
			cosmicSignatureToken,
			cosmicSignatureDao,
			charityWallet,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			cosmicSignatureGame,
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
	it("Should set the right unlockTime", async function () {
		const { cosmicSignatureGameProxy, cosmicSignatureToken, charityWallet, cosmicSignatureDao, prizesWallet, randomWalkNft } =
			await loadFixture(deployCosmicSignature);
		expect(await cosmicSignatureGameProxy.nanoSecondsExtra()).to.equal(3600 * 1000 * 1000 * 1000);
		expect(await cosmicSignatureToken.totalSupply()).to.equal(0);
	});
	it("Fallback function works", async function () {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWallet,
			marketingWallet
		} = await basicDeployment(
			contractDeployerAcct,
			'',
			1,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true
		);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
		await expect(
			hre.ethers.provider.call({
				to:  await cosmicSignatureGameProxy.getAddress(),
				data: "0xffffffff", // non-existent selector
			})
		).to.be.revertedWith("Method does not exist.");
	});
	it("Fallback function is executing bid", async function () {
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWallet,
			marketingWallet,
		} = await loadFixture(deployCosmicSignature);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		const [owner, otherAccount] = await hre.ethers.getSigners();
		await owner.sendTransaction({
			to: await cosmicSignatureGameProxy.getAddress(),
			value: bidPrice,
		});
		let bidPriceAfter = await cosmicSignatureGameProxy.getBidPrice();
		expect(bidPriceAfter).not.to.equal(bidPrice);
	});
});
