"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { anyUint } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { shuffleArray, generateRandomUInt32, waitForTransactionReceipt } = require("../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../src/ContractTestingHelpers.js");

describe("StakingWalletCosmicSignatureNft", function () {
	it("Deployment", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		await expect(contracts_.stakingWalletCosmicSignatureNftFactory.deploy(hre.ethers.ZeroAddress, contracts_.signers[0].address))
			.revertedWithCustomError(contracts_.stakingWalletCosmicSignatureNftFactory, "ZeroAddress");
		await expect(contracts_.stakingWalletCosmicSignatureNftFactory.deploy(contracts_.signers[0].address, hre.ethers.ZeroAddress))
			.revertedWithCustomError(contracts_.stakingWalletCosmicSignatureNftFactory, "ZeroAddress");
	});

	it("Minting, staking, and unstaking of at least 10 Cosmic Signature NFTs", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(999n);

		const cosmicSignatureNftNftMintedTopicHash_ = contracts_.cosmicSignatureNft.interface.getEvent("NftMinted").topicHash;
		const stakingWalletCosmicSignatureNftNftStakedTopicHash_ = contracts_.stakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;

		await waitForTransactionReceipt(contracts_.cosmicSignatureNft.connect(contracts_.signers[0]).setApprovalForAll(contracts_.stakingWalletCosmicSignatureNftAddress, true));

		const nftIds_ = [];

		for ( let roundNum_ = 0n; ; ++ roundNum_ ) {
			const durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilRoundActivation_),]);
			// await hre.ethers.provider.send("evm_mine");
			await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(-1n, "", {value: 10n ** 18n,}));
			const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
			// await hre.ethers.provider.send("evm_mine");
			/** @type {Promise<hre.ethers.TransactionResponse>} */
			const transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).claimMainPrize();
			const transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
			const cosmicSignatureNftNftMintedLogs_ = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(cosmicSignatureNftNftMintedTopicHash_) >= 0));
			for (const cosmicSignatureNftNftMintedLog_ of cosmicSignatureNftNftMintedLogs_) {
				const cosmicSignatureNftNftMintedParsedLog_ = contracts_.cosmicSignatureNft.interface.parseLog(cosmicSignatureNftNftMintedLog_);
				nftIds_.push(cosmicSignatureNftNftMintedParsedLog_.args.nftId);
			}
			// console.info(performance.now().toFixed(1), nftIds_.length);
			if (roundNum_ >= 2n && nftIds_.length >= 10) {
				break;
			}
		}

		let numStakedNfts_ = await contracts_.stakingWalletCosmicSignatureNft.numStakedNfts();
		expect(numStakedNfts_).equal(0n);

		const stakeActions_ = [];
		shuffleArray(nftIds_);

		for (let nftIndex_ = nftIds_.length; ( -- nftIndex_ ) >= 0; ) {
			const nftId_ = nftIds_[nftIndex_];
			/** @type {Promise<hre.ethers.TransactionResponse>} */
			const transactionResponsePromise_ =
				((nftId_ & 2n) == 0n) ?
				contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[0]).stake(nftId_) :
				contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[0]).stakeMany([nftId_]);
			const transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
			const stakingWalletCosmicSignatureNftNftStakedLog_ = transactionReceipt_.logs.find((log_) => (log_.topics.indexOf(stakingWalletCosmicSignatureNftNftStakedTopicHash_) >= 0));
			const stakingWalletCosmicSignatureNftNftStakedParsedLog_ = contracts_.stakingWalletCosmicSignatureNft.interface.parseLog(stakingWalletCosmicSignatureNftNftStakedLog_);
			stakeActions_.push(
				{
					stakeActionId: stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakeActionId,
					nftId: nftId_,
				}
			);
		}

		expect(stakeActions_.length).equal(nftIds_.length);
		numStakedNfts_ = await contracts_.stakingWalletCosmicSignatureNft.numStakedNfts();
		expect(Number(numStakedNfts_)).equal(stakeActions_.length);

		for (const nftId_ of nftIds_) {
			const nftOwnerAddress_ = await contracts_.cosmicSignatureNft.ownerOf(nftId_);
			expect(nftOwnerAddress_).equal(contracts_.stakingWalletCosmicSignatureNftAddress);
		}

		shuffleArray(stakeActions_);

		for (let stakeActionIndex_ = stakeActions_.length; ( -- stakeActionIndex_ ) >= 0; ) {
			const stakeAction_ = stakeActions_[stakeActionIndex_];
			/** @type {Promise<hre.ethers.TransactionResponse>} */
			const transactionResponsePromise_ =
				((stakeAction_.stakeActionId & 2n) == 0n) ?
				contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[0]).unstake(stakeAction_.stakeActionId) :
				contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[0]).unstakeMany([stakeAction_.stakeActionId]);
			await expect(transactionResponsePromise_)
				.emit(contracts_.stakingWalletCosmicSignatureNft, "NftUnstaked")
				.withArgs(anyUint, stakeAction_.stakeActionId, stakeAction_.nftId, contracts_.signers[0].address, BigInt(stakeActionIndex_), 0n, 0n);
		}

		numStakedNfts_ = await contracts_.stakingWalletCosmicSignatureNft.numStakedNfts();
		expect(numStakedNfts_).equal(0n);

		for (const nftId_ of nftIds_) {
			const nftOwnerAddress_ = await contracts_.cosmicSignatureNft.ownerOf(nftId_);
			expect(nftOwnerAddress_).equal(contracts_.signers[0].address);
		}
	});

	it("The stakeMany and unstakeMany methods", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		const cosmicSignatureNftNftMintedTopicHash_ = contracts_.cosmicSignatureNft.interface.getEvent("NftMinted").topicHash;
		const stakingWalletCosmicSignatureNftNftStakedTopicHash_ = contracts_.stakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;
		const stakingWalletCosmicSignatureNftNftUnstakedTopicHash_ = contracts_.stakingWalletCosmicSignatureNft.interface.getEvent("NftUnstaked").topicHash;

		await waitForTransactionReceipt(contracts_.cosmicSignatureNft.connect(contracts_.signers[0]).setApprovalForAll(contracts_.stakingWalletCosmicSignatureNftAddress, true));

		const nftIds_ = [];

		{
			await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(-1n, "", {value: 10n ** 18n,}));
			const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
			// await hre.ethers.provider.send("evm_mine");
			/** @type {Promise<hre.ethers.TransactionResponse>} */
			const transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).claimMainPrize();
			const transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
			const cosmicSignatureNftNftMintedLogs_ = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(cosmicSignatureNftNftMintedTopicHash_) >= 0));
			for (const cosmicSignatureNftNftMintedLog_ of cosmicSignatureNftNftMintedLogs_) {
				const cosmicSignatureNftNftMintedParsedLog_ = contracts_.cosmicSignatureNft.interface.parseLog(cosmicSignatureNftNftMintedLog_);
				// console.info(`202507211 ${cosmicSignatureNftNftMintedParsedLog_.args.nftId}`)
				nftIds_.push(cosmicSignatureNftNftMintedParsedLog_.args.nftId);
			}
		}

		expect(nftIds_.length).greaterThanOrEqual(2);
		const stakeActionIds_ = [];
		shuffleArray(nftIds_);

		{
			/** @type {Promise<hre.ethers.TransactionResponse>} */
			const transactionResponsePromise_ = contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[0]).stakeMany(nftIds_);
			const transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
			expect(transactionReceipt_.logs.length).equals(nftIds_.length * 2);
			const stakingWalletCosmicSignatureNftNftStakedLogs_ = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(stakingWalletCosmicSignatureNftNftStakedTopicHash_) >= 0));
			expect(stakingWalletCosmicSignatureNftNftStakedLogs_.length).equals(nftIds_.length);
			for (let stakingWalletCosmicSignatureNftNftStakedLogIndex_ = stakingWalletCosmicSignatureNftNftStakedLogs_.length; ( -- stakingWalletCosmicSignatureNftNftStakedLogIndex_ ) >= 0; ) {
				const stakingWalletCosmicSignatureNftNftStakedLog_ = stakingWalletCosmicSignatureNftNftStakedLogs_[stakingWalletCosmicSignatureNftNftStakedLogIndex_];
				const stakingWalletCosmicSignatureNftNftStakedParsedLog_ = contracts_.stakingWalletCosmicSignatureNft.interface.parseLog(stakingWalletCosmicSignatureNftNftStakedLog_);
				expect(stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.nftId).equal(nftIds_.at((-1) - stakingWalletCosmicSignatureNftNftStakedLogIndex_));
				expect(stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakerAddress).equal(contracts_.signers[0].address);
				expect(stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.numStakedNfts).equal(BigInt(stakingWalletCosmicSignatureNftNftStakedLogIndex_ + 1));
				expect(stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.rewardAmountPerStakedNft).equal(0n);
				const stakeActionRecord_ = await contracts_.stakingWalletCosmicSignatureNft.stakeActions(stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakeActionId);
				// console.info(`202507212 ${stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakeActionId} ${stakeActionRecord_}`)
				expect(stakeActionRecord_).deep.equal([stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.nftId, stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakerAddress, stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.rewardAmountPerStakedNft,]);
				stakeActionIds_[stakingWalletCosmicSignatureNftNftStakedLogIndex_] = stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakeActionId;
			}
		}

		expect(stakeActionIds_.length).equals(nftIds_.length);
		let numStakedNfts_ = await contracts_.stakingWalletCosmicSignatureNft.numStakedNfts();
		expect(Number(numStakedNfts_)).equal(stakeActionIds_.length);
		shuffleArray(stakeActionIds_);

		{
			/** @type {Promise<hre.ethers.TransactionResponse>} */
			const transactionResponsePromise_ = contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[0]).unstakeMany(stakeActionIds_);
			const transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
			expect(transactionReceipt_.logs.length).equals(stakeActionIds_.length * 2);
			const stakingWalletCosmicSignatureNftNftUnstakedLogs_ = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(stakingWalletCosmicSignatureNftNftUnstakedTopicHash_) >= 0));
			expect(stakingWalletCosmicSignatureNftNftUnstakedLogs_.length).equals(stakeActionIds_.length);
			for (let stakingWalletCosmicSignatureNftNftUnstakedLogIndex_ = stakeActionIds_.length; ( -- stakingWalletCosmicSignatureNftNftUnstakedLogIndex_ ) >= 0; ) {
				const stakingWalletCosmicSignatureNftNftUnstakedLog_ = stakingWalletCosmicSignatureNftNftUnstakedLogs_[stakingWalletCosmicSignatureNftNftUnstakedLogIndex_];
				const stakingWalletCosmicSignatureNftNftUnstakedParsedLog_ = contracts_.stakingWalletCosmicSignatureNft.interface.parseLog(stakingWalletCosmicSignatureNftNftUnstakedLog_);
				expect(stakingWalletCosmicSignatureNftNftUnstakedParsedLog_.args.stakeActionId).equal(stakeActionIds_.at((-1) - stakingWalletCosmicSignatureNftNftUnstakedLogIndex_));
				expect(stakingWalletCosmicSignatureNftNftUnstakedParsedLog_.args.stakerAddress).equal(contracts_.signers[0].address);
				expect(stakingWalletCosmicSignatureNftNftUnstakedParsedLog_.args.numStakedNfts).equal(stakeActionIds_.length - 1 - stakingWalletCosmicSignatureNftNftUnstakedLogIndex_);
				expect(stakingWalletCosmicSignatureNftNftUnstakedParsedLog_.args.rewardAmountPerStakedNft).equal(0n);
				expect(stakingWalletCosmicSignatureNftNftUnstakedParsedLog_.args.rewardAmount).equal(0n);
			}
		}

		numStakedNfts_ = await contracts_.stakingWalletCosmicSignatureNft.numStakedNfts();
		expect(numStakedNfts_).equal(0n);
	});

	it("Cosmic Signature NFT staking ETH reward amounts and the tryPerformMaintenance method", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(999n);

		const brokenEthReceiverFactory_ = await hre.ethers.getContractFactory("BrokenEthReceiver", contracts_.deployerSigner);
		const brokenEthReceiver_ = await brokenEthReceiverFactory_.deploy();
		await brokenEthReceiver_.waitForDeployment();
		const brokenEthReceiverAddress_ = await brokenEthReceiver_.getAddress();
		// await waitForTransactionReceipt(brokenEthReceiver_.transferOwnership(contracts_.ownerSigner.address));

		const cosmicSignatureNftNftMintedTopicHash_ = contracts_.cosmicSignatureNft.interface.getEvent("NftMinted").topicHash;
		const stakingWalletCosmicSignatureNftNftStakedTopicHash_ = contracts_.stakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;
		const stakingWalletCosmicSignatureNftEthDepositReceivedTopicHash_ = contracts_.stakingWalletCosmicSignatureNft.interface.getEvent("EthDepositReceived").topicHash;

		// Signers 1 through `numBidders_` will act as bidders.
		const numBidders_ = 5 + generateRandomUInt32() % 3;

		const numIterations_ = 5 + generateRandomUInt32() % 3;
		const numRoundsPerIteration_ = 5 + generateRandomUInt32() % 3;
		const bidders_ = [];

		for ( let signerIndex_ = numBidders_; signerIndex_ > 0; -- signerIndex_ ) {
			// console.info("202507214");
			const bidder_ = contracts_.signers[signerIndex_];
			bidders_.push(bidder_);
			await waitForTransactionReceipt(contracts_.cosmicSignatureNft.connect(bidder_).setApprovalForAll(contracts_.stakingWalletCosmicSignatureNftAddress, true));
		}

		let ethRewardAmountPerStakedNft_ = 0n;
		let roundNum_ = 0n;

		for ( let iterationCounter_ = 1; iterationCounter_ <= numIterations_; ++ iterationCounter_ ) {
			let remainderEthAmount_ = 0n;
			const stakeActions_ = [];

			// Running a few bidding rounds and staking all newly minted CS NFTs.
			for (;;) {
				const durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();

				// Waiting longer before placing the 1st bid in a bidding round to avoid exponential increase of ETH bid price.
				await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilRoundActivation_) + 24 * 60 * 60,]);

				// await hre.ethers.provider.send("evm_mine");
				shuffleArray(bidders_);
				for ( let bidderIndex_ = generateRandomUInt32() % numBidders_; ; ) {
					// console.info("202507215");
					await hre.ethers.provider.send("evm_increaseTime", [generateRandomUInt32() % (60 * 60),]);
					// await hre.ethers.provider.send("evm_mine");
					await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(bidders_[bidderIndex_]).bidWithEth(-1n, "", {value: 10n ** (18n + 1n),}));
					if (( -- bidderIndex_ ) < 0) {
						break;
					}
				}
				const cosmicSignatureNftStakingTotalEthRewardAmount_ = await contracts_.cosmicSignatureGameProxy.getCosmicSignatureNftStakingTotalEthRewardAmount();
				expect(cosmicSignatureNftStakingTotalEthRewardAmount_).greaterThan(0n);
				const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
				await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
				// await hre.ethers.provider.send("evm_mine");
				/** @type {Promise<hre.ethers.TransactionResponse>} */
				let transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(bidders_[0]).claimMainPrize();
				let transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
				const stakingWalletCosmicSignatureNftEthDepositReceivedLog_ = transactionReceipt_.logs.find((log_) => (log_.topics.indexOf(stakingWalletCosmicSignatureNftEthDepositReceivedTopicHash_) >= 0));
				if (roundNum_ % BigInt(numRoundsPerIteration_) == 0n) {
					// console.info("202507216");
					expect(stakingWalletCosmicSignatureNftEthDepositReceivedLog_).equal(undefined);
				} else {
					const stakingWalletCosmicSignatureNftEthDepositReceivedParsedLog_ = contracts_.stakingWalletCosmicSignatureNft.interface.parseLog(stakingWalletCosmicSignatureNftEthDepositReceivedLog_);
					expect(stakingWalletCosmicSignatureNftEthDepositReceivedParsedLog_.args.roundNum).equal(roundNum_);
					expect(stakingWalletCosmicSignatureNftEthDepositReceivedParsedLog_.args.depositAmount).equal(cosmicSignatureNftStakingTotalEthRewardAmount_);
					expect(Number(stakingWalletCosmicSignatureNftEthDepositReceivedParsedLog_.args.numStakedNfts)).equal(stakeActions_.length);
					const rewardAmountPerStakedNftIncrement_ = cosmicSignatureNftStakingTotalEthRewardAmount_ / stakingWalletCosmicSignatureNftEthDepositReceivedParsedLog_.args.numStakedNfts;
					expect(rewardAmountPerStakedNftIncrement_).greaterThan(0n);
					ethRewardAmountPerStakedNft_ += rewardAmountPerStakedNftIncrement_;
					expect(stakingWalletCosmicSignatureNftEthDepositReceivedParsedLog_.args.rewardAmountPerStakedNft).equal(ethRewardAmountPerStakedNft_);
					expect(await contracts_.stakingWalletCosmicSignatureNft.rewardAmountPerStakedNft()).equal(ethRewardAmountPerStakedNft_);
					const remainderEthAmountIncrement_ = cosmicSignatureNftStakingTotalEthRewardAmount_ - rewardAmountPerStakedNftIncrement_ * stakingWalletCosmicSignatureNftEthDepositReceivedParsedLog_.args.numStakedNfts;
					// console.info("202507217", remainderEthAmountIncrement_.toString());
					expect(remainderEthAmountIncrement_).greaterThanOrEqual(0n);
					remainderEthAmount_ += remainderEthAmountIncrement_;
				}
				const cosmicSignatureNftNftMintedLogs_ = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(cosmicSignatureNftNftMintedTopicHash_) >= 0));
				expect(cosmicSignatureNftNftMintedLogs_.length).greaterThanOrEqual(2);
				for (const cosmicSignatureNftNftMintedLog_ of cosmicSignatureNftNftMintedLogs_) {
					// console.info("202507218");
					const cosmicSignatureNftNftMintedParsedLog_ = contracts_.cosmicSignatureNft.interface.parseLog(cosmicSignatureNftNftMintedLog_);
					const nftOwnerSigner_ = contracts_.signers[contracts_.signerAddressToIndexMapping[cosmicSignatureNftNftMintedParsedLog_.args.nftOwnerAddress]];
					transactionResponsePromise_ = contracts_.stakingWalletCosmicSignatureNft.connect(nftOwnerSigner_).stake(cosmicSignatureNftNftMintedParsedLog_.args.nftId);
					transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
					const stakingWalletCosmicSignatureNftNftStakedLog_ = transactionReceipt_.logs.find((log_) => (log_.topics.indexOf(stakingWalletCosmicSignatureNftNftStakedTopicHash_) >= 0));
					const stakingWalletCosmicSignatureNftNftStakedParsedLog_ = contracts_.stakingWalletCosmicSignatureNft.interface.parseLog(stakingWalletCosmicSignatureNftNftStakedLog_);
					expect(stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.nftId).equal(cosmicSignatureNftNftMintedParsedLog_.args.nftId);
					expect(stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakerAddress).equal(cosmicSignatureNftNftMintedParsedLog_.args.nftOwnerAddress);
					expect(stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.rewardAmountPerStakedNft).equal(ethRewardAmountPerStakedNft_);
					stakeActions_.push(
						{
							stakeActionId: stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakeActionId,
							nftId: stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.nftId,
							nftOwnerSigner: nftOwnerSigner_,
							initialEthRewardAmountPerStakedNft: ethRewardAmountPerStakedNft_,
						}
					);
					expect(Number(stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.numStakedNfts)).equal(stakeActions_.length);
				}
				if (( ++ roundNum_ ) % BigInt(numRoundsPerIteration_) == 0n) {
					break;
				}
			}

			// const ethDutchAuctionBeginningBidPrice_ = await contracts_.cosmicSignatureGameProxy.ethDutchAuctionBeginningBidPrice();
			// console.info(`202507207 ${stakeActions_.length} ${remainderEthAmount_}`, hre.ethers.formatEther(ethDutchAuctionBeginningBidPrice_));

			await expect(contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.ownerSigner).tryPerformMaintenance(brokenEthReceiverAddress_))
				.revertedWithCustomError(contracts_.stakingWalletCosmicSignatureNft, "ThereAreStakedNfts")
				.withArgs("There are still staked NFTs.");

			shuffleArray(stakeActions_);

			// Unstaking all.
			for (let stakeActionIndex_ = stakeActions_.length; ( -- stakeActionIndex_ ) >= 0; ) {
				// console.info("202507219");
				const stakeAction_ = stakeActions_[stakeActionIndex_];
				const ethRewardAmount_ = ethRewardAmountPerStakedNft_ - stakeAction_.initialEthRewardAmountPerStakedNft;
				const stakerEthBalanceAmountBeforeTransaction_ = await hre.ethers.provider.getBalance(stakeAction_.nftOwnerSigner.address);
				/** @type {Promise<hre.ethers.TransactionResponse>} */
				const transactionResponsePromise_ = contracts_.stakingWalletCosmicSignatureNft.connect(stakeAction_.nftOwnerSigner).unstake(stakeAction_.stakeActionId);
				const transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
				const stakerEthBalanceAmountAfterTransaction_ = await hre.ethers.provider.getBalance(stakeAction_.nftOwnerSigner.address);
				expect(stakerEthBalanceAmountAfterTransaction_).equal(stakerEthBalanceAmountBeforeTransaction_ - transactionReceipt_.fee + ethRewardAmount_);
				await expect(transactionResponsePromise_)
					.emit(contracts_.stakingWalletCosmicSignatureNft, "NftUnstaked")
					.withArgs(anyUint, stakeAction_.stakeActionId, stakeAction_.nftId, stakeAction_.nftOwnerSigner.address, BigInt(stakeActionIndex_), ethRewardAmountPerStakedNft_, ethRewardAmount_);
			}

			expect(await hre.ethers.provider.getBalance(contracts_.stakingWalletCosmicSignatureNftAddress)).equal(remainderEthAmount_);

			await expect(contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[0]).tryPerformMaintenance(brokenEthReceiverAddress_))
				.revertedWithCustomError(contracts_.stakingWalletCosmicSignatureNft, "OwnableUnauthorizedAccount");

			// This does nothing.
			await waitForTransactionReceipt(contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.ownerSigner).tryPerformMaintenance(hre.ethers.ZeroAddress));

			expect(await hre.ethers.provider.getBalance(contracts_.stakingWalletCosmicSignatureNftAddress)).equal(remainderEthAmount_);

			for ( let brokenEthReceiverEthDepositAcceptanceModeCode_ = 2n; ; -- brokenEthReceiverEthDepositAcceptanceModeCode_ ) {
				await waitForTransactionReceipt(brokenEthReceiver_.connect(contracts_.signers[0]).setEthDepositAcceptanceModeCode(brokenEthReceiverEthDepositAcceptanceModeCode_));
				/** @type {Promise<hre.ethers.TransactionResponse>} */
				const transactionResponsePromise_ = contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.ownerSigner).tryPerformMaintenance(brokenEthReceiverAddress_);
				const transactionResponsePromiseAssertion_ = expect(transactionResponsePromise_);
				if (brokenEthReceiverEthDepositAcceptanceModeCode_ > 0n) {
					// console.info("202507221");
					await transactionResponsePromiseAssertion_
						.emit(contracts_.stakingWalletCosmicSignatureNft, "FundTransferFailed")
						.withArgs("ETH transfer to charity failed.", brokenEthReceiverAddress_, remainderEthAmount_);
					expect(await hre.ethers.provider.getBalance(contracts_.stakingWalletCosmicSignatureNftAddress)).equal(remainderEthAmount_);
				} else {
					// console.info("202507222");
					await transactionResponsePromiseAssertion_
						.emit(contracts_.stakingWalletCosmicSignatureNft, "FundsTransferredToCharity")
						.withArgs(brokenEthReceiverAddress_, remainderEthAmount_);
					break;
				}
			}

			expect(await hre.ethers.provider.getBalance(contracts_.stakingWalletCosmicSignatureNftAddress)).equal(0n);
			expect(await hre.ethers.provider.getBalance(brokenEthReceiverAddress_)).equal(remainderEthAmount_);
			await waitForTransactionReceipt(brokenEthReceiver_.connect(contracts_.signers[0]).surrenderMyEth());
		}
	});

	it("Bidding and Cosmic Signature NFT staking", async function () {
		let durationUntilRoundActivation_;
		let durationUntilMainPrize_;
		/** @type {Promise<hre.ethers.TransactionResponse>} */
		let transactionResponsePromise_;
		/** @type {hre.ethers.TransactionReceipt} */
		let transactionReceipt_;
		/** @type {hre.ethers.Log} */
		let log_;
		/** @type {hre.ethers.LogDescription} */
		let parsedLog_;

		const contracts_ = await loadFixtureDeployContractsForTesting(999n);

		const stakingWalletCosmicSignatureNftNftStakedTopicHash_ = contracts_.stakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;
		const cosmicSignatureGameProxyRaffleWinnerCosmicSignatureNftAwardedTopicHash_ = contracts_.cosmicSignatureGameProxy.interface.getEvent("RaffleWinnerCosmicSignatureNftAwarded").topicHash;

		for ( let signerIndex_ = 1; signerIndex_ <= 4; ++ signerIndex_ ) {
			await waitForTransactionReceipt(contracts_.cosmicSignatureNft.connect(contracts_.signers[signerIndex_]).setApprovalForAll(contracts_.stakingWalletCosmicSignatureNftAddress, true));
		}

		for ( let counter_ = 0; counter_ < 10; ++ counter_ ) {
			durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilRoundActivation_),]);
			// await hre.ethers.provider.send("evm_mine");
			for ( let signerIndex_ = 1; signerIndex_ <= 4; ++ signerIndex_ ) {
				await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[signerIndex_]).bidWithEth(-1n, "", {value: 10n ** 18n,}));
			}
			durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
			// await hre.ethers.provider.send("evm_mine");
			await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).claimMainPrize());
		}

		const nftIdsByStakerAddress_ = {};
		const stakeActionIds_ = [];
		let cosmicSignatureNftTotalSupply_ = await contracts_.cosmicSignatureNft.totalSupply();

		// Staking all NFTs.
		for ( let nftId_ = 0n; nftId_ < cosmicSignatureNftTotalSupply_; ++ nftId_ ) {
			const nftStakerAddress_ = await contracts_.cosmicSignatureNft.ownerOf(nftId_);
			let nftStakerNftIds_ = nftIdsByStakerAddress_[nftStakerAddress_];
			if (nftStakerNftIds_ == undefined) {
				nftStakerNftIds_ = [];
				nftIdsByStakerAddress_[nftStakerAddress_] = nftStakerNftIds_;
			}
			nftStakerNftIds_.push(nftId_);
			const nftStakerSigner_ = contracts_.signers[contracts_.signerAddressToIndexMapping[nftStakerAddress_]];

			// [Comment-202506052/]
			transactionResponsePromise_ = contracts_.stakingWalletCosmicSignatureNft.connect(nftStakerSigner_).stake(nftId_);

			transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
			log_ = transactionReceipt_.logs.find((log_) => (log_.topics.indexOf(stakingWalletCosmicSignatureNftNftStakedTopicHash_) >= 0));
			parsedLog_ = contracts_.stakingWalletCosmicSignatureNft.interface.parseLog(log_);
			stakeActionIds_.push(parsedLog_.args.stakeActionId);
		}

		let cosmicSignatureNftTotalSupplyBefore_ = cosmicSignatureNftTotalSupply_;

		durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilRoundActivation_),]);
		// await hre.ethers.provider.send("evm_mine");
		for ( let signerIndex_ = 1; signerIndex_ <= 4; ++ signerIndex_ ) {
			await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[signerIndex_]).bidWithEth(-1n, "", {value: 10n ** 18n,}));
		}
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();

		// We need an extra time increase to claim as signer 5. It placed no bids; won't get raffle NFTs.
		let durationUntilTimeoutTimeToClaimMainPrize_ = durationUntilMainPrize_ + await contracts_.cosmicSignatureGameProxy.timeoutDurationToClaimMainPrize();

		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilTimeoutTimeToClaimMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[5]).claimMainPrize();
		transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);

		// Issue. These are really not all events that show newly minted and awarded CS NFTs.
		let cosmicSignatureGameProxyRaffleWinnerCosmicSignatureNftAwardedLogs_ = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(cosmicSignatureGameProxyRaffleWinnerCosmicSignatureNftAwardedTopicHash_) >= 0));

		// Asserting that the the extra NFTs have not been staked.
		for ( let raffleNftIndex_ = 0; raffleNftIndex_ < cosmicSignatureGameProxyRaffleWinnerCosmicSignatureNftAwardedLogs_.length; ++ raffleNftIndex_ ) {
			parsedLog_ = contracts_.cosmicSignatureGameProxy.interface.parseLog(cosmicSignatureGameProxyRaffleWinnerCosmicSignatureNftAwardedLogs_[raffleNftIndex_]);
			const nftWasUsed_ = await contracts_.stakingWalletCosmicSignatureNft.usedNfts(parsedLog_.args.prizeCosmicSignatureNftId);
			expect(nftWasUsed_).equal(0n);
		}

		cosmicSignatureNftTotalSupply_ = await contracts_.cosmicSignatureNft.totalSupply();

		for ( let nftId_ = 0n; nftId_ < cosmicSignatureNftTotalSupply_; ++ nftId_ ) {
			const nftWasUsed_ = await contracts_.stakingWalletCosmicSignatureNft.usedNfts(nftId_);
			if (nftWasUsed_ != 0n) {
				expect(nftId_).lessThan(cosmicSignatureNftTotalSupplyBefore_);
			} else {
				expect(nftId_).greaterThanOrEqual(cosmicSignatureNftTotalSupplyBefore_);
				const nftStakerAddress_ = await contracts_.cosmicSignatureNft.ownerOf(nftId_);
				let nftStakerNftIds_ = nftIdsByStakerAddress_[nftStakerAddress_];
				if (nftStakerNftIds_ == undefined) {
					nftStakerNftIds_ = [];
					nftIdsByStakerAddress_[nftStakerAddress_] = nftStakerNftIds_;
				}
				nftStakerNftIds_.push(nftId_);

				// Unlike near Comment-202506052, not staking the NFT here.
			}
		}

		let numStakedNfts_ = await contracts_.stakingWalletCosmicSignatureNft.numStakedNfts();
		expect(Number(numStakedNfts_)).equal(stakeActionIds_.length);
		shuffleArray(stakeActionIds_);

		// Unstaking all staked NFTs.
		for ( let stakeActionIndex_ = 0; stakeActionIndex_ < stakeActionIds_.length; ++ stakeActionIndex_ ) {
			const stakeAction_ = await contracts_.stakingWalletCosmicSignatureNft.stakeActions(stakeActionIds_[stakeActionIndex_]);
			const nftStakerAddress_ = stakeAction_.nftOwnerAddress;
			const nftStakerSigner_ = contracts_.signers[contracts_.signerAddressToIndexMapping[nftStakerAddress_]];
			await waitForTransactionReceipt(contracts_.stakingWalletCosmicSignatureNft.connect(nftStakerSigner_).unstake(stakeActionIds_[stakeActionIndex_]));
		}

		// Asserting that all NFTs have been unstaked.
		numStakedNfts_ = await contracts_.stakingWalletCosmicSignatureNft.numStakedNfts();
		expect(numStakedNfts_).equal(0n);

		// Asserting that every staker got their NFTs back.
		for (const nftStakerAddress_ in nftIdsByStakerAddress_) {
			const nftStakerNftIds_ = nftIdsByStakerAddress_[nftStakerAddress_];
			for ( let nftIndex_ = 0; nftIndex_ < nftStakerNftIds_.length; ++ nftIndex_ ) {
				const nftOwnerAddress_ = await contracts_.cosmicSignatureNft.ownerOf(nftStakerNftIds_[nftIndex_]);
				expect(nftOwnerAddress_).equal(nftStakerAddress_);
			}
		}
	});

	it("Staking a used Cosmic Signature NFT", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		const stakingWalletCosmicSignatureNftNftStakedTopicHash_ = contracts_.stakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;

		await waitForTransactionReceipt(contracts_.cosmicSignatureNft.connect(contracts_.signers[0]).setApprovalForAll(contracts_.stakingWalletCosmicSignatureNftAddress, true));

		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(-1n, "", {value: 10n ** 18n,}));
		const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).claimMainPrize());

		const nftId_ = await contracts_.cosmicSignatureNft.totalSupply() / 2n;

		for ( let counter_ = 0; ; ++ counter_ ) {
			/** @type {Promise<hre.ethers.TransactionResponse>} */
			const transactionResponsePromise_ = contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[0]).stake(nftId_);
			if (counter_ <= 0) {
				const transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
				const stakingWalletCosmicSignatureNftNftStakedLog_ = transactionReceipt_.logs.find((log_) => (log_.topics.indexOf(stakingWalletCosmicSignatureNftNftStakedTopicHash_) >= 0));
				const stakingWalletCosmicSignatureNftNftStakedParsedLog_ = contracts_.stakingWalletCosmicSignatureNft.interface.parseLog(stakingWalletCosmicSignatureNftNftStakedLog_);
				await waitForTransactionReceipt(contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[0]).unstake(stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakeActionId));
				expect(await contracts_.stakingWalletCosmicSignatureNft.usedNfts(nftId_)).equal(1n);
			} else {
				await expect(transactionResponsePromise_)
					.revertedWithCustomError(contracts_.stakingWalletCosmicSignatureNft, "NftHasAlreadyBeenStaked")
					.withArgs("This NFT has already been staked in the past. An NFT is allowed to be staked only once.", nftId_);
				break;
			}
		}
	});

	it("An unauthorized caller unstakes a Cosmic Signature NFT", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		const stakingWalletCosmicSignatureNftNftStakedTopicHash_ = contracts_.stakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;

		await waitForTransactionReceipt(contracts_.cosmicSignatureNft.connect(contracts_.signers[0]).setApprovalForAll(contracts_.stakingWalletCosmicSignatureNftAddress, true));

		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(-1n, "", {value: 10n ** 18n,}));
		const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).claimMainPrize());

		const nftId_ = await contracts_.cosmicSignatureNft.totalSupply() / 2n;

		/** @type {Promise<hre.ethers.TransactionResponse>} */
		let transactionResponsePromise_ = contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[0]).stake(nftId_);
		let transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
		const stakingWalletCosmicSignatureNftNftStakedLog_ = transactionReceipt_.logs.find((log_) => (log_.topics.indexOf(stakingWalletCosmicSignatureNftNftStakedTopicHash_) >= 0));
		const stakingWalletCosmicSignatureNftNftStakedParsedLog_ = contracts_.stakingWalletCosmicSignatureNft.interface.parseLog(stakingWalletCosmicSignatureNftNftStakedLog_);
		// console.info(stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakeActionId.toString());

		for ( let counter_ = 0; counter_ < 2; ++ counter_ ) {
			transactionResponsePromise_ =
				(counter_ <= 0) ?
				contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[1]).unstake(stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakeActionId) :
				contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[1]).unstakeMany([stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakeActionId]);
			await expect(transactionResponsePromise_)
				.revertedWithCustomError(contracts_.stakingWalletCosmicSignatureNft, "NftStakeActionAccessDenied")
				.withArgs("Only NFT owner is permitted to unstake it.", stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakeActionId, contracts_.signers[1].address);
		}
	});

	it("Unstaking an invalid stakeActionId", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		const stakingWalletCosmicSignatureNftNftStakedTopicHash_ = contracts_.stakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;

		await waitForTransactionReceipt(contracts_.cosmicSignatureNft.connect(contracts_.signers[0]).setApprovalForAll(contracts_.stakingWalletCosmicSignatureNftAddress, true));

		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(-1n, "", {value: 10n ** 18n,}));
		const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).claimMainPrize());

		const nftId_ = await contracts_.cosmicSignatureNft.totalSupply() / 2n;
		/** @type {Promise<hre.ethers.TransactionResponse>} */
		let transactionResponsePromise_ = contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[0]).stake(nftId_);
		let transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
		const stakingWalletCosmicSignatureNftNftStakedLog_ = transactionReceipt_.logs.find((log_) => (log_.topics.indexOf(stakingWalletCosmicSignatureNftNftStakedTopicHash_) >= 0));
		const stakingWalletCosmicSignatureNftNftStakedParsedLog_ = contracts_.stakingWalletCosmicSignatureNft.interface.parseLog(stakingWalletCosmicSignatureNftNftStakedLog_);
		// console.info(stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakeActionId.toString());

		{
			const stakeActionId_ = stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakeActionId + BigInt(1 - (generateRandomUInt32() & 2));
			for ( let counter_ = 0; counter_ < 2; ++ counter_ ) {
				transactionResponsePromise_ =
					(counter_ <= 0) ?
					contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[0]).unstake(stakeActionId_) :
					contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[0]).unstakeMany([stakeActionId_]);
				await expect(transactionResponsePromise_)
					.revertedWithCustomError(contracts_.stakingWalletCosmicSignatureNft, "NftStakeActionInvalidId")
					.withArgs("Invalid NFT stake action ID.", stakeActionId_);
			}
		}

		{
			const stakeActionId_ = stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakeActionId;
			transactionResponsePromise_ =
				((generateRandomUInt32() & 1) == 0) ?
				contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[0]).unstake(stakeActionId_) :
				contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[0]).unstakeMany([stakeActionId_]);
			await waitForTransactionReceipt(transactionResponsePromise_);
		}
	});

	it("Double-unstaking Cosmic Signature NFTs", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		const cosmicSignatureNftNftMintedTopicHash_ = contracts_.cosmicSignatureNft.interface.getEvent("NftMinted").topicHash;
		const stakingWalletCosmicSignatureNftNftStakedTopicHash_ = contracts_.stakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;

		await waitForTransactionReceipt(contracts_.cosmicSignatureNft.connect(contracts_.signers[0]).setApprovalForAll(contracts_.stakingWalletCosmicSignatureNftAddress, true));

		const nftIds_ = [];

		{
			await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(-1n, "", {value: 10n ** 18n,}));
			const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
			// await hre.ethers.provider.send("evm_mine");
			/** @type {Promise<hre.ethers.TransactionResponse>} */
			const transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).claimMainPrize();
			const transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
			const cosmicSignatureNftNftMintedLogs_ = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(cosmicSignatureNftNftMintedTopicHash_) >= 0));
			// console.info(`202507281 ${cosmicSignatureNftNftMintedLogs_.length}`)
			for (const cosmicSignatureNftNftMintedLog_ of cosmicSignatureNftNftMintedLogs_) {
				const cosmicSignatureNftNftMintedParsedLog_ = contracts_.cosmicSignatureNft.interface.parseLog(cosmicSignatureNftNftMintedLog_);
				// console.info(`202507282 ${cosmicSignatureNftNftMintedParsedLog_.args.nftId}`)
				nftIds_.push(cosmicSignatureNftNftMintedParsedLog_.args.nftId);
			}
		}

		const duplicatedStakeActionIds_ = [];
		shuffleArray(nftIds_);

		{
			/** @type {Promise<hre.ethers.TransactionResponse>} */
			const transactionResponsePromise_ = contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[0]).stakeMany(nftIds_);
			const transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
			const stakingWalletCosmicSignatureNftNftStakedLogs_ = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(stakingWalletCosmicSignatureNftNftStakedTopicHash_) >= 0));
			for (const stakingWalletCosmicSignatureNftNftStakedLog_ of stakingWalletCosmicSignatureNftNftStakedLogs_) {
				const stakingWalletCosmicSignatureNftNftStakedParsedLog_ = contracts_.stakingWalletCosmicSignatureNft.interface.parseLog(stakingWalletCosmicSignatureNftNftStakedLog_);
				// console.info(`202507283 ${stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.nftId} ${stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakeActionId}`)
				expect(await contracts_.stakingWalletCosmicSignatureNft.usedNfts(stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.nftId)).equal(1n);
				for ( let counter_ = 0; counter_ < 2; ++ counter_ ) {
					duplicatedStakeActionIds_.push(stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakeActionId);
				}
			}
		}

		shuffleArray(duplicatedStakeActionIds_);
		const unstakedStakeActionIds_ = {};

		for (const stakeActionId_ of duplicatedStakeActionIds_) {
			/** @type {Promise<hre.ethers.TransactionResponse>} */
			const transactionResponsePromise_ = contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[0]).unstake(stakeActionId_);
			const transactionResponsePromiseAssertion_ = expect(transactionResponsePromise_);
			if ( ! unstakedStakeActionIds_[stakeActionId_] ) {
				// console.info(`202507284 ${stakeActionId_}`)
				unstakedStakeActionIds_[stakeActionId_] = true;
				await transactionResponsePromiseAssertion_.emit(contracts_.stakingWalletCosmicSignatureNft, "NftUnstaked");
			} else {
				// console.info(`202507285 ${stakeActionId_}`)
				await transactionResponsePromiseAssertion_.revertedWithCustomError(contracts_.stakingWalletCosmicSignatureNft, "NftStakeActionInvalidId");
			}
		}
	});

	it("ETH transfer to the staker reversal", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		const brokenCosmicSignatureNftStakerFactory_ = await hre.ethers.getContractFactory("BrokenCosmicSignatureNftStaker", contracts_.deployerSigner);
		const brokenCosmicSignatureNftStaker_ = await brokenCosmicSignatureNftStakerFactory_.deploy(contracts_.stakingWalletCosmicSignatureNftAddress);
		await brokenCosmicSignatureNftStaker_.waitForDeployment();
		const brokenCosmicSignatureNftStakerAddress_ = await brokenCosmicSignatureNftStaker_.getAddress();

		const stakingWalletCosmicSignatureNftNftStakedTopicHash_ = contracts_.stakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;

		await waitForTransactionReceipt(brokenCosmicSignatureNftStaker_.connect(contracts_.signers[0]).doSetApprovalForAll());

		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(-1n, "", {value: 10n ** 18n,}));
		const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).claimMainPrize());

		const nftId_ = await contracts_.cosmicSignatureNft.totalSupply() / 2n;

		await waitForTransactionReceipt(contracts_.cosmicSignatureNft.connect(contracts_.signers[0]).transferFrom(contracts_.signers[0].address, brokenCosmicSignatureNftStakerAddress_, nftId_));

		/** @type {Promise<hre.ethers.TransactionResponse>} */
		let transactionResponsePromise_ = brokenCosmicSignatureNftStaker_.connect(contracts_.signers[0]).doStake(nftId_);
		let transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
		const stakingWalletCosmicSignatureNftNftStakedLog_ = transactionReceipt_.logs.find((log_) => (log_.topics.indexOf(stakingWalletCosmicSignatureNftNftStakedTopicHash_) >= 0));
		const stakingWalletCosmicSignatureNftNftStakedParsedLog_ = contracts_.stakingWalletCosmicSignatureNft.interface.parseLog(stakingWalletCosmicSignatureNftNftStakedLog_);

		for ( let brokenCosmicSignatureNftStakerEthDepositAcceptanceModeCode_ = 2n; ; -- brokenCosmicSignatureNftStakerEthDepositAcceptanceModeCode_ ) {
			await waitForTransactionReceipt(brokenCosmicSignatureNftStaker_.connect(contracts_.signers[0]).setEthDepositAcceptanceModeCode(brokenCosmicSignatureNftStakerEthDepositAcceptanceModeCode_));
			transactionResponsePromise_ = brokenCosmicSignatureNftStaker_.connect(contracts_.signers[0]).doUnstake(stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakeActionId);
			let transactionResponsePromiseAssertion_ = expect(transactionResponsePromise_);
			if (brokenCosmicSignatureNftStakerEthDepositAcceptanceModeCode_ > 0n) {
				await transactionResponsePromiseAssertion_
					.revertedWithCustomError(contracts_.stakingWalletCosmicSignatureNft, "FundTransferFailed")
					.withArgs("NFT staking ETH reward payment failed.", brokenCosmicSignatureNftStakerAddress_, 0n);
			} else {
				await transactionResponsePromiseAssertion_
					.emit(contracts_.stakingWalletCosmicSignatureNft, "NftUnstaked")
					.withArgs(
						anyUint,
						stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakeActionId,
						nftId_,
						brokenCosmicSignatureNftStakerAddress_,
						0n,
						0n,
						0n
					);
				break;
			}
		}
	});

	it("An unauthorized caller deposits ETH", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		await expect(contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[1]).deposit(0, {value: 1n,}))
			.revertedWithCustomError(contracts_.stakingWalletCosmicSignatureNft, "UnauthorizedCaller");
	});

	it("Reentries", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		const maliciousCosmicSignatureNftStakerFactory_ = await hre.ethers.getContractFactory("MaliciousCosmicSignatureNftStaker", contracts_.deployerSigner);
		const maliciousCosmicSignatureNftStaker_ = await maliciousCosmicSignatureNftStakerFactory_.deploy(contracts_.stakingWalletCosmicSignatureNftAddress);
		await maliciousCosmicSignatureNftStaker_.waitForDeployment();
		const maliciousCosmicSignatureNftStakerAddress_ = await maliciousCosmicSignatureNftStaker_.getAddress();

		const stakingWalletCosmicSignatureNftNftStakedTopicHash_ = contracts_.stakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;

		await waitForTransactionReceipt(maliciousCosmicSignatureNftStaker_.connect(contracts_.signers[0]).doSetApprovalForAll());

		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(-1n, "", {value: 10n ** 18n,}));
		const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).claimMainPrize());

		const nftId_ = await contracts_.cosmicSignatureNft.totalSupply() / 2n;

		await waitForTransactionReceipt(contracts_.cosmicSignatureNft.connect(contracts_.signers[0]).transferFrom(contracts_.signers[0].address, maliciousCosmicSignatureNftStakerAddress_, nftId_));

		/** @type {Promise<hre.ethers.TransactionResponse>} */
		let transactionResponsePromise_ = maliciousCosmicSignatureNftStaker_.connect(contracts_.signers[0]).doStake(nftId_);
		let transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
		const stakingWalletCosmicSignatureNftNftStakedLog_ = transactionReceipt_.logs.find((log_) => (log_.topics.indexOf(stakingWalletCosmicSignatureNftNftStakedTopicHash_) >= 0));
		const stakingWalletCosmicSignatureNftNftStakedParsedLog_ = contracts_.stakingWalletCosmicSignatureNft.interface.parseLog(stakingWalletCosmicSignatureNftNftStakedLog_);

		for ( let maliciousCosmicSignatureNftStakerModeCode_ = 6n; ; -- maliciousCosmicSignatureNftStakerModeCode_ ) {
			await waitForTransactionReceipt(maliciousCosmicSignatureNftStaker_.connect(contracts_.signers[0]).setModeCode(maliciousCosmicSignatureNftStakerModeCode_));
			transactionResponsePromise_ = maliciousCosmicSignatureNftStaker_.connect(contracts_.signers[0]).doUnstake(stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakeActionId);
			let transactionResponsePromiseAssertion_ = expect(transactionResponsePromise_);
			if (maliciousCosmicSignatureNftStakerModeCode_ > 0n) {
				await transactionResponsePromiseAssertion_
					.revertedWithCustomError(contracts_.stakingWalletCosmicSignatureNft, "FundTransferFailed")
					.withArgs("NFT staking ETH reward payment failed.", maliciousCosmicSignatureNftStakerAddress_, 0n);
			} else {
				await transactionResponsePromiseAssertion_
					.emit(contracts_.stakingWalletCosmicSignatureNft, "NftUnstaked")
					.withArgs(
						anyUint,
						stakingWalletCosmicSignatureNftNftStakedParsedLog_.args.stakeActionId,
						nftId_,
						maliciousCosmicSignatureNftStakerAddress_,
						0n,
						0n,
						0n
					);
				break;
			}
		}
	});
});
