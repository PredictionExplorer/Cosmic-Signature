"use strict";

const nodePathModule = require("node:path");
const nodeFsModule = require("node:fs");
const hre = require("hardhat");

async function runDeployCosmicSignatureContracts(
	deployerPrivateKey_,
	cosmicSignatureGameContractName_,
	randomWalkNftAddress_,
	deployCosmicSignatureContractsConfigurationFilePath_,
	deployCosmicSignatureContractsReportFilePath_
) {
	const deployCosmicSignatureContractsTaskConfiguration_ = {
		deployerPrivateKey: deployerPrivateKey_,
		cosmicSignatureGameContractName: cosmicSignatureGameContractName_,
		randomWalkNftAddress: randomWalkNftAddress_,
		charityAddress: "",
		transferContractOwnershipToCosmicSignatureDao: false,
		roundActivationTime: -1e9,
		donateEthToCosmicSignatureGame: false,
		ethDonationToCosmicSignatureGameAmountInEth: 0.0,
		reportFilePath: deployCosmicSignatureContractsReportFilePath_,
	};
	const deployCosmicSignatureContractsTaskConfigurationAsJsonString_ = JSON.stringify(deployCosmicSignatureContractsTaskConfiguration_, null, 3);
	await nodeFsModule.promises.mkdir(nodePathModule.dirname(deployCosmicSignatureContractsConfigurationFilePath_), {recursive: true,});
	await nodeFsModule.promises.writeFile(deployCosmicSignatureContractsConfigurationFilePath_, deployCosmicSignatureContractsTaskConfigurationAsJsonString_);
	const deployCosmicSignatureContractsArgs_ = {
		deployconfigfilepath: deployCosmicSignatureContractsConfigurationFilePath_,
	};
	await hre.run("deploy-cosmic-signature-contracts", deployCosmicSignatureContractsArgs_);
}

module.exports = {
	runDeployCosmicSignatureContracts,
};
