"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
// const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("CosmicSignatureToken-Old", function () {
	it("Smoke-test", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {cosmicSignatureGameProxyAddr, cosmicSignatureToken,} =
			await loadFixture(deployContractsForUnitTesting);

		expect(await cosmicSignatureToken.game()).equal(cosmicSignatureGameProxyAddr);
	});
	
	it("The ERC20 nonces method exists", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {signers, cosmicSignatureToken,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0,] = signers;

		expect(await cosmicSignatureToken.nonces(signer0.address)).equal(0n);
	});

	it("Unauthorized access to restricted methods", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureNft, cosmicSignatureToken, charityWallet,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;

		// todo-1 Add `cosmicSignatureToken.connect(...).transferToMarketingWalletOrBurn` to all tests. But I have eliminated it.
		await expect(cosmicSignatureToken.connect(signer1).mint(signer1.address, 10000n))
			.revertedWithCustomError(cosmicSignatureToken, /*"OwnableUnauthorizedAccount"*/ "UnauthorizedCaller");
		await expect(cosmicSignatureToken.connect(ownerAcct).mint(signer1.address, 10000n))
			.revertedWithCustomError(cosmicSignatureToken, /*"OwnableUnauthorizedAccount"*/ "UnauthorizedCaller");
		await expect(cosmicSignatureToken.connect(signer1)["burn(address,uint256)"](signer1.address, 10000n))
			.revertedWithCustomError(cosmicSignatureToken, "UnauthorizedCaller");
		await expect(cosmicSignatureToken.connect(ownerAcct)["burn(address,uint256)"](signer1.address, 10000n))
			.revertedWithCustomError(cosmicSignatureToken, "UnauthorizedCaller");
		await expect(cosmicSignatureToken.connect(signer1)["burn(uint256)"](10000n)).not.reverted;
	});
});
