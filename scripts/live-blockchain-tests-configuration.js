"use strict";

const configuration =
	Object.freeze(
		{
			// If this is empty, Hardhat will choose its default network.
			networkName:
				// "",
				// "hardhat",
				"localhost",
				// "sepolia",
				// "arbitrumSepolia",
				// "arbitrumOne",

			// [Comment-202508313]
			// We will use this value as a seed to generate private keys of a few accounts.
			// We will print the actual generated private keys and addresses.
			// "live-blockchain-tests.bash" passes a not so secret value to us (it exists in the Git repo).
			// When running this script against a mainnet, use your own secret value.
			// For your convenience, there is another script named "live-blockchain-tests-secure.bash".
			// Copy it to the folder above the Git repo and edit it to pass a secret value.
			// You can execute "generate-random-uint256.bash" to generate a hard to guess value.
			// [/Comment-202508313]
			accountPrivateKeySeed: BigInt(process.argv[2]),

			cosmicSignatureGameContractName:
				"SelfDestructibleCosmicSignatureGame",
				// "SpecialCosmicSignatureGame",
				// "CosmicSignatureGame",

			// We can either deploy a new or reuse the already deployed RW NFT contract.
			randomWalkNftAddress:
				"",
				// "0x???",

			// If we run the deploy-cosmic-signature-contracts task, we will create this file at runtime.
			// We will substitute the variables in the file name.
			// If the file already exists we will overwrite it.
			deployCosmicSignatureContractsTaskConfigurationFilePath: "temp/deploy-cosmic-signature-contracts-config-${networkName}-${cosmicSignatureGameContractName}.json",

			// We will substitute the variables in this file name.
			// We will run the deploy-cosmic-signature-contracts task only if this file does not exist yet.
			// We will load this file regardless of whether we run the task.
			deployCosmicSignatureContractsTaskReportFilePath: "temp/deploy-cosmic-signature-contracts-report-${networkName}-${cosmicSignatureGameContractName}.json",

			accountFundingWithEth: {
				// The funding of accounts will happen only if this is `true`.
				enabled: true,

				// We will fund each account, except charity, by transfering ETH from the owner account to it.
				// We will make each of them balance twice larger than this.
				// We won't fund any account that already has at least this much.
				// This value is expressed in ETH. It will be converted to Wei.
				accountEthBalanceAmountMinLimitInEth: 0.01,
			},
		}
	);

module.exports = { configuration, };
