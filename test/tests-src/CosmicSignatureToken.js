"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt32, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");

describe("CosmicSignatureToken", function () {
	it("Deployment", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		await expect(contracts_.cosmicSignatureTokenFactory.deploy(hre.ethers.ZeroAddress))
			.revertedWithCustomError(contracts_.cosmicSignatureTokenFactory, "ZeroAddress");
	});

	it("Smoke-test", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		expect(await contracts_.cosmicSignatureToken.game()).equal(contracts_.cosmicSignatureGameProxyAddress);
		expect(await contracts_.cosmicSignatureToken.CLOCK_MODE()).equal("mode=timestamp");
		const latestBlock_ = await hre.ethers.provider.getBlock("latest");
		expect(Number(await contracts_.cosmicSignatureToken.clock())).equal(latestBlock_.timestamp);
		expect(await contracts_.cosmicSignatureToken.nonces(contracts_.signers[0].address)).equal(0n);
	});
	
	it("Minting, burning, and transferring tokens", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		const newCosmicSignatureToken_ = await contracts_.cosmicSignatureTokenFactory.deploy(contracts_.signers[0].address);
		await newCosmicSignatureToken_.waitForDeployment();
		// const newCosmicSignatureTokenAddress_ = await newCosmicSignatureToken_.getAddress();
		// await waitForTransactionReceipt(newCosmicSignatureToken_.transferOwnership(contracts_.ownerSigner.address));
		const newCosmicSignatureTokenForSigner0_ = newCosmicSignatureToken_.connect(contracts_.signers[0]);

		// Comment-202507302 applies.
		await waitForTransactionReceipt(newCosmicSignatureTokenForSigner0_.mint(contracts_.signers[1].address, (1n << 208n) - 1n));
		await expect(newCosmicSignatureTokenForSigner0_.mint(contracts_.signers[1].address, 1n))
			.revertedWithCustomError(newCosmicSignatureTokenForSigner0_, "ERC20ExceededSafeSupply");
		await waitForTransactionReceipt(newCosmicSignatureToken_.connect(contracts_.signers[1]).transfer(contracts_.signers[10].address, (1n << 208n) - 1n));
		await expect(newCosmicSignatureTokenForSigner0_.mint(contracts_.signers[1].address, 1n))
			.revertedWithCustomError(newCosmicSignatureTokenForSigner0_, "ERC20ExceededSafeSupply");
		await waitForTransactionReceipt(newCosmicSignatureToken_.connect(contracts_.signers[10])["burn(uint256)"](((1n << 208n) - 1n) - 1n));
		expect(await newCosmicSignatureToken_.totalSupply()).equal(1n);
		await waitForTransactionReceipt(newCosmicSignatureTokenForSigner0_["burn(address,uint256)"](contracts_.signers[10].address, 1n));
		expect(await newCosmicSignatureToken_.totalSupply()).equal(0n);

		{
			const mintSpecs_ = [
				[contracts_.signers[1].address, 10n,],
				[contracts_.signers[2].address, 20n,],
				[contracts_.signers[3].address, 30n,],
			];
			await waitForTransactionReceipt(newCosmicSignatureTokenForSigner0_.mintMany(mintSpecs_));
			const burnSpecs_ = [
				[contracts_.signers[2].address, 9n,],
				[contracts_.signers[1].address, 11n,],
				[contracts_.signers[3].address, 14n,],
			];
			await expect(newCosmicSignatureTokenForSigner0_.burnMany(burnSpecs_))
				.revertedWithCustomError(newCosmicSignatureTokenForSigner0_, "ERC20InsufficientBalance");
			-- burnSpecs_[1][1];
			await waitForTransactionReceipt(newCosmicSignatureTokenForSigner0_.burnMany(burnSpecs_));
			const mintAndBurnSpecs_ = [
				[contracts_.signers[2].address, 15n,],
				[contracts_.signers[3].address, -17n,],
				[contracts_.signers[1].address, 9n,],
				[contracts_.signers[3].address, 10n,],
			];
			await expect(newCosmicSignatureTokenForSigner0_.mintAndBurnMany(mintAndBurnSpecs_))
				.revertedWithCustomError(newCosmicSignatureTokenForSigner0_, "ERC20InsufficientBalance");
			[mintAndBurnSpecs_[1], mintAndBurnSpecs_[3]] = [mintAndBurnSpecs_[3], mintAndBurnSpecs_[1]];
			await waitForTransactionReceipt(newCosmicSignatureTokenForSigner0_.mintAndBurnMany(mintAndBurnSpecs_));
			const tos_ = [
				contracts_.signers[6].address,
				contracts_.signers[5].address,
				contracts_.signers[4].address,
			];
			await waitForTransactionReceipt(newCosmicSignatureToken_.connect(contracts_.signers[3])["transferMany(address[],uint256)"](tos_, 3));
			const transferSpecs_ = [
				[contracts_.signers[4].address, 2n,],
				[contracts_.signers[5].address, 4n,],
				[contracts_.signers[6].address, 5n,],
			];
			await waitForTransactionReceipt(newCosmicSignatureToken_.connect(contracts_.signers[2])["transferMany((address,uint256)[])"](transferSpecs_));
			expect(await newCosmicSignatureToken_.balanceOf(contracts_.signers[1].address)).equal(10n - (11n - 1n) + 9n);
			expect(await newCosmicSignatureToken_.balanceOf(contracts_.signers[2].address)).equal(20n - 9n + 15n - 2n - 4n - 5n);
			expect(await newCosmicSignatureToken_.balanceOf(contracts_.signers[3].address)).equal(30n - 14n + 10n - 17n - 3n * 3n);
			expect(await newCosmicSignatureToken_.balanceOf(contracts_.signers[4].address)).equal(3n + 2n);
			expect(await newCosmicSignatureToken_.balanceOf(contracts_.signers[5].address)).equal(3n + 4n);
			expect(await newCosmicSignatureToken_.balanceOf(contracts_.signers[6].address)).equal(3n + 5n);
		}
	});

	it("Unauthorized access to restricted methods", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		const pickUnauthorizedCaller_ = () => {
			return ((generateRandomUInt32() & 1) == 0) ? contracts_.ownerSigner : contracts_.signers[0];
		};

		const emptyAray_ = [];

		await expect(contracts_.cosmicSignatureToken.connect(pickUnauthorizedCaller_()).mint(contracts_.signers[1].address, 1n))
			.revertedWithCustomError(contracts_.cosmicSignatureToken, "UnauthorizedCaller");
		await expect(contracts_.cosmicSignatureToken.connect(pickUnauthorizedCaller_())["burn(address,uint256)"](contracts_.signers[1].address, 1n))
			.revertedWithCustomError(contracts_.cosmicSignatureToken, "UnauthorizedCaller");
		await waitForTransactionReceipt(contracts_.cosmicSignatureToken.connect(pickUnauthorizedCaller_())["burn(uint256)"](0n));
		await expect(contracts_.cosmicSignatureToken.connect(pickUnauthorizedCaller_()).burnFrom(contracts_.signers[1].address, 1n))
			.revertedWithCustomError(contracts_.cosmicSignatureToken, "ERC20InsufficientAllowance");
		await expect(contracts_.cosmicSignatureToken.connect(pickUnauthorizedCaller_()).mintMany(emptyAray_))
			.revertedWithCustomError(contracts_.cosmicSignatureToken, "UnauthorizedCaller");
		await expect(contracts_.cosmicSignatureToken.connect(pickUnauthorizedCaller_()).burnMany(emptyAray_))
			.revertedWithCustomError(contracts_.cosmicSignatureToken, "UnauthorizedCaller");
		await expect(contracts_.cosmicSignatureToken.connect(pickUnauthorizedCaller_()).mintAndBurnMany(emptyAray_))
			.revertedWithCustomError(contracts_.cosmicSignatureToken, "UnauthorizedCaller");
	});
});
