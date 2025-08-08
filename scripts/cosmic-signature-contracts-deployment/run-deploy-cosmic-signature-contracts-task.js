"use strict";

const nodePathModule = require("node:path");
const nodeFsModule = require("node:fs");
const hre = require("hardhat");

async function runDeployCosmicSignatureContractsTask(
	deployerPrivateKey_,
	cosmicSignatureGameContractName_,
	randomWalkNftAddress_,
	charityAddress_,
	deployCosmicSignatureContractsTaskConfigurationFilePath_,
	deployCosmicSignatureContractsTaskReportFilePath_
) {
	const deployCosmicSignatureContractsTaskConfiguration_ = {
		deployerPrivateKey: deployerPrivateKey_,
		cosmicSignatureGameContractName: cosmicSignatureGameContractName_,
		randomWalkNftAddress: randomWalkNftAddress_,
		charityAddress: charityAddress_,
		transferContractOwnershipToCosmicSignatureDao: false,
		roundActivationTime: -1e9,
		donateEthToCosmicSignatureGame: false,
		ethDonationToCosmicSignatureGameAmountInEth: 0,
		saveReportFile: true,
		reportFilePath: deployCosmicSignatureContractsTaskReportFilePath_,
	};
	const deployCosmicSignatureContractsTaskConfigurationAsJsonString_ = JSON.stringify(deployCosmicSignatureContractsTaskConfiguration_, null, 3);
	await nodeFsModule.promises.mkdir(nodePathModule.dirname(deployCosmicSignatureContractsTaskConfigurationFilePath_), {recursive: true,});
	await nodeFsModule.promises.writeFile(deployCosmicSignatureContractsTaskConfigurationFilePath_, deployCosmicSignatureContractsTaskConfigurationAsJsonString_);
	const deployCosmicSignatureContractsTaskArgs_ = {
		deployconfigfilepath: deployCosmicSignatureContractsTaskConfigurationFilePath_,
	};
	await hre.run("deploy-cosmic-signature-contracts", deployCosmicSignatureContractsTaskArgs_);
}

module.exports = { runDeployCosmicSignatureContractsTask, };
