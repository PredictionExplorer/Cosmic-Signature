"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForTesting } = require("../src/ContractTestingHelpers.js");

describe("CosmicSignatureGame", function () {
	// const bidParamsEncoding = {
	// 	type: "tuple(string,int256)",
	// 	name: "BidParams",
	// 	components: [
	// 		{ name: "message", type: "string" },
	// 		{ name: "randomWalkNftId", type: "int256" },
	// 	],
	// };
	it("Smoke test", async function () {
		const {cosmicSignatureGameProxy, cosmicSignatureToken,} = await loadFixture(deployContractsForTesting);

		expect(await cosmicSignatureGameProxy.nanoSecondsExtra()).to.equal(60 * 60 * 1000 * 1000 * 1000);
		expect(await cosmicSignatureToken.totalSupply()).to.equal(0);
	});
	it("The receive method is executing a bid", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner,] = signers;

		const bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await owner.sendTransaction({
			to: await cosmicSignatureGameProxy.getAddress(),
			value: bidPrice,
		});
		const bidPriceAfter = await cosmicSignatureGameProxy.getBidPrice();
		expect(bidPriceAfter).greaterThan(bidPrice);
	});

	// I have eliminated the `fallback` method.
	// Now the call reverts "without a reason".
	it("The fallback method works", async function () {
		const {cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		
		await expect(
			hre.ethers.provider.call({
				to: await cosmicSignatureGameProxy.getAddress(),
				data: "0xffffffff", // non-existent selector
			})
		// ).to.be.revertedWith("Method does not exist.");
		).to.be.reverted;
	});
});
