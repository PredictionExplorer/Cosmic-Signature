"use strict";

const hre = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { expect } = require("chai");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

describe("CosmicGame", function () {
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
			ethPrizesWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet,
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true, true);

		return {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			ethPrizesWallet,
			stakingWallet,
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
	it("Should set the right unlockTime", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, ethPrizesWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		expect(await cosmicGameProxy.nanoSecondsExtra()).to.equal(3600 * 1000 * 1000 * 1000);
		expect(await cosmicToken.totalSupply()).to.equal(0);
	});
	it("Fallback function works", async function () {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			ethPrizesWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet
		} = await basicDeployment(
			contractDeployerAcct,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			true
		);
		const contractErrors = await hre.ethers.getContractFactory('CosmicGameErrors');
		await expect(
			hre.ethers.provider.call({
				to:  await cosmicGameProxy.getAddress(),
				data: "0xffffffff", // non-existent selector
			})
		).to.be.revertedWith("Function does not exist.");
	})
	it("Fallback function is executing bid", async function () {
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			ethPrizesWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet,
			cosmicGameImplementation,
		} = await loadFixture(deployCosmic);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		const [owner, otherAccount] = await hre.ethers.getSigners();
		await owner.sendTransaction({
			to: await cosmicGameProxy.getAddress(),
			value: bidPrice,
		});
		let bidPriceAfter = await cosmicGameProxy.getBidPrice();
		expect(bidPriceAfter).not.to.equal(bidPrice);
	});
});
