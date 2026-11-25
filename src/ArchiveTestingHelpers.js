"use strict";

const nodeOs = require("node:os");
const nodePath = require("node:path");
const nodeFs = require("node:fs");
const hre = require("hardhat");
const { Artifacts } = require("hardhat/internal/artifacts");

// Append archives in deployment order so each release keeps its snapshot index.
const archivedSnapshotBranchNames = [
	"20260505-v1-archive",
	"20260625-CosmicSignatureGameV2-archive",
];
const INITIAL_DEPLOYMENT_SNAPSHOT_INDEX = 0;
const COSMIC_SIGNATURE_GAME_V2_SNAPSHOT_INDEX = 1;
const COSMIC_SIGNATURE_GAME_V3_SNAPSHOT_INDEX = 2;
const CURRENT_CODEBASE_SNAPSHOT_INDEX = archivedSnapshotBranchNames.length;
const archivedArtifactsAndCacheBySnapshotIndex = [];

/**
Run an action with the selected codebase snapshot's Hardhat artifacts and OpenZeppelin validations.
@template ActionReturnValue_
@param {number} codebaseSnapshotIndex_
@param {() => Promise<ActionReturnValue_>} action_
@returns {Promise<ActionReturnValue_>}
*/
async function withCodebaseSnapshotArtifacts(codebaseSnapshotIndex_, action_) {
	if (codebaseSnapshotIndex_ === CURRENT_CODEBASE_SNAPSHOT_INDEX) {
		return /* await */ action_();
	}

	const currentPaths_ = hre.config.paths;
	const currentArtifacts_ = hre.artifacts;
	const archivedArtifactsAndCache_ = getArchivedArtifactsAndCache(codebaseSnapshotIndex_, currentPaths_);

	// Hardhat 2 types this property as readonly, but its runtime and plugins share this writable instance.
	// Issue. This is a hack that has a chance to stop working with a future version of Hardhat.
	/** @type {{ artifacts: typeof currentArtifacts_ }} */
	const writableHre_ = hre;

	try {
		hre.config.paths = {
			...currentPaths_,
			cache: archivedArtifactsAndCache_.cacheFolderPath,
			artifacts: archivedArtifactsAndCache_.artifactsFolderPath,
		};
		writableHre_.artifacts = archivedArtifactsAndCache_.artifacts;

		// Await the action before restoring `hre` properties. Each Mocha worker selects one snapshot at a time.
		return await action_();
	} finally {
		writableHre_.artifacts = currentArtifacts_;
		hre.config.paths = currentPaths_;
	}
}

function getArchivedArtifactsAndCache(codebaseSnapshotIndex_, currentPaths_) {
	if ( ! (Number.isInteger(codebaseSnapshotIndex_) && codebaseSnapshotIndex_ >= 0 && codebaseSnapshotIndex_ < archivedSnapshotBranchNames.length) ) {
		throw new RangeError(`Unknown codebase snapshot index: ${codebaseSnapshotIndex_}`);
	}
	const cachedArtifactsAndCache_ = archivedArtifactsAndCacheBySnapshotIndex[codebaseSnapshotIndex_];
	if (cachedArtifactsAndCache_ !== undefined) {
		return cachedArtifactsAndCache_;
	}

	const archiveBranchName_ = archivedSnapshotBranchNames[codebaseSnapshotIndex_];
	const buildConfigurationName_ = nodePath.basename(currentPaths_.artifacts);
	const archiveFolderPath_ = nodePath.join(currentPaths_.root, "archives", archiveBranchName_);
	const artifactsFolderPath_ = nodePath.join(archiveFolderPath_, "artifacts", buildConfigurationName_);

	// OpenZeppelin locks its cache and can rewrite it. Each test worker gets a private copy for each archive.
	const cacheFolderPath_ = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "cosmic-signature-validations-"));
	process.once("exit", () => nodeFs.rmSync(cacheFolderPath_, { recursive: true, force: true }));
	nodeFs.copyFileSync(
		nodePath.join(archiveFolderPath_, "cache", buildConfigurationName_, "validations.json"),
		nodePath.join(cacheFolderPath_, "validations.json")
	);

	const archivedArtifactsAndCache_ = {
		artifactsFolderPath: artifactsFolderPath_,
		artifacts: new Artifacts(artifactsFolderPath_),
		cacheFolderPath: cacheFolderPath_,
	};
	archivedArtifactsAndCacheBySnapshotIndex[codebaseSnapshotIndex_] = archivedArtifactsAndCache_;
	return archivedArtifactsAndCache_;
}

module.exports = {
	INITIAL_DEPLOYMENT_SNAPSHOT_INDEX,
	COSMIC_SIGNATURE_GAME_V2_SNAPSHOT_INDEX,
	COSMIC_SIGNATURE_GAME_V3_SNAPSHOT_INDEX,
	CURRENT_CODEBASE_SNAPSHOT_INDEX,
	withCodebaseSnapshotArtifacts,
};
