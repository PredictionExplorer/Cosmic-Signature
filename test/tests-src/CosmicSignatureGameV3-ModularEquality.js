// #region

"use strict";

// #endregion
// #region

// [Comment-202608252]
// Structural gates for the modular delegatecall architecture of the V3 Game (Comment-202608245):
//
//    1. ABI equality: the combined ABI observed at the proxy (the implementation plus the modules,
//       deduplicated in fallback-chain-precedence order) is identical, member for member, to the recorded
//       ABI of the audited monolithic `CosmicSignatureGameV3`
//       (`test/baselines/cosmic-signature-game-v3-abi-baseline.json`).
//    2. Storage layout identity: the implementation and every module pass the OpenZeppelin storage layout
//       compatibility validation against each other in both directions, which, together with them
//       sharing the same trailing gap, means their layouts are identical. (Since the de-duplication
//       restructuring, they all inherit the very same storage chassis source, so this holds
//       by construction; the gate remains to catch any future divergence.) The V2 -> V3 upgrade
//       validation is additionally covered by `CosmicSignatureGameV3-StorageLayout.js`.
//    3. Selector routing: every function selector is served where it is supposed to be served
//       (the implementation dispatches everything except the configuration setters and the ETH donations,
//       which live in the admin module, and the main prize claim with the prize amount views,
//       which live in the prizes module), and a selector unknown to the whole chain reverts with
//       empty revert data, with or without ETH, exactly like the monolith did.
//    4. Bytecode size budgets: every deployed production contract must stay far below the EIP-170 limit,
//       so that future versions cannot silently regress toward the limit (the monolith had 154 bytes
//       of headroom; the implementation now has ~9,900).
//    5. Direct-call safety: calling the implementation or a module at its own address, rather than
//       through the proxy, is harmless. Comment-202608247 applies.
// [/Comment-202608252]

// #endregion
// #region

const nodeFsModule = require("node:fs");
const nodePathModule = require("node:path");
const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { deployV1CompleteRoundZeroAndUpgradeToV2AndV3 } = require("../src/V3UpgradeTestHelpers.js");

// #endregion
// #region Constants.

const abiBaselineFilePath = nodePathModule.join(__dirname, "..", "baselines", "cosmic-signature-game-v3-abi-baseline.json");

// Comment-202608252 applies.
const implementationDeployedBytecodeSizeMaxLimit = 20_000;
const moduleDeployedBytecodeSizeMaxLimit = 22_000;

// #endregion
// #region Helpers.

/** Formats an ABI JSON array into a sorted list of canonical member descriptions, using ethers. */
function canonicalizeAbi(abiJson_) {
	const interface_ = new hre.ethers.Interface(abiJson_);
	const members_ = [];
	interface_.forEachFunction((fragment_) => { members_.push("function " + fragment_.format("full")); });
	interface_.forEachEvent((fragment_) => { members_.push("event " + fragment_.format("full")); });
	interface_.forEachError((fragment_) => { members_.push("error " + fragment_.format("full")); });
	members_.sort();
	return members_;
}

function getInterfaceFunctionNames(interface_) {
	const functionNames_ = new Set();
	interface_.forEachFunction((fragment_) => { functionNames_.add(fragment_.name); });
	return functionNames_;
}

function readArtifactDeployedBytecodeSize(contractName_) {
	const artifact_ = hre.artifacts.readArtifactSync(contractName_);
	return (artifact_.deployedBytecode.length - 2) / 2;
}

// #endregion
// #region The tests.

