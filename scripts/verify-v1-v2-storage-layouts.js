"use strict";

// Independent storage-layout equivalence verification for the CosmicSignatureGame V2 upgrade.
//
// Why this exists:
// The production upgrade runs `upgradeProxy` with `unsafeSkipStorageCheck: true`, which disables
// OpenZeppelin's automatic storage-layout compatibility validation. This script re-establishes that
// guarantee independently, straight from the Solidity compiler's `storageLayout` output, so we do not
// have to trust the upgrade tooling.
//
// It compiles three contracts and compares their storage layouts slot-by-slot:
//   1. Deployed V1   - `CosmicSignatureGame` from the `origin/main` worktree (what the live proxy runs).
//   2. Refactored V1 - `CosmicSignatureGame` from the current branch.
//   3. V2            - `CosmicSignatureGameV2` from the current branch (the upgrade target).
//
// Usage:
//   MAIN_WORKTREE=/tmp/csig-main-worktree node scripts/verify-v1-v2-storage-layouts.js
//
// Requirements:
//   - solc 0.8.34 at ~/.solc-select/artifacts/solc-0.8.34/solc-0.8.34 (override with SOLC_PATH).
//   - A git worktree of `origin/main` (override with MAIN_WORKTREE). If absent, the deployed-V1
//     comparison is skipped with a warning and only refactored-V1 vs V2 is checked.

const nodeFsModule = require("node:fs");
const nodeOsModule = require("node:os");
const nodePathModule = require("node:path");
const nodeChildProcessModule = require("node:child_process");

const REPO_ROOT = nodePathModule.resolve(__dirname, "..");
const SOLC_PATH = process.env.SOLC_PATH || nodePathModule.join(nodeOsModule.homedir(), ".solc-select/artifacts/solc-0.8.34/solc-0.8.34");
const MAIN_WORKTREE = process.env.MAIN_WORKTREE || "/tmp/csig-main-worktree";
const NODE_MODULES = nodePathModule.join(REPO_ROOT, "node_modules");

/**
Runs solc in standard-JSON mode and returns the storage layout of one contract.
@param {string} basePath Directory whose `contracts/...` sources to compile (repo root or main worktree).
@param {string} sourcePath Source file path relative to `basePath`.
@param {string} contractName Contract to extract the layout for.
*/
function getStorageLayout(basePath, sourcePath, contractName) {
	const standardJsonInput = {
		language: "Solidity",
		sources: { [sourcePath]: { urls: [sourcePath] } },
		settings: { outputSelection: { [sourcePath]: { [contractName]: ["storageLayout"] } } },
	};
	const resultJson =
		nodeChildProcessModule.execFileSync(
			SOLC_PATH,
			["--standard-json", "--base-path", basePath, "--include-path", NODE_MODULES, "--allow-paths", `${basePath},${NODE_MODULES}`],
			{ input: JSON.stringify(standardJsonInput), maxBuffer: 256 * 1024 * 1024 }
		);
	const result = JSON.parse(resultJson);
	const errors = (result.errors || []).filter((errorObject_) => errorObject_.severity === "error");
	if (errors.length > 0) {
		throw new Error(`solc errors compiling ${sourcePath}:${contractName}:\n${errors.map((e_) => e_.formattedMessage).join("\n")}`);
	}
	const contractOutput = result.contracts?.[sourcePath]?.[contractName];
	if ( ! contractOutput?.storageLayout ) {
		throw new Error(`No storageLayout for ${sourcePath}:${contractName}.`);
	}
	return contractOutput.storageLayout;
}

/**
Flattens a solc storage layout into a map keyed by `slot:offset` with resolved type info.
The OpenZeppelin upgradeable base contracts use ERC-7201 namespaced storage (hashed slots),
so the sequential layout we compare is dominated by `CosmicSignatureGameStorage*`.
*/
function indexLayout(storageLayout) {
	const byPosition = new Map();
	const byLabel = new Map();
	for (const item of storageLayout.storage) {
		const typeInfo = storageLayout.types[item.type];
		const record = {
			label: item.label,
			slot: BigInt(item.slot),
			offset: Number(item.offset),
			typeLabel: typeInfo.label,
			numberOfBytes: BigInt(typeInfo.numberOfBytes),
		};
		byPosition.set(`${record.slot}:${record.offset}`, record);
		byLabel.set(record.label, record);
	}
	return { byPosition, byLabel };
}

const GAP_LABEL = "__gap_persistent";

// The only intentional, documented storage changes between deployed V1 and V2.
const V2_RENAMES = new Map([
	["cstDutchAuctionDurationDivisor", "cstDutchAuctionDuration"],
	["bidCstRewardAmount", "bidCstRewardAmountMultiplier"],
]);
const V2_NEW_VARIABLE = "cstDutchAuctionDurationChangeDivisor";

const problems = [];
const notes = [];

function fail(message_) {
	problems.push(message_);
}

function note(message_) {
	notes.push(message_);
}

