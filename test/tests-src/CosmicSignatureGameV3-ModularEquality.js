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
//       sharing the same trailing gap, means their layouts are identical. The V2 -> V3 upgrade validation
//       is additionally covered by `CosmicSignatureGameV3-StorageLayout.js`.
//    3. Selector routing: every function selector is served where it is supposed to be served,
//       and a selector unknown to the whole chain reverts with empty revert data, with or without ETH,
//       exactly like the monolith did.
//    4. Bytecode size budgets: every deployed production contract must stay far below the EIP-170 limit;
//       the implementation gets the strictest budget, so that future versions cannot silently regress
//       toward the limit (the monolith had 154 bytes of headroom; the implementation now has ~17000).
//    5. Direct-call safety: calling a module at its own address, rather than through the proxy,
//       is harmless. Comment-202608247 applies.
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
			{contractName: "CosmicSignatureGameViewsModuleV3", constructorArgs: [zeroAddress_,],},
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

		// The implementation itself dispatches exactly the hot path and the upgrade machinery.
		{
			const implementationInterface_ = contracts_.cosmicSignatureGameV3Factory.interface;
			const implementationFunctionNames_ = [];
			implementationInterface_.forEachFunction((fragment_) => { implementationFunctionNames_.push(fragment_.name); });
			implementationFunctionNames_.sort();
			expect(implementationFunctionNames_).deep.equal(
				[
					"UPGRADE_INTERFACE_VERSION",
					"bidWithCst",
					"bidWithEth",
					"claimMainPrize",
					"owner",
					"proxiableUUID",
					"reinitialize",
					"renounceOwnership",
					"transferOwnership",
					"upgradeToAndCall",
				]
			);
		}

		// A sample of every routed area works at the proxy:
		// a state getter, a computed view, and an admin setter (routed through 2 forwarding hops).
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
		expect(readArtifactDeployedBytecodeSize("CosmicSignatureGameViewsModuleV3")).lessThanOrEqual(moduleDeployedBytecodeSizeMaxLimit);
		expect(readArtifactDeployedBytecodeSize("CosmicSignatureGameAdminModuleV3")).lessThanOrEqual(moduleDeployedBytecodeSizeMaxLimit);
		expect(readArtifactDeployedBytecodeSize("CosmicSignatureGamePrizesModuleV3")).lessThanOrEqual(moduleDeployedBytecodeSizeMaxLimit);
	});

	// #endregion
	// #region Direct-call safety.

	it("Calling a module directly, not through the proxy, is harmless", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const caller_ = contracts_.signers[10];

		// Comment-202608247 applies.
		for (const module_ of [contracts_.cosmicSignatureGameViewsModule, contracts_.cosmicSignatureGameAdminModule, contracts_.cosmicSignatureGamePrizesModule,]) {
			const moduleAddress_ = await module_.getAddress();

			// Every bid path reverts on the modules' own empty storage:
			// an ETH bid panics computing the ETH Dutch auction price (division by the zero divisor
			// in the production build; a fired assertion in the assert-enabled build),
			// and a CST bid hits the round-inactivity check (the modules' own `roundActivationTime`
			// is the maximum value). Either way, no direct bid can succeed, and no ETH is ever accepted.
			if (module_ === contracts_.cosmicSignatureGameViewsModule) {
				await expect(module_.connect(caller_).bidWithEth((-1n), "", 0n, {value: 10n ** 18n,}))
					.revertedWithPanic();
				await expect(caller_.sendTransaction({to: moduleAddress_, value: 10n ** 18n,}))
					.revertedWithPanic();
				await expect(module_.connect(caller_).bidWithCst(10n ** 30n, "", 0n))
					.revertedWithCustomError(module_, "RoundIsInactive");
				await expect(module_.connect(caller_).halveEthDutchAuctionEndingBidPrice())
					.revertedWithCustomError(module_, "OwnableUnauthorizedAccount");
			}

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

		// None of the above touched the proxy's state.
		expect(await contracts_.cosmicSignatureGameV3Proxy.roundNum()).equal(1n);
	});

	// #endregion
});

// #endregion
