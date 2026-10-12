"use strict";

const nodeFsModule = require("node:fs");
const nodePathModule = require("node:path");
const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { readValidations } = require("@openzeppelin/hardhat-upgrades/dist/utils/validations");
const {
	getUnlinkedBytecode,
	getVersion,
	getStorageLayout,
	getStorageUpgradeReport,
	withValidationDefaults,
} = require("@openzeppelin/upgrades-core");

// Other tests validate the V2 -> V3 upgrade against the V2 compiled from the current sources.
// But the V2 sources have since been refactored, so these tests validate against what is actually deployed:
// the V2 storage layout recorded in the OpenZeppelin manifest on the live V2 upgrade.
const DEPLOYED_V2_FIXTURE_PATH =
	nodePathModule.join(__dirname, "../data/deployed-storage-layouts/arbitrumOne-CosmicSignatureGameV2.json");

// In the deployed V2 this was `mapping(uint256 => BidderAddresses) bidderAddresses`.
const RENAMED_VARIABLE_SLOT = "259";

function loadDeployedV2Layout() {
	const fixture_ = JSON.parse(nodeFsModule.readFileSync(DEPLOYED_V2_FIXTURE_PATH, "utf8"));
	return fixture_.layout;
}

async function getV3Layout() {
	const cosmicSignatureGameV3Factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV3");
	const validations_ = await readValidations(hre);
	const unlinkedBytecode_ = getUnlinkedBytecode(validations_, cosmicSignatureGameV3Factory_.bytecode);
	const version_ = getVersion(unlinkedBytecode_, cosmicSignatureGameV3Factory_.bytecode);
	return getStorageLayout(validations_, version_);
}

function findStorageItemAtSlot(layout_, slot_) {
	return layout_.storage.find((item_) => item_.slot == slot_);
}

/** The Game storage gap is the last storage item. An earlier `__gap_persistent` belongs to `OwnableUpgradeableWithReservedStorageGaps`. */
function findGameStorageGap(layout_) {
	const gapItem_ = layout_.storage[layout_.storage.length - 1];
	expect(gapItem_.label).equal("__gap_persistent");
	return gapItem_;
}

function getTypeMembers(layout_, typeId_) {
	return layout_.types[typeId_].members;
}

/** For a type ID like `t_mapping(t_uint256,t_struct(BidInfo)123_storage)`, returns `t_struct(BidInfo)123_storage`. */
function getMappingValueStructTypeId(mappingTypeId_) {
	return mappingTypeId_.match(/t_struct\([^)]*\)\d+_storage/)[0];
}

/** Simulates enabling the rename annotation on the deployed V2 upgrade branch. */
function annotateRoundStatsAsRenamedFromBidderAddresses(v3Layout_) {
	const annotatedLayout_ = structuredClone(v3Layout_);
	const roundStatsItem_ = findStorageItemAtSlot(annotatedLayout_, RENAMED_VARIABLE_SLOT);
	roundStatsItem_.renamedFrom = "bidderAddresses";
	return annotatedLayout_;
}

