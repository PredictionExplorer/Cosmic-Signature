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

					// // Issue. This is not well supported, because of Comment-202509215.
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
					// Comment-202509242 relates.
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
				timeoutDurationToWithdrawPrizes: 7n,
			},
			cosmicSignatureGame: {
				delayDurationBeforeRoundActivation: 4n,
				// ethDutchAuctionDurationDivisor: ???,
				ethDutchAuctionDuration: 18n,
				// cstDutchAuctionDurationDivisor: ???,
				cstDutchAuctionDuration: 15n,
				// initialDurationUntilMainPrizeDivisor: ???,
				initialDurationUntilMainPrize: 7n,
				// mainPrizeTimeIncrementInMicroSeconds: ???,
				mainPrizeTimeIncrement: 3n,
				timeoutDurationToClaimMainPrize: 4n,
			},

			donateEthToCosmicSignatureGame: true,
			ethDonationToCosmicSignatureGame: {
				amountInEth: 0.00000000123,
			},
			playCosmicSignatureGame: true,
			cosmicSignatureGamePlaying: {
				// You have an option to provide zero or more Random Walk NFT IDs.
				// Each of them will be used for both bidding and donation.
				// The first one shall be owned by bidder 2, the second by bidder 3, the third again by bidder 2, and so on.
				// When we run out of NFTs you have provided we will mint more.
				randomWalkNftIds:
					// [],
					// todo-0 testing
					[5n, 0n,],

				numRoundsToPlay: 3,
			},

			// [Comment-202509242]
			// At the end, call `SelfDestructibleCosmicSignatureGame.finalizeTesting`.
			// For this to work, `cosmicSignatureContractsDeployment.cosmicSignatureGameContractName`
			// must be "SelfDestructibleCosmicSignatureGame".
			// [/Comment-202509242]
			finalizeTesting: true,
		}
	);

module.exports = { configuration, };
