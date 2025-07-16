"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt32 } = require("../src/Helpers.js");
const { loadFixtureDeployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("CosmicSignatureToken", function () {
	it("Smoke-test", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		expect(await contracts_.cosmicSignatureToken.game()).equal(contracts_.cosmicSignatureGameProxyAddr);
		expect(await contracts_.cosmicSignatureToken.nonces(contracts_.signers[0].address)).equal(0n);
	});
	
	it("Deployment", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		await expect(contracts_.cosmicSignatureTokenFactory.deploy(hre.ethers.ZeroAddress)).revertedWithCustomError(contracts_.cosmicSignatureTokenFactory, "ZeroAddress");
	});

	it("Unauthorized access to restricted methods", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const pickUnauthorizedCaller_ = () => {
			return ((generateRandomUInt32() & 1) == 0) ? contracts_.ownerAcct : contracts_.signers[0];
		};

		const emptyAray_ = [];

		await expect(contracts_.cosmicSignatureToken.connect(pickUnauthorizedCaller_()).mint(contracts_.signers[1].address, 1n))
			.revertedWithCustomError(contracts_.cosmicSignatureToken, /*"OwnableUnauthorizedAccount"*/ "UnauthorizedCaller");
		await expect(contracts_.cosmicSignatureToken.connect(pickUnauthorizedCaller_())["burn(address,uint256)"](contracts_.signers[1].address, 1n))
			.revertedWithCustomError(contracts_.cosmicSignatureToken, "UnauthorizedCaller");
		await expect(contracts_.cosmicSignatureToken.connect(pickUnauthorizedCaller_())["burn(uint256)"](0n)).not.reverted;
	});
});
