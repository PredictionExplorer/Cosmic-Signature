// todo-0 Move these tests to another file and delete this file.

"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { setRoundActivationTimeIfNeeded } = require("../src/ContractDeploymentHelpers.js");
const { deployContractsForUnitTesting, deployContractsForUnitTestingAdvanced, } = require("../src/ContractUnitTestingHelpers.js");

describe("MainPrize-Old", function () {
	it("The number of distributed prizes is correct", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureNft, prizesWallet, randomWalkNft, stakingWalletRandomWalkNft, stakingWalletRandomWalkNftAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2, signer3,] = signers;
	
		// ToDo-202411202-1 applies.
		await cosmicSignatureGameProxy.connect(ownerAcct).setDelayDurationBeforeRoundActivation(0n);

		let roundNum = 0;

		// we need to mint Rwalk because our Rwalk contract is empty and doesn't have any holder
		// but they are needed to test token distribution in claimMainPrize()
		let rwalkTokenPrice = await randomWalkNft.getMintPrice();
		let randomWalkNftId_ = await randomWalkNft.connect(signer1).mint({ value: rwalkTokenPrice });
		await randomWalkNft.connect(signer1).setApprovalForAll(stakingWalletRandomWalkNftAddr, true);
		await stakingWalletRandomWalkNft.connect(signer1).stake(/*randomWalkNftId_*/ 0);
		rwalkTokenPrice = await randomWalkNft.getMintPrice();
		randomWalkNftId_ = await randomWalkNft.connect(signer2).mint({ value: rwalkTokenPrice });
		await randomWalkNft.connect(signer2).setApprovalForAll(stakingWalletRandomWalkNftAddr, true);
		await stakingWalletRandomWalkNft.connect(signer2).stake(/*randomWalkNftId_*/ 1);

		// now we need to do a dummy claimMainPrize() because our CosmicSignatureNft contract is empty
		// and does not contain any tokens but we need them to test token distribution (the holder loop)
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		await cosmicSignatureGameProxy.connect(signer1).claimMainPrize();
		++ roundNum;
		let totalSupplyBefore = await cosmicSignatureNft.totalSupply();

		// at this point all required data was initialized, we can proceed with the test

		let topic_sig = prizesWallet.interface.getEvent("EthReceived").topicHash;

		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		await cosmicSignatureGameProxy.connect(signer1).bidWithCst(10n ** 30n, "");
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer3).bidWithEth((-1), "", { value: nextEthBidPrice_ });

		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");

		let roundNumBefore = await cosmicSignatureGameProxy.roundNum();

		let tx = await cosmicSignatureGameProxy.connect(signer3).claimMainPrize();
		++ roundNum;
		let receipt = await tx.wait();

		// check that roundNum is incremented
		let roundNumAfter = await cosmicSignatureGameProxy.roundNum();
		expect(roundNumAfter).to.equal(roundNumBefore + 1n);

		// Validating that we have recorded the correct main prize beneficiary.
		// let mainPrizeBeneficiaryAddress_ = await cosmicSignatureGameProxy.winners(roundNumBefore);
		let mainPrizeBeneficiaryAddress_ = await prizesWallet.mainPrizeBeneficiaryAddresses(roundNumBefore);
		expect(mainPrizeBeneficiaryAddress_).to.equal(signer3.address);

		// Validating the number of ETH deposits.
		let deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		const numMainPrizeBeneficiaries_ = 1n;
		const numLastCstBidders_ = 1n;
		const numEnduranceChampions_ = 1n;
		const numChronoWarriors_ = 1n;
		let numRaffleEthPrizesForBidders_= await cosmicSignatureGameProxy.numRaffleEthPrizesForBidders();
		let numRaffleCosmicSignatureNftsForBidders_ = await cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForBidders();
		let numRaffleCosmicSignatureNftsForRandomWalkNftStakers_ = await cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForRandomWalkNftStakers();
		expect(numChronoWarriors_ + numRaffleEthPrizesForBidders_).to.equal(deposit_logs.length);
		let sum_winners =
			numMainPrizeBeneficiaries_ +
			numLastCstBidders_ +
			numEnduranceChampions_ +
			numRaffleCosmicSignatureNftsForBidders_ +
			numRaffleCosmicSignatureNftsForRandomWalkNftStakers_;
		let expected_total_supply =
			totalSupplyBefore +
			sum_winners;
		let curTotalSupply = await cosmicSignatureNft.totalSupply();
		expect(curTotalSupply).to.equal(expected_total_supply);
		// let last_cosmic_signature_supply = sum_winners + numMainPrizeBeneficiaries_;

		// let's begin a new bidding round
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer3).bidWithEth((-1), "", { value: nextEthBidPrice_ });

		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");

		// let raffleTotalEthPrizeAmountForBidders_ = await cosmicSignatureGameProxy.getRaffleTotalEthPrizeAmountForBidders();
		tx = await cosmicSignatureGameProxy.connect(signer3).claimMainPrize();
		++ roundNum;
		receipt = await tx.wait();
		deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);

		// Making sure the total number of bids has been reset.
		let totalNumBids_ = await cosmicSignatureGameProxy.getTotalNumBids(roundNum);
		expect(totalNumBids_).to.equal(0n);

		const unique_winners = [];
		for (let i = 0; i < deposit_logs.length; i++) {
			let wlog = prizesWallet.interface.parseLog(deposit_logs[i]);
			let args = wlog.args.toObject();
			let prizeWinnerAddress_ = args.prizeWinnerAddress;
			if (unique_winners[prizeWinnerAddress_] == undefined) {
				let winner_signer = await hre.ethers.getSigner(prizeWinnerAddress_);
				await prizesWallet.connect(winner_signer).withdrawEth();
				unique_winners[prizeWinnerAddress_] = 1;
			}
		}
	});

	it("Distribution of prize amounts matches specified business logic", async function () {
		const {deployerAcct, ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, cosmicSignatureNft, charityWalletAddr, prizesWallet, stakingWalletCosmicSignatureNft, stakingWalletCosmicSignatureNftAddr,} =
			await deployContractsForUnitTestingAdvanced("SpecialCosmicSignatureGame");
		const [signer0, signer1, signer2, signer3,] = signers;
		
		await setRoundActivationTimeIfNeeded(cosmicSignatureGameProxy.connect(ownerAcct), 0n);

		let donationAmount_ = hre.ethers.parseEther("1");
		await cosmicSignatureGameProxy.connect(signer0).donateEth({ value: donationAmount_ });

		await cosmicSignatureGameProxy.connect(signer0).mintCosmicSignatureNft(signer1.address); // mint an NFT so we can stake
		await cosmicSignatureNft.connect(signer1).setApprovalForAll(stakingWalletCosmicSignatureNftAddr, true);
		await stakingWalletCosmicSignatureNft.connect(signer1).stake(0); // we need to stake, otherwise the deposit would be rejected

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer2).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer3).bidWithEth((-1), "", { value: nextEthBidPrice_ });

		// we are using BidderContract for this test because there won't be any subtraction
		// for paying gas price since it is accounted on the EOA that sends the TX,
		// and this will guarantee clean calculations
		const bidderContractFactory = await hre.ethers.getContractFactory("BidderContract", deployerAcct);
		const bidderContract = await bidderContractFactory.deploy(cosmicSignatureGameProxyAddr);
		await bidderContract.waitForDeployment();
		const bidderContractAddr = await bidderContract.getAddress();

		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await bidderContract.connect(signer0).doBidWithEth({ value: nextEthBidPrice_ });

		let mainEthPrizeAmount_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();
		let charityEthDonationAmount_ = await cosmicSignatureGameProxy.getCharityEthDonationAmount();
		let cosmicSignatureNftStakingTotalEthRewardAmount_ = await cosmicSignatureGameProxy.getCosmicSignatureNftStakingTotalEthRewardAmount();
		let bidderContractBalanceAmountBefore = await hre.ethers.provider.getBalance(bidderContractAddr);
		let charityWalletBalanceAmountBefore = await hre.ethers.provider.getBalance(charityWalletAddr);
		let stakingWalletCosmicSignatureNftBalanceAmountBefore = await hre.ethers.provider.getBalance(stakingWalletCosmicSignatureNftAddr);
		let raffleTotalEthPrizeAmountForBidders_ = await cosmicSignatureGameProxy.getRaffleTotalEthPrizeAmountForBidders();
		let numRaffleEthPrizesForBidders_ = await cosmicSignatureGameProxy.numRaffleEthPrizesForBidders();
		// let raffleEthPrizeAmountForBidder_ = raffleTotalEthPrizeAmountForBidders_ / numRaffleEthPrizesForBidders_;
		let raffleTotalEthPrizeAmountForBiddersRemainder_ = raffleTotalEthPrizeAmountForBidders_ % numRaffleEthPrizesForBidders_;
		raffleTotalEthPrizeAmountForBidders_ -= raffleTotalEthPrizeAmountForBiddersRemainder_; // clean the value from remainder if not divisible by numRaffleEthPrizesForBidders_
		const durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		let tx = await bidderContract.connect(signer0).doClaimMainPrize();
		let receipt = await tx.wait();
		let bidderContractBalanceAmountAfter = await hre.ethers.provider.getBalance(bidderContractAddr);
		let charityWalletBalanceAmountAfter = await hre.ethers.provider.getBalance(charityWalletAddr);
		let stakingWalletCosmicSignatureNftBalanceAmountAfter = await hre.ethers.provider.getBalance(stakingWalletCosmicSignatureNftAddr);
		
		let topic_sig = cosmicSignatureGameProxy.interface.getEvent("RaffleWinnerBidderEthPrizeAllocated").topicHash;
		let deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		const unique_winners = [];
		// todo-1 Chrono-warrior gets ETH, right? But this doesn't seem to account for that. Make sense to add that amount to this test?
		let sumDeposits = 0n;
		for (let i = 0; i < deposit_logs.length; i++) {
			let wlog = cosmicSignatureGameProxy.interface.parseLog(deposit_logs[i]);
			let args = wlog.args.toObject();
			let winnerAddress_ = args.winnerAddress;
			sumDeposits += args.ethPrizeAmount;
			if (unique_winners[winnerAddress_] == undefined) {
				if (winnerAddress_ != bidderContractAddr) {
					let winner_signer = await hre.ethers.getSigner(winnerAddress_);
					await prizesWallet.connect(winner_signer).withdrawEth();
				}
				unique_winners[winnerAddress_] = 1;
			}
		}
		expect(sumDeposits).equal(raffleTotalEthPrizeAmountForBidders_);

		let bidderContractExpectedBalanceAmountAfter = bidderContractBalanceAmountBefore + mainEthPrizeAmount_;
		expect(bidderContractBalanceAmountAfter).equal(bidderContractExpectedBalanceAmountAfter);
		let charityWalletExpectedBalanceAmountAfter = charityWalletBalanceAmountBefore + charityEthDonationAmount_;
		expect(charityWalletBalanceAmountAfter).equal(charityWalletExpectedBalanceAmountAfter);
		let stakingWalletCosmicSignatureNftExpectedBalanceAmountAfter = stakingWalletCosmicSignatureNftBalanceAmountBefore + cosmicSignatureNftStakingTotalEthRewardAmount_;
		expect(stakingWalletCosmicSignatureNftBalanceAmountAfter).equal(stakingWalletCosmicSignatureNftExpectedBalanceAmountAfter);
	});
	
	it("The _msgSender() will get the prize if the lastBidderAddress won't claim it", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {deployerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2, signer3,] = signers;

		// in this test we will make one bid as EOA, after that we will wait for claimMainPrize() timeout
		// and call the claimMainPrize() function from a contract. The contract should get the (main) prize.

		const bidderContractFactory = await hre.ethers.getContractFactory("BidderContract", deployerAcct);
		const bidderContract = await bidderContractFactory.deploy(cosmicSignatureGameProxyAddr);
		await bidderContract.waitForDeployment();
		const bidderContractAddr = await bidderContract.getAddress();

		// let donationAmount_ = hre.ethers.parseEther("10");
		// await cosmicSignatureGameProxy.connect(signer0).donateEth({ value: donationAmount_ });

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer3).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();

		// forward time 2 days
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) + (2 * 24 * 60 * 60)]);
		// await hre.ethers.provider.send("evm_mine");

		let tx = await bidderContract.connect(signer2).doClaimMainPrize();
		let receipt = await tx.wait();
		let topic_sig = cosmicSignatureGameProxy.interface.getEvent("MainPrizeClaimed").topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicSignatureGameProxy.interface.parseLog(log);
		// todo-1 Assert 2 more params passed to the event.
		expect(parsed_log.args.beneficiaryAddress).to.equal(bidderContractAddr);
	});
});
