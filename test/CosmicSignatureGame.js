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
		const [owner, addr1,] = signers;
		const contracts = await basicDeployment(owner, "", 1, addr1.address, true);
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

	// I have eliminated the `fallback` method.
	// Now the call reverts without a reason.
	it("The fallback method works", async function () {
		const {cosmicSignatureGameProxy,} = await loadFixture(deployCosmicSignature);
		// const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
		await expect(
			hre.ethers.provider.call({
				to: await cosmicSignatureGameProxy.getAddress(),
				data: "0xffffffff", // non-existent selector
			})
		// ).to.be.revertedWith("Method does not exist.");
		).to.be.reverted;
	});
});
