"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixtureDeployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("CosmicSignatureGame-3", function () {
	it("The initialize method is disabled", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		await expect(contracts_.cosmicSignatureGameImplementation.initialize(contracts_.ownerAcct.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidInitialization");
		await expect(contracts_.cosmicSignatureGameImplementation.connect(contracts_.ownerAcct).initialize(contracts_.ownerAcct.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidInitialization");
		await expect(contracts_.cosmicSignatureGameProxy.initialize(contracts_.ownerAcct.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidInitialization");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct).initialize(contracts_.ownerAcct.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidInitialization");
	});

	// Comment-202412129 relates.
	it("CosmicSignatureGame upgrade using the recommended approach", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const cosmicSignatureGameOpenBidFactory_ =
			await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid", contracts_.ownerAcct);
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
		expect(await cosmicSignatureGame2Proxy_.getAddress()).equal(contracts_.cosmicSignatureGameProxyAddr);
		const cosmicSignatureGame2ImplementationAddr_ = await hre.upgrades.erc1967.getImplementationAddress(contracts_.cosmicSignatureGameProxyAddr);
		expect(cosmicSignatureGame2ImplementationAddr_).not.equal(contracts_.cosmicSignatureGameImplementationAddr);
		const cosmicSignatureGame2Implementation_ = cosmicSignatureGameOpenBidFactory_.attach(cosmicSignatureGame2ImplementationAddr_);
		await expect(cosmicSignatureGame2Proxy_.connect(contracts_.ownerAcct).initialize(contracts_.ownerAcct.address)).revertedWithCustomError(cosmicSignatureGame2Proxy_, "InvalidInitialization");
		await expect(cosmicSignatureGame2Proxy_.connect(contracts_.ownerAcct).initialize2()).revertedWithCustomError(cosmicSignatureGame2Proxy_, "InvalidInitialization");
		await expect(cosmicSignatureGame2Implementation_.connect(contracts_.ownerAcct).initialize(contracts_.ownerAcct.address)).revertedWithCustomError(cosmicSignatureGame2Implementation_, "InvalidInitialization");
		await expect(cosmicSignatureGame2Implementation_.connect(contracts_.ownerAcct).initialize2()).revertedWithCustomError(cosmicSignatureGame2Implementation_, "InvalidInitialization");
		expect(await cosmicSignatureGame2Proxy_.timesEthBidPrice()).equal(3n);
		await expect(cosmicSignatureGame2Proxy_.connect(contracts_.ownerAcct).setTimesEthBidPrice(10n)).not.reverted;
		expect(await cosmicSignatureGame2Proxy_.timesEthBidPrice()).equal(10n);
		expect(await cosmicSignatureGame2Implementation_.timesEthBidPrice()).equal(0n);
	});

	// Comment-202412129 relates.
	it("CosmicSignatureGame upgrade using our minimalistic unsafe approach", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const cosmicSignatureGameOpenBidFactory_ =
			await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid", contracts_.deployerAcct);
		const cosmicSignatureGame2Implementation_ = await cosmicSignatureGameOpenBidFactory_.deploy();
		await cosmicSignatureGame2Implementation_.waitForDeployment();
		const cosmicSignatureGame2ImplementationAddr_ = await cosmicSignatureGame2Implementation_.getAddress();
		await expect(cosmicSignatureGame2Implementation_.connect(contracts_.ownerAcct).initialize(contracts_.ownerAcct.address)).revertedWithCustomError(cosmicSignatureGame2Implementation_, "InvalidInitialization");
		await expect(cosmicSignatureGame2Implementation_.connect(contracts_.ownerAcct).initialize2()).revertedWithCustomError(cosmicSignatureGame2Implementation_, "InvalidInitialization");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct).upgradeTo(cosmicSignatureGame2ImplementationAddr_)).not.reverted;
		expect(await hre.upgrades.erc1967.getImplementationAddress(contracts_.cosmicSignatureGameProxyAddr)).equal(cosmicSignatureGame2ImplementationAddr_);
		const cosmicSignatureGame2Proxy_ = cosmicSignatureGameOpenBidFactory_.attach(contracts_.cosmicSignatureGameProxyAddr);
		expect(await cosmicSignatureGame2Proxy_.timesEthBidPrice()).equal(0n);
		await expect(cosmicSignatureGame2Proxy_.connect(contracts_.ownerAcct).initialize(contracts_.ownerAcct.address)).revertedWithCustomError(cosmicSignatureGame2Proxy_, "InvalidInitialization");

		// According to Comment-202502164, anybody is permitted to make this call.
		await expect(cosmicSignatureGame2Proxy_.connect(contracts_.signers[5]).initialize2()).not.reverted;
		await expect(cosmicSignatureGame2Proxy_.connect(contracts_.signers[5]).initialize2()).revertedWithCustomError(cosmicSignatureGame2Proxy_, "InvalidInitialization");

		expect(await cosmicSignatureGame2Proxy_.timesEthBidPrice()).equal(3n);
		await expect(cosmicSignatureGame2Proxy_.connect(contracts_.ownerAcct).setTimesEthBidPrice(10n)).not.reverted;
		expect(await cosmicSignatureGame2Proxy_.timesEthBidPrice()).equal(10n);
		expect(await cosmicSignatureGame2Implementation_.timesEthBidPrice()).equal(0n);
	});

	// `HardhatRuntimeEnvironment.upgrades.upgradeProxy` would not allow doing this.
	// Comment-202412129 relates.
	it("CosmicSignatureGame upgrade to a completely different contract using our minimalistic unsafe approach", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const brokenEthReceiverFactory_ = await hre.ethers.getContractFactory("BrokenEthReceiver", contracts_.deployerAcct);
		const brokenEthReceiver_ = await brokenEthReceiverFactory_.deploy();
		await brokenEthReceiver_.waitForDeployment();
		const brokenEthReceiverAddr_ = await brokenEthReceiver_.getAddress();

		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct).upgradeTo(brokenEthReceiverAddr_)).not.reverted;
		const brokenEthReceiverProxy_ = brokenEthReceiverFactory_.attach(contracts_.cosmicSignatureGameProxyAddr);
		// console.info((await brokenEthReceiverProxy_.ethDepositAcceptanceModeCode()).toString());

		// If we upgraded to `CosmicSignatureGameOpenBid`, we would call `brokenEthReceiverProxy_.initialize2` at this point.

		// This and further calls to this method corrupt game proxy state.
		await expect(brokenEthReceiverProxy_.setEthDepositAcceptanceModeCode(2)).not.reverted;

		await expect(contracts_.signers[5].sendTransaction({to: contracts_.cosmicSignatureGameProxyAddr, value: 1n,})).revertedWithPanic(0x01n);
		await expect(brokenEthReceiverProxy_.setEthDepositAcceptanceModeCode(1)).not.reverted;
		await expect(contracts_.signers[5].sendTransaction({to: contracts_.cosmicSignatureGameProxyAddr, value: 1n,})).revertedWith("I am not accepting deposits.");
		await expect(brokenEthReceiverProxy_.setEthDepositAcceptanceModeCode(0)).not.reverted;
		await expect(contracts_.signers[5].sendTransaction({to: contracts_.cosmicSignatureGameProxyAddr, value: 1n,})).not.reverted;
	});

	// Comment-202412129 relates.
	it("Unauthorized or incorrect CosmicSignatureGame upgrade attempts", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const cosmicSignatureGameOpenBidFactory_ =
			await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid", contracts_.ownerAcct);

		// `onlyOwner`.
		{
			// The recommended approach.
			{
				const transactionResponseFuture_ =
					hre.upgrades.upgradeProxy(
						contracts_.cosmicSignatureGameProxy/*.connect(contracts_.signers[5])*/,
						cosmicSignatureGameOpenBidFactory_.connect(contracts_.signers[5]),
						{
							kind: "uups",
							call: "initialize2",
						}
					);
				// await transactionResponseFuture_;
				await expect(transactionResponseFuture_).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
			}

			// Our minimalistic unsafe approach.
			{
				const transactionResponseFuture_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[5]).upgradeTo(contracts_.signers[0].address);
				await expect(transactionResponseFuture_).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
			}
		}

		// `_providedAddressIsNonZero`.
		{
			// The recommended approach.
			{
				const transactionResponseFuture_ =
					hre.upgrades.upgradeProxy(
						hre.ethers.ZeroAddress,
						cosmicSignatureGameOpenBidFactory_,
						{
							kind: "uups",
							call: "initialize2",
						}
					);

				// // It doesn't reach the point where it would revert with this error.
				// await expect(transactionResponseFuture_).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "ZeroAddress");

				try {
					await transactionResponseFuture_;
					expect(false);
				} catch (errorObject_) {
					expect(errorObject_.message).equal("Contract at 0x0000000000000000000000000000000000000000 doesn't look like an ERC 1967 proxy with a logic contract address\n\n");
				}
			}

			// Our minimalistic unsafe approach.
			{
				const transactionResponseFuture_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct).upgradeTo(hre.ethers.ZeroAddress);
				await expect(transactionResponseFuture_).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "ZeroAddress");
			}
		}

		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct).setRoundActivationTime(123n)).not.reverted;

		// `_onlyRoundIsInactive`.
		{
			// The recommended approach.
			{
				const transactionResponseFuture_ =
					hre.upgrades.upgradeProxy(
						contracts_.cosmicSignatureGameProxy,
						cosmicSignatureGameOpenBidFactory_,
						{
							kind: "uups",
							call: "initialize2",
						}
					);
				// await transactionResponseFuture_;
				await expect(transactionResponseFuture_).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
			}

			// Our minimalistic unsafe approach.
			{
				const transactionResponseFuture_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct).upgradeTo(contracts_.signers[0].address);
				await expect(transactionResponseFuture_).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
			}
		}
	});
});
