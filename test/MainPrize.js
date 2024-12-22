"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

describe("MainPrize", function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
	async function deployCosmicSignature(deployerAcct) {
		const [contractDeployerAcct, addr1,] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			// marketingWallet,
		} = await basicDeployment(contractDeployerAcct, "", 1, addr1.address, true);
		return {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			// marketingWallet,
		};
	}
	// const bidParamsEncoding = {
	// 	type: "tuple(string,int256)",
	// 	name: "BidParams",
	// 	components: [
	// 		{ name: "message", type: "string" },
	// 		{ name: "randomWalkNftId", type: "int256" },
	// 	],
	// };
	it("The number of distributed prizes is correct", async function () {
		const {cosmicSignatureGameProxy, cosmicSignatureNft, prizesWallet, randomWalkNft, stakingWalletRandomWalkNft,} =
			await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2, addr3, addr4, addr5, addr6, ...addrs] = await hre.ethers.getSigners();
	
		// ToDo-202411202-1 applies.
		cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(0);

		let roundNum = 0;

		// we need to mint Rwalk because our Rwalk contract is empty and doesn't have any holder
		// but they are needed to test token distribution in claimMainPrize()
		let rwalkTokenPrice = await randomWalkNft.getMintPrice();
		let randomWalkNftId_ = await randomWalkNft.connect(addr1).mint({ value: rwalkTokenPrice });
		await randomWalkNft.connect(addr1).setApprovalForAll(await stakingWalletRandomWalkNft.getAddress(), true);
		await stakingWalletRandomWalkNft.connect(addr1).stake(/*randomWalkNftId_*/ 0);
		rwalkTokenPrice = await randomWalkNft.getMintPrice();
		randomWalkNftId_ = await randomWalkNft.connect(addr2).mint({ value: rwalkTokenPrice });
		await randomWalkNft.connect(addr2).setApprovalForAll(await stakingWalletRandomWalkNft.getAddress(), true);
		await stakingWalletRandomWalkNft.connect(addr2).stake(/*randomWalkNftId_*/ 1);

		// now we need to do a dummy claimMainPrize() because our CosmicSignatureNft contract is empty
		// and does not contain any tokens but we need them to test token distribution (the holder loop)
		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		await cosmicSignatureGameProxy.connect(addr1).claimMainPrize();
		roundNum = roundNum + 1;
		let totalSupplyBefore = await cosmicSignatureNft.totalSupply();

		// at this point all required data was initialized, we can proceed with the test

		let topic_sig = prizesWallet.interface.getEvent("EthReceived").topicHash;

		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });
		await cosmicSignatureGameProxy.connect(addr1).bidWithCst(10n ** 30n, "");
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ (-1), "", { value: bidPrice });

		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) + 1]);
		await hre.ethers.provider.send("evm_mine");

		let roundNumBefore = await cosmicSignatureGameProxy.roundNum();

		let tx = await cosmicSignatureGameProxy.connect(addr3).claimMainPrize();
		roundNum = roundNum + 1;
		let receipt = await tx.wait();

		// check that roundNum is incremented
		let roundNumAfter = await cosmicSignatureGameProxy.roundNum();
		expect(roundNumAfter).to.equal(roundNumBefore + 1n);

		// check winners[] map contains correct winner value
		// let curWinnerAddress_ = await cosmicSignatureGameProxy.winners(roundNumBefore);
		let curWinnerAddress_ = await prizesWallet.mainPrizeWinnerAddresses(roundNumBefore);
		expect(curWinnerAddress_).to.equal(addr3.address);

		// make sure the number of deposits matches numRaffleWinnersPerRound variable
		let deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		const numMainPrizeWinners_ = 1n;
		const numLastCstBidders_ = 1n;
		const numEnduranceChampions_ = 1n;
		const numChronoWarriors_ = 1n;
		let numRaffleEthPrizesForBidders_= await cosmicSignatureGameProxy.numRaffleEthPrizesForBidders();
		let numRaffleCosmicSignatureNftsForBidders_ = await cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForBidders();
		let numRaffleCosmicSignatureNftsForRandomWalkNftStakers_ = await cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForRandomWalkNftStakers();
		expect(numChronoWarriors_ + numRaffleEthPrizesForBidders_).to.equal(deposit_logs.length);
		let sum_winners =
			numMainPrizeWinners_ +
			numLastCstBidders_ +
			numEnduranceChampions_ +
			numRaffleCosmicSignatureNftsForBidders_ +
			numRaffleCosmicSignatureNftsForRandomWalkNftStakers_;
		let expected_total_supply =
			totalSupplyBefore +
			sum_winners;
		let curTotalSupply = await cosmicSignatureNft.totalSupply();
		expect(curTotalSupply).to.equal(expected_total_supply);
		// let last_cosmic_signature_supply = sum_winners + numMainPrizeWinners_;

		// let's begin a new round
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ (-1), "", { value: bidPrice });

		durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) + 1]);
		await hre.ethers.provider.send("evm_mine");

		// let raffleTotalEthPrizeAmount_ = await cosmicSignatureGameProxy.getRaffleTotalEthPrizeAmount();
		tx = await cosmicSignatureGameProxy.connect(addr3).claimMainPrize();
		roundNum = roundNum + 1
		receipt = await tx.wait();
		deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);

		// make sure numRaffleParticipants have been reset
		let numRaffleParticipants = await cosmicSignatureGameProxy.numRaffleParticipants(roundNum);
		expect(numRaffleParticipants).to.equal(0);

		const unique_winners = [];
		for (let i = 0; i < deposit_logs.length; i++) {
			let wlog = prizesWallet.interface.parseLog(deposit_logs[i]);
			let args = wlog.args.toObject();
			let roundPrizeWinnerAddress_ = args.roundPrizeWinnerAddress;
			if (typeof unique_winners[roundPrizeWinnerAddress_] === "undefined") {
				let winner_signer = await hre.ethers.getSigner(roundPrizeWinnerAddress_);
				await prizesWallet.connect(winner_signer).withdrawEth();
				unique_winners[roundPrizeWinnerAddress_] = 1;
			}
		}
	});
	it("Distribution of prize amounts matches specified business logic", async function () {
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
		} = await basicDeploymentAdvanced(
			"SpecialCosmicSignatureGame",
			owner,
			'',
			1,
			addr1.address,
			true
		);

		let donationAmount = hre.ethers.parseEther('1');
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount });
		let charityAddr = await cosmicSignatureGameProxy.charityAddress();

		await cosmicSignatureGameProxy.mintCosmicSignatureNft(addr1.address); // mint an NFT so we can stake
		await cosmicSignatureNft.connect(addr1).setApprovalForAll(await stakingWalletCosmicSignatureNft.getAddress(), true);
		await stakingWalletCosmicSignatureNft.connect(addr1).stake(0); // we need to stake, otherwise the deposit would be rejected

		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ (-1), "", { value: bidPrice });

		// we are using BidderContract for this test because there won't be any subtraction
		// for paying gas price since it is accounted on the EOA that sends the TX,
		// and this will guarantee clean calculations
		const BidderContract = await hre.ethers.getContractFactory("BidderContract");
		const cBidder = await BidderContract.deploy(await cosmicSignatureGameProxy.getAddress());
		await cBidder.waitForDeployment();

		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cBidder.doBid({ value: bidPrice });

		let mainEthPrizeAmount_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();
		let charityEthDonationAmount_ = await cosmicSignatureGameProxy.getCharityEthDonationAmount();
		let stakingTotalEthRewardAmount_ = await cosmicSignatureGameProxy.getStakingTotalEthRewardAmount();
		let balanceBefore = await hre.ethers.provider.getBalance(await cBidder.getAddress());
		let balanceCharityBefore = await hre.ethers.provider.getBalance(charityAddr);
		let balanceStakingBefore = await hre.ethers.provider.getBalance(await stakingWalletCosmicSignatureNft.getAddress());
		let raffleTotalEthPrizeAmount_ = await cosmicSignatureGameProxy.getRaffleTotalEthPrizeAmount();
		let numRaffleEthPrizesForBidders_ = await cosmicSignatureGameProxy.numRaffleEthPrizesForBidders();
		// let raffleEthPrizeAmount_ = raffleTotalEthPrizeAmount_ / numRaffleEthPrizesForBidders_;
		let raffleTotalEthPrizeAmountRemainder_ = raffleTotalEthPrizeAmount_ % numRaffleEthPrizesForBidders_;
		raffleTotalEthPrizeAmount_ -= raffleTotalEthPrizeAmountRemainder_; // clean the value from remainder if not divisible by numRaffleEthPrizesForBidders_
		const durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send('evm_increaseTime', [Number(durationUntilMainPrize_)]);
		await hre.ethers.provider.send('evm_mine');
		let tx = await cBidder.doClaim();
		let receipt = await tx.wait();
		let balanceAfter = await hre.ethers.provider.getBalance(await cBidder.getAddress());
		let balanceCharityAfter = await hre.ethers.provider.getBalance(charityAddr);
		let balanceStakingAfter = await hre.ethers.provider.getBalance(await stakingWalletCosmicSignatureNft.getAddress());

		let topic_sig = cosmicSignatureGameProxy.interface.getEvent("RaffleWinnerEthPrizeAllocated").topicHash;
		let deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		const unique_winners = [];
		let sumDeposits = 0n;
		for (let i = 0; i < deposit_logs.length; i++) {
			let wlog = cosmicSignatureGameProxy.interface.parseLog(deposit_logs[i]);
			let args = wlog.args.toObject();
			let winnerAddress_ = args.winnerAddress;
			sumDeposits = sumDeposits + args.ethPrizeAmount;
			if (typeof unique_winners[winnerAddress_] === 'undefined') {
				if (winnerAddress_ != (await cBidder.getAddress())) {
					let winner_signer = await hre.ethers.getSigner(winnerAddress_);
					await prizesWallet.connect(winner_signer).withdrawEth();
				}
				unique_winners[winnerAddress_] = 1;
			}
		}
		expect(sumDeposits).to.equal(raffleTotalEthPrizeAmount_);

		let expectedBalanceAfter = balanceBefore + mainEthPrizeAmount_;
		expect(expectedBalanceAfter).to.equal(balanceAfter);
		let expectedBalanceCharityAfter = balanceCharityBefore + charityEthDonationAmount_;
		expect(expectedBalanceCharityAfter).to.equal(balanceCharityAfter);
		let expectedBalanceStakingAfter = balanceStakingBefore + stakingTotalEthRewardAmount_;
		expect(expectedBalanceStakingAfter).to.equal(balanceStakingAfter);
	});
	it("The msg.sender will get the prize if the lastBidderAddress won't claim it", async function () {
		const [owner, addr1, addr2, addr3,] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			charityWallet,
			randomWalkNft,
			stakingWallet,
		} = await basicDeployment(
			owner,
			"",
			1,
			addr1.address,
			true
		);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		// in this test we will make one bid as EOA, after that we will wait for claimMainPrize() timeout
		// and call the claimMainPrize() function from a contract. The contract should get the (main) prize.

		const BidderContract = await hre.ethers.getContractFactory("BidderContract");
		const bContract = await BidderContract.deploy(await cosmicSignatureGameProxy.getAddress());

		let donationAmount = hre.ethers.parseEther('10');
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount });

		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ (-1), "", { value: bidPrice });
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		// forward time 2 days
		await hre.ethers.provider.send('evm_increaseTime', [Number(durationUntilMainPrize_) + (2 * 24 * 60 * 60)]);
		await hre.ethers.provider.send('evm_mine');

		let tx = await bContract.connect(addr2).doClaim();
		let receipt = await tx.wait();
		let topic_sig = cosmicSignatureGameProxy.interface.getEvent('MainPrizeClaimed').topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicSignatureGameProxy.interface.parseLog(log);
		// todo-1 Assert 2 more params passed to the event.
		expect(parsed_log.args.beneficiaryAddress).to.equal(await bContract.getAddress());
	});
});