describe("CosmicSignatureGameV3-ModularEquality", function () {
	// #region ABI equality.

	it("The combined modular ABI is identical to the monolith ABI baseline", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const abiBaseline_ = JSON.parse(nodeFsModule.readFileSync(abiBaselineFilePath, "utf8"));
		const baselineAbiMembers_ = canonicalizeAbi(abiBaseline_.abi);
		const combinedAbiMembers_ = canonicalizeAbi(contracts_.cosmicSignatureGameV3CombinedAbi);
		expect(combinedAbiMembers_).deep.equal(baselineAbiMembers_);
	});

	// #endregion
	// #region Storage layout identity.

	it("The implementation and every module have identical storage layouts", async function () {
		// This uses the same machinery through which the OpenZeppelin Upgrades plugin extracts storage layouts,
		// and then requires the strongest possible property: exact label/slot/offset/type identity
		// of every storage entry, plus the standard OpenZeppelin storage compatibility assertion
		// in both directions for good measure.
		const { getDeployData } = require("@openzeppelin/hardhat-upgrades/dist/utils/deploy-impl.js");
		const { assertStorageUpgradeSafe } = require("@openzeppelin/upgrades-core");

		// Struct and contract type identifiers embed AST node ids, which are irrelevant to the layout;
		// normalizing them away. Array sizes (e.g. the storage gap sizes) are deliberately kept and compared.
		const normalizeType_ = (type_) => (type_.replace(/(t_(?:struct|contract)\([^)]*\))\d+/g, "$1"));
		const normalizeLayout_ = (layout_) =>
			(layout_.storage.map((entry_) => ({label: entry_.label, slot: entry_.slot, offset: entry_.offset, type: normalizeType_(entry_.type),})));

		const zeroAddress_ = hre.ethers.ZeroAddress;
		const implementationDeployData_ =
			await getDeployData(hre, await hre.ethers.getContractFactory("CosmicSignatureGameV3"), {kind: "uups", constructorArgs: [zeroAddress_, zeroAddress_,],});
		const moduleDescriptors_ = [
			{contractName: "CosmicSignatureGameAdminModuleV3", constructorArgs: [zeroAddress_,],},
			{contractName: "CosmicSignatureGamePrizesModuleV3", constructorArgs: [],},
		];
		for (const moduleDescriptor_ of moduleDescriptors_) {
			const moduleDeployData_ =
				await getDeployData(hre, await hre.ethers.getContractFactory(moduleDescriptor_.contractName), {kind: "uups", constructorArgs: moduleDescriptor_.constructorArgs,});
			expect(normalizeLayout_(moduleDeployData_.layout), `Storage layout of ${moduleDescriptor_.contractName} diverged from the implementation's.`)
				.deep.equal(normalizeLayout_(implementationDeployData_.layout));
			assertStorageUpgradeSafe(implementationDeployData_.layout, moduleDeployData_.layout, moduleDeployData_.fullOpts);
			assertStorageUpgradeSafe(moduleDeployData_.layout, implementationDeployData_.layout, implementationDeployData_.fullOpts);
		}
	});

	// #endregion
	// #region Selector routing.

	it("Every selector is served where intended and unknown selectors revert empty", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;

		// The implementation dispatches everything except the two module areas (Comment-202608248):
		// it declares the whole user action API, every state variable getter, and every computed view
		// of the bidding/statistics area, and it declares none of the configuration setters,
		// the ETH donations, or the prize amount views.
		{
			const implementationFunctionNames_ = getInterfaceFunctionNames(contracts_.cosmicSignatureGameV3Factory.interface);
			for (
				const expectedFunctionName_ of
				[
					// The user action API, including the `claimMainPrize` forwarder.
					"bidWithEth", "bidWithEthAndDonateToken", "bidWithEthAndDonateNft",
					"bidWithCst", "bidWithCstAndDonateToken", "bidWithCstAndDonateNft",
					"claimMainPrize",

					// A sample of the state variable getters (the `public` storage chassis).
					"roundNum", "nextEthBidPrice", "mainPrizeTime", "championDurations", "bidRaffleCumulativeWeights",

					// A sample of the computed views and the owner action served by the implementation.
					"getNextEthBidPrice", "getNextCstBidPriceAdvanced", "getBidCstRewardAmountAdvanced",
					"getCstDutchAuctionDurations", "getRoundLateBidDuration", "getDurationUntilMainPrize",
					"getTotalNumBids", "tryGetCurrentChampions", "halveEthDutchAuctionEndingBidPrice",

					// The upgrade machinery.
					"reinitialize", "owner", "upgradeToAndCall", "proxiableUUID",
				]
			) {
				expect(implementationFunctionNames_.has(expectedFunctionName_), `The implementation is expected to declare ${expectedFunctionName_}.`).equal(true);
			}
			for (
				const moduleOnlyFunctionName_ of
				[
					// The admin module: configuration setters and ETH donations.
					"setBidMessageLengthMaxLimit", "setMainPrizeNumCosmicSignatureNfts", "setRoundActivationTime",
					"setCstDutchAuctionDuration", "donateEth", "donateEthWithInfo", "numEthDonationWithInfoRecords",

					// The prizes module: prize amount views.
					"getMainEthPrizeAmount", "getCharityEthDonationAmount",
				]
			) {
				expect(implementationFunctionNames_.has(moduleOnlyFunctionName_), `${moduleOnlyFunctionName_} is expected to be served by a module, not by the implementation.`).equal(false);
			}
		}

		// A sample of every routed area works at the proxy:
		// a state getter and a computed view (dispatched by the implementation itself),
		// an admin setter (routed through 1 forwarding hop), and a prize view (routed through 2 hops).
		expect(await game_.roundNum()).equal(1n);
		expect(await game_.getNextEthBidPrice()).greaterThan(0n);
		expect(await game_.getMainEthPrizeAmount()).greaterThanOrEqual(0n);
		await game_.connect(contracts_.ownerSigner).setBidMessageLengthMaxLimit(1234n);
		expect(await game_.bidMessageLengthMaxLimit()).equal(1234n);

		// A selector unknown to the whole chain reverts with empty revert data, with or without ETH,
		// exactly like the monolith did.
		await expect(
			hre.ethers.provider.call({to: contracts_.cosmicSignatureGameProxyAddress, data: "0xdeadbeef",})
		).revertedWithoutReason();
		await expect(
			contracts_.signers[0].sendTransaction({to: contracts_.cosmicSignatureGameProxyAddress, data: "0xdeadbeef", value: 1n,})
		).revertedWithoutReason();
	});

	// #endregion
	// #region Bytecode size budgets.

	it("Every production contract stays far below the EIP-170 bytecode size limit", function () {
		expect(readArtifactDeployedBytecodeSize("CosmicSignatureGameV3")).lessThanOrEqual(implementationDeployedBytecodeSizeMaxLimit);
		expect(readArtifactDeployedBytecodeSize("CosmicSignatureGameAdminModuleV3")).lessThanOrEqual(moduleDeployedBytecodeSizeMaxLimit);
		expect(readArtifactDeployedBytecodeSize("CosmicSignatureGamePrizesModuleV3")).lessThanOrEqual(moduleDeployedBytecodeSizeMaxLimit);
	});

	// #endregion
	// #region Direct-call safety.

	it("Calling the implementation or a module directly, not through the proxy, is harmless", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const caller_ = contracts_.signers[10];

		// Comment-202608247 applies.
		// The implementation at its own address: its constructor permanently disabled initializers
		// and set its own `roundActivationTime` far into the future (Comment-202608281).
		{
			const implementation_ =
				contracts_.cosmicSignatureGameV3Factory.attach(contracts_.cosmicSignatureGameV3ImplementationAddress);

			// An ETH bid reverts on the implementation's own empty storage:
			// with a panic (division by the zero `ethBidPriceIncreaseDivisor` in the production build;
			// a fired assertion in the assert-enabled build). No ETH is ever accepted.
			await expect(implementation_.connect(caller_).bidWithEth((-1n), "", 0n, {value: 10n ** 18n,}))
				.revertedWithPanic();
			await expect(caller_.sendTransaction({to: contracts_.cosmicSignatureGameV3ImplementationAddress, value: 10n ** 18n,}))
				.revertedWithPanic();

			// A CST bid hits the round-inactivity check
			// (the implementation's own `roundActivationTime` is in the year 9000).
			await expect(implementation_.connect(caller_).bidWithCst(10n ** 30n, "", 0n))
				.revertedWithCustomError(implementation_, "RoundIsInactive");

			// The implementation's own `owner()` is the zero address, so every `onlyOwner` function reverts.
			expect(await implementation_.owner()).equal(hre.ethers.ZeroAddress);
			await expect(implementation_.connect(caller_).halveEthDutchAuctionEndingBidPrice())
				.revertedWithCustomError(implementation_, "OwnableUnauthorizedAccount");

			// The `claimMainPrize` forwarder dead-ends on the implementation's own empty storage.
			// (The error originates in the prizes module's code, so it is decoded through that interface.)
			await expect(implementation_.connect(caller_).claimMainPrize())
				.revertedWithCustomError(contracts_.cosmicSignatureGamePrizesModule, "NoBidsPlacedInCurrentRound");
		}

		// Comment-202608247 applies.
		for (const module_ of [contracts_.cosmicSignatureGameAdminModule, contracts_.cosmicSignatureGamePrizesModule,]) {
			const moduleAddress_ = await module_.getAddress();

			// The modules' own `owner()` is the zero address, so every `onlyOwner` function reverts.
			if (module_ === contracts_.cosmicSignatureGameAdminModule) {
				expect(await module_.owner()).equal(hre.ethers.ZeroAddress);
				await expect(module_.connect(caller_).setBidMessageLengthMaxLimit(1n))
					.revertedWithCustomError(module_, "OwnableUnauthorizedAccount");
			}

			// The main prize claim dead-ends on the modules' own empty storage.
			if (module_ === contracts_.cosmicSignatureGamePrizesModule) {
				await expect(module_.connect(caller_).claimMainPrize())
					.revertedWithCustomError(module_, "NoBidsPlacedInCurrentRound");
			}

			// The modules' initializers are permanently disabled.
			expect(await hre.ethers.provider.getStorage(moduleAddress_, "0xf0c57e16840df040f15088dc2f81fe391c3923bec73e23a9662efc9c229c6a00"))
				.equal("0x000000000000000000000000000000000000000000000000ffffffffffffffff");
		}

		// The implementation's initializers are permanently disabled too.
		expect(await hre.ethers.provider.getStorage(contracts_.cosmicSignatureGameV3ImplementationAddress, "0xf0c57e16840df040f15088dc2f81fe391c3923bec73e23a9662efc9c229c6a00"))
			.equal("0x000000000000000000000000000000000000000000000000ffffffffffffffff");

		// None of the above touched the proxy's state.
		expect(await contracts_.cosmicSignatureGameV3Proxy.roundNum()).equal(1n);
	});

	// #endregion
});

// #endregion