describe("CosmicSignatureGameV3-DeployedV2StorageLayout", function () {
	it("keeps every deployed V2 storage variable at the same location", async function () {
		const deployedV2Layout_ = loadDeployedV2Layout();
		const v3Layout_ = await getV3Layout();
		const deployedGap_ = findGameStorageGap(deployedV2Layout_);
		for (const deployedItem_ of deployedV2Layout_.storage) {
			if (deployedItem_ == deployedGap_) {
				continue;
			}
			const v3Item_ = findStorageItemAtSlot(v3Layout_, deployedItem_.slot);
			expect(v3Item_, `nothing at slot ${deployedItem_.slot}`).not.equal(undefined);
			expect(v3Item_.offset, deployedItem_.label).equal(deployedItem_.offset);
			expect(v3Layout_.types[v3Item_.type].numberOfBytes, deployedItem_.label)
				.equal(deployedV2Layout_.types[deployedItem_.type].numberOfBytes);
			if (deployedItem_.slot == RENAMED_VARIABLE_SLOT) {
				expect(deployedItem_.label).equal("bidderAddresses");
				expect(v3Item_.label).equal("roundStats");
			} else {
				expect(v3Item_.label).equal(deployedItem_.label);
				expect(v3Layout_.types[v3Item_.type].label, deployedItem_.label)
					.equal(deployedV2Layout_.types[deployedItem_.type].label);
			}
		}

		// OpenZeppelin ERC-7201 namespaces, such as `Ownable` and `Initializable`, are unchanged.
		expect(Object.keys(v3Layout_.namespaces ?? {}).sort()).deep.equal(Object.keys(deployedV2Layout_.namespaces ?? {}).sort());
	});

	it("reads the deployed V2 bidder addresses through the V3 round stats", async function () {
		const deployedV2Layout_ = loadDeployedV2Layout();
		const v3Layout_ = await getV3Layout();
		const deployedItem_ = findStorageItemAtSlot(deployedV2Layout_, RENAMED_VARIABLE_SLOT);
		const v3Item_ = findStorageItemAtSlot(v3Layout_, RENAMED_VARIABLE_SLOT);

		// Both are mappings from a round number to a struct. A struct value is stored starting at a hashed slot,
		// so the members at the same struct-relative slot and offset overlap.
		const deployedMembers_ = getTypeMembers(deployedV2Layout_, getMappingValueStructTypeId(deployedItem_.type));
		const v3Members_ = getTypeMembers(v3Layout_, getMappingValueStructTypeId(v3Item_.type));
		expect(deployedMembers_.map((member_) => member_.label)).deep.equal(["numItems", "items",]);
		expect(v3Members_[0]).include({ label: "numBids", type: "t_uint256", offset: 0, slot: "0", });
		expect(deployedMembers_[0]).include({ type: "t_uint256", offset: 0, slot: "0", });
		expect(v3Members_[1]).include({ label: "bidsInfo", offset: 0, slot: "1", });
		expect(deployedMembers_[1]).include({ type: "t_mapping(t_uint256,t_address)", offset: 0, slot: "1", });

		// The deployed `items[bidIndex]` address is stored at the beginning of a hashed slot,
		// and so is the V3 `bidsInfo[bidIndex].bidderAddress`.
		// `raffleCumulativeWeight` is in the next slot, which was never written, so it reads as zero for V2 bids.
		const bidInfoMembers_ = getTypeMembers(v3Layout_, getMappingValueStructTypeId(v3Members_[1].type));
		expect(bidInfoMembers_[0]).include({ label: "bidderAddress", type: "t_address", offset: 0, slot: "0", });
		expect(bidInfoMembers_[1]).include({ label: "raffleCumulativeWeight", type: "t_uint256", offset: 0, slot: "1", });

		// The other `RoundStats` members are appended. A mapping value has no following variables to collide with.
		expect(v3Members_.slice(2).map((member_) => Number(member_.slot))).deep.equal([2, 3, 4, 5, 6, 7, 8, 9,]);
	});

	it("appends the new V3 variables from the deployed V2 storage gap without moving its end", async function () {
		const deployedV2Layout_ = loadDeployedV2Layout();
		const v3Layout_ = await getV3Layout();
		const deployedGap_ = findGameStorageGap(deployedV2Layout_);
		const v3Gap_ = findGameStorageGap(v3Layout_);
		const getGapLength_ = (layout_, item_) => BigInt(layout_.types[item_.type].label.match(/\[(\d+)\]$/)[1]);
		const deployedGapEnd_ = BigInt(deployedGap_.slot) + getGapLength_(deployedV2Layout_, deployedGap_);
		const v3GapEnd_ = BigInt(v3Gap_.slot) + getGapLength_(v3Layout_, v3Gap_);
		expect(v3GapEnd_).equal(deployedGapEnd_);
		expect(Number(deployedGap_.slot)).equal(308);
		expect(Number(v3Gap_.slot)).equal(312);
		const newItems_ =
			v3Layout_.storage.filter((item_) => BigInt(item_.slot) >= BigInt(deployedGap_.slot) && BigInt(item_.slot) < BigInt(v3Gap_.slot));
		expect(newItems_.map((item_) => item_.label)).deep.equal([
			"roundLateBidDurationDivisor",
			"roundLateBidPricePremiumAmountBaseMultiplier",
			"roundLateBidPricePremiumAmountExponent",
			"mainPrizeNumCosmicSignatureNfts",
		]);
		expect(newItems_.map((item_) => Number(item_.slot))).deep.equal([308, 309, 310, 311,]);
		for (const item_ of newItems_) {
			expect(v3Layout_.types[item_.type].label).equal("uint256");
		}
	});

	it("passes OpenZeppelin validation against the deployed V2 only with the roundStats annotations", async function () {
		const deployedV2Layout_ = loadDeployedV2Layout();
		const v3Layout_ = await getV3Layout();
		const validationOptions_ = withValidationDefaults({ unsafeAllowRenames: false, unsafeSkipStorageCheck: false, });

		// Unless both `@custom:oz-renamed-from bidderAddresses` and
		// `@custom:oz-retyped-from mapping(uint256 => ICosmicSignatureGameStorage.BidderAddresses)`
		// are present near `roundStats`, OpenZeppelin rejects the upgrade, and only because of `roundStats`.
		// Renaming alone is not enough, because the struct members were renamed and `items` was retyped.
		const report_ = getStorageUpgradeReport(deployedV2Layout_, v3Layout_, validationOptions_);
		const roundStatsItem_ = findStorageItemAtSlot(v3Layout_, RENAMED_VARIABLE_SLOT);
		if (roundStatsItem_.renamedFrom === undefined || roundStatsItem_.retypedFrom === undefined) {
			expect(report_.pass).equal(false);
			for (const operation_ of report_.ops) {
				expect(operation_.updated?.label ?? operation_.original?.label).equal("roundStats");
			}
		} else {
			expect(report_.pass, report_.explain(false)).equal(true);
		}

		const annotatedV3Layout_ = annotateRoundStatsAsRenamedFromBidderAddresses(v3Layout_);
		const annotatedReport_ = getStorageUpgradeReport(deployedV2Layout_, annotatedV3Layout_, validationOptions_);
		expect(annotatedReport_.pass, annotatedReport_.explain(false)).equal(true);

		const renamedOnlyV3Layout_ = structuredClone(v3Layout_);
		findStorageItemAtSlot(renamedOnlyV3Layout_, RENAMED_VARIABLE_SLOT).renamedFrom = "bidderAddresses";
		delete findStorageItemAtSlot(renamedOnlyV3Layout_, RENAMED_VARIABLE_SLOT).retypedFrom;
		expect(getStorageUpgradeReport(deployedV2Layout_, renamedOnlyV3Layout_, validationOptions_).pass).equal(false);
	});
});
