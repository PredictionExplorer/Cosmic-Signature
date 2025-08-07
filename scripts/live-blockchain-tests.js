// #region

"use strict";

// #endregion
// #region

const { configuration } = require("./live-blockchain-tests-configuration.js");

// #endregion
// #region

prepare1();

// #endregion
// #region

const nodeOsModule = require("node:os");
const nodeFsModule = require("node:fs");
const hre = require("hardhat");
const { generateRandomUInt256, generateAccountPrivateKeyFromSeed, uint256ToPaddedHexString, waitForTransactionReceipt } = require("../src/Helpers.js");
const { State } = require("./live-blockchain-tests-state.js");
const { runDeployCosmicSignatureContractsTask } = require("./cosmic-signature-contracts-deployment/run-deploy-cosmic-signature-contracts-task.js");

// #endregion
// #region

const accountPrivateKeySeedSalts = {
	owner: 0xc09702ad1f6c687de525aa275debf9b72db9de68734c9250f7440e35171726efn,
	bidder1: 0x41412fc5a274fc146e3d60f10c1dfe1571ea30544ff2a66d31319bb8ed7cdc79n,
	bidder2: 0xc236c2f0d226e219570a1f79668a6f1bb30ad22bbd4b446affedbd9f69ae88fdn,
	bidder3: 0xd34f80f7e5dc79f927913501ed2a4f9e76c4bc3ff3138823372130eb82a67870n,
	charity: 0xd5fcb76fea40bc2b696ed7dfff0c1912973933322d468515c10f30819e458cabn,
	treasurer: 0x8f77872975c967ed2792a745a7b5c00c7831fdb9bea7eb3d5ce6a685c2e74035n,
};
const state = new State();

// #endregion
// #region

prepare2();
main()
	.then(() => (process.exit(0)))
	.catch((errorObject) => {
		console.error(errorObject);
		process.exit(1);
	});

// #endregion
// #region `prepare1`

function prepare1() {
	if (configuration.networkName.length > 0) {
		process.env.HARDHAT_NETWORK = configuration.networkName;
	}
}

// #endregion
// #region `prepare2`

function prepare2() {
	console.info(`${nodeOsModule.EOL}hre.network.name = ${hre.network.name}`);
	createAccountSigners();
}

// #endregion
// #region `createAccountSigners`

function createAccountSigners() {
	console.info(`${nodeOsModule.EOL}accountPrivateKeySeed = ${uint256ToPaddedHexString(configuration.accountPrivateKeySeed)}${nodeOsModule.EOL}`);
	state.dummySigner = new hre.ethers.Wallet(uint256ToPaddedHexString(generateRandomUInt256()), hre.ethers.provider);
	Object.entries(accountPrivateKeySeedSalts).forEach(createAccountSigner);
}

// #endregion
// #region `createAccountSigner`

/**
 * @param {[string, bigint,]} accountPrivateKeySeedSaltEntry_
 */
function createAccountSigner(accountPrivateKeySeedSaltEntry_) {
	const [accountName_, accountPrivateKeySeedSalt_,] = accountPrivateKeySeedSaltEntry_;
	// console.info(accountName_, accountPrivateKeySeedSalt_);
	const accountPrivateKeySeed_ = configuration.accountPrivateKeySeed ^ accountPrivateKeySeedSalt_;
	const accountPrivateKey_ = generateAccountPrivateKeyFromSeed(accountPrivateKeySeed_);
	const accountSigner_ = new hre.ethers.Wallet(accountPrivateKey_, hre.ethers.provider);
	console.info(`${accountName_}: privateKey = ${accountPrivateKey_}, address = ${accountSigner_.address}`);
	state[`${accountName_}Signer`] = accountSigner_;
}

// #endregion
// #region `main`

async function main() {
	// todo-0 print new lines as needed
	// await hre.run("compile");
	await createContracts(await runDeployCosmicSignatureContractsTaskIfNeeded());
	await fundAccountsWithEthIfNeeded();


	// todo-0 
}

// #endregion
// #region `runDeployCosmicSignatureContractsTaskIfNeeded`

