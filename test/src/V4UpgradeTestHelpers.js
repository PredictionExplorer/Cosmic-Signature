"use strict";

const hre = require("hardhat");
const { deployV1CompleteRoundZeroAndUpgradeToV2AndV3 } = require("./V3UpgradeTestHelpers.js");

async function deployArtAuction(contracts_) {
	const factory_ = await hre.ethers.getContractFactory("CosmicSignatureArtAuction", contracts_.ownerSigner);
	const auction_ = await factory_.deploy(contracts_.cosmicSignatureGameProxyAddress, contracts_.cosmicSignatureNftAddress);
	await auction_.waitForDeployment();
	return auction_;
}

async function upgradeToV4(contracts_, auction_, options_ = {}) {
	const factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV4", contracts_.ownerSigner);
	const game_ = await hre.upgrades.upgradeProxy(contracts_.cosmicSignatureGameProxyAddress, factory_, {
		kind: "uups",
		call: { fn: "initializeV4", args: [await auction_.getAddress()] },
		...options_,
	});
	contracts_.cosmicSignatureGameV4Proxy = game_;
	contracts_.cosmicSignatureArtAuction = auction_;
	return game_;
}

async function deployV4Fixture() {
	const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
	const auction_ = await deployArtAuction(contracts_);
	await upgradeToV4(contracts_, auction_);
	return contracts_;
}

async function snapshotV3Storage(proxyAddress_) {
	return Promise.all(Array.from({ length: 314 }, (_, index_) => hre.ethers.provider.getStorage(proxyAddress_, index_)));
}

module.exports = { deployArtAuction, upgradeToV4, deployV4Fixture, snapshotV3Storage };
