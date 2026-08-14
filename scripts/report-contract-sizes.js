// #region

"use strict";

// #endregion
// #region

// [Comment-202608241]
// Reports deployed bytecode sizes of the compiled production contracts against the EIP-170 limit,
// and optionally attributes the bytecode of a single contract to its Yul functions
// (using `functionDebugData` from the build-info file), which is the tool that guided
// the modular delegatecall restructuring of `CosmicSignatureGameV3`.
//
// Usage:
//    node scripts/report-contract-sizes.js [--artifacts <folder>] [--attribute <ContractName>]
//
// Examples:
//    node scripts/report-contract-sizes.js
//    node scripts/report-contract-sizes.js --attribute CosmicSignatureGameV3
// [/Comment-202608241]

// #endregion
// #region

const nodeFsModule = require("node:fs");
const nodePathModule = require("node:path");

// #endregion
// #region

const EIP_170_MAX_DEPLOYED_BYTECODE_SIZE = 24_576;
const EIP_3860_MAX_INIT_CODE_SIZE = 49_152;

// #endregion
// #region

function parseArguments() {
	const arguments_ = {artifactsFolderPath: "artifacts/production", contractNameToAttribute: undefined,};
	for ( let index_ = 2; index_ < process.argv.length; ++ index_ ) {
		switch (process.argv[index_]) {
			case "--artifacts": {
				arguments_.artifactsFolderPath = process.argv[++ index_];
				break;
			}
			case "--attribute": {
				arguments_.contractNameToAttribute = process.argv[++ index_];
				break;
			}
			default: {
				throw new Error(`Unknown argument: ${process.argv[index_]}`);
			}
		}
	}
	return arguments_;
}

// #endregion
// #region

function findArtifactFiles(folderPath_, artifactFilePaths_) {
	for (const folderEntry_ of nodeFsModule.readdirSync(folderPath_, {withFileTypes: true,})) {
		const folderEntryPath_ = nodePathModule.join(folderPath_, folderEntry_.name);
		if (folderEntry_.isDirectory()) {
			findArtifactFiles(folderEntryPath_, artifactFilePaths_);
		} else if (folderEntry_.name.endsWith(".json") && ( ! folderEntry_.name.endsWith(".dbg.json") )) {
			artifactFilePaths_.push(folderEntryPath_);
		}
	}
	return artifactFilePaths_;
}

// #endregion
// #region

function reportSizes(artifactsFolderPath_) {
	const artifactFilePaths_ = findArtifactFiles(nodePathModule.join(artifactsFolderPath_, "contracts"), []);
	const rows_ = [];
	for (const artifactFilePath_ of artifactFilePaths_) {
		const artifact_ = JSON.parse(nodeFsModule.readFileSync(artifactFilePath_, "utf8"));
		if (( ! artifact_.deployedBytecode ) || artifact_.deployedBytecode == "0x") {
			continue;
		}
		rows_.push({
			contractName: artifact_.contractName,
			sourceName: artifact_.sourceName,
			deployedBytecodeSize: (artifact_.deployedBytecode.length - 2) / 2,
			initCodeSize: (artifact_.bytecode.length - 2) / 2,
		});
	}
	rows_.sort((row1_, row2_) => (row2_.deployedBytecodeSize - row1_.deployedBytecodeSize));
	console.info("%s", `EIP-170 deployed bytecode max size: ${EIP_170_MAX_DEPLOYED_BYTECODE_SIZE}. EIP-3860 init code max size: ${EIP_3860_MAX_INIT_CODE_SIZE}.`);
	console.info("%s", "deployed initcode  %-of-max contract");
	for (const row_ of rows_) {
		const percentageOfMaxSize_ = (row_.deployedBytecodeSize * 100 / EIP_170_MAX_DEPLOYED_BYTECODE_SIZE).toFixed(1);
		console.info(
			"%s",
			`${row_.deployedBytecodeSize.toString().padStart(8)} ${row_.initCodeSize.toString().padStart(8)} ${(percentageOfMaxSize_ + "%").padStart(9)} ${row_.contractName}  (${row_.sourceName})`
		);
	}
}

// #endregion
// #region

function attributeContractSize(artifactsFolderPath_, contractNameToAttribute_) {
	const buildInfoFolderPath_ = nodePathModule.join(artifactsFolderPath_, "build-info");
	for (const buildInfoFileName_ of nodeFsModule.readdirSync(buildInfoFolderPath_)) {
		const buildInfo_ = JSON.parse(nodeFsModule.readFileSync(nodePathModule.join(buildInfoFolderPath_, buildInfoFileName_), "utf8"));
		for (const [sourceName_, contracts_] of Object.entries(buildInfo_.output.contracts ?? {})) {
			const contract_ = contracts_[contractNameToAttribute_];
			if (contract_ === undefined || ( ! contract_.evm?.deployedBytecode?.object )) {
				continue;
			}
			const bytecode_ = Buffer.from(contract_.evm.deployedBytecode.object, "hex");
			const functionDebugData_ = contract_.evm.deployedBytecode.functionDebugData ?? {};
			const functionEntries_ =
				Object.entries(functionDebugData_)
					.filter(([, functionDebugDataItem_]) => (functionDebugDataItem_.entryPoint != null))
					.map(([yulFunctionName_, functionDebugDataItem_]) => ({yulFunctionName: yulFunctionName_, entryPoint: functionDebugDataItem_.entryPoint,}))
					.sort((entry1_, entry2_) => (entry1_.entryPoint - entry2_.entryPoint));
			console.info("%s", `${contractNameToAttribute_} (${sourceName_}): deployed bytecode size = ${bytecode_.length}.`);
			if (functionEntries_.length <= 0) {
				console.info("%s", "No functionDebugData available.");
				return;
			}
			console.info("%s", `Dispatcher and inlined prologue before the first named Yul function: ${functionEntries_[0].entryPoint} bytes.`);
			const rows_ = [];
			for ( let index_ = 0; index_ < functionEntries_.length; ++ index_ ) {
				const nextEntryPoint_ = (index_ + 1 < functionEntries_.length) ? functionEntries_[index_ + 1].entryPoint : bytecode_.length;
				rows_.push({yulFunctionName: functionEntries_[index_].yulFunctionName, size: nextEntryPoint_ - functionEntries_[index_].entryPoint,});
			}
			rows_.sort((row1_, row2_) => (row2_.size - row1_.size));
			for (const row_ of rows_) {
				console.info("%s", `${row_.size.toString().padStart(8)} ${row_.yulFunctionName}`);
			}
			return;
		}
	}
	throw new Error(`Contract not found in build-info: ${contractNameToAttribute_}`);
}

// #endregion
// #region

const arguments_ = parseArguments();
reportSizes(arguments_.artifactsFolderPath);
if (arguments_.contractNameToAttribute !== undefined) {
	console.info();
	attributeContractSize(arguments_.artifactsFolderPath, arguments_.contractNameToAttribute);
}

// #endregion
