"use strict";

const configuration =
	Object.freeze(
		{
			hardhat: {
				// [Comment-202509132]
				// If this is empty, Hardhat will choose its default network.
				// The network/blockchain should be external, not the in-process "hardhat".
				// By default, Hardhat will choose "hardhat" unless a different default network is specified in the Hardhat config file.
				// The `HARDHAT_MODE_CODE` environment variable should either not be set or be set to "2".
				// Otherwise the behavior will not necessarily be correct.
				// [/Comment-202509132]
				networkName:
					// "",
					// "hardhat",
					"localhost",
					// "sepolia",
					// "arbitrumSepolia",
					// "arbitrumOne",
			},

			// If this is `false` we will not deploy our production (as opposed to testing) contracts.
			// It's generally safe to always keep this `true` because we would skip the deployment
			// if the deployment report file already exists. But for a guaranteed avoidance of an accidential unwanted deployment,
			// set this to `false`.
			deployCosmicSignatureContracts: true,

			// Configuration of our production (as opposed to testing) contracts deployment.
			cosmicSignatureContractsDeployment: {
				cosmicSignatureGameContractName:
					"SelfDestructibleCosmicSignatureGame",
					// "SpecialCosmicSignatureGame",
					// "CosmicSignatureGame",

				// If this is empty or zero we will deploy a new Random Walk NFT contract.
				// Otherwise we will reuse the already deployed one.
				randomWalkNftAddress:
					"",
					// "0x???",

				// We will substitute the variables in this file name.
				// If we run the deploy-cosmic-signature-contracts task, we will create this file at runtime.
				// If the file already exists we will overwrite it.
				deployCosmicSignatureContractsConfigurationFilePath: "temp/deploy-cosmic-signature-contracts-config-${networkName}-${cosmicSignatureGameContractName}.json",

				// We will substitute the variables in this file name.
				// We will not run the deploy-cosmic-signature-contracts task if this file already exists.
				// We will load this file regardless of whether we run the task.
				deployCosmicSignatureContractsReportFilePath: "temp/deploy-cosmic-signature-contracts-report-${networkName}-${cosmicSignatureGameContractName}.json",
			},

			// The funding of accounts will not happen if this is `false`.
			fundAccountsWithEth: true,

			// Accounts funding with ETH configuration.
			accountFundingWithEth: {
				// We will fund each account, except charity, by transfering ETH from the owner account to it.
				// We will make each of them balance twice larger than this.
				// We won't fund any account that already has at least this much.
				// This value is expressed in ETH. It will be converted to Wei.
				accountEthBalanceAmountMinLimitInEth: 0.01,
			},

			// Whether to validate state of newly deployed Cosmic Signature contracts.
			// 0 = do not validate.
			// 1 = validate only if we have just deployed them.
			// 2 = validate unconditionally.
			validateCosmicSignatureContractStates: 1,

			// Whether to configure newly deployed Cosmic Signature contracts.
			// 0 = do not configure.
			// 1 = configure only if we have just deployed them.
			// 2 = configure unconditionally.
			configureCosmicSignatureContracts: 1,

			// Configurations to use when configuring newly deployed Cosmic Signature contracts.
			// todo-0 Should I move these into a child object?
			prizesWallet: {
				timeoutDurationToWithdrawPrizes: 1n * 60n,
			},
			cosmicSignatureGame: {
				delayDurationBeforeRoundActivation: 1n * 60n / 2n,
				// ethDutchAuctionDurationDivisor: ???,
				ethDutchAuctionDuration: 3n * 60n / 2n,
				// cstDutchAuctionDurationDivisor: ???,
				cstDutchAuctionDuration: 1n * 60n,
				// initialDurationUntilMainPrizeDivisor: ???,
				initialDurationUntilMainPrize: 2n * 60n,
				// mainPrizeTimeIncrementInMicroSeconds: ???,
				mainPrizeTimeIncrement: 1n * 60n / 3n,
				timeoutDurationToClaimMainPrize: 1n * 60n,
			},

			donateEthToCosmicSignatureGame: true,
			ethDonationToCosmicSignatureGame: {
				amountInEth: 0.00000000123,
			},
		}
	);

module.exports = { configuration, };
