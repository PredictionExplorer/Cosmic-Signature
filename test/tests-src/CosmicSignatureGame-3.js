"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");

describe("CosmicSignatureGame-3", function () {
	it("Smoke-test", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		await expect(contracts_.cosmicSignatureGameImplementation.initialize(contracts_.ownerSigner.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidInitialization");
		await expect(contracts_.cosmicSignatureGameImplementation.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidInitialization");
		expect(await contracts_.cosmicSignatureGameImplementation.owner()).equal(hre.ethers.ZeroAddress);
		await expect(contracts_.cosmicSignatureGameProxy.initialize(contracts_.ownerSigner.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidInitialization");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidInitialization");
	});

	it("CosmicSignatureGame upgrade", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		const cosmicSignatureGameOpenBidFactory_ =
			await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid", contracts_.ownerSigner);
		const cosmicSignatureGame2Proxy_ =
			await hre.upgrades.upgradeProxy(
				contracts_.cosmicSignatureGameProxy,
				cosmicSignatureGameOpenBidFactory_,
				{
					kind: "uups",
					call: "initialize2",
				}
			);
		// await cosmicSignatureGame2Proxy_.waitForDeployment();
		expect(await cosmicSignatureGame2Proxy_.getAddress()).equal(contracts_.cosmicSignatureGameProxyAddress);
		const cosmicSignatureGame2ImplementationAddress_ = await hre.upgrades.erc1967.getImplementationAddress(contracts_.cosmicSignatureGameProxyAddress);
		expect(cosmicSignatureGame2ImplementationAddress_).not.equal(contracts_.cosmicSignatureGameImplementationAddress);
		const cosmicSignatureGame2Implementation_ = cosmicSignatureGameOpenBidFactory_.attach(cosmicSignatureGame2ImplementationAddress_);
		// await expect(cosmicSignatureGame2Proxy_.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(cosmicSignatureGame2Proxy_, "InvalidInitialization");
		await expect(cosmicSignatureGame2Proxy_.connect(contracts_.ownerSigner).initialize2()).revertedWithCustomError(cosmicSignatureGame2Proxy_, "InvalidInitialization");
		// await expect(cosmicSignatureGame2Implementation_.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(cosmicSignatureGame2Implementation_, "InvalidInitialization");
		await expect(cosmicSignatureGame2Implementation_.connect(contracts_.ownerSigner).initialize2()).revertedWithCustomError(cosmicSignatureGame2Implementation_, "InvalidInitialization");
		expect(await cosmicSignatureGame2Proxy_.timesEthBidPrice()).equal(3n);
		await waitForTransactionReceipt(cosmicSignatureGame2Proxy_.connect(contracts_.ownerSigner).setTimesEthBidPrice(10n));
		expect(await cosmicSignatureGame2Proxy_.timesEthBidPrice()).equal(10n);
		expect(await cosmicSignatureGame2Implementation_.owner()).equal(hre.ethers.ZeroAddress);
		expect(await cosmicSignatureGame2Implementation_.timesEthBidPrice()).equal(0n);
	});

	it("Unauthorized or incorrect CosmicSignatureGame upgrade attempts", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		const cosmicSignatureGameOpenBidFactory_ =
			await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid", contracts_.ownerSigner);

		// A non-compliant proxy contract.
		for (const contractProxyAddress_ of [contracts_.charityWalletAddress, hre.ethers.ZeroAddress,]) {
			// /** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
			const transactionResponsePromise_ =
				hre.upgrades.upgradeProxy(
					contractProxyAddress_,
					cosmicSignatureGameOpenBidFactory_,
					{
						kind: "uups",
						call: "initialize2",
					}
				);
			try {
				// await waitForTransactionReceipt(transactionResponsePromise_);
				await transactionResponsePromise_;
				expect(false).true;
			} catch (errorObject_) {
				// console.error("<***>" + errorObject_.message + "<***>");
				expect(errorObject_.message.startsWith(`Contract at ${contractProxyAddress_} doesn't look like an ERC 1967 proxy with a logic contract address`)).true;
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
						// call: "initialize2",
					}
				);
			try {
				// await waitForTransactionReceipt(transactionResponsePromise_);
				await transactionResponsePromise_;
				expect(false).true;
			} catch (errorObject_) {
				// console.error("<***>" + errorObject_.message + "<***>");
				expect(errorObject_.message.startsWith("Contract `contracts/production/CharityWallet.sol:CharityWallet` is not upgrade safe")).true;
			}
		}

		// `onlyOwner`.
		{
			// /** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
			const transactionResponsePromise_ =
				hre.upgrades.upgradeProxy(
					contracts_.cosmicSignatureGameProxy/*.connect(contracts_.signers[5])*/,
					cosmicSignatureGameOpenBidFactory_.connect(contracts_.signers[5]),
					{
						kind: "uups",
						call: "initialize2",
					}
				);
			// await transactionResponsePromise_;
			await expect(transactionResponsePromise_).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		}

		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).setRoundActivationTime(123n));

		// `_onlyRoundIsInactive`.
		{
			// /** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
			const transactionResponsePromise_ =
				hre.upgrades.upgradeProxy(
					contracts_.cosmicSignatureGameProxy,
					cosmicSignatureGameOpenBidFactory_,
					{
						kind: "uups",
						call: "initialize2",
					}
				);
			// await transactionResponsePromise_;
			await expect(transactionResponsePromise_).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
		}
	});
});
