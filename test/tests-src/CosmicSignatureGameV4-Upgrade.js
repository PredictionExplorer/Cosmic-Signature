"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { readValidations } = require("@openzeppelin/hardhat-upgrades/dist/utils/validations");
const { getUnlinkedBytecode, getVersion, getStorageLayout, getStorageUpgradeReport, withValidationDefaults } = require("@openzeppelin/upgrades-core");
const { TIMESTAMP_9000_01_01 } = require("../../src/CosmicSignatureConstants.js");
const { ENABLE_HARDHAT_PREPROCESSOR, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { deployV1CompleteRoundZeroAndUpgradeToV2 } = require("../src/V2UpgradeTestHelpers.js");
const { deployV1CompleteRoundZeroAndUpgradeToV2AndV3 } = require("../src/V3UpgradeTestHelpers.js");
const { activateRoundBidAndClaimMainPrize, bidWithEthAt } = require("../src/GameRoundTestHelpers.js");
const { activateCurrentRound, getLatestBlockTimestamp } = require("../src/V2UpgradeTestHelpers.js");
const { deployArtAuction, upgradeToV4, snapshotV3Storage } = require("../src/V4UpgradeTestHelpers.js");

const deployedV3 = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/deployed-storage-layouts/arbitrumOne-CosmicSignatureGameV3.json"), "utf8"));

async function v4Layout() {
	const factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV4");
	const validations_ = await readValidations(hre);
	return getStorageLayout(validations_, getVersion(getUnlinkedBytecode(validations_, factory_.bytecode), factory_.bytecode));
}

describe("CosmicSignatureGameV4-Upgrade", function () {
	it("keeps production runtime and creation bytecode within deployment limits", async function () {
		if (ENABLE_HARDHAT_PREPROCESSOR) this.skip();

		// The shared stress-test network permits oversized contracts. Check production artifacts
		// explicitly so a future change cannot pass locally while becoming undeployable.
		for (const contractName_ of ["CosmicSignatureGameV4", "CosmicSignatureArtAuction"]) {
			const artifact_ = await hre.artifacts.readArtifact(contractName_);
			expect((artifact_.deployedBytecode.length - 2) / 2, `${contractName_} runtime`).at.most(24_576);
			const constructorBytes_ = contractName_ === "CosmicSignatureArtAuction" ? 64 : 0;
			expect((artifact_.bytecode.length - 2) / 2 + constructorBytes_, `${contractName_} initialization code`).at.most(49_152);
		}
	});

	it("consumes exactly slot 314 and preserves the deployed V3 layout and namespace storage", async function () {
		const layout_ = await v4Layout();
		const report_ = getStorageUpgradeReport(deployedV3.layout, layout_, withValidationDefaults({}));
		expect(report_.ok, report_.explain()).equal(true);
		for (const original_ of deployedV3.layout.storage.slice(0, -1)) {
			const current_ = layout_.storage.find(item_ => item_.slot === original_.slot && item_.offset === original_.offset);
			expect(current_, original_.label).not.undefined;
			expect(current_.label).equal(original_.label);
			expect(layout_.types[current_.type].label).equal(deployedV3.layout.types[original_.type].label);
		}
		expect(layout_.storage.find(item_ => item_.label === "artAuction")).include({ slot: "314", offset: 0 });
		const oldGap_ = deployedV3.layout.storage.at(-1);
		const newGap_ = layout_.storage.at(-1);
		expect(newGap_).include({ label: "__gap_persistent", slot: "315" });
		const gapEnd_ = (layout__, gap__) => BigInt(gap__.slot) + BigInt(layout__.types[gap__.type].numberOfBytes) / 32n;
		expect(gapEnd_(layout_, newGap_)).equal(gapEnd_(deployedV3.layout, oldGap_));
		expect(Object.keys(layout_.namespaces ?? {}).sort()).deep.equal(Object.keys(deployedV3.layout.namespaces ?? {}).sort());
	});

	it("preserves every V3 scalar slot, configured economics, historical mappings, balances and token ownership", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const before_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateRoundBidAndClaimMainPrize(contracts_, before_);
		await waitForTransactionReceipt(before_.connect(contracts_.ownerSigner).setRoundActivationTime(TIMESTAMP_9000_01_01));
		await waitForTransactionReceipt(before_.connect(contracts_.ownerSigner).setCstPrizeAmount(777n));
		await waitForTransactionReceipt(before_.connect(contracts_.ownerSigner).setMainPrizeNumCosmicSignatureNfts(5n));
		await waitForTransactionReceipt(before_.connect(contracts_.ownerSigner).setMainEthPrizeAmountPercentage(17n));
		await waitForTransactionReceipt(before_.connect(contracts_.ownerSigner).setBidCstRewardAmountMultiplier(123456n));
		await waitForTransactionReceipt(before_.connect(contracts_.ownerSigner).donateEthWithInfo("preserved V3 contribution", { value: 123n }));
		const auction_ = await deployArtAuction(contracts_);
		const slots_ = await snapshotV3Storage(contracts_.cosmicSignatureGameProxyAddress);
		const historicalStats_ = await before_.roundStats(1n);
		const historicalBid_ = await before_.getBidInfoAt(1n, 0n);
		const contribution_ = await before_.ethDonationWithInfoRecords(0n);
		const balance_ = await hre.ethers.provider.getBalance(contracts_.cosmicSignatureGameProxyAddress);
		const nftSupply_ = await contracts_.cosmicSignatureNft.totalSupply();
		const cstSupply_ = await contracts_.cosmicSignatureToken.totalSupply();
		const tokenOwner_ = await contracts_.cosmicSignatureNft.ownerOf(0n);
		const game_ = await upgradeToV4(contracts_, auction_);
		expect(await snapshotV3Storage(contracts_.cosmicSignatureGameProxyAddress)).deep.equal(slots_);
		expect(await game_.owner()).equal(contracts_.ownerSigner.address);
		expect(await game_.roundStats(1n)).deep.equal(historicalStats_);
		expect(await game_.getBidInfoAt(1n, 0n)).deep.equal(historicalBid_);
		expect(await game_.ethDonationWithInfoRecords(0n)).deep.equal(contribution_);
		expect(await hre.ethers.provider.getBalance(contracts_.cosmicSignatureGameProxyAddress)).equal(balance_);
		expect(await contracts_.cosmicSignatureNft.totalSupply()).equal(nftSupply_);
		expect(await contracts_.cosmicSignatureToken.totalSupply()).equal(cstSupply_);
		expect(await contracts_.cosmicSignatureNft.ownerOf(0n)).equal(tokenOwner_);
		expect(await game_.artAuction()).equal(await auction_.getAddress());
		expect(await auction_.registeredRounds(0n)).equal(false);
		expect(await auction_.registeredRounds(1n)).equal(false);
		await expect(game_.initializeV4(auction_)).revertedWithCustomError(game_, "InvalidInitialization");
		await expect(game_.reinitialize()).revertedWithCustomError(game_, "V4InitializationRequired");
	});

	it("requires owner authorization, V3 initialization, a matching auction, and an inactive cycle", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const auction_ = await deployArtAuction(contracts_);
		const factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV4", contracts_.ownerSigner);
		const implementation_ = await factory_.deploy();
		await implementation_.waitForDeployment();
		const before_ = contracts_.cosmicSignatureGameV3Proxy;
		const init_ = factory_.interface.encodeFunctionData("initializeV4", [await auction_.getAddress()]);
		await expect(before_.connect(contracts_.signers[2]).upgradeToAndCall(implementation_, init_))
			.revertedWithCustomError(before_, "OwnableUnauthorizedAccount");
		for (const invalidAddress_ of [hre.ethers.ZeroAddress, contracts_.signers[2].address]) {
			await expect(before_.connect(contracts_.ownerSigner).upgradeToAndCall(implementation_, factory_.interface.encodeFunctionData("initializeV4", [invalidAddress_])))
				.revertedWithCustomError(implementation_, "InvalidArtAuction");
		}
		const doubleFactory_ = await hre.ethers.getContractFactory("ArtAuctionRegistrationTestDouble", contracts_.ownerSigner);
		for (const [gameAddress_, nftAddress_] of [[contracts_.signers[2].address, contracts_.cosmicSignatureNftAddress], [contracts_.cosmicSignatureGameProxyAddress, contracts_.signers[2].address]]) {
			const double_ = await doubleFactory_.deploy(gameAddress_, nftAddress_);
			await double_.waitForDeployment();
			await expect(before_.connect(contracts_.ownerSigner).upgradeToAndCall(implementation_, factory_.interface.encodeFunctionData("initializeV4", [await double_.getAddress()])))
				.revertedWithCustomError(implementation_, "InvalidArtAuction");
		}
		await activateCurrentRound(before_, contracts_.ownerSigner);
		await bidWithEthAt(before_, contracts_.signers[1], await getLatestBlockTimestamp() + 1n);
		await expect(before_.connect(contracts_.ownerSigner).upgradeToAndCall(implementation_, init_))
			.revertedWithCustomError(before_, "RoundIsActive");
		await expect(implementation_.initializeV4(auction_)).revertedWithCustomError(implementation_, "OwnableUnauthorizedAccount");

		const v2Contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2();
		const v2Auction_ = await deployArtAuction(v2Contracts_);
		await expect(upgradeToV4(v2Contracts_, v2Auction_)).revertedWithCustomError(factory_, "InvalidInitialization");
	});

	it("does not let an attacker initialize a bare upgrade before its owner configures it", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const auction_ = await deployArtAuction(contracts_);
		const game_ = await upgradeToV4(contracts_, auction_, { call: undefined });
		await expect(game_.connect(contracts_.signers[2]).initializeV4(auction_)).revertedWithCustomError(game_, "OwnableUnauthorizedAccount");
		expect(await game_.artAuction()).equal(hre.ethers.ZeroAddress);
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).initializeV4(auction_));
		expect(await game_.artAuction()).equal(await auction_.getAddress());
	});

	it("fails closed instead of finalizing without an auction after an unsupported bare upgrade", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const auction_ = await deployArtAuction(contracts_);
		const game_ = await upgradeToV4(contracts_, auction_, { call: undefined });
		await activateCurrentRound(game_, contracts_.ownerSigner);
		await bidWithEthAt(game_, contracts_.signers[1], await getLatestBlockTimestamp() + 1n);
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime())]);
		const supply_ = await contracts_.cosmicSignatureNft.totalSupply();
		await expect(game_.connect(contracts_.signers[1]).claimMainPrize()).revertedWithCustomError(game_, "V4InitializationRequired");
		expect(await contracts_.cosmicSignatureNft.totalSupply()).equal(supply_);
		expect(await game_.roundNum()).equal(1n);
	});

	it("upgrades from the actual recorded deployed V3 runtime, not only the current V3 source", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		expect(hre.ethers.keccak256(deployedV3.runtimeBytecode)).equal(deployedV3.runtimeBytecodeKeccak256);
		await hre.ethers.provider.send("hardhat_setCode", [deployedV3.implementationAddress, deployedV3.runtimeBytecode]);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameV3Proxy.connect(contracts_.ownerSigner).upgradeToAndCall(deployedV3.implementationAddress, "0x"));
		const slots_ = await snapshotV3Storage(contracts_.cosmicSignatureGameProxyAddress);
		const auction_ = await deployArtAuction(contracts_);
		const factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV4", contracts_.ownerSigner);
		const implementation_ = await factory_.deploy();
		await implementation_.waitForDeployment();
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameV3Proxy.connect(contracts_.ownerSigner).upgradeToAndCall(implementation_, factory_.interface.encodeFunctionData("initializeV4", [await auction_.getAddress()])));
		const game_ = factory_.attach(contracts_.cosmicSignatureGameProxyAddress);
		expect(await snapshotV3Storage(contracts_.cosmicSignatureGameProxyAddress)).deep.equal(slots_);
		expect(await game_.artAuction()).equal(await auction_.getAddress());
		const receipt_ = await activateRoundBidAndClaimMainPrize(contracts_, game_);
		expect(receipt_.status).equal(1);
		expect(await auction_.registeredRounds(1n)).equal(true);
	});
});
