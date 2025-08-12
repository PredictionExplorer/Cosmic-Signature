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

			// Configuration of our production (as opposed to testing) contracts deployment.
			cosmicSignatureContractsDeployment: {
				// The deployment will not happen if this is `false`.
				enabled: true,

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
				// But we will not load it if it does not exist.
				deployCosmicSignatureContractsTaskReportFilePath: "temp/deploy-cosmic-signature-contracts-report-${networkName}-${cosmicSignatureGameContractName}.json",
			},

			accountFundingWithEth: {
				// The funding of accounts will not happen if this is `false`.
				enabled: true,

				// We will fund each account, except charity, by transfering ETH from the owner account to it.
				// We will make each of them balance twice larger than this.
				// We won't fund any account that already has at least this much.
				// This value is expressed in ETH. It will be converted to Wei.
				accountEthBalanceAmountMinLimitInEth: 0.01,
			},

			prizesWalletConfiguration: {
				enabled: true,
				timeoutDurationToWithdrawPrizes: 1n * 60n,
			},

			cosmicSignatureGameConfiguration: {
				enabled: true,
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
		}
	);

module.exports = { configuration, };
