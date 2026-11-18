"use strict";

const hre = require("hardhat");
const { deployV1CompleteRoundZeroAndUpgradeToV2AndV3 } = require("./V3UpgradeTestHelpers.js");

async function deployArtAuction(contracts_) {
	const factory_ = await hre.ethers.getContractFactory("CosmicSignatureArtAuction", contracts_.ownerSigner);
	const auction_ = await factory_.deploy(contracts_.cosmicSignatureGameProxyAddress, contracts_.cosmicSignatureNftAddress);
	await auction_.waitForDeployment();
	return auction_;
}

async function deployChaosZeroMarket(contracts_) {
	const factory_ = await hre.ethers.getContractFactory("ChaosZeroBindingTestDouble", contracts_.ownerSigner);
	const game_ = contracts_.cosmicSignatureGameProxyAddress;
	const cst_ = await contracts_.cosmicSignatureToken.getAddress();
	const source_ = await factory_.deploy(game_, cst_, hre.ethers.ZeroAddress);
	await source_.waitForDeployment();
	const market_ = await factory_.deploy(game_, cst_, source_);
	await market_.waitForDeployment();
	return market_;
}

async function upgradeToV4(contracts_, auction_, options_ = {}) {
	const market_ = await deployChaosZeroMarket(contracts_);
	const factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV4", contracts_.ownerSigner);
	const game_ = await hre.upgrades.upgradeProxy(contracts_.cosmicSignatureGameProxyAddress, factory_, {
		kind: "uups",
		call: { fn: "initializeV4", args: [await auction_.getAddress(), await market_.getAddress()] },
		...options_,
	});
	contracts_.cosmicSignatureGameV4Proxy = game_;
	contracts_.cosmicSignatureArtAuction = auction_;
	contracts_.chaosZeroMarket = market_;
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

module.exports = { deployArtAuction, deployChaosZeroMarket, upgradeToV4, deployV4Fixture, snapshotV3Storage };