async function runDeployCosmicSignatureContractsTaskIfNeeded() {
	const deployCosmicSignatureContractsTaskReportFilePath_ =
		configuration.deployCosmicSignatureContractsTaskReportFilePath
			.replaceAll("${networkName}", hre.network.name)
			.replaceAll("${cosmicSignatureGameContractName}", configuration.cosmicSignatureGameContractName);
	const deployCosmicSignatureContractsTaskReportFileStats_ = nodeFsModule.statSync(deployCosmicSignatureContractsTaskReportFilePath_, {throwIfNoEntry: false,});
	if (deployCosmicSignatureContractsTaskReportFileStats_ == undefined) {
		const deployCosmicSignatureContractsTaskConfigurationFilePath_ =
			configuration.deployCosmicSignatureContractsTaskConfigurationFilePath
				.replaceAll("${networkName}", hre.network.name)
				.replaceAll("${cosmicSignatureGameContractName}", configuration.cosmicSignatureGameContractName);
		await runDeployCosmicSignatureContractsTask(
			state.ownerSigner.privateKey,
			configuration.cosmicSignatureGameContractName,
			configuration.randomWalkNftAddress,
			state.charitySigner.address,
			deployCosmicSignatureContractsTaskConfigurationFilePath_,
			deployCosmicSignatureContractsTaskReportFilePath_
		);
	} else {
		if ( ! deployCosmicSignatureContractsTaskReportFileStats_.isFile() ) {
			throw new Error(`"${deployCosmicSignatureContractsTaskReportFilePath_}" already exists, but it's not a file.`);
		}
		console.info(`${nodeOsModule.EOL}"${deployCosmicSignatureContractsTaskReportFilePath_}" already exists. Reusing the already deployed contracts. Assuming their bytecodes have not changed.`);
	}
	return deployCosmicSignatureContractsTaskReportFilePath_;
}

// #endregion
// #region `createContracts`

/**
 * @param {string} deployCosmicSignatureContractsTaskReportFilePath_
 */
async function createContracts(deployCosmicSignatureContractsTaskReportFilePath_) {
	const deployCosmicSignatureContractsTaskReportJsonString_ = await nodeFsModule.promises.readFile(deployCosmicSignatureContractsTaskReportFilePath_, "utf8");
	/** @type {object} */
	const contracts_ = JSON.parse(deployCosmicSignatureContractsTaskReportJsonString_);
	await createContract(contracts_, "CosmicSignatureToken", "cosmicSignatureToken");
	await createContract(contracts_, "RandomWalkNFT", "randomWalkNft");
	await createContract(contracts_, "CosmicSignatureNft", "cosmicSignatureNft");
	await createContract(contracts_, "PrizesWallet", "prizesWallet");
	await createContract(contracts_, "StakingWalletRandomWalkNft", "stakingWalletRandomWalkNft");
	await createContract(contracts_, "StakingWalletCosmicSignatureNft", "stakingWalletCosmicSignatureNft");
	await createContract(contracts_, "MarketingWallet", "marketingWallet");
	await createContract(contracts_, "CharityWallet", "charityWallet");
	await createContract(contracts_, "CosmicSignatureDao", "cosmicSignatureDao");
	await createContract(contracts_, configuration.cosmicSignatureGameContractName, "cosmicSignatureGameImplementation");
	await createContract(contracts_, configuration.cosmicSignatureGameContractName, "cosmicSignatureGameProxy");
	state.contracts = contracts_;
}

// #endregion
// #region `createContract`

/**
 * @param {object} contracts_
 * @param {string} contractName_
 * @param {string} contractVariableName_
 */
async function createContract(contracts_, contractName_, contractVariableName_) {
	contracts_[contractVariableName_] = await hre.ethers.getContractAt(contractName_, contracts_[contractVariableName_ + "Address"], state.dummySigner);
}

// #endregion
// #region `fundAccountsWithEthIfNeeded`

async function fundAccountsWithEthIfNeeded() {
	if ( ! configuration.accountFundingWithEth.enabled ) {
		return;
	}
	console.info();
	await fundAccountWithEthIfNeeded("bidder1", state.bidder1Signer.address);
	await fundAccountWithEthIfNeeded("bidder2", state.bidder2Signer.address);
	await fundAccountWithEthIfNeeded("bidder3", state.bidder3Signer.address);
	// await fundAccountWithEthIfNeeded("charity", state.charitySigner.address);
	await fundAccountWithEthIfNeeded("treasurer", state.treasurerSigner.address);
}

// #endregion
// #region `fundAccountWithEthIfNeeded`

/**
 * @param {string} accountName_ 
 * @param {string} accountAddress_
 */
async function fundAccountWithEthIfNeeded(accountName_, accountAddress_) {
	const accountEthBalanceAmountMinLimitInWei_ = hre.ethers.parseEther(configuration.accountFundingWithEth.accountEthBalanceAmountMinLimitInEth.toString());
	const accountEthBalanceAmount_ = await hre.ethers.provider.getBalance(accountAddress_);
	if (accountEthBalanceAmount_ >= accountEthBalanceAmountMinLimitInWei_) {
		return;
	}
	const ethAmountToTransferToAccount_ = accountEthBalanceAmountMinLimitInWei_ * 2n - accountEthBalanceAmount_;
	console.info(`Funding ${accountName_} with ${hre.ethers.formatEther(ethAmountToTransferToAccount_)} ETH.`);
	await waitForTransactionReceipt(state.ownerSigner.sendTransaction({to: accountAddress_, value: ethAmountToTransferToAccount_,}));
}

// #endregion
