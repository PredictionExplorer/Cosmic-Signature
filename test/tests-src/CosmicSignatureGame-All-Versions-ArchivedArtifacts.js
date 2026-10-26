"use strict";

const nodeFsModule = require("node:fs/promises");
const nodeOsModule = require("node:os");
const nodePathModule = require("node:path");
const { describe, it, after } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { Artifacts } = require("hardhat/internal/artifacts");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsAdvanced } = require("../../src/ContractDeploymentHelpers.js");
const { storeContractDeployedByteCodeAtAddress } = require("../../src/ContractTestingHelpers.js");
const { completeRoundZero } = require("../src/V2UpgradeTestHelpers.js");

let archivedV2BuildPromise;
let temporaryCacheFolderPath;

async function deployArchivedV1Contracts() {
	return withArchivedV2Build(async () => {
		await storeContractDeployedByteCodeAtAddress("FakeArbSys", "0x0000000000000000000000000000000000000064");
		await storeContractDeployedByteCodeAtAddress("FakeArbGasInfo", "0x000000000000000000000000000000000000006C");
		const signers_ = await hre.ethers.getSigners();
		const ownerSigner_ = signers_[0];
		const contracts_ = await deployContractsAdvanced(ownerSigner_, "CosmicSignatureGame", "", "", false, 2n);
		return Object.freeze({ ...contracts_, ownerSigner: ownerSigner_, signers: signers_ });
	});
}

/** Selects the archived build matching the active compilation flags, without changing either build's files. */
async function withArchivedV2Build(action_) {
	const currentPaths_ = hre.config.paths;
	const currentArtifacts_ = hre.artifacts;
	archivedV2BuildPromise ??= prepareArchivedV2Build(currentPaths_);
	const archivedV2Build_ = await archivedV2BuildPromise;

	try {
		hre.config.paths = { ...currentPaths_, artifacts: archivedV2Build_.artifactsFolderPath, cache: temporaryCacheFolderPath };
		hre.artifacts = archivedV2Build_.artifacts;

		// Await the action before finally restores the HRE. Calls to this helper must not overlap.
		return await action_();
	} finally {
		hre.artifacts = currentArtifacts_;
		hre.config.paths = currentPaths_;
	}
}

/** Prepares one validation-cache copy and artifact manager for all archived-build calls in this suite. */
async function prepareArchivedV2Build(currentPaths_) {
	const buildConfigurationName_ = nodePathModule.basename(currentPaths_.artifacts);
	const currentArtifactsParentFolderPath_ = nodePathModule.dirname(currentPaths_.artifacts);
	const archiveFolderPath_ = nodePathModule.join(nodePathModule.dirname(currentArtifactsParentFolderPath_), "archive", "v2");
	const archivedArtifactsFolderPath_ = nodePathModule.join(archiveFolderPath_, nodePathModule.basename(currentArtifactsParentFolderPath_), buildConfigurationName_);
	temporaryCacheFolderPath = await nodeFsModule.mkdtemp(nodePathModule.join(nodeOsModule.tmpdir(), "cosmic-signature-archived-validation-"));

	// OpenZeppelin locks and may update its validation cache, so give it a private copy.
	await nodeFsModule.copyFile(
		nodePathModule.join(archiveFolderPath_, "cache", buildConfigurationName_, "validations.json"),
		nodePathModule.join(temporaryCacheFolderPath, "validations.json")
	);

	return { artifactsFolderPath: archivedArtifactsFolderPath_, artifacts: new Artifacts(archivedArtifactsFolderPath_) };
}

describe("CosmicSignatureGame-All-Versions-ArchivedArtifacts", function () {
	it("deploys archived V1, upgrades through archived V2 to current V3, and rejects the removed getter", async function () {
		const contracts_ = await loadFixture(deployArchivedV1Contracts);
		const gameV1_ = contracts_.cosmicSignatureGameProxy;
		const proxyAddress_ = contracts_.cosmicSignatureGameProxyAddress;
		expect(await gameV1_.getTotalNumBids(0n)).equal(0n);

		// Finish round zero before upgrading, and leave nonzero historical data to read through each version.
		await completeRoundZero(contracts_, 0);
		expect(await gameV1_.getTotalNumBids(0n)).equal(1n);

		const gameV2_ = await withArchivedV2Build(async () => {
			const factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV2", contracts_.ownerSigner);
			return hre.upgrades.upgradeProxy(gameV1_, factory_, { kind: "uups", call: "initializeV2" });
		});
		expect(await gameV2_.getAddress()).equal(proxyAddress_);
		const v2ImplementationAddress_ = await hre.upgrades.erc1967.getImplementationAddress(proxyAddress_);
		expect(v2ImplementationAddress_).not.equal(contracts_.cosmicSignatureGameImplementationAddress);
		expect(await gameV2_.getTotalNumBids(0n)).equal(1n);
		expect(await gameV2_.getTotalNumBids(1n)).equal(0n);

		// The previous implementation's layout is already in OpenZeppelin's network manifest.
		// Normal upgradeProxy validation compares it with V3 from the restored current build.
		const v3Factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV3", contracts_.ownerSigner);
		const gameV3_ = await hre.upgrades.upgradeProxy(gameV2_, v3Factory_, { kind: "uups", call: "reinitialize" });
		expect(await gameV3_.getAddress()).equal(proxyAddress_);
		expect(await hre.upgrades.erc1967.getImplementationAddress(proxyAddress_)).not.equal(v2ImplementationAddress_);
		expect(await gameV3_.roundNum()).equal(1n);
		expect((await gameV3_.roundStats(0n)).numBids).equal(1n);
		expect((await gameV3_.getBidInfoAt(0n, 0n)).bidderAddress).equal(contracts_.ownerSigner.address);
		expect(gameV3_.interface.getFunction("getTotalNumBids")).equal(null);

		// Use the historical ABI so this reaches V3 and reverts on-chain, rather than failing in JavaScript.
		await expect(gameV2_.getTotalNumBids(0n)).revertedWithoutReason();
	});

	after(async function () {
		// Also clean up if preparing the validation-cache copy or running a test failed.
		if (temporaryCacheFolderPath !== undefined) {
			await nodeFsModule.rm(temporaryCacheFolderPath, { recursive: true, force: true });
			temporaryCacheFolderPath = undefined;
		}
		archivedV2BuildPromise = undefined;
	});
});
