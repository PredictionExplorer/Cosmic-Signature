"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { ENABLE_ASSERTS, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");

describe("CosmicSignatureGame-3", function () {
	it("Smoke-test", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		expect(await contracts_.cosmicSignatureGameImplementation.owner()).equal(hre.ethers.ZeroAddress);
		await expect(contracts_.cosmicSignatureGameImplementation.initialize(contracts_.ownerSigner.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidInitialization");
		await expect(contracts_.cosmicSignatureGameImplementation.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidInitialization");
		expect(await contracts_.cosmicSignatureGameProxy.owner()).equal(contracts_.ownerSigner.address);
		await expect(contracts_.cosmicSignatureGameProxy.initialize(contracts_.ownerSigner.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidInitialization");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidInitialization");
	});

	it("CosmicSignatureGame upgrade to CosmicSignatureGameOpenBid", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		const cosmicSignatureGameOpenBidFactory_ =
			await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid", contracts_.ownerSigner);
		const cosmicSignatureGameOpenBidProxy_ =
			await hre.upgrades.upgradeProxy(
				contracts_.cosmicSignatureGameProxy,
				cosmicSignatureGameOpenBidFactory_,
				{
					kind: "uups",
					call: "initializeV2",
				}
			);
		// await cosmicSignatureGameOpenBidProxy_.waitForDeployment();
		expect(await cosmicSignatureGameOpenBidProxy_.getAddress()).equal(contracts_.cosmicSignatureGameProxyAddress);
		const cosmicSignatureGameOpenBidImplementationAddress_ = await hre.upgrades.erc1967.getImplementationAddress(contracts_.cosmicSignatureGameProxyAddress);
		expect(cosmicSignatureGameOpenBidImplementationAddress_).not.equal(contracts_.cosmicSignatureGameImplementationAddress);
		const cosmicSignatureGameOpenBidImplementation_ = cosmicSignatureGameOpenBidFactory_.attach(cosmicSignatureGameOpenBidImplementationAddress_);
		// await expect(cosmicSignatureGameOpenBidProxy_.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(cosmicSignatureGameOpenBidProxy_, "InvalidInitialization");
		await expect(cosmicSignatureGameOpenBidProxy_.connect(contracts_.ownerSigner).initializeV2()).revertedWithCustomError(cosmicSignatureGameOpenBidProxy_, "InvalidInitialization");
		// await expect(cosmicSignatureGameOpenBidImplementation_.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(cosmicSignatureGameOpenBidImplementation_, "InvalidInitialization");
		await expect(cosmicSignatureGameOpenBidImplementation_.connect(contracts_.ownerSigner).initializeV2()).revertedWithCustomError(cosmicSignatureGameOpenBidImplementation_, "InvalidInitialization");
		expect(await cosmicSignatureGameOpenBidProxy_.timesEthBidPrice()).equal(3n);
		await waitForTransactionReceipt(cosmicSignatureGameOpenBidProxy_.connect(contracts_.ownerSigner).setTimesEthBidPrice(10n));
		expect(await cosmicSignatureGameOpenBidProxy_.timesEthBidPrice()).equal(10n);
		expect(await cosmicSignatureGameOpenBidImplementation_.owner()).equal(hre.ethers.ZeroAddress);
		expect(await cosmicSignatureGameOpenBidImplementation_.timesEthBidPrice()).equal(0n);
	});

	it("CosmicSignatureGame upgrade to CosmicSignatureGameV2, and then to CosmicSignatureGameOpenBid", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: 10n ** 18n,}));
		const mainPrizeTime_ = await contracts_.cosmicSignatureGameProxy.mainPrizeTime();
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(mainPrizeTime_),]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize());

		const cosmicSignatureGameV2Factory_ =
			await hre.ethers.getContractFactory("CosmicSignatureGameV2", contracts_.ownerSigner);
		const cosmicSignatureGameV2Proxy_ =
			await hre.upgrades.upgradeProxy(
				contracts_.cosmicSignatureGameProxy,
				cosmicSignatureGameV2Factory_,
				{
					kind: "uups",
					call: "initializeV2",
				}
			);
		// await cosmicSignatureGameV2Proxy_.waitForDeployment();
		expect(await cosmicSignatureGameV2Proxy_.getAddress()).equal(contracts_.cosmicSignatureGameProxyAddress);
		const cosmicSignatureGameV2ImplementationAddress_ = await hre.upgrades.erc1967.getImplementationAddress(contracts_.cosmicSignatureGameProxyAddress);
		expect(cosmicSignatureGameV2ImplementationAddress_).not.equal(contracts_.cosmicSignatureGameImplementationAddress);
		const cosmicSignatureGameV2Implementation_ = cosmicSignatureGameV2Factory_.attach(cosmicSignatureGameV2ImplementationAddress_);
		// await expect(cosmicSignatureGameV2Proxy_.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(cosmicSignatureGameV2Proxy_, "InvalidInitialization");
		{
			/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
			const transactionResponsePromise_ = cosmicSignatureGameV2Proxy_.connect(contracts_.ownerSigner).initializeV2();
			const transactionResponsePromiseAssertion_ = expect(transactionResponsePromise_);
			if (ENABLE_ASSERTS) {
				// `_onlyIfPrevVersionWasInitialized`.
				await transactionResponsePromiseAssertion_.revertedWithPanic(0x1);
			} else {
				// `reinitializer`.
				await transactionResponsePromiseAssertion_.revertedWithCustomError(cosmicSignatureGameV2Implementation_, "InvalidInitialization");
			}
		}
		// await expect(cosmicSignatureGameV2Implementation_.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(cosmicSignatureGameV2Implementation_, "InvalidInitialization");
		{
			/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
			const transactionResponsePromise_ = cosmicSignatureGameV2Implementation_.connect(contracts_.ownerSigner).initializeV2();
			const transactionResponsePromiseAssertion_ = expect(transactionResponsePromise_);
			if (ENABLE_ASSERTS) {
				// `_onlyNonFirstRound`.
				await transactionResponsePromiseAssertion_.revertedWithPanic(0x1);
			} else {
				await transactionResponsePromiseAssertion_.revertedWithCustomError(cosmicSignatureGameV2Implementation_, "InvalidInitialization");
			}
		}
		expect(await cosmicSignatureGameV2Proxy_.cstDutchAuctionDurationChangeDivisor()).equal(250n);
		await waitForTransactionReceipt(cosmicSignatureGameV2Proxy_.connect(contracts_.ownerSigner).setCstDutchAuctionDurationChangeDivisor(234n));
		expect(await cosmicSignatureGameV2Proxy_.cstDutchAuctionDurationChangeDivisor()).equal(234n);
		expect(await cosmicSignatureGameV2Implementation_.owner()).equal(hre.ethers.ZeroAddress);
		expect(await cosmicSignatureGameV2Implementation_.cstDutchAuctionDurationChangeDivisor()).equal(0n);

		const cosmicSignatureGameOpenBidFactory_ =
			await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid", contracts_.ownerSigner);

		// [Comment-202606126]
		// `CosmicSignatureGameOpenBid` will not work correct after an upgrade from `CosmicSignatureGameV2`.
		// And `upgradeProxy` would not allow the upgrade, which is why we need `unsafeSkipStorageCheck`.
		// It's OK as this is just a test.
		// Comment-202606084 relates.
		// [/Comment-202606126]
		const cosmicSignatureGameOpenBidProxy_ =
			await hre.upgrades.upgradeProxy(
				contracts_.cosmicSignatureGameProxy,
				cosmicSignatureGameOpenBidFactory_,
				{
					kind: "uups",
					unsafeSkipStorageCheck: true,
					call: "initializeV2",
				}
			);

		// await cosmicSignatureGameOpenBidProxy_.waitForDeployment();
		expect(await cosmicSignatureGameOpenBidProxy_.getAddress()).equal(contracts_.cosmicSignatureGameProxyAddress);
		const cosmicSignatureGameOpenBidImplementationAddress_ = await hre.upgrades.erc1967.getImplementationAddress(contracts_.cosmicSignatureGameProxyAddress);
		expect(cosmicSignatureGameOpenBidImplementationAddress_).not.equal(contracts_.cosmicSignatureGameImplementationAddress);
		expect(cosmicSignatureGameOpenBidImplementationAddress_).not.equal(cosmicSignatureGameV2ImplementationAddress_);
		expect(await cosmicSignatureGameOpenBidProxy_.timesEthBidPrice()).equal(3n);

		// Comment-202606139 applies.
		const cosmicSignatureGameV2ImplementationByteCodeSize_ =
			// cosmicSignatureGameV2Factory.bytecode.length / 2 - 1;
			(await hre.ethers.provider.getCode(cosmicSignatureGameV2ImplementationAddress_)).length / 2 - 1;
		expect(cosmicSignatureGameV2ImplementationByteCodeSize_).greaterThanOrEqual(21 * 1024);
		console.info(
			"%s",
			"CosmicSignatureGameV2 implementation bytecode size is " +
			cosmicSignatureGameV2ImplementationByteCodeSize_.toString() +
			" bytes, which is less than the maximum allowed by " +
			(24 * 1024 - cosmicSignatureGameV2ImplementationByteCodeSize_).toString() +
			"."
		);
	});

	it("Unauthorized or incorrect CosmicSignatureGame upgrade attempts", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: 10n ** 18n,}));
		const mainPrizeTime_ = await contracts_.cosmicSignatureGameProxy.mainPrizeTime();
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(mainPrizeTime_),]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize());

		const cosmicSignatureGameOpenBidFactory_ =
			await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid", contracts_.ownerSigner);
		const cosmicSignatureGameV2Factory_ =
			await hre.ethers.getContractFactory("CosmicSignatureGameV2", contracts_.ownerSigner);
		const newCosmicSignatureGameFactories_ = [cosmicSignatureGameOpenBidFactory_, cosmicSignatureGameV2Factory_,];

		// A non-compliant proxy contract.
		for (const newCosmicSignatureGameFactory_ of newCosmicSignatureGameFactories_) {
			for (const contractProxyAddress_ of [contracts_.cosmicSignatureGameImplementationAddress, contracts_.charityWalletAddress, hre.ethers.ZeroAddress,]) {
				// /** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
				const transactionResponsePromise_ =
					hre.upgrades.upgradeProxy(
						contractProxyAddress_,
						newCosmicSignatureGameFactory_,
						{
							kind: "uups",
							call: "initializeV2",
						}
					);
				try {
					// await waitForTransactionReceipt(transactionResponsePromise_);
					await transactionResponsePromise_;
					expect(false).true;
				} catch (errorObject_) {
					// console.error("%s", `<***>${errorObject_.message}<***>`);
					expect(errorObject_.message.startsWith(`Contract at ${contractProxyAddress_} doesn't look like an ERC 1967 proxy with a logic contract address`)).true;
				}
			}
		}

		// A non-compliant implementation contract.
		{
			// /** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
			const transactionResponsePromise_ =
				hre.upgrades.upgradeProxy(
					contracts_.cosmicSignatureGameProxy,
					contracts_.charityWalletFactory.connect(contracts_.ownerSigner),
					{
						kind: "uups",
						// call: "initializeV2",
					}
				);
			try {
				// await waitForTransactionReceipt(transactionResponsePromise_);
				await transactionResponsePromise_;
				expect(false).true;
			} catch (errorObject_) {
				// console.error("%s", `<***>${errorObject_.message}<***>`);
				expect(errorObject_.message.startsWith("Contract `contracts/production/CharityWallet.sol:CharityWallet` is not upgrade safe")).true;
			}
		}

		// `onlyOwner`.
		for (const newCosmicSignatureGameFactory_ of newCosmicSignatureGameFactories_) {
			{
				// /** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
				const transactionResponsePromise_ =
					hre.upgrades.upgradeProxy(
						contracts_.cosmicSignatureGameProxy/*.connect(contracts_.signers[5])*/,
						newCosmicSignatureGameFactory_.connect(contracts_.signers[5]),
						{
							kind: "uups",
							call: "initializeV2",
						}
					);
				// await transactionResponsePromise_;
				await expect(transactionResponsePromise_).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
			}
		}

		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).setRoundActivationTime(123n));

		// `_onlyRoundIsInactive`.
		for (const newCosmicSignatureGameFactory_ of newCosmicSignatureGameFactories_) {
			{
				// /** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
				const transactionResponsePromise_ =
					hre.upgrades.upgradeProxy(
						contracts_.cosmicSignatureGameProxy,
						newCosmicSignatureGameFactory_,
						{
							kind: "uups",
							call: "initializeV2",
						}
					);
				// await transactionResponsePromise_;
				await expect(transactionResponsePromise_).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
			}
		}
	});
});
