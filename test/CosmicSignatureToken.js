"use strict";

const { expect } = require("chai");
// const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("CosmicSignatureToken", function () {
	it("Smoke-test", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {cosmicSignatureGameProxyAddr, cosmicSignatureToken,} =
			await loadFixture(deployContractsForUnitTesting);

		expect(await cosmicSignatureToken.game()).equal(cosmicSignatureGameProxyAddr);
	});
	
	it("ERC20 nonces() function exists", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {signers, cosmicSignatureToken,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0,] = signers;

		await cosmicSignatureToken.nonces(signer0.address);
	});
});
