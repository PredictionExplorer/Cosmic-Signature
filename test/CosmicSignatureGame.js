"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment } = require("../src/Deploy.js");

describe("CosmicSignatureGame", function () {
	/// ToDo-202411224-1 applies.
	async function deployCosmicSignature() {
		const signers = await hre.ethers.getSigners();
		const [owner,] = signers;
		const contracts = await basicDeployment(owner, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		contracts.signers = signers;
		return contracts;
	}
	const bidParamsEncoding = {
		type: "tuple(string,int256)",
		name: "BidParams",
		components: [
			{ name: "message", type: "string" },
			{ name: "randomWalkNftId", type: "int256" },
		],
	};
	it("Smoke test", async function () {
		const {cosmicSignatureGameProxy, cosmicSignatureToken,} = await loadFixture(deployCosmicSignature);
		expect(await cosmicSignatureGameProxy.nanoSecondsExtra()).to.equal(60 * 60 * 1000 * 1000 * 1000);
		expect(await cosmicSignatureToken.totalSupply()).to.equal(0);
	});
	it("The receive method is executing a bid", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployCosmicSignature);
		const [owner,] = signers;
		const bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await owner.sendTransaction({
			to: await cosmicSignatureGameProxy.getAddress(),
			value: bidPrice,
		});
		const bidPriceAfter = await cosmicSignatureGameProxy.getBidPrice();
		expect(bidPriceAfter).not.to.equal(bidPrice);
	});
	it("The fallback method works", async function () {
		const {cosmicSignatureGameProxy,} = await loadFixture(deployCosmicSignature);
		// const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
		await expect(
			hre.ethers.provider.call({
				to: await cosmicSignatureGameProxy.getAddress(),
				data: "0xffffffff", // non-existent selector
			})
		).to.be.revertedWith("Method does not exist.");
	});
});