/**
Asserts that every non-gap variable of `from` keeps its exact slot/offset/type in `to`,
allowing only the documented renames. Returns nothing; pushes problems instead.
*/
function compareLayouts(fromName, from, toName, to, allowedRenames) {
	for (const [label, record] of from.byLabel) {
		if (label === GAP_LABEL) {
			continue;
		}
		const expectedLabel = allowedRenames.get(label) || label;
		const counterpart = to.byPosition.get(`${record.slot}:${record.offset}`);
		if ( ! counterpart ) {
			fail(`${toName}: no variable at slot ${record.slot} offset ${record.offset} where ${fromName} has \`${label}\`.`);
			continue;
		}
		if (counterpart.label !== expectedLabel) {
			fail(`${toName}: slot ${record.slot} offset ${record.offset} holds \`${counterpart.label}\` but ${fromName} has \`${label}\` (expected \`${expectedLabel}\`).`);
			continue;
		}
		if (counterpart.typeLabel !== record.typeLabel) {
			fail(`${toName}: \`${expectedLabel}\` type is \`${counterpart.typeLabel}\` but ${fromName} \`${label}\` type is \`${record.typeLabel}\`.`);
			continue;
		}
		if (counterpart.numberOfBytes !== record.numberOfBytes) {
			fail(`${toName}: \`${expectedLabel}\` size ${counterpart.numberOfBytes} != ${fromName} \`${label}\` size ${record.numberOfBytes}.`);
		}
	}
}

function gapSlot(index) {
	const gap = index.byLabel.get(GAP_LABEL);
	return gap ? gap.slot : undefined;
}

function main() {
	console.info("Solc:", SOLC_PATH);

	const refactoredV1 = indexLayout(getStorageLayout(REPO_ROOT, "contracts/production/CosmicSignatureGame.sol", "CosmicSignatureGame"));
	const v2 = indexLayout(getStorageLayout(REPO_ROOT, "contracts/production/CosmicSignatureGameV2.sol", "CosmicSignatureGameV2"));
	console.info(`Refactored V1 variables: ${refactoredV1.byLabel.size}; V2 variables: ${v2.byLabel.size}`);

	let deployedV1;
	if (nodeFsModule.existsSync(nodePathModule.join(MAIN_WORKTREE, "contracts/production/CosmicSignatureGame.sol"))) {
		deployedV1 = indexLayout(getStorageLayout(MAIN_WORKTREE, "contracts/production/CosmicSignatureGame.sol", "CosmicSignatureGame"));
		console.info(`Deployed V1 (origin/main) variables: ${deployedV1.byLabel.size}`);
	} else {
		note(`Deployed-V1 comparison skipped: no main worktree at ${MAIN_WORKTREE}.`);
	}

	// 1. Deployed V1 (live proxy layout) vs refactored V1: must be identical except the one rename.
	if (deployedV1) {
		compareLayouts("deployedV1", deployedV1, "refactoredV1", refactoredV1, new Map([["cstRewardAmountForBidding", "bidCstRewardAmount"]]));
	}

	// 2. Refactored V1 vs V2: every real variable preserved; documented repurposing only.
	compareLayouts("refactoredV1", refactoredV1, "V2", v2, V2_RENAMES);

	// 2b. If we have the deployed layout, also compare it directly against V2 (the upgrade that actually happens).
	if (deployedV1) {
		const deployedToV2Renames = new Map([
			["cstDutchAuctionDurationDivisor", "cstDutchAuctionDuration"],
			["cstRewardAmountForBidding", "bidCstRewardAmountMultiplier"],
		]);
		compareLayouts("deployedV1", deployedV1, "V2", v2, deployedToV2Renames);
	}

	// 3. The new V2 variable must land on the first slot of the old persistent gap.
	const baselineForGap = deployedV1 || refactoredV1;
	const oldGapSlot = gapSlot(baselineForGap);
	const newVar = v2.byLabel.get(V2_NEW_VARIABLE);
	if ( ! newVar ) {
		fail(`V2 is missing the new variable \`${V2_NEW_VARIABLE}\`.`);
	} else if (oldGapSlot === undefined) {
		fail("Could not locate the persistent gap slot in the V1 layout.");
	} else if (newVar.slot !== oldGapSlot || newVar.offset !== 0) {
		fail(`V2 \`${V2_NEW_VARIABLE}\` is at slot ${newVar.slot} offset ${newVar.offset}, expected slot ${oldGapSlot} offset 0 (start of old gap).`);
	} else {
		note(`V2 \`${V2_NEW_VARIABLE}\` correctly occupies the first old-gap slot (${oldGapSlot}).`);
	}

	// 4. The V2 gap must move down exactly one slot relative to the V1 gap (it absorbed the new variable).
	const v2GapSlot = gapSlot(v2);
	if (oldGapSlot !== undefined && v2GapSlot !== undefined) {
		if (v2GapSlot !== oldGapSlot + 1n) {
			fail(`V2 gap starts at slot ${v2GapSlot}, expected ${oldGapSlot + 1n} (old gap + 1).`);
		} else {
			note(`V2 gap correctly starts one slot after the old gap (${v2GapSlot}).`);
		}
	}

	// 5. No real V2 variable may sit on or beyond the old gap except the one new variable.
	if (oldGapSlot !== undefined) {
		for (const [label, record] of v2.byLabel) {
			if (label === GAP_LABEL || label === V2_NEW_VARIABLE) {
				continue;
			}
			if (record.slot >= oldGapSlot) {
				fail(`V2 \`${label}\` sits at slot ${record.slot} (>= old gap slot ${oldGapSlot}); it would collide with reserved/gap space.`);
			}
		}
	}

	console.info("");
	for (const message of notes) {
		console.info("note:", message);
	}
	console.info("");
	if (problems.length > 0) {
		console.error(`STORAGE_LAYOUT_VERIFICATION_FAIL (${problems.length} problem(s)):`);
		for (const message of problems) {
			console.error(" -", message);
		}
		process.exitCode = 1;
		return;
	}
	console.info("STORAGE_LAYOUT_VERIFICATION_OK");
}

main();
