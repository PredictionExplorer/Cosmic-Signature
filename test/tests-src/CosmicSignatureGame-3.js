"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");

describe("CosmicSignatureGame-3", function () {
	it("The initialize method is disabled", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		await expect(contracts_.cosmicSignatureGameImplementation.initialize(contracts_.ownerSigner.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidInitialization");
		await expect(contracts_.cosmicSignatureGameImplementation.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidInitialization");
		await expect(contracts_.cosmicSignatureGameProxy.initialize(contracts_.ownerSigner.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidInitialization");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidInitialization");
	});

	// Comment-202412129 relates.
	it("CosmicSignatureGame upgrade using the recommended approach", async function () {
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
		await cosmicSignatureGame2Proxy_.waitForDeployment();
		expect(await cosmicSignatureGame2Proxy_.getAddress()).equal(contracts_.cosmicSignatureGameProxyAddress);
		const cosmicSignatureGame2ImplementationAddress_ = await hre.upgrades.erc1967.getImplementationAddress(contracts_.cosmicSignatureGameProxyAddress);
		expect(cosmicSignatureGame2ImplementationAddress_).not.equal(contracts_.cosmicSignatureGameImplementationAddress);
		const cosmicSignatureGame2Implementation_ = cosmicSignatureGameOpenBidFactory_.attach(cosmicSignatureGame2ImplementationAddress_);
		await expect(cosmicSignatureGame2Proxy_.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(cosmicSignatureGame2Proxy_, "InvalidInitialization");
		await expect(cosmicSignatureGame2Proxy_.connect(contracts_.ownerSigner).initialize2()).revertedWithCustomError(cosmicSignatureGame2Proxy_, "InvalidInitialization");
		await expect(cosmicSignatureGame2Implementation_.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(cosmicSignatureGame2Implementation_, "InvalidInitialization");
		await expect(cosmicSignatureGame2Implementation_.connect(contracts_.ownerSigner).initialize2()).revertedWithCustomError(cosmicSignatureGame2Implementation_, "InvalidInitialization");
		expect(await cosmicSignatureGame2Proxy_.timesEthBidPrice()).equal(3n);
		await waitForTransactionReceipt(cosmicSignatureGame2Proxy_.connect(contracts_.ownerSigner).setTimesEthBidPrice(10n));
		expect(await cosmicSignatureGame2Proxy_.timesEthBidPrice()).equal(10n);
		expect(await cosmicSignatureGame2Implementation_.timesEthBidPrice()).equal(0n);
	});

	// Comment-202412129 relates.
	it("CosmicSignatureGame upgrade using our minimalistic unsafe approach", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		const cosmicSignatureGameOpenBidFactory_ =
			await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid", contracts_.deployerSigner);
		const cosmicSignatureGame2Implementation_ = await cosmicSignatureGameOpenBidFactory_.deploy();
		await cosmicSignatureGame2Implementation_.waitForDeployment();
		const cosmicSignatureGame2ImplementationAddress_ = await cosmicSignatureGame2Implementation_.getAddress();
		await expect(cosmicSignatureGame2Implementation_.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(cosmicSignatureGame2Implementation_, "InvalidInitialization");
		await expect(cosmicSignatureGame2Implementation_.connect(contracts_.ownerSigner).initialize2()).revertedWithCustomError(cosmicSignatureGame2Implementation_, "InvalidInitialization");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).upgradeTo(cosmicSignatureGame2ImplementationAddress_));
		expect(await hre.upgrades.erc1967.getImplementationAddress(contracts_.cosmicSignatureGameProxyAddress)).equal(cosmicSignatureGame2ImplementationAddress_);
		const cosmicSignatureGame2Proxy_ = cosmicSignatureGameOpenBidFactory_.attach(contracts_.cosmicSignatureGameProxyAddress);
		expect(await cosmicSignatureGame2Proxy_.timesEthBidPrice()).equal(0n);
		await expect(cosmicSignatureGame2Proxy_.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(cosmicSignatureGame2Proxy_, "InvalidInitialization");

		// According to Comment-202502164, anybody is permitted to make this call.
		await waitForTransactionReceipt(cosmicSignatureGame2Proxy_.connect(contracts_.signers[5]).initialize2());
		await expect(cosmicSignatureGame2Proxy_.connect(contracts_.signers[5]).initialize2()).revertedWithCustomError(cosmicSignatureGame2Proxy_, "InvalidInitialization");

		expect(await cosmicSignatureGame2Proxy_.timesEthBidPrice()).equal(3n);
		await waitForTransactionReceipt(cosmicSignatureGame2Proxy_.connect(contracts_.ownerSigner).setTimesEthBidPrice(10n));
		expect(await cosmicSignatureGame2Proxy_.timesEthBidPrice()).equal(10n);
		expect(await cosmicSignatureGame2Implementation_.timesEthBidPrice()).equal(0n);
	});

	// `HardhatRuntimeEnvironment.upgrades.upgradeProxy` would not allow doing this.
	// Comment-202412129 relates.
	it("CosmicSignatureGame upgrade to a completely different contract using our minimalistic unsafe approach", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		const brokenEthReceiverFactory_ = await hre.ethers.getContractFactory("BrokenEthReceiver", contracts_.deployerSigner);
		const brokenEthReceiver_ = await brokenEthReceiverFactory_.deploy();
		await brokenEthReceiver_.waitForDeployment();
		const brokenEthReceiverAddress_ = await brokenEthReceiver_.getAddress();
		// await waitForTransactionReceipt(brokenEthReceiver_.transferOwnership(contracts_.ownerSigner.address));

		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).upgradeTo(brokenEthReceiverAddress_));
		const brokenEthReceiverProxy_ = brokenEthReceiverFactory_.attach(contracts_.cosmicSignatureGameProxyAddress);
		// console.info((await brokenEthReceiverProxy_.ethDepositAcceptanceModeCode()).toString());

		// If we upgraded to `CosmicSignatureGameOpenBid`, we would call `brokenEthReceiverProxy_.initialize2` at this point.

		// This and further calls to this method corrupt game proxy state.
		await waitForTransactionReceipt(brokenEthReceiverProxy_.setEthDepositAcceptanceModeCode(2n));

		await expect(contracts_.signers[5].sendTransaction({to: contracts_.cosmicSignatureGameProxyAddress, value: 1n,})).revertedWithPanic(0x01n);
		await waitForTransactionReceipt(brokenEthReceiverProxy_.setEthDepositAcceptanceModeCode(1n));
		await expect(contracts_.signers[5].sendTransaction({to: contracts_.cosmicSignatureGameProxyAddress, value: 1n,})).revertedWith("I am not accepting deposits.");
		await waitForTransactionReceipt(brokenEthReceiverProxy_.setEthDepositAcceptanceModeCode(0n));
		await waitForTransactionReceipt(contracts_.signers[5].sendTransaction({to: contracts_.cosmicSignatureGameProxyAddress, value: 1n,}));
	});

	// Comment-202412129 relates.
	it("Unauthorized or incorrect CosmicSignatureGame upgrade attempts", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		const cosmicSignatureGameOpenBidFactory_ =
			await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid", contracts_.ownerSigner);

		// `onlyOwner`.
		{
			// The recommended approach.
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

			// Our minimalistic unsafe approach.
			{
				/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
				const transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[5]).upgradeTo(contracts_.signers[0].address);
				await expect(transactionResponsePromise_).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
			}
		}

		// `_providedAddressIsNonZero`.
		{
			// The recommended approach.
			{
				// /** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
				const transactionResponsePromise_ =
					hre.upgrades.upgradeProxy(
						hre.ethers.ZeroAddress,
						cosmicSignatureGameOpenBidFactory_,
						{
							kind: "uups",
							call: "initialize2",
						}
					);

				// // It doesn't reach the point where it would revert with this error.
				// await expect(transactionResponsePromise_).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "ZeroAddress");

				try {
					// await waitForTransactionReceipt(transactionResponsePromise_);
					await transactionResponsePromise_;
					expect(false).true;
				} catch (errorObject_) {
					expect(errorObject_.message.startsWith("Contract at 0x0000000000000000000000000000000000000000 doesn't look like an ERC 1967 proxy with a logic contract address")).true;
				}
			}

			// Our minimalistic unsafe approach.
			{
				/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
				const transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).upgradeTo(hre.ethers.ZeroAddress);
				await expect(transactionResponsePromise_).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "ZeroAddress");
			}
		}

		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).setRoundActivationTime(123n));

		// `_onlyRoundIsInactive`.
		{
			// The recommended approach.
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

			// Our minimalistic unsafe approach.
			{
				/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
				const transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).upgradeTo(contracts_.signers[0].address);
				await expect(transactionResponsePromise_).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
			}
		}
	});
});
