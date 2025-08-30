"use strict";

const configuration =
	Object.freeze(
		{
			// Hardhat configuration.
			hardhat: {
				// [Comment-202509132]
				// If this is empty, Hardhat will choose its default network.
				// The network/blockchain should be external. The in-process "hardhat" is not intended to be used for this test;
				// use "hardhat_on_localhost" instead. By default, Hardhat will choose "hardhat"
				// unless a different default network is specified in the Hardhat config file.
				// The `HARDHAT_MODE_CODE` environment variable should either not be set or be set to "2".
				// Otherwise the behavior will not necessarily be correct.
				// [/Comment-202509132]
				networkName:
					// "",
					// // "hardhat",
					"hardhat_on_localhost",

					// // Issue. This is not well supported, because of Comment-202509215.
					// "sepolia",

					// "arbitrumSepolia",
					// "arbitrumOne",
			},

			// If this is `false` we will not deploy our production (as opposed to testing) contracts.
			// It's generally safe to always keep this `true` because we would anyway skip the deployment
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

				// If this is empty or zero, we will deploy a new Random Walk NFT contract.
				// Otherwise we will reuse the already deployed one.
				randomWalkNftAddress:
					"",
					// "0x???",

				// The deploy-cosmic-signature-contracts task config file path.
				// We will substitute the variables in this file name.
				// If we run the deploy-cosmic-signature-contracts task, we will create this file at runtime.
				// If the file already exists we will overwrite it.
				deployCosmicSignatureContractsConfigurationFilePath: "../output/deploy-cosmic-signature-contracts-config-${networkName}-${cosmicSignatureGameContractName}.json",

				// The deploy-cosmic-signature-contracts task report file path.
				// We will substitute the variables in this file name.
				// We will not run the deploy-cosmic-signature-contracts task if this file already exists.
				// We will load this file regardless of whether we run the task.
				deployCosmicSignatureContractsReportFilePath: "../output/deploy-cosmic-signature-contracts-report-${networkName}-${cosmicSignatureGameContractName}.json",
			},

			// Whether to validate state of newly deployed Cosmic Signature contracts.
			// 0 = do not validate.
			// 1 = validate only if we have just deployed them.
			// 2 = validate unconditionally.
			validateCosmicSignatureContractStates: 1,

			// The funding of accounts with ETH will not happen if this is `false`.
			fundAccountsWithEth: true,

			// Accounts funding with ETH configuration.
			accountFundingWithEth: {
				// We will fund each account by transfering ETH from the owner account to it.
				// We will make each of them balance twice larger than this.
				// We won't fund any account that already has at least this much.
				// This value is expressed in ETH. It will be converted to Wei.
				// To test on the mainnet, this doesn't necessarily need to be that big.
				// You can reduce this, based on how much ETH is spent on the testnet.
				accountEthBalanceAmountMinLimitInEth: 0.01,
			},

			// Whether to configure newly deployed Cosmic Signature contracts.
			// 0 = do not configure.
			// 1 = configure only if we have just deployed them.
			// 2 = configure unconditionally.
			configureCosmicSignatureContracts: 1,

			// Configurations to use when configuring newly deployed Cosmic Signature contracts.
			cosmicSignatureContracts: {
				prizesWallet: {
					// [Comment-202509305]
					// If this is negative we will not set respective parameter.
					// Warning. A too short timeout can potentially result in hackers stealing your asserts.
					// So consider configuring a bigger or better negative value here.
					// The test will anyway not be delayed by this.
					// [/Comment-202509305]
					timeoutDurationToWithdrawPrizes:
						// 8n,
						-1n,
				},
				cosmicSignatureGame: {
					delayDurationBeforeRoundActivation: 5n,
					// ethDutchAuctionDurationDivisor: ???,
					ethDutchAuctionDuration: 18n,
					// cstDutchAuctionDurationDivisor: ???,
					cstDutchAuctionDuration: 15n,
					// initialDurationUntilMainPrizeDivisor: ???,
					initialDurationUntilMainPrize: 7n,
					// mainPrizeTimeIncrementInMicroSeconds: ???,
					mainPrizeTimeIncrement: 3n,

					// Comment-202509305 applies.
					timeoutDurationToClaimMainPrize:
						// 5n,
						-1n,
				},
			},

			donateEthToCosmicSignatureGame: true,
			ethDonationToCosmicSignatureGame: {
				amountInEth: 0.00000000123,
			},

			playCosmicSignatureGame: true,
			cosmicSignatureGamePlaying: {
				// You have an option to provide zero or more Random Walk NFT IDs.
				// Each of them will be used for both bidding and donation.
				// The first NFT shall be owned by bidder 2, the second by bidder 3, the third again by bidder 2, and so on.
				// 2 NFTs will be used during each bidding round.
				// When we run out of NFTs you have provided we will mint more.
				randomWalkNftIds:
					[],
					// [5n, 0n, 7n, 9n,],

				numRoundsToPlay: 2,
			},

			// Whether each bidder account needs to call `PrizesWallet.withdrawEverything`.
			// Note that if a withdrawal fails you will have to manually withdraw some assets.
			// This test logic will log them, but it won't remember to withdraw them when you run this test again.
			// See Comment-202509304 for more info.
			withdrawEverything: true,

			// [Comment-202509242]
			// At the end, call `SelfDestructibleCosmicSignatureGame.finalizeTesting`.
			// For this to work, `cosmicSignatureContractsDeployment.cosmicSignatureGameContractName`
			// must be "SelfDestructibleCosmicSignatureGame".
			// [/Comment-202509242]
			finalizeTesting: true,

			payMarketingRewards: true,
		}
	);

module.exports = {
	configuration,
};
