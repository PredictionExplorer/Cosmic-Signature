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
		// [Comment-202610256]
		// Issue. This saves a private key to a file. It would instead be more secure
		// to pass it through an environment variable named like `HARDHAT_VAR_...`.
		// Respective Hardhat configuration variable name is specified near Comment-202610253.
		// [/Comment-202610256]
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
