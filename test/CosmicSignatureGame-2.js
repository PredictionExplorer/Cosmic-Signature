"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt32, uint32ToPaddedHexString } = require("../src/Helpers.js");
// const { setRoundActivationTimeIfNeeded } = require("../src/ContractDeploymentHelpers.js");
const { loadFixtureDeployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("CosmicSignatureGame-2", function () {
	it("Smoke-test", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(999n);

		const cosmicSignatureGameImplementationByteCodeSize =
			// cosmicSignatureGameFactory.bytecode.length / 2 - 1;
			(await hre.ethers.provider.getCode(contracts_.cosmicSignatureGameImplementationAddr)).length / 2 - 1;
		expect(cosmicSignatureGameImplementationByteCodeSize).greaterThanOrEqual(21 * 1024);
		console.log(
			"CosmicSignatureGame implementation bytecode size is " +
			cosmicSignatureGameImplementationByteCodeSize.toString() +
			" bytes, which is less than the maximum allowed by " +
			(24 * 1024 - cosmicSignatureGameImplementationByteCodeSize).toString() +
			"."
		);
		expect(await contracts_.cosmicSignatureGameImplementation.owner()).equal(hre.ethers.ZeroAddress);
		expect(await contracts_.cosmicSignatureGameProxy.owner()).equal(contracts_.ownerAcct);
		expect(await contracts_.cosmicSignatureGameImplementation.mainPrizeTimeIncrementInMicroSeconds()).equal(0n);
		expect(await contracts_.cosmicSignatureGameProxy.mainPrizeTimeIncrementInMicroSeconds()).equal(60n * 60n * 10n ** 6n);
	});

	it("The transferOwnership method", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		expect(await contracts_.cosmicSignatureGameImplementation.owner()).equal(hre.ethers.ZeroAddress);
		await expect(contracts_.cosmicSignatureGameImplementation.connect(contracts_.ownerAcct).transferOwnership(contracts_.deployerAcct.address)).revertedWithCustomError(contracts_.cosmicSignatureGameImplementation, "OwnableUnauthorizedAccount");
		await expect(contracts_.cosmicSignatureGameImplementation.connect(contracts_.deployerAcct).transferOwnership(contracts_.ownerAcct.address)).revertedWithCustomError(contracts_.cosmicSignatureGameImplementation, "OwnableUnauthorizedAccount");
		expect(await contracts_.cosmicSignatureGameProxy.owner()).equal(contracts_.ownerAcct.address);
		for ( let counter_ = 0; counter_ <= 1; ++ counter_ ) {
			// Ownership transfer will succeed regardless if the current bidding round is active or not.
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct).setRoundActivationTime((counter_ <= 0) ? 123_456_789_012n : 123n)).not.reverted;

			if (counter_ <= 0) {
				expect(await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation()).greaterThan(+1e9);
			} else {
				expect(await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation()).lessThan(-1e9);
			}
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).transferOwnership(contracts_.ownerAcct.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct).transferOwnership(contracts_.signers[2].address)).not.reverted;
			expect(await contracts_.cosmicSignatureGameProxy.owner()).equal(contracts_.signers[2].address);
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).transferOwnership(contracts_.ownerAcct.address)).not.reverted;
			expect(await contracts_.cosmicSignatureGameProxy.owner()).equal(contracts_.ownerAcct.address);
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).transferOwnership(contracts_.ownerAcct.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		}
	});

	// Issue. I have eliminated the `fallback` method.
	it("The fallback method", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		await expect(
			hre.ethers.provider.call({
				to: contracts_.cosmicSignatureGameProxyAddr,

				// A (likely) non-existent selector.
				data: /*"0xffffffff"*/ uint32ToPaddedHexString(generateRandomUInt32()),
			})
		// ).revertedWith("Method does not exist.");
		).revertedWithoutReason();
	});
});
