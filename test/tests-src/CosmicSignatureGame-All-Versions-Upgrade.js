// #region

"use strict";

// #endregion
// #region

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { INITIAL_CST_DUTCH_AUCTION_DURATION } = require("../../src/CosmicSignatureConstants.js");
const { ENABLE_ASSERTS, generateRandomUInt32, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");
const { upgradeToV2, assertDefaultV2Initialization } = require("../src/V2UpgradeTestHelpers.js");
const { upgradeToV3, assertDefaultV3Initialization } = require("../src/V3UpgradeTestHelpers.js");
const { testGameRounds, activateRoundBidAndClaimMainPrize } = require("../src/GameRoundTestHelpers.js");

// #endregion
// #region

const gameUpgrades = [
	{ versionNumber: 2, upgrade: upgradeToV2, assertInitialization: assertDefaultV2Initialization },
	{ versionNumber: 3, upgrade: upgradeToV3, assertInitialization: assertDefaultV3Initialization },
];

// #endregion
// #region

async function expectReinitializeUnavailable(game_, signer_) {
	const expectation_ = expect(game_.connect(signer_).reinitialize());
	if (ENABLE_ASSERTS) {
		// The version/round assertions precede the reinitializer guard.
		await expectation_.revertedWithPanic(0x01n);
	} else {
		await expectation_.revertedWithCustomError(game_, "InvalidInitialization");
	}
}

// #endregion
// #region `describe`

describe("CosmicSignatureGame-All-Versions-Upgrade", function () {
	it("Smoke-test", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		expect(await contracts_.cosmicSignatureGameImplementation.owner()).equal(hre.ethers.ZeroAddress);
		await expect(contracts_.cosmicSignatureGameImplementation.initialize(contracts_.ownerSigner.address)).revertedWithCustomError(contracts_.cosmicSignatureGameImplementation, "InvalidInitialization");
		await expect(contracts_.cosmicSignatureGameImplementation.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(contracts_.cosmicSignatureGameImplementation, "InvalidInitialization");
		expect(await contracts_.cosmicSignatureGameProxy.owner()).equal(contracts_.ownerSigner.address);
		await expect(contracts_.cosmicSignatureGameProxy.initialize(contracts_.ownerSigner.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidInitialization");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidInitialization");
	});

	it("Upgrading CosmicSignatureGame ==> CosmicSignatureGameOpenBid", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		const cosmicSignatureGameOpenBidFactory_ =
			await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid", contracts_.ownerSigner);
		const cosmicSignatureGameOpenBidProxy_ =
			await hre.upgrades.upgradeProxy(
				contracts_.cosmicSignatureGameProxy,
				cosmicSignatureGameOpenBidFactory_,
				{
					kind: "uups",
					call: "reinitialize",
				}
			);
		// await cosmicSignatureGameOpenBidProxy_.waitForDeployment();
		expect(await cosmicSignatureGameOpenBidProxy_.getAddress()).equal(contracts_.cosmicSignatureGameProxyAddress);
		const cosmicSignatureGameOpenBidImplementationAddress_ = await hre.upgrades.erc1967.getImplementationAddress(contracts_.cosmicSignatureGameProxyAddress);
		expect(cosmicSignatureGameOpenBidImplementationAddress_).not.equal(contracts_.cosmicSignatureGameImplementationAddress);
		const cosmicSignatureGameOpenBidImplementation_ = cosmicSignatureGameOpenBidFactory_.attach(cosmicSignatureGameOpenBidImplementationAddress_);
		// await expect(cosmicSignatureGameOpenBidProxy_.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(cosmicSignatureGameOpenBidProxy_, "InvalidInitialization");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithoutReason();
		await expect(cosmicSignatureGameOpenBidProxy_.connect(contracts_.ownerSigner).reinitialize()).revertedWithCustomError(cosmicSignatureGameOpenBidProxy_, "InvalidInitialization");
		// await expect(cosmicSignatureGameOpenBidImplementation_.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(cosmicSignatureGameOpenBidImplementation_, "InvalidInitialization");
		await expect(cosmicSignatureGameOpenBidImplementation_.connect(contracts_.ownerSigner).reinitialize()).revertedWithCustomError(cosmicSignatureGameOpenBidImplementation_, "InvalidInitialization");
		expect(await cosmicSignatureGameOpenBidProxy_.timesEthBidPrice()).equal(3n);
		await waitForTransactionReceipt(cosmicSignatureGameOpenBidProxy_.connect(contracts_.ownerSigner).setTimesEthBidPrice(10n));
		expect(await cosmicSignatureGameOpenBidProxy_.timesEthBidPrice()).equal(10n);
		expect(await cosmicSignatureGameOpenBidImplementation_.owner()).equal(hre.ethers.ZeroAddress);
		expect(await cosmicSignatureGameOpenBidImplementation_.timesEthBidPrice()).equal(0n);
	});

	it("Upgrading CosmicSignatureGame ==> CosmicSignatureGameV2 ==> CosmicSignatureGameV3 ==> CosmicSignatureGameOpenBid", async function () {
		// #region

		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		// #endregion
		// #region

		// [Comment-202606139]
		// Similar logic exists in multiple places.
		// [/Comment-202606139]
		const cosmicSignatureGameImplementationByteCodeSize_ =
			// cosmicSignatureGameFactory.bytecode.length / 2 - 1;
			(await hre.ethers.provider.getCode(contracts_.cosmicSignatureGameImplementationAddress)).length / 2 - 1;
		expect(cosmicSignatureGameImplementationByteCodeSize_).greaterThanOrEqual(18 * 1024);
		console.info(
			"%s",
			"CosmicSignatureGame implementation bytecode size is " +
			cosmicSignatureGameImplementationByteCodeSize_.toString() +
			" bytes, which is less than the maximum allowed by " +
			(24 * 1024 - cosmicSignatureGameImplementationByteCodeSize_).toString() +
			"."
		);

		// #endregion
		// #region

		await testGameRounds(contracts_, contracts_.cosmicSignatureGameProxy, activateRoundBidAndClaimMainPrize, 1 + generateRandomUInt32() % 4);

		// #endregion
		// #region

		const cosmicSignatureGameV2Factory_ =
			await hre.ethers.getContractFactory("CosmicSignatureGameV2", contracts_.ownerSigner);
		const cosmicSignatureGameV2Proxy_ =
			await hre.upgrades.upgradeProxy(
				contracts_.cosmicSignatureGameProxy,
				cosmicSignatureGameV2Factory_,
				{
					kind: "uups",
					call: "reinitialize",
				}
			);
		// await cosmicSignatureGameV2Proxy_.waitForDeployment();
		expect(await cosmicSignatureGameV2Proxy_.getAddress()).equal(contracts_.cosmicSignatureGameProxyAddress);
		const cosmicSignatureGameV2ImplementationAddress_ = await hre.upgrades.erc1967.getImplementationAddress(contracts_.cosmicSignatureGameProxyAddress);
		expect(cosmicSignatureGameV2ImplementationAddress_).not.equal(contracts_.cosmicSignatureGameImplementationAddress);
		const cosmicSignatureGameV2Implementation_ = cosmicSignatureGameV2Factory_.attach(cosmicSignatureGameV2ImplementationAddress_);
		// await expect(cosmicSignatureGameV2Proxy_.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(cosmicSignatureGameV2Proxy_, "InvalidInitialization");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithoutReason();
		await expectReinitializeUnavailable(cosmicSignatureGameV2Proxy_, contracts_.ownerSigner);
		await expectReinitializeUnavailable(cosmicSignatureGameV2Proxy_, contracts_.signers[9]);
		// await expect(cosmicSignatureGameV2Implementation_.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(cosmicSignatureGameV2Implementation_, "InvalidInitialization");
		await expectReinitializeUnavailable(cosmicSignatureGameV2Implementation_, contracts_.ownerSigner);
		expect(await cosmicSignatureGameV2Proxy_.cstDutchAuctionDurationChangeDivisor()).equal(250n);
		await waitForTransactionReceipt(cosmicSignatureGameV2Proxy_.connect(contracts_.ownerSigner).setCstDutchAuctionDurationChangeDivisor(234n));
		expect(await cosmicSignatureGameV2Proxy_.cstDutchAuctionDurationChangeDivisor()).equal(234n);
		expect(await cosmicSignatureGameV2Implementation_.owner()).equal(hre.ethers.ZeroAddress);
		expect(await cosmicSignatureGameV2Implementation_.cstDutchAuctionDurationChangeDivisor()).equal(0n);

		// Comment-202606139 applies.
		const cosmicSignatureGameV2ImplementationByteCodeSize_ =
			// cosmicSignatureGameV2Factory.bytecode.length / 2 - 1;
			(await hre.ethers.provider.getCode(cosmicSignatureGameV2ImplementationAddress_)).length / 2 - 1;
		expect(cosmicSignatureGameV2ImplementationByteCodeSize_).greaterThanOrEqual(18 * 1024);
		console.info(
			"%s",
			"CosmicSignatureGameV2 implementation bytecode size is " +
			cosmicSignatureGameV2ImplementationByteCodeSize_.toString() +
			" bytes, which is less than the maximum allowed by " +
			(24 * 1024 - cosmicSignatureGameV2ImplementationByteCodeSize_).toString() +
			"."
		);

		// #endregion
		// #region

		await testGameRounds(contracts_, cosmicSignatureGameV2Proxy_, activateRoundBidAndClaimMainPrize, /* 1 + */ generateRandomUInt32() % /* 4 */ 5);

		// #endregion
		// #region

		const cosmicSignatureGameV3Factory_ =
			await hre.ethers.getContractFactory("CosmicSignatureGameV3", contracts_.ownerSigner);
		const cosmicSignatureGameV3Proxy_ =
			await hre.upgrades.upgradeProxy(
				contracts_.cosmicSignatureGameProxy,
				cosmicSignatureGameV3Factory_,
				{
					kind: "uups",
					call: "reinitialize",
				}
			);
		// await cosmicSignatureGameV3Proxy_.waitForDeployment();
		expect(await cosmicSignatureGameV3Proxy_.getAddress()).equal(contracts_.cosmicSignatureGameProxyAddress);
		const cosmicSignatureGameV3ImplementationAddress_ = await hre.upgrades.erc1967.getImplementationAddress(contracts_.cosmicSignatureGameProxyAddress);
		expect(cosmicSignatureGameV3ImplementationAddress_).not.equal(cosmicSignatureGameV2ImplementationAddress_);
		const cosmicSignatureGameV3Implementation_ = cosmicSignatureGameV3Factory_.attach(cosmicSignatureGameV3ImplementationAddress_);
		// await expect(cosmicSignatureGameV3Proxy_.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(cosmicSignatureGameV3Proxy_, "InvalidInitialization");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithoutReason();
		await expectReinitializeUnavailable(cosmicSignatureGameV3Proxy_, contracts_.ownerSigner);
		await expectReinitializeUnavailable(cosmicSignatureGameV3Proxy_, contracts_.signers[9]);
		// await expect(cosmicSignatureGameV3Implementation_.connect(contracts_.ownerSigner).initialize(contracts_.ownerSigner.address)).revertedWithCustomError(cosmicSignatureGameV3Implementation_, "InvalidInitialization");
		await expectReinitializeUnavailable(cosmicSignatureGameV3Implementation_, contracts_.ownerSigner);
		expect(await cosmicSignatureGameV3Proxy_.roundLateBidDurationDivisor()).equal(3_000_000n);
		expect(await cosmicSignatureGameV3Proxy_.mainPrizeNumCosmicSignatureNfts()).equal(3n);
		await waitForTransactionReceipt(cosmicSignatureGameV3Proxy_.connect(contracts_.ownerSigner).setMainPrizeNumCosmicSignatureNfts(5n));
		expect(await cosmicSignatureGameV3Proxy_.mainPrizeNumCosmicSignatureNfts()).equal(5n);
		expect(await cosmicSignatureGameV3Implementation_.owner()).equal(hre.ethers.ZeroAddress);
		expect(await cosmicSignatureGameV3Implementation_.mainPrizeNumCosmicSignatureNfts()).equal(0n);

		// Comment-202606139 applies.
		const cosmicSignatureGameV3ImplementationByteCodeSize_ =
			// cosmicSignatureGameV3Factory.bytecode.length / 2 - 1;
			(await hre.ethers.provider.getCode(cosmicSignatureGameV3ImplementationAddress_)).length / 2 - 1;
		expect(cosmicSignatureGameV3ImplementationByteCodeSize_).greaterThanOrEqual(20 * 1024);
		console.info(
			"%s",
			"CosmicSignatureGameV3 implementation bytecode size is " +
			cosmicSignatureGameV3ImplementationByteCodeSize_.toString() +
			" bytes, which is less than the maximum allowed by " +
			(24 * 1024 - cosmicSignatureGameV3ImplementationByteCodeSize_).toString() +
			"."
		);

		// #endregion
		// #region

		await testGameRounds(contracts_, cosmicSignatureGameV3Proxy_, activateRoundBidAndClaimMainPrize);

		// #endregion
		// #region

		const cosmicSignatureGameOpenBidFactory_ =
			await hre.ethers.getContractFactory("CosmicSignatureGameOpenBid", contracts_.ownerSigner);

		// [Comment-202606126]
		// `CosmicSignatureGameOpenBid` will not work correct after an upgrade from V2+.
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
					call: "reinitialize",
				}
			);

		// await cosmicSignatureGameOpenBidProxy_.waitForDeployment();
		expect(await cosmicSignatureGameOpenBidProxy_.getAddress()).equal(contracts_.cosmicSignatureGameProxyAddress);
		const cosmicSignatureGameOpenBidImplementationAddress_ = await hre.upgrades.erc1967.getImplementationAddress(contracts_.cosmicSignatureGameProxyAddress);
		expect(cosmicSignatureGameOpenBidImplementationAddress_).not.equal(cosmicSignatureGameV3ImplementationAddress_);
		expect(await cosmicSignatureGameOpenBidProxy_.timesEthBidPrice()).equal(3n);

		// #endregion
	});

	it("documents that roundNum > 0 is assert-only in reinitialize", async function () {
		const contracts_ = { ...await loadFixtureDeployContractsForTesting(-1_000_000_000n) };
		expect(await contracts_.cosmicSignatureGameProxy.roundNum()).equal(0n);
		const factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV2", contracts_.ownerSigner);

		if (ENABLE_ASSERTS) {
			await expect(
				hre.upgrades.upgradeProxy(
					contracts_.cosmicSignatureGameProxy,
					factory_,
					{ kind: "uups", call: "reinitialize" }
				)
			).revertedWithPanic(0x1);
		} else {
			await upgradeToV2(contracts_);
			expect(await contracts_.cosmicSignatureGameV2Proxy.roundNum()).equal(0n);
			expect(await contracts_.cosmicSignatureGameV2Proxy.getNextEthBidPrice()).equal(0n);
		}
	});

	it("documents that roundNum > 0 is assert-only in reinitialize, through the whole V1 -> V2 -> V3 chain", async function () {
		const contracts_ = { ...await loadFixtureDeployContractsForTesting(-1_000_000_000n) };
		expect(await contracts_.cosmicSignatureGameProxy.roundNum()).equal(0n);

		if (ENABLE_ASSERTS) {
			// The chain already stops at the V2 upgrade (`_onlyNonFirstRound` fires); V3 is unreachable at round 0.
			const cosmicSignatureGameV2Factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV2", contracts_.ownerSigner);
			await expect(
				hre.upgrades.upgradeProxy(
					contracts_.cosmicSignatureGameProxy,
					cosmicSignatureGameV2Factory_,
					{ kind: "uups", call: "reinitialize" }
				)
			).revertedWithPanic(0x1);
		} else {
			// In a production build, nothing stops upgrading all the way to V3 at round 0,
			// which leaves the game with a broken zero ETH bid price.
			await upgradeToV2(contracts_);
			await upgradeToV3(contracts_);
			const gameV3_ = contracts_.cosmicSignatureGameV3Proxy;
			expect(await gameV3_.roundNum()).equal(0n);
			await assertDefaultV3Initialization(gameV3_);
			expect(await gameV3_.getNextEthBidPrice()).equal(0n);
		}
	});

	it("a bare upgrade leaves one permissionless reinitialize call per version", async function () {
		const contracts_ = { ...await loadFixtureDeployContractsForTesting(-1_000_000_000n) };
		await testGameRounds(contracts_, contracts_.cosmicSignatureGameProxy, activateRoundBidAndClaimMainPrize, 1 + generateRandomUInt32() % 4);
		for (const [upgradeIndex_, upgrade_] of gameUpgrades.entries()) {
			// Deliberately omit the atomic reinitialize call used by the production upgrade task.
			await upgrade_.upgrade(contracts_, { call: undefined });
			const game_ = contracts_[`cosmicSignatureGameV${upgrade_.versionNumber}Proxy`];
			if (upgrade_.versionNumber === 2) {
				expect(await game_.cstDutchAuctionDuration()).not.equal(INITIAL_CST_DUTCH_AUCTION_DURATION);
			} else if (upgrade_.versionNumber === 3) {
				expect(await game_.mainPrizeNumCosmicSignatureNfts()).equal(0n);
			}
			await waitForTransactionReceipt(game_.connect(contracts_.signers[9]).reinitialize());
			await upgrade_.assertInitialization(game_);
			await expectReinitializeUnavailable(game_, contracts_.ownerSigner);
			await expectReinitializeUnavailable(game_, contracts_.signers[9]);
			const numRounds_ = (upgradeIndex_ === gameUpgrades.length - 1) ? 4 : 1 + generateRandomUInt32() % 4;
			await testGameRounds(contracts_, game_, activateRoundBidAndClaimMainPrize, numRounds_);
		}
	});

	it("asserts that the preceding version was initialized", async function () {
		for (let skippedUpgradeIndex_ = 0; skippedUpgradeIndex_ < gameUpgrades.length - 1; ++ skippedUpgradeIndex_) {
			const contracts_ = { ...await loadFixtureDeployContractsForTesting(-1_000_000_000n) };
			await testGameRounds(contracts_, contracts_.cosmicSignatureGameProxy, activateRoundBidAndClaimMainPrize, 1 + generateRandomUInt32() % 4);
			for (let upgradeIndex_ = 0; upgradeIndex_ < skippedUpgradeIndex_; ++ upgradeIndex_) {
				const upgrade_ = gameUpgrades[upgradeIndex_];
				await upgrade_.upgrade(contracts_);
				await testGameRounds(contracts_, contracts_[`cosmicSignatureGameV${upgrade_.versionNumber}Proxy`], activateRoundBidAndClaimMainPrize, 1 + generateRandomUInt32() % 4);
			}
			const skippedUpgrade_ = gameUpgrades[skippedUpgradeIndex_];
			await skippedUpgrade_.upgrade(contracts_, { call: undefined });
			const skippedGame_ = contracts_[`cosmicSignatureGameV${skippedUpgrade_.versionNumber}Proxy`];
			const rawCstDutchAuctionDuration_ = await skippedGame_.cstDutchAuctionDuration();
			if (skippedUpgrade_.versionNumber === 2) {
				expect(rawCstDutchAuctionDuration_).not.equal(INITIAL_CST_DUTCH_AUCTION_DURATION);
			}
			const nextUpgrade_ = gameUpgrades[skippedUpgradeIndex_ + 1];
			if (ENABLE_ASSERTS) {
				const factory_ = await hre.ethers.getContractFactory(`CosmicSignatureGameV${nextUpgrade_.versionNumber}`, contracts_.ownerSigner);
				await expect(hre.upgrades.upgradeProxy(contracts_.cosmicSignatureGameProxy, factory_, { kind: "uups", call: "reinitialize" }))
					.revertedWithPanic(0x01n);
			} else {
				await nextUpgrade_.upgrade(contracts_);
				const game_ = contracts_[`cosmicSignatureGameV${nextUpgrade_.versionNumber}Proxy`];
				await nextUpgrade_.assertInitialization(game_);
				if (skippedUpgrade_.versionNumber === 2) {
					// V3 does not initialize the repurposed V2 duration slot.
					expect(await game_.cstDutchAuctionDuration()).equal(rawCstDutchAuctionDuration_);
				}
			}
		}
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
							call: "reinitialize",
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
						// call: "reinitialize",
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
							call: "reinitialize",
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
							call: "reinitialize",
						}
					);
				// await transactionResponsePromise_;
				await expect(transactionResponsePromise_).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
			}
		}
	});
});

// #endregion
