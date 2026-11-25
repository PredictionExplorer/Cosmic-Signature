"use strict";

const nodeOs = require("node:os");
const nodePath = require("node:path");
const nodeFs = require("node:fs");
const hre = require("hardhat");
const { Artifacts } = require("hardhat/internal/artifacts");

// Append snapshot branches in deployment order so each release keeps its snapshot index.
const snapshotBranchNames = [
	"20260505-v1-snapshot",
	"20260625-CosmicSignatureGameV2-snapshot",
	"20261125-CosmicSignatureGameV3-snapshot",
];
const INITIAL_DEPLOYMENT_SNAPSHOT_INDEX = 0;
const COSMIC_SIGNATURE_GAME_V2_SNAPSHOT_INDEX = 1;
const COSMIC_SIGNATURE_GAME_V3_SNAPSHOT_INDEX = 2;
const CURRENT_CODEBASE_SNAPSHOT_INDEX = snapshotBranchNames.length;
const artifactsAndCacheBySnapshotIndex = [];

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
	const snapshotArtifactsAndCache_ = getSnapshotArtifactsAndCache(codebaseSnapshotIndex_, currentPaths_);

	// Hardhat 2 types this property as readonly, but its runtime and plugins share this writable instance.
	// Issue. This is a hack that has a chance to stop working with a future version of Hardhat.
	/** @type {{ artifacts: typeof currentArtifacts_ }} */
	const writableHre_ = hre;

	try {
		hre.config.paths = {
			...currentPaths_,
			cache: snapshotArtifactsAndCache_.cacheFolderPath,
			artifacts: snapshotArtifactsAndCache_.artifactsFolderPath,
		};
		writableHre_.artifacts = snapshotArtifactsAndCache_.artifacts;

		// Await the action before restoring `hre` properties. Each Mocha worker selects one snapshot at a time.
		return await action_();
	} finally {
		writableHre_.artifacts = currentArtifacts_;
		hre.config.paths = currentPaths_;
	}
}

function getSnapshotArtifactsAndCache(codebaseSnapshotIndex_, currentPaths_) {
	if ( ! (Number.isInteger(codebaseSnapshotIndex_) && codebaseSnapshotIndex_ >= 0 && codebaseSnapshotIndex_ < snapshotBranchNames.length) ) {
		throw new RangeError(`Unknown codebase snapshot index: ${codebaseSnapshotIndex_}`);
	}
	const cachedArtifactsAndCache_ = artifactsAndCacheBySnapshotIndex[codebaseSnapshotIndex_];
	if (cachedArtifactsAndCache_ !== undefined) {
		return cachedArtifactsAndCache_;
	}

	const snapshotBranchName_ = snapshotBranchNames[codebaseSnapshotIndex_];
	const buildConfigurationName_ = nodePath.basename(currentPaths_.artifacts);
	const snapshotFolderPath_ = nodePath.join(currentPaths_.root, "codebase-snapshots", snapshotBranchName_);
	const artifactsFolderPath_ = nodePath.join(snapshotFolderPath_, "artifacts", buildConfigurationName_);

	// OpenZeppelin locks its cache and can rewrite it. Each test worker gets a private copy for each snapshot.
	const cacheFolderPath_ = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "cosmic-signature-validations-"));
	process.once("exit", () => nodeFs.rmSync(cacheFolderPath_, { recursive: true, force: true }));
	nodeFs.copyFileSync(
		nodePath.join(snapshotFolderPath_, "cache", buildConfigurationName_, "validations.json"),
		nodePath.join(cacheFolderPath_, "validations.json")
	);

	const snapshotArtifactsAndCache_ = {
		artifactsFolderPath: artifactsFolderPath_,
		artifacts: new Artifacts(artifactsFolderPath_),
		cacheFolderPath: cacheFolderPath_,
	};
	artifactsAndCacheBySnapshotIndex[codebaseSnapshotIndex_] = snapshotArtifactsAndCache_;
	return snapshotArtifactsAndCache_;
}

module.exports = {
	INITIAL_DEPLOYMENT_SNAPSHOT_INDEX,
	COSMIC_SIGNATURE_GAME_V2_SNAPSHOT_INDEX,
	COSMIC_SIGNATURE_GAME_V3_SNAPSHOT_INDEX,
	CURRENT_CODEBASE_SNAPSHOT_INDEX,
	withCodebaseSnapshotArtifacts,
};
