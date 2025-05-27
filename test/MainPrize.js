"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt256 } = require("../src/Helpers.js");
const { setRoundActivationTimeIfNeeded } = require("../src/ContractDeploymentHelpers.js");
const { loadFixtureDeployContractsForUnitTesting, deployContractsForUnitTestingAdvanced } = require("../src/ContractUnitTestingHelpers.js");

describe("MainPrize", function () {
	// Comment-202505315 applies.
	it("Test 1", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		const ethDonationAmount_ = BigInt(Math.max(Number(BigInt.asUintN(53, generateRandomUInt256())) - Number(1n << (53n - 2n)), 0));
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).donateEth({value: ethDonationAmount_,})).not.reverted;
		let mainEthPrizeAmount_ = await contracts_.cosmicSignatureGameProxy.getMainEthPrizeAmount();
		expect(mainEthPrizeAmount_).equal((ethDonationAmount_ * 25n) / 100n);
		let currentChampions_ = await contracts_.cosmicSignatureGameProxy.tryGetCurrentChampions();
		expect(currentChampions_[0]).equal(hre.ethers.ZeroAddress);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: 1n,})).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InsufficientReceivedBidAmount");
		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_ - 1n,})).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InsufficientReceivedBidAmount");

		const initialDurationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getInitialDurationUntilMainPrize();
		expect(initialDurationUntilMainPrize_).equal(24n * 60n * 60n + 1n);
		const mainPrizeTimeIncrement_ = await contracts_.cosmicSignatureGameProxy.getMainPrizeTimeIncrement();
		expect(mainPrizeTimeIncrement_).equal(60n * 60n);

		// If a bidder sends too much ETH, the game would refund the excess.
		// Keeping in mind that the bidder won't get a too small refund.
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_ + 10n ** (18n - 2n),})).not.reverted;
		let gameBalanceAmount_ = await hre.ethers.provider.getBalance(contracts_.cosmicSignatureGameProxyAddr);
		expect(gameBalanceAmount_).equal(ethDonationAmount_ + nextEthBidPrice_);
		let roundNum_ = await contracts_.cosmicSignatureGameProxy.roundNum();
		let totalSpentEthAmount_ = await contracts_.cosmicSignatureGameProxy.getBidderTotalSpentAmounts(roundNum_, contracts_.signers[1].address);
		expect(totalSpentEthAmount_[0]).equal(nextEthBidPrice_);

		let durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		expect(durationUntilMainPrize_).equal(initialDurationUntilMainPrize_);
		await hre.ethers.provider.send("evm_increaseTime", [100]);
		await hre.ethers.provider.send("evm_mine");
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		expect(durationUntilMainPrize_).equal(initialDurationUntilMainPrize_ - 100n);

		currentChampions_ = await contracts_.cosmicSignatureGameProxy.tryGetCurrentChampions();
		expect(currentChampions_[0]).equal(contracts_.signers[1].address);

		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		expect(durationUntilMainPrize_).equal(initialDurationUntilMainPrize_ - 100n - 1n + mainPrizeTimeIncrement_);

		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		expect(durationUntilMainPrize_).equal(initialDurationUntilMainPrize_ - 100n - 1n + mainPrizeTimeIncrement_ - 1n + mainPrizeTimeIncrement_);

		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize()).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "MainPrizeEarlyClaim");
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 1,]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).claimMainPrize()).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "MainPrizeEarlyClaim");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize()).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "MainPrizeClaimDenied");
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		await hre.ethers.provider.send("evm_increaseTime", [100]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		await hre.ethers.provider.send("evm_increaseTime", [10]);
		await hre.ethers.provider.send("evm_mine");
		currentChampions_ = await contracts_.cosmicSignatureGameProxy.tryGetCurrentChampions();
		expect(currentChampions_[0]).equal(contracts_.signers[2].address);
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		// mainEthPrizeAmount_ = await contracts_.cosmicSignatureGameProxy.getMainEthPrizeAmount();
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).claimMainPrize()).not.reverted;
		gameBalanceAmount_ = await hre.ethers.provider.getBalance(contracts_.cosmicSignatureGameProxyAddr);
		let mainEthPrizeAmount2_ = await contracts_.cosmicSignatureGameProxy.getMainEthPrizeAmount();
		let mainEthPrizeExpectedAmount_ = (gameBalanceAmount_ * 25n) / 100n;
		expect(mainEthPrizeAmount2_).equal(mainEthPrizeExpectedAmount_);
		let mainPrizeBeneficiaryAddress_ = await contracts_.prizesWallet.mainPrizeBeneficiaryAddresses(roundNum_);
		expect(mainPrizeBeneficiaryAddress_).equal(contracts_.signers[3].address);

		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).claimMainPrize()).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "NoBidsPlacedInCurrentRound");
		let durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilRoundActivation_),]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).claimMainPrize()).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "NoBidsPlacedInCurrentRound");
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize()).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "MainPrizeEarlyClaim");
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 1,]);
		// await hre.ethers.provider.send("evm_mine");
		// mainEthPrizeAmount_ = await contracts_.cosmicSignatureGameProxy.getMainEthPrizeAmount();
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize()).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "MainPrizeEarlyClaim");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize()).not.reverted;
		gameBalanceAmount_ = await hre.ethers.provider.getBalance(contracts_.cosmicSignatureGameProxyAddr);
		mainEthPrizeAmount2_ = await contracts_.cosmicSignatureGameProxy.getMainEthPrizeAmount();
		mainEthPrizeExpectedAmount_ = (gameBalanceAmount_ * 25n) / 100n;
		expect(mainEthPrizeAmount2_).equal(mainEthPrizeExpectedAmount_);

		durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilRoundActivation_) - 1,]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: 10n ** 18n,})).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsInactive");
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		roundNum_ = await contracts_.cosmicSignatureGameProxy.roundNum();
		expect(roundNum_).equal(2n);
		expect(await contracts_.cosmicSignatureGameProxy.getTotalNumBids(roundNum_)).equal(1n);
		expect(await contracts_.cosmicSignatureGameProxy.getBidderAddressAt(roundNum_, 0n)).equal(contracts_.signers[1].address);
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).claimMainPrize()).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "MainPrizeClaimDenied");

		// After the main prize claim timeout expires, anyone is allowed to claim the prize.
		const timeoutDurationToClaimMainPrize_ = await contracts_.cosmicSignatureGameProxy.timeoutDurationToClaimMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(timeoutDurationToClaimMainPrize_) - 1]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).claimMainPrize()).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "MainPrizeClaimDenied");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).claimMainPrize()).not.reverted;
	});

	// Comment-202505315 applies.
	// Issue. This test doesn't test CST prizes.
	it("The number of prizes", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		const prizesWalletEthReceivedTopicHash_ = contracts_.prizesWallet.interface.getEvent("EthReceived").topicHash;

		await expect(contracts_.randomWalkNft.connect(contracts_.signers[1]).setApprovalForAll(contracts_.stakingWalletRandomWalkNftAddr, true)).not.reverted;
		await expect(contracts_.randomWalkNft.connect(contracts_.signers[2]).setApprovalForAll(contracts_.stakingWalletRandomWalkNftAddr, true)).not.reverted;

		const numMainPrizeBeneficiaries_ = 1n;
		const numLastCstBidders_ = 1n;
		const numEnduranceChampions_ = 1n;
		const numChronoWarriors_ = 1n;
		const numRaffleEthPrizesForBidders_= await contracts_.cosmicSignatureGameProxy.numRaffleEthPrizesForBidders();
		const numRaffleCosmicSignatureNftsForBidders_ = await contracts_.cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForBidders();
		const numRaffleCosmicSignatureNftsForRandomWalkNftStakers_ = await contracts_.cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForRandomWalkNftStakers();
		const numSecondaryEthPrizesToDistribute_ =
			numChronoWarriors_ +
			numRaffleEthPrizesForBidders_;
		const numCosmicSignatureNftsToDistribute_ =
			numMainPrizeBeneficiaries_ +
			numLastCstBidders_ +
			numEnduranceChampions_ +
			numRaffleCosmicSignatureNftsForBidders_ +
			numRaffleCosmicSignatureNftsForRandomWalkNftStakers_;

		// Populating `RandomWalkNFT`.
		let randomWalkNftMintPrice_ = await contracts_.randomWalkNft.getMintPrice();
		await expect(contracts_.randomWalkNft.connect(contracts_.signers[1]).mint({value: randomWalkNftMintPrice_,})).not.reverted;
		let randomWalkNftId_ = 0n;
		await expect(contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[1]).stake(randomWalkNftId_)).not.reverted;
		randomWalkNftMintPrice_ = await contracts_.randomWalkNft.getMintPrice();
		await expect(contracts_.randomWalkNft.connect(contracts_.signers[2]).mint({value: randomWalkNftMintPrice_,})).not.reverted;
		++ randomWalkNftId_;
		await expect(contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[2]).stake(randomWalkNftId_)).not.reverted;

		let roundNum_ = 0n;

		// Running a bidding round ending with `claimMainPrize` to populate `CosmicSignatureNft`.
		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		let nextCstBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextCstBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithCst(nextCstBidPrice_, "")).not.reverted;
		let durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize()).not.reverted;
		++ roundNum_;
		const cosmicSignatureNftTotalSupplyBefore_ = await contracts_.cosmicSignatureNft.totalSupply();
		expect(cosmicSignatureNftTotalSupplyBefore_).equal(numCosmicSignatureNftsToDistribute_);
		let expectedCosmicSignatureNftTotalSupply_ = cosmicSignatureNftTotalSupplyBefore_;

		// At this point, all required data has been initialized. We can start the test.

		let durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilRoundActivation_) - 1,]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;

		// Reducing CST bid price.
		await hre.ethers.provider.send("evm_increaseTime", [20000]);
		await hre.ethers.provider.send("evm_mine");

		nextCstBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextCstBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithCst(nextCstBidPrice_, "")).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		let transactionResponse_ = await contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).claimMainPrize();
		let transactionReceipt_ = await transactionResponse_.wait();
		++ roundNum_;
		expect(await contracts_.cosmicSignatureGameProxy.roundNum()).equal(roundNum_);

		// Asserting that we have recorded the correct main prize beneficiary.
		let mainPrizeBeneficiaryAddress_ = await contracts_.prizesWallet.mainPrizeBeneficiaryAddresses(roundNum_ - 1n);
		expect(mainPrizeBeneficiaryAddress_).equal(contracts_.signers[3].address);

		// Asserting the number of ETH deposits.
		let prizesWalletEthReceivedLogs_ = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(prizesWalletEthReceivedTopicHash_) >= 0));
		expect(prizesWalletEthReceivedLogs_.length).equal(numSecondaryEthPrizesToDistribute_);
		expectedCosmicSignatureNftTotalSupply_ += numCosmicSignatureNftsToDistribute_;
		expect(await contracts_.cosmicSignatureNft.totalSupply()).equal(expectedCosmicSignatureNftTotalSupply_);

		// Next bidding round.
		durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilRoundActivation_) - 1,]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		transactionResponse_ = await contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).claimMainPrize();
		transactionReceipt_ = await transactionResponse_.wait();
		++ roundNum_;

		// Asserting that the total number of bids has been reset.
		let totalNumBids_ = await contracts_.cosmicSignatureGameProxy.getTotalNumBids(roundNum_);
		expect(totalNumBids_).equal(0n);

		prizesWalletEthReceivedLogs_ = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(prizesWalletEthReceivedTopicHash_) >= 0));
		const uniqueSecondaryEthPrizeWinners_ = {};
		for ( let prizesWalletEthDepositIndex_ = 0; prizesWalletEthDepositIndex_ < prizesWalletEthReceivedLogs_.length; ++ prizesWalletEthDepositIndex_ ) {
			const parsedLog_ = contracts_.prizesWallet.interface.parseLog(prizesWalletEthReceivedLogs_[prizesWalletEthDepositIndex_]);
			if (uniqueSecondaryEthPrizeWinners_[parsedLog_.args.prizeWinnerAddress] == undefined) {
				uniqueSecondaryEthPrizeWinners_[parsedLog_.args.prizeWinnerAddress] = true;
				const prizeWinnerSigner_ = await hre.ethers.getSigner(parsedLog_.args.prizeWinnerAddress);
				await expect(contracts_.prizesWallet.connect(prizeWinnerSigner_).withdrawEth()).not.reverted;
			}
		}
	});

	// Comment-202505315 applies.
	// Issue. This test doesn't test some prizes.
	it("Prize amounts", async function () {
		const contracts_ = await deployContractsForUnitTestingAdvanced("SpecialCosmicSignatureGame");

		// [Comment-202506033]
		// The use of `BidderContract` eliminates the need to subtract gas used.
		// It's paid by the EOA that sends the transaction request.
		// [/Comment-202506033]
		const bidderContractFactory_ = await hre.ethers.getContractFactory("BidderContract", contracts_.deployerAcct);
		const bidderContract_ = await bidderContractFactory_.deploy(contracts_.cosmicSignatureGameProxyAddr);
		await bidderContract_.waitForDeployment();
		const bidderContractAddr_ = await bidderContract_.getAddress();

		const cosmicSignatureGameProxyRaffleWinnerBidderEthPrizeAllocatedTopicHash_ = contracts_.cosmicSignatureGameProxy.interface.getEvent("RaffleWinnerBidderEthPrizeAllocated").topicHash;

		await expect(contracts_.cosmicSignatureNft.connect(contracts_.signers[1]).setApprovalForAll(contracts_.stakingWalletCosmicSignatureNftAddr, true)).not.reverted;

		// Minting and staking a CS NFT.
		// Otherwise `StakingWalletCosmicSignatureNft` would reject an ETH deposit.
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).mintCosmicSignatureNft(contracts_.signers[1].address)).not.reverted;
		let cosmicSignatureNftId_ = 0n;
		await expect(contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[1]).stake(cosmicSignatureNftId_)).not.reverted;

		const ethDonationAmount_ = BigInt(Math.max(Number(BigInt.asUintN(53, generateRandomUInt256())) - Number(1n << (53n - 2n)), 0));
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).donateEth({value: ethDonationAmount_,})).not.reverted;

		await setRoundActivationTimeIfNeeded(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct), 2n);
		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(bidderContract_.connect(contracts_.signers[0]).doBidWithEth2({value: nextEthBidPrice_,})).not.reverted;

		const mainEthPrizeAmount_ = await contracts_.cosmicSignatureGameProxy.getMainEthPrizeAmount();
		const charityEthDonationAmount_ = await contracts_.cosmicSignatureGameProxy.getCharityEthDonationAmount();
		const cosmicSignatureNftStakingTotalEthRewardAmount_ = await contracts_.cosmicSignatureGameProxy.getCosmicSignatureNftStakingTotalEthRewardAmount();
		let raffleTotalEthPrizeAmountForBidders_ = await contracts_.cosmicSignatureGameProxy.getRaffleTotalEthPrizeAmountForBidders();
		const numRaffleEthPrizesForBidders_ = await contracts_.cosmicSignatureGameProxy.numRaffleEthPrizesForBidders();
		// const raffleEthPrizeAmountForBidder_ = raffleTotalEthPrizeAmountForBidders_ / numRaffleEthPrizesForBidders_;
		const raffleTotalEthPrizeAmountForBiddersRemainder_ = raffleTotalEthPrizeAmountForBidders_ % numRaffleEthPrizesForBidders_;
		raffleTotalEthPrizeAmountForBidders_ -= raffleTotalEthPrizeAmountForBiddersRemainder_;

		const bidderContractBalanceAmountBefore_ = await hre.ethers.provider.getBalance(bidderContractAddr_);
		const charityWalletBalanceAmountBefore_ = await hre.ethers.provider.getBalance(contracts_.charityWalletAddr);
		const stakingWalletCosmicSignatureNftBalanceAmountBefore_ = await hre.ethers.provider.getBalance(contracts_.stakingWalletCosmicSignatureNftAddr);

		const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		let transactionRequest_ = await bidderContract_.connect(contracts_.signers[2]).doClaimMainPrize();
		let transactionReceipt_ = await transactionRequest_.wait();

		const bidderContractBalanceAmountAfter_ = await hre.ethers.provider.getBalance(bidderContractAddr_);
		const bidderContractExpectedBalanceAmountAfter_ = bidderContractBalanceAmountBefore_ + mainEthPrizeAmount_;
		expect(bidderContractBalanceAmountAfter_).equal(bidderContractExpectedBalanceAmountAfter_);
		const charityWalletBalanceAmountAfter_ = await hre.ethers.provider.getBalance(contracts_.charityWalletAddr);
		const charityWalletExpectedBalanceAmountAfter_ = charityWalletBalanceAmountBefore_ + charityEthDonationAmount_;
		expect(charityWalletBalanceAmountAfter_).equal(charityWalletExpectedBalanceAmountAfter_);
		const stakingWalletCosmicSignatureNftBalanceAmountAfter_ = await hre.ethers.provider.getBalance(contracts_.stakingWalletCosmicSignatureNftAddr);
		const stakingWalletCosmicSignatureNftExpectedBalanceAmountAfter_ = stakingWalletCosmicSignatureNftBalanceAmountBefore_ + cosmicSignatureNftStakingTotalEthRewardAmount_;
		expect(stakingWalletCosmicSignatureNftBalanceAmountAfter_).equal(stakingWalletCosmicSignatureNftExpectedBalanceAmountAfter_);

		let cosmicSignatureGameProxyRaffleWinnerBidderEthPrizeAllocatedLogs_ = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(cosmicSignatureGameProxyRaffleWinnerBidderEthPrizeAllocatedTopicHash_) >= 0));
		let sumRaffleWinnerBidderEthPrizes_ = 0n;
		const uniqueRaffleWinnerBidderEthPrizeWinners_ = {};
		for ( let counter_ = 0; counter_ < cosmicSignatureGameProxyRaffleWinnerBidderEthPrizeAllocatedLogs_.length; ++ counter_ ) {
			const parsedLog_ = contracts_.cosmicSignatureGameProxy.interface.parseLog(cosmicSignatureGameProxyRaffleWinnerBidderEthPrizeAllocatedLogs_[counter_]);
			sumRaffleWinnerBidderEthPrizes_ += parsedLog_.args.ethPrizeAmount;
			if (uniqueRaffleWinnerBidderEthPrizeWinners_[parsedLog_.args.winnerAddress] == undefined) {
				uniqueRaffleWinnerBidderEthPrizeWinners_[parsedLog_.args.winnerAddress] = true;
				if (parsedLog_.args.winnerAddress != bidderContractAddr_) {
					const prizeWinnerSigner_ = await hre.ethers.getSigner(parsedLog_.args.winnerAddress);
					await expect(contracts_.prizesWallet.connect(prizeWinnerSigner_).withdrawEth()).not.reverted;
				}
			}
		}
		expect(sumRaffleWinnerBidderEthPrizes_).equal(raffleTotalEthPrizeAmountForBidders_);
	});

	it("The StakingWalletCosmicSignatureNft.deposit method reversal", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const brokenStakingWalletCosmicSignatureNftFactory_ = await hre.ethers.getContractFactory("BrokenStakingWalletCosmicSignatureNft", contracts_.deployerAcct);
		const brokenStakingWalletCosmicSignatureNft_ = await brokenStakingWalletCosmicSignatureNftFactory_.deploy();
		await brokenStakingWalletCosmicSignatureNft_.waitForDeployment();
		const brokenStakingWalletCosmicSignatureNftAddr_ = await brokenStakingWalletCosmicSignatureNft_.getAddress();
		// await expect(brokenStakingWalletCosmicSignatureNft_.transferOwnership(contracts_.ownerAcct.address)).not.reverted;

		const newStakingWalletCosmicSignatureNft_ =
			await contracts_.stakingWalletCosmicSignatureNftFactory.deploy(contracts_.cosmicSignatureNftAddr, brokenStakingWalletCosmicSignatureNftAddr_);
		await newStakingWalletCosmicSignatureNft_.waitForDeployment();
		const newStakingWalletCosmicSignatureNftAddr_ = await newStakingWalletCosmicSignatureNft_.getAddress();
		await expect(newStakingWalletCosmicSignatureNft_.transferOwnership(contracts_.ownerAcct.address)).not.reverted;

		await expect(brokenStakingWalletCosmicSignatureNft_.setStakingWalletCosmicSignatureNft(newStakingWalletCosmicSignatureNftAddr_)).not.reverted;
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct).setStakingWalletCosmicSignatureNft(brokenStakingWalletCosmicSignatureNftAddr_)).not.reverted;
		await setRoundActivationTimeIfNeeded(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct), 2n);

		const nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 1,]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(brokenStakingWalletCosmicSignatureNft_.setEthDepositAcceptanceModeCode(2n)).not.reverted;

		// Any `StakingWalletCosmicSignatureNft.deposit` panic except the division by zero will not be handled.
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).claimMainPrize()).revertedWithPanic(0x01n);

		await expect(brokenStakingWalletCosmicSignatureNft_.setEthDepositAcceptanceModeCode(1n)).not.reverted;

		// Any `StakingWalletCosmicSignatureNft.deposit` non-panic reversal will not be handled.
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).claimMainPrize()).revertedWith("I am not accepting deposits.");

		const cosmicSignatureNftStakingTotalEthRewardAmount_ = await contracts_.cosmicSignatureGameProxy.getCosmicSignatureNftStakingTotalEthRewardAmount();
		expect(cosmicSignatureNftStakingTotalEthRewardAmount_).greaterThan(0n);
		const charityEthDonationAmount_ = await contracts_.cosmicSignatureGameProxy.getCharityEthDonationAmount();
		expect(charityEthDonationAmount_).greaterThan(0n);
		expect(await hre.ethers.provider.getBalance(contracts_.charityWalletAddr)).equal(0n);
		await expect(brokenStakingWalletCosmicSignatureNft_.setEthDepositAcceptanceModeCode(0n)).not.reverted;

		// `StakingWalletCosmicSignatureNft.deposit` panic due to division by zero will be handled.
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).claimMainPrize())
			.emit(contracts_.cosmicSignatureGameProxy, "FundsTransferredToCharity")
			.withArgs(contracts_.charityWalletAddr, cosmicSignatureNftStakingTotalEthRewardAmount_ + charityEthDonationAmount_);

		// CS NFT staking rewards have been transferred to `contracts_.charityWalletAddr`,
		// which is the same as `await contracts_.cosmicSignatureGameProxy.charityAddress()`.
		// Comment-202411078 relates.
		expect(await hre.ethers.provider.getBalance(contracts_.charityWalletAddr)).equal(cosmicSignatureNftStakingTotalEthRewardAmount_ + charityEthDonationAmount_);
	});

	// Comment-202411077 relates and/or applies.
	it("ETH receive by charity reversal", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(999n);

		const brokenEthReceiverFactory_ = await hre.ethers.getContractFactory("BrokenEthReceiver", contracts_.deployerAcct);
		const brokenEthReceiver_ = await brokenEthReceiverFactory_.deploy();
		await brokenEthReceiver_.waitForDeployment();
		const brokenEthReceiverAddr_ = await brokenEthReceiver_.getAddress();
		// await expect(brokenEthReceiver_.transferOwnership(contracts_.ownerAcct.address)).not.reverted;

		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct).setCharityAddress(brokenEthReceiverAddr_)).not.reverted;

		for (let ethDepositAcceptanceModeCode_ = 2n; ethDepositAcceptanceModeCode_ >= 0n; -- ethDepositAcceptanceModeCode_ ) {
			await expect(brokenEthReceiver_.setEthDepositAcceptanceModeCode(ethDepositAcceptanceModeCode_)).not.reverted;
			const durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilRoundActivation_) - 1,]);
			await hre.ethers.provider.send("evm_mine");
			const nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
			const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
			// await hre.ethers.provider.send("evm_mine");

			// There are no staked CS NFTs, so on main prize claim we will transfer this to charity.
			const cosmicSignatureNftStakingTotalEthRewardAmount_ = await contracts_.cosmicSignatureGameProxy.getCosmicSignatureNftStakingTotalEthRewardAmount();

			expect(cosmicSignatureNftStakingTotalEthRewardAmount_).greaterThan(0n);
			const charityEthDonationAmount_ = await contracts_.cosmicSignatureGameProxy.getCharityEthDonationAmount();
			expect(charityEthDonationAmount_).greaterThan(0n);
			const transactionResponseFuture_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).claimMainPrize();
			if (ethDepositAcceptanceModeCode_ > 0n) {
				await expect(transactionResponseFuture_)
					.emit(contracts_.cosmicSignatureGameProxy, "FundTransferFailed")
					.withArgs("ETH transfer to charity failed.", brokenEthReceiverAddr_, cosmicSignatureNftStakingTotalEthRewardAmount_ + charityEthDonationAmount_);
			} else {
				await expect(transactionResponseFuture_)
					.emit(contracts_.cosmicSignatureGameProxy, "FundsTransferredToCharity")
					.withArgs(brokenEthReceiverAddr_, cosmicSignatureNftStakingTotalEthRewardAmount_ + charityEthDonationAmount_);
			}
			const brokenEthReceiverEthBalanceAmount_ = await hre.ethers.provider.getBalance(brokenEthReceiverAddr_);
			expect(brokenEthReceiverEthBalanceAmount_).equal((ethDepositAcceptanceModeCode_ > 0n) ? 0n : (cosmicSignatureNftStakingTotalEthRewardAmount_ + charityEthDonationAmount_));
		}
	});

	it("ETH receive by main prize beneficiary reversal", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		const bidderContractFactory_ = await hre.ethers.getContractFactory("BidderContract", contracts_.deployerAcct);
		const bidderContract_ = await bidderContractFactory_.deploy(contracts_.cosmicSignatureGameProxyAddr);
		await bidderContract_.waitForDeployment();
		const bidderContractAddr_ = await bidderContract_.getAddress();

		const nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(bidderContract_.connect(contracts_.signers[4]).doBidWithEth2({value: nextEthBidPrice_,})).not.reverted;
		const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 1,]);
		// await hre.ethers.provider.send("evm_mine");
		const mainEthPrizeAmount_ = await contracts_.cosmicSignatureGameProxy.getMainEthPrizeAmount();
		await expect(bidderContract_.setEthDepositAcceptanceModeCode(2n)).not.reverted;
		await expect(bidderContract_.connect(contracts_.signers[4]).doClaimMainPrize())
			.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FundTransferFailed")
			.withArgs("ETH transfer to bidding round main prize beneficiary failed.", bidderContractAddr_, mainEthPrizeAmount_);
		await expect(bidderContract_.setEthDepositAcceptanceModeCode(1n)).not.reverted;
		await expect(bidderContract_.connect(contracts_.signers[4]).doClaimMainPrize())
			.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FundTransferFailed")
			.withArgs("ETH transfer to bidding round main prize beneficiary failed.", bidderContractAddr_, mainEthPrizeAmount_);
		await expect(bidderContract_.setEthDepositAcceptanceModeCode(0n)).not.reverted;
		await expect(bidderContract_.connect(contracts_.signers[4]).doClaimMainPrize())
			.emit(contracts_.cosmicSignatureGameProxy, "MainPrizeClaimed")
			.withArgs(0n, bidderContractAddr_, mainEthPrizeAmount_, 0n);
	});

	it("Reentry and double-claim attempts", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(999n);
		const maliciousBidderFactory_ = await hre.ethers.getContractFactory("MaliciousBidder", contracts_.deployerAcct);
		const maliciousBidder_ = await maliciousBidderFactory_.deploy(contracts_.cosmicSignatureGameProxyAddr);
		await maliciousBidder_.waitForDeployment();
		const maliciousBidderAddr_ = await maliciousBidder_.getAddress();

		const ethPriceToPay_ = 10n ** 18n;
		for ( let counter_ = 0; counter_ < 3; ++ counter_ ) {
			const durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilRoundActivation_) - 1,]);
			// await hre.ethers.provider.send("evm_mine");
			for ( let maliciousBidderModeCode_ = 3n; maliciousBidderModeCode_ >= 0n; -- maliciousBidderModeCode_ ) {
				await expect(maliciousBidder_.setModeCode(maliciousBidderModeCode_)).not.reverted;
				const paidEthPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
				const overpaidEthPrice_ = ethPriceToPay_ - paidEthPrice_;
				expect(overpaidEthPrice_).greaterThan(0n);
				const transactionResponseFuture_ = maliciousBidder_.connect(contracts_.signers[4]).doBidWithEth({value: ethPriceToPay_,});
				if (maliciousBidderModeCode_ > 0n) {
					await expect(transactionResponseFuture_)
						.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FundTransferFailed")
						.withArgs("ETH refund transfer failed.", maliciousBidderAddr_, overpaidEthPrice_);
				} else {
					await expect(transactionResponseFuture_)
						.emit(contracts_.cosmicSignatureGameProxy, "BidPlaced");
				}
			}
			const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 1,]);
			// await hre.ethers.provider.send("evm_mine");
			for ( let maliciousBidderModeCode_ = 3n; maliciousBidderModeCode_ >= 0n; -- maliciousBidderModeCode_ ) {
				await expect(maliciousBidder_.setModeCode(maliciousBidderModeCode_)).not.reverted;
				const mainEthPrizeAmount_ = await contracts_.cosmicSignatureGameProxy.getMainEthPrizeAmount();
				const transactionResponseFuture_ = maliciousBidder_.connect(contracts_.signers[4]).doClaimMainPrize();
				if (maliciousBidderModeCode_ > 0n) {
					await expect(transactionResponseFuture_)
						.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FundTransferFailed")
						.withArgs("ETH transfer to bidding round main prize beneficiary failed.", maliciousBidderAddr_, mainEthPrizeAmount_);
				} else {
					await expect(transactionResponseFuture_)
						.emit(contracts_.cosmicSignatureGameProxy, "MainPrizeClaimed");
				}
			}
		}
	});
});
