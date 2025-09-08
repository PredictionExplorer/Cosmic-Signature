"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { anyUint } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt256, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { setRoundActivationTimeIfNeeded } = require("../../src/ContractDeploymentHelpers.js");
const { loadFixtureDeployContractsForTesting, deployContractsForTestingAdvanced, makeNextBlockTimeDeterministic } = require("../../src/ContractTestingHelpers.js");

describe("MainPrize", function () {
	it("Test 1", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		// const timeStamp1_ = performance.now();

		const ethDonationAmount_ = BigInt(Math.max(Number(BigInt.asUintN(53, generateRandomUInt256())) - Number(1n << (53n - 2n)), 0));
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).donateEth({value: ethDonationAmount_,}));
		let mainEthPrizeAmount_ = await contracts_.cosmicSignatureGameProxy.getMainEthPrizeAmount();
		expect(mainEthPrizeAmount_).equal((ethDonationAmount_ * 25n) / 100n);
		let currentChampions_ = await contracts_.cosmicSignatureGameProxy.tryGetCurrentChampions();
		expect(currentChampions_[0]).equal(hre.ethers.ZeroAddress);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: 1n,})).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InsufficientReceivedBidAmount");
		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_ - 1n,})).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InsufficientReceivedBidAmount");

		const initialDurationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getInitialDurationUntilMainPrize();
		expect(initialDurationUntilMainPrize_).equal(1n * 24n * 60n * 60n - 1n);
		const mainPrizeTimeIncrement_ = await contracts_.cosmicSignatureGameProxy.getMainPrizeTimeIncrement();
		expect(mainPrizeTimeIncrement_).equal(1n * 60n * 60n);

		// If a bidder sends too much ETH, the game would refund the excess.
		// Keeping in mind that the game would swallow a too small refund.
		await makeNextBlockTimeDeterministic();
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_ + 10n ** (18n - 2n),}));
		let gameBalanceAmount_ = await hre.ethers.provider.getBalance(contracts_.cosmicSignatureGameProxyAddress);
		expect(gameBalanceAmount_).equal(ethDonationAmount_ + nextEthBidPrice_);
		let roundNum_ = await contracts_.cosmicSignatureGameProxy.roundNum();
		let totalSpentEthAmount_ = await contracts_.cosmicSignatureGameProxy.getBidderTotalSpentAmounts(roundNum_, contracts_.signers[1].address);
		expect(totalSpentEthAmount_[0]).equal(nextEthBidPrice_);

		let durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		expect(durationUntilMainPrize_).equal(initialDurationUntilMainPrize_);
		await hre.ethers.provider.send("evm_increaseTime", [100 - await makeNextBlockTimeDeterministic(300),]);
		await hre.ethers.provider.send("evm_mine");
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		expect(durationUntilMainPrize_).equal(initialDurationUntilMainPrize_ - 100n);

		currentChampions_ = await contracts_.cosmicSignatureGameProxy.tryGetCurrentChampions();
		expect(currentChampions_[0]).equal(contracts_.signers[1].address);

		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		expect(durationUntilMainPrize_).equal(initialDurationUntilMainPrize_ - 100n - 1n + mainPrizeTimeIncrement_);

		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		expect(durationUntilMainPrize_).equal(initialDurationUntilMainPrize_ - 100n - 1n + mainPrizeTimeIncrement_ - 1n + mainPrizeTimeIncrement_);

		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize()).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "MainPrizeEarlyClaim");
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 1 - await makeNextBlockTimeDeterministic(),]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).claimMainPrize()).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "MainPrizeEarlyClaim");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize()).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "MainPrizeClaimDenied");
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		await hre.ethers.provider.send("evm_increaseTime", [100 - await makeNextBlockTimeDeterministic(),]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		await hre.ethers.provider.send("evm_increaseTime", [10 - await makeNextBlockTimeDeterministic(),]);
		await hre.ethers.provider.send("evm_mine");
		currentChampions_ = await contracts_.cosmicSignatureGameProxy.tryGetCurrentChampions();
		expect(currentChampions_[0]).equal(contracts_.signers[2].address);
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - await makeNextBlockTimeDeterministic(),]);
		// await hre.ethers.provider.send("evm_mine");
		// mainEthPrizeAmount_ = await contracts_.cosmicSignatureGameProxy.getMainEthPrizeAmount();
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).claimMainPrize());
		gameBalanceAmount_ = await hre.ethers.provider.getBalance(contracts_.cosmicSignatureGameProxyAddress);
		let mainEthPrizeAmount2_ = await contracts_.cosmicSignatureGameProxy.getMainEthPrizeAmount();
		let mainEthPrizeExpectedAmount_ = (gameBalanceAmount_ * 25n) / 100n;
		expect(mainEthPrizeAmount2_).equal(mainEthPrizeExpectedAmount_);
		let mainPrizeBeneficiaryAddress_ = await contracts_.prizesWallet.mainPrizeBeneficiaryAddresses(roundNum_);
		expect(mainPrizeBeneficiaryAddress_).equal(contracts_.signers[3].address);

		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).claimMainPrize()).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "NoBidsPlacedInCurrentRound");
		let durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilRoundActivation_) - await makeNextBlockTimeDeterministic(),]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).claimMainPrize()).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "NoBidsPlacedInCurrentRound");
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize()).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "MainPrizeEarlyClaim");
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 1 - await makeNextBlockTimeDeterministic(300),]);
		// await hre.ethers.provider.send("evm_mine");
		// mainEthPrizeAmount_ = await contracts_.cosmicSignatureGameProxy.getMainEthPrizeAmount();
		// const timeStamp1_ = performance.now();
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize()).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "MainPrizeEarlyClaim");
		// const timeStamp2_ = performance.now();
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize());
		// const timeStamp3_ = performance.now();
		// console.info(`202508247 ${(timeStamp2_ - timeStamp1_).toFixed(1)} ${(timeStamp3_ - timeStamp2_).toFixed(1)}`);
		gameBalanceAmount_ = await hre.ethers.provider.getBalance(contracts_.cosmicSignatureGameProxyAddress);
		mainEthPrizeAmount2_ = await contracts_.cosmicSignatureGameProxy.getMainEthPrizeAmount();
		mainEthPrizeExpectedAmount_ = (gameBalanceAmount_ * 25n) / 100n;
		expect(mainEthPrizeAmount2_).equal(mainEthPrizeExpectedAmount_);

		durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilRoundActivation_) - 1 - await makeNextBlockTimeDeterministic(),]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: 10n ** 18n,})).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsInactive");
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		roundNum_ = await contracts_.cosmicSignatureGameProxy.roundNum();
		expect(roundNum_).equal(2n);
		expect(await contracts_.cosmicSignatureGameProxy.getTotalNumBids(roundNum_)).equal(1n);
		expect(await contracts_.cosmicSignatureGameProxy.getBidderAddressAt(roundNum_, 0n)).equal(contracts_.signers[1].address);
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - await makeNextBlockTimeDeterministic(),]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).claimMainPrize()).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "MainPrizeClaimDenied");

		// After the main prize claim timeout expires, anyone is allowed to claim the prize.
		const timeoutDurationToClaimMainPrize_ = await contracts_.cosmicSignatureGameProxy.timeoutDurationToClaimMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(timeoutDurationToClaimMainPrize_) - 2 - await makeNextBlockTimeDeterministic(),]);
		await hre.ethers.provider.send("evm_mine");
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		expect(durationUntilMainPrize_).equal(2n - timeoutDurationToClaimMainPrize_);
		expect(await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize()).equal(0n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).claimMainPrize()).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "MainPrizeClaimDenied");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).claimMainPrize());

		// const timeStamp2_ = performance.now();
		// console.info(`202506249 ${(timeStamp2_ - timeStamp1_).toFixed(1)}`);
	});

	// Issue. This test doesn't test CST prizes.
	it("The number of prizes", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		const prizesWalletEthReceivedTopicHash_ = contracts_.prizesWallet.interface.getEvent("EthReceived").topicHash;

		await waitForTransactionReceipt(contracts_.randomWalkNft.connect(contracts_.signers[1]).setApprovalForAll(contracts_.stakingWalletRandomWalkNftAddress, true));
		await waitForTransactionReceipt(contracts_.randomWalkNft.connect(contracts_.signers[2]).setApprovalForAll(contracts_.stakingWalletRandomWalkNftAddress, true));

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
		await waitForTransactionReceipt(contracts_.randomWalkNft.connect(contracts_.signers[1]).mint({value: randomWalkNftMintPrice_,}));
		let randomWalkNftId_ = 0n;
		await waitForTransactionReceipt(contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[1]).stake(randomWalkNftId_));
		randomWalkNftMintPrice_ = await contracts_.randomWalkNft.getMintPrice();
		await waitForTransactionReceipt(contracts_.randomWalkNft.connect(contracts_.signers[2]).mint({value: randomWalkNftMintPrice_,}));
		++ randomWalkNftId_;
		await waitForTransactionReceipt(contracts_.stakingWalletRandomWalkNft.connect(contracts_.signers[2]).stake(randomWalkNftId_));

		let roundNum_ = 0n;

		// Running a bidding round ending with `claimMainPrize` to populate `CosmicSignatureNft`.
		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		let nextCstBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextCstBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithCst(nextCstBidPrice_, ""));
		let durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		// const timeStamp1_ = performance.now();
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize());
		// const timeStamp2_ = performance.now();
		// console.info((timeStamp2_ - timeStamp1_).toFixed(1));
		++ roundNum_;
		const cosmicSignatureNftTotalSupplyBefore_ = await contracts_.cosmicSignatureNft.totalSupply();
		expect(cosmicSignatureNftTotalSupplyBefore_).equal(numCosmicSignatureNftsToDistribute_);
		let expectedCosmicSignatureNftTotalSupply_ = cosmicSignatureNftTotalSupplyBefore_;

		// At this point, all required data has been initialized. We can start the test.

		let durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilRoundActivation_) - 1,]);
		await hre.ethers.provider.send("evm_mine");
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));

		// Reducing CST bid price.
		await hre.ethers.provider.send("evm_increaseTime", [20000]);
		await hre.ethers.provider.send("evm_mine");

		nextCstBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextCstBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithCst(nextCstBidPrice_, ""));
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
		let transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).claimMainPrize();
		let transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
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
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).claimMainPrize();
		transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
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
				const prizeWinnerSigner_ = contracts_.signers[contracts_.signerAddressToIndexMapping[parsedLog_.args.prizeWinnerAddress]];
				await waitForTransactionReceipt(contracts_.prizesWallet.connect(prizeWinnerSigner_).withdrawEth());
			}
		}
	});

	// Issue. This test doesn't test some prizes.
	it("Prize amounts", async function () {
		const contracts_ = await deployContractsForTestingAdvanced("SpecialCosmicSignatureGame");

		// [Comment-202506033]
		// The use of `BidderContract` eliminates the need to subtract gas used.
		// It's paid by the EOA that sends the transaction request.
		// [/Comment-202506033]
		const bidderContractFactory_ = await hre.ethers.getContractFactory("BidderContract", contracts_.deployerSigner);
		const bidderContract_ = await bidderContractFactory_.deploy(contracts_.cosmicSignatureGameProxyAddress);
		await bidderContract_.waitForDeployment();
		const bidderContractAddress_ = await bidderContract_.getAddress();

		const cosmicSignatureGameProxyRaffleWinnerBidderEthPrizeAllocatedTopicHash_ = contracts_.cosmicSignatureGameProxy.interface.getEvent("RaffleWinnerBidderEthPrizeAllocated").topicHash;

		await waitForTransactionReceipt(contracts_.cosmicSignatureNft.connect(contracts_.signers[1]).setApprovalForAll(contracts_.stakingWalletCosmicSignatureNftAddress, true));

		// Minting and staking a CS NFT.
		// Otherwise `StakingWalletCosmicSignatureNft` would reject an ETH deposit.
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).mintCosmicSignatureNft(contracts_.signers[1].address));
		let cosmicSignatureNftId_ = 0n;
		await waitForTransactionReceipt(contracts_.stakingWalletCosmicSignatureNft.connect(contracts_.signers[1]).stake(cosmicSignatureNftId_));

		const ethDonationAmount_ = BigInt(Math.max(Number(BigInt.asUintN(53, generateRandomUInt256())) - Number(1n << (53n - 2n)), 0));
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).donateEth({value: ethDonationAmount_,}));

		await setRoundActivationTimeIfNeeded(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner), 2n);
		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(bidderContract_.connect(contracts_.signers[0]).doBidWithEth({value: nextEthBidPrice_,}));

		const mainEthPrizeAmount_ = await contracts_.cosmicSignatureGameProxy.getMainEthPrizeAmount();
		const charityEthDonationAmount_ = await contracts_.cosmicSignatureGameProxy.getCharityEthDonationAmount();
		const cosmicSignatureNftStakingTotalEthRewardAmount_ = await contracts_.cosmicSignatureGameProxy.getCosmicSignatureNftStakingTotalEthRewardAmount();
		let raffleTotalEthPrizeAmountForBidders_ = await contracts_.cosmicSignatureGameProxy.getRaffleTotalEthPrizeAmountForBidders();
		const numRaffleEthPrizesForBidders_ = await contracts_.cosmicSignatureGameProxy.numRaffleEthPrizesForBidders();
		// const raffleEthPrizeAmountForBidder_ = raffleTotalEthPrizeAmountForBidders_ / numRaffleEthPrizesForBidders_;
		const raffleTotalEthPrizeAmountForBiddersRemainder_ = raffleTotalEthPrizeAmountForBidders_ % numRaffleEthPrizesForBidders_;
		raffleTotalEthPrizeAmountForBidders_ -= raffleTotalEthPrizeAmountForBiddersRemainder_;

		const bidderContractBalanceAmountBefore_ = await hre.ethers.provider.getBalance(bidderContractAddress_);
		const charityWalletBalanceAmountBefore_ = await hre.ethers.provider.getBalance(contracts_.charityWalletAddress);
		const stakingWalletCosmicSignatureNftBalanceAmountBefore_ = await hre.ethers.provider.getBalance(contracts_.stakingWalletCosmicSignatureNftAddress);

		const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
		let transactionResponsePromise_ = bidderContract_.connect(contracts_.signers[2]).doClaimMainPrize();
		let transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);

		const bidderContractBalanceAmountAfter_ = await hre.ethers.provider.getBalance(bidderContractAddress_);
		const bidderContractExpectedBalanceAmountAfter_ = bidderContractBalanceAmountBefore_ + mainEthPrizeAmount_;
		expect(bidderContractBalanceAmountAfter_).equal(bidderContractExpectedBalanceAmountAfter_);
		const charityWalletBalanceAmountAfter_ = await hre.ethers.provider.getBalance(contracts_.charityWalletAddress);
		const charityWalletExpectedBalanceAmountAfter_ = charityWalletBalanceAmountBefore_ + charityEthDonationAmount_;
		expect(charityWalletBalanceAmountAfter_).equal(charityWalletExpectedBalanceAmountAfter_);
		const stakingWalletCosmicSignatureNftBalanceAmountAfter_ = await hre.ethers.provider.getBalance(contracts_.stakingWalletCosmicSignatureNftAddress);
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
				if (parsedLog_.args.winnerAddress != bidderContractAddress_) {
					const prizeWinnerSigner_ = contracts_.signers[contracts_.signerAddressToIndexMapping[parsedLog_.args.winnerAddress]];
					await waitForTransactionReceipt(contracts_.prizesWallet.connect(prizeWinnerSigner_).withdrawEth());
				}
			}
		}
		expect(sumRaffleWinnerBidderEthPrizes_).equal(raffleTotalEthPrizeAmountForBidders_);
	});

	it("The StakingWalletCosmicSignatureNft.deposit method reversal", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		const brokenStakingWalletCosmicSignatureNftFactory_ = await hre.ethers.getContractFactory("BrokenStakingWalletCosmicSignatureNft", contracts_.deployerSigner);
		const brokenStakingWalletCosmicSignatureNft_ = await brokenStakingWalletCosmicSignatureNftFactory_.deploy();
		await brokenStakingWalletCosmicSignatureNft_.waitForDeployment();
		const brokenStakingWalletCosmicSignatureNftAddress_ = await brokenStakingWalletCosmicSignatureNft_.getAddress();
		// await waitForTransactionReceipt(brokenStakingWalletCosmicSignatureNft_.transferOwnership(contracts_.ownerSigner.address));

		const newStakingWalletCosmicSignatureNft_ =
			await contracts_.stakingWalletCosmicSignatureNftFactory.deploy(contracts_.cosmicSignatureNftAddress, brokenStakingWalletCosmicSignatureNftAddress_);
		await newStakingWalletCosmicSignatureNft_.waitForDeployment();
		const newStakingWalletCosmicSignatureNftAddress_ = await newStakingWalletCosmicSignatureNft_.getAddress();
		await waitForTransactionReceipt(newStakingWalletCosmicSignatureNft_.transferOwnership(contracts_.ownerSigner.address));

		await waitForTransactionReceipt(brokenStakingWalletCosmicSignatureNft_.connect(contracts_.signers[4]).setStakingWalletCosmicSignatureNft(newStakingWalletCosmicSignatureNftAddress_));
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).setStakingWalletCosmicSignatureNft(brokenStakingWalletCosmicSignatureNftAddress_));
		await setRoundActivationTimeIfNeeded(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner), 2n);

		const nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 1,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(brokenStakingWalletCosmicSignatureNft_.connect(contracts_.signers[4]).setEthDepositAcceptanceModeCode(2n));

		// Any `StakingWalletCosmicSignatureNft.deposit` panic except the division by zero will not be handled.
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).claimMainPrize()).revertedWithPanic(0x01n);

		await waitForTransactionReceipt(brokenStakingWalletCosmicSignatureNft_.connect(contracts_.signers[4]).setEthDepositAcceptanceModeCode(1n));

		// Any `StakingWalletCosmicSignatureNft.deposit` non-panic reversal will not be handled.
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).claimMainPrize()).revertedWith("I am not accepting deposits.");

		const cosmicSignatureNftStakingTotalEthRewardAmount_ = await contracts_.cosmicSignatureGameProxy.getCosmicSignatureNftStakingTotalEthRewardAmount();
		expect(cosmicSignatureNftStakingTotalEthRewardAmount_).greaterThan(0n);
		const charityEthDonationAmount_ = await contracts_.cosmicSignatureGameProxy.getCharityEthDonationAmount();
		expect(charityEthDonationAmount_).greaterThan(0n);
		expect(await hre.ethers.provider.getBalance(contracts_.charityWalletAddress)).equal(0n);
		await waitForTransactionReceipt(brokenStakingWalletCosmicSignatureNft_.connect(contracts_.signers[4]).setEthDepositAcceptanceModeCode(0n));

		// `StakingWalletCosmicSignatureNft.deposit` panic due to division by zero will be handled.
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).claimMainPrize())
			.emit(contracts_.cosmicSignatureGameProxy, "FundsTransferredToCharity")
			.withArgs(contracts_.charityWalletAddress, cosmicSignatureNftStakingTotalEthRewardAmount_ + charityEthDonationAmount_);

		// CS NFT staking rewards have been transferred to `contracts_.charityWalletAddress`,
		// which is the same as `await contracts_.cosmicSignatureGameProxy.charityAddress()`.
		// Comment-202411078 relates.
		expect(await hre.ethers.provider.getBalance(contracts_.charityWalletAddress)).equal(cosmicSignatureNftStakingTotalEthRewardAmount_ + charityEthDonationAmount_);
	});

	// Comment-202411077 relates and/or applies.
	it("ETH receive by charity reversal", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(999n);

		const brokenEthReceiverFactory_ = await hre.ethers.getContractFactory("BrokenEthReceiver", contracts_.deployerSigner);
		const brokenEthReceiver_ = await brokenEthReceiverFactory_.deploy();
		await brokenEthReceiver_.waitForDeployment();
		const brokenEthReceiverAddress_ = await brokenEthReceiver_.getAddress();
		// await waitForTransactionReceipt(brokenEthReceiver_.transferOwnership(contracts_.ownerSigner.address));

		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).setCharityAddress(brokenEthReceiverAddress_));

		for ( let brokenEthReceiverEthDepositAcceptanceModeCode_ = 2n; brokenEthReceiverEthDepositAcceptanceModeCode_ >= 0n; -- brokenEthReceiverEthDepositAcceptanceModeCode_ ) {
			await waitForTransactionReceipt(brokenEthReceiver_.connect(contracts_.signers[4]).setEthDepositAcceptanceModeCode(brokenEthReceiverEthDepositAcceptanceModeCode_));
			const durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilRoundActivation_) - 1,]);
			await hre.ethers.provider.send("evm_mine");
			const nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
			await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
			const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
			// await hre.ethers.provider.send("evm_mine");

			// There are no staked CS NFTs, so on main prize claim we will transfer this to charity.
			const cosmicSignatureNftStakingTotalEthRewardAmount_ = await contracts_.cosmicSignatureGameProxy.getCosmicSignatureNftStakingTotalEthRewardAmount();

			expect(cosmicSignatureNftStakingTotalEthRewardAmount_).greaterThan(0n);
			const charityEthDonationAmount_ = await contracts_.cosmicSignatureGameProxy.getCharityEthDonationAmount();
			expect(charityEthDonationAmount_).greaterThan(0n);
			/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
			const transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).claimMainPrize();
			if (brokenEthReceiverEthDepositAcceptanceModeCode_ > 0n) {
				await expect(transactionResponsePromise_)
					.emit(contracts_.cosmicSignatureGameProxy, "FundTransferFailed")
					.withArgs("ETH transfer to charity failed.", brokenEthReceiverAddress_, cosmicSignatureNftStakingTotalEthRewardAmount_ + charityEthDonationAmount_);
			} else {
				await expect(transactionResponsePromise_)
					.emit(contracts_.cosmicSignatureGameProxy, "FundsTransferredToCharity")
					.withArgs(brokenEthReceiverAddress_, cosmicSignatureNftStakingTotalEthRewardAmount_ + charityEthDonationAmount_);
			}
			const brokenEthReceiverEthBalanceAmount_ = await hre.ethers.provider.getBalance(brokenEthReceiverAddress_);
			expect(brokenEthReceiverEthBalanceAmount_).equal((brokenEthReceiverEthDepositAcceptanceModeCode_ > 0n) ? 0n : (cosmicSignatureNftStakingTotalEthRewardAmount_ + charityEthDonationAmount_));
		}
	});

	it("ETH receive by main prize beneficiary reversal", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		const bidderContractFactory_ = await hre.ethers.getContractFactory("BidderContract", contracts_.deployerSigner);
		const bidderContract_ = await bidderContractFactory_.deploy(contracts_.cosmicSignatureGameProxyAddress);
		await bidderContract_.waitForDeployment();
		const bidderContractAddress_ = await bidderContract_.getAddress();

		const nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(bidderContract_.connect(contracts_.signers[4]).doBidWithEth({value: nextEthBidPrice_,}));
		const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 1,]);
		// await hre.ethers.provider.send("evm_mine");
		const mainEthPrizeAmount_ = await contracts_.cosmicSignatureGameProxy.getMainEthPrizeAmount();
		await waitForTransactionReceipt(bidderContract_.connect(contracts_.signers[4]).setEthDepositAcceptanceModeCode(2n));
		await expect(bidderContract_.connect(contracts_.signers[4]).doClaimMainPrize())
			.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FundTransferFailed")
			.withArgs("ETH transfer to bidding round main prize beneficiary failed.", bidderContractAddress_, mainEthPrizeAmount_);
		await waitForTransactionReceipt(bidderContract_.connect(contracts_.signers[4]).setEthDepositAcceptanceModeCode(1n));
		await expect(bidderContract_.connect(contracts_.signers[4]).doClaimMainPrize())
			.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FundTransferFailed")
			.withArgs("ETH transfer to bidding round main prize beneficiary failed.", bidderContractAddress_, mainEthPrizeAmount_);
		await waitForTransactionReceipt(bidderContract_.connect(contracts_.signers[4]).setEthDepositAcceptanceModeCode(0n));
		await expect(bidderContract_.connect(contracts_.signers[4]).doClaimMainPrize())
			.emit(contracts_.cosmicSignatureGameProxy, "MainPrizeClaimed")
			.withArgs(0n, bidderContractAddress_, mainEthPrizeAmount_, 0n, anyUint);
	});

	// Comment-202507055 applies.
	// Comment-202507059 relates and/or applies.
	it("Reentry and double-claim attempts", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(999n);

		const maliciousBidderFactory_ = await hre.ethers.getContractFactory("MaliciousBidder", contracts_.deployerSigner);
		const maliciousBidder_ = await maliciousBidderFactory_.deploy(contracts_.cosmicSignatureGameProxyAddress);
		await maliciousBidder_.waitForDeployment();
		const maliciousBidderAddress_ = await maliciousBidder_.getAddress();

		const ethPriceToPayMaxLimit_ = 10n ** 18n;

		for ( let counter_ = 0; counter_ < 3; ++ counter_ ) {
			const durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilRoundActivation_) - 1,]);
			// await hre.ethers.provider.send("evm_mine");
			for ( let maliciousBidderModeCode_ = 3n; maliciousBidderModeCode_ >= 0n; -- maliciousBidderModeCode_ ) {
				await waitForTransactionReceipt(maliciousBidder_.connect(contracts_.signers[4]).setModeCode(maliciousBidderModeCode_));
				const paidEthPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPriceAdvanced(1n);
				const overpaidEthPrice_ = ethPriceToPayMaxLimit_ - paidEthPrice_;
				expect(overpaidEthPrice_).greaterThan(0n);
				/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
				const transactionResponsePromise_ = maliciousBidder_.connect(contracts_.signers[4]).doBidWithEth(-1, "", {value: ethPriceToPayMaxLimit_,});
				if (maliciousBidderModeCode_ > 0n) {
					await expect(transactionResponsePromise_)
						.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FundTransferFailed")
						.withArgs("ETH refund transfer failed.", maliciousBidderAddress_, overpaidEthPrice_);
				} else {
					await expect(transactionResponsePromise_)
						.emit(contracts_.cosmicSignatureGameProxy, "BidPlaced");
				}
			}
			const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 1,]);
			// await hre.ethers.provider.send("evm_mine");
			for ( let maliciousBidderModeCode_ = 3n; maliciousBidderModeCode_ >= 0n; -- maliciousBidderModeCode_ ) {
				await waitForTransactionReceipt(maliciousBidder_.connect(contracts_.signers[4]).setModeCode(maliciousBidderModeCode_));
				const mainEthPrizeAmount_ = await contracts_.cosmicSignatureGameProxy.getMainEthPrizeAmount();
				/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
				const transactionResponsePromise_ = maliciousBidder_.connect(contracts_.signers[4]).doClaimMainPrize();
				if (maliciousBidderModeCode_ > 0n) {
					await expect(transactionResponsePromise_)
						.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FundTransferFailed")
						.withArgs("ETH transfer to bidding round main prize beneficiary failed.", maliciousBidderAddress_, mainEthPrizeAmount_);
				} else {
					await expect(transactionResponsePromise_)
						.emit(contracts_.cosmicSignatureGameProxy, "MainPrizeClaimed");
				}
			}
		}
	});
});
