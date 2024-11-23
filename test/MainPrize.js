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
	async function deployCosmic(deployerAcct) {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			marketingWallet,
		} = await basicDeployment(contractDeployerAcct, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		return {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			marketingWallet,
		};
	}
	const bidParamsEncoding = {
		type: "tuple(string,int256)",
		name: "BidParams",
		components: [
			{ name: "message", type: "string" },
			{ name: "randomWalkNftId", type: "int256" },
		],
	};
	it("Raffle deposits sent should match raffle deposits received", async function () {
		const {cosmicGameProxy, cosmicSignature, prizesWallet, randomWalkNft,} =
			await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3, addr4, addr5, addr6, ...addrs] = await hre.ethers.getSigners();
	
		// ToDo-202411202-1 applies.
		cosmicGameProxy.setDelayDurationBeforeNextRound(0);

		let roundNum = 0;
		// we need to mint Rwalk because our Rwalk contract is empty and doesn't have any holder
		// but they are needed to test token distribution in claimPrize()
		let rwalkTokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr1).mint({ value: rwalkTokenPrice });
		rwalkTokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr2).mint({ value: rwalkTokenPrice });

		// now we need to do a dummy claimPrize() because our CosmicSignature contract is empty
		// and does not contain any tokens but we need them to test token distribution (the holder loop)
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { message: "", randomWalkNftId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime)]);
		await cosmicGameProxy.connect(addr1).claimPrize();
		roundNum = roundNum + 1;
		let totalSupplyBefore = Number(await cosmicSignature.totalSupply());

		// at this point all required data was initialized, we can proceed with the test
		let topic_sig = prizesWallet.interface.getEvent("EthReceived").topicHash;
		let tx, receipt, log, parsed_log;

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { message: "", randomWalkNftId: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { message: "", randomWalkNftId: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { message: "", randomWalkNftId: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });

		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime)+1]);
		await hre.ethers.provider.send("evm_mine");

		let roundNumBefore = await cosmicGameProxy.roundNum();

		tx = await cosmicGameProxy.connect(addr3).claimPrize();
		roundNum = roundNum + 1;
		receipt = await tx.wait();

		// check tnat roundNum is incremented
		let roundNumAfter = await cosmicGameProxy.roundNum();
		expect(Number(roundNumAfter) - 1).to.equal(Number(roundNumBefore));

		// check winners[] map contains correct winner value
		let curWinnerAddress_ = await cosmicGameProxy.winners(roundNumBefore);
		expect(curWinnerAddress_).to.equal(addr3.address);

		//make sure the number of deposits matches numRaffleWinnersPerRound variable
		let deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let num_eth_winners_bidders= await cosmicGameProxy.numRaffleETHWinnersBidding();
		let num_raffle_nft_winners_bidding = await cosmicGameProxy.numRaffleNftWinnersBidding();
		let num_raffle_nft_winners_staking_rwalk = await cosmicGameProxy.numRaffleNftWinnersStakingRWalk();
		const numChronoWarriors_ = 1n;
		let sum_winners = Number(num_raffle_nft_winners_bidding) + Number(num_raffle_nft_winners_staking_rwalk);
		expect(Number(num_eth_winners_bidders + numChronoWarriors_)).to.equal(deposit_logs.length);
		let prize_winner_mints = 1;
		let expected_total_supply = totalSupplyBefore + prize_winner_mints + sum_winners;
		let curTotalSupply = Number(await cosmicSignature.totalSupply());
		// todo-1 This looked like a bug, so I replaced this with the next line, but it fails.
		// expect(await cosmicSignature.totalSupply()).to.equal(curTotalSupply);
		expect(curTotalSupply).to.equal(expected_total_supply);
		// let last_cosmic_signature_supply = sum_winners + prize_winner_mints;

		// let's begin a new round
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { message: "", randomWalkNftId: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { message: "", randomWalkNftId: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { message: "", randomWalkNftId: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });

		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime)+1]);
		await hre.ethers.provider.send("evm_mine");

		// let raffleAmount = await cosmicGameProxy.raffleAmount();
		tx = await cosmicGameProxy.connect(addr3).claimPrize();
		roundNum = roundNum + 1
		receipt = await tx.wait();
		deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);

		// make sure numRaffleParticipants have been reset
		let numRaffleParticipants = await cosmicGameProxy.numRaffleParticipants(roundNum);
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
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			bidLogic
		} = await basicDeploymentAdvanced(
			'SpecialCosmicGame',
			owner,
			'',
			1,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true
		);

		let donationAmount = hre.ethers.parseEther('1');
		await cosmicGameProxy.donate({ value: donationAmount });
		let charityAddr = await cosmicGameProxy.charity();

		await cosmicGameProxy.mintCST(addr1.address, 0); // mint a token so we can stake
		await cosmicSignature.connect(addr1).setApprovalForAll(await stakingWalletCosmicSignatureNft.getAddress(), true);
		await stakingWalletCosmicSignatureNft.connect(addr1).stake(0); // we need to stake, otherwise the deposit would be rejected

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { message: "", randomWalkNftId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });

		// we are using BidderContract for this test because there won't be any subtraction
		// for paying gas price since it is accounted on the EOA that sends the TX,
		// and this will guarantee clean calculations
		const BidderContract = await hre.ethers.getContractFactory('BidderContract');
		const cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		await cBidder.waitForDeployment();

		bidPrice = await cosmicGameProxy.getBidPrice();
		await cBidder.doBid({ value: bidPrice });

		let mainPrizeAmount_ = await cosmicGameProxy.mainPrizeAmount();
		let charityAmount = await cosmicGameProxy.charityAmount();
		let stakingAmount = await cosmicGameProxy.stakingAmount();
		let balanceBefore = await hre.ethers.provider.getBalance(await cBidder.getAddress());
		let balanceCharityBefore = await hre.ethers.provider.getBalance(charityAddr);
		let balanceStakingBefore = await hre.ethers.provider.getBalance(await stakingWalletCosmicSignatureNft.getAddress());
		let raffleAmount = await cosmicGameProxy.raffleAmount();
		let numWinners = await cosmicGameProxy.numRaffleETHWinnersBidding();
		let amountPerWinner = Number(raffleAmount) / Number(numWinners);
		let modAmount = Number(raffleAmount) % Number(numWinners);
		raffleAmount = raffleAmount - BigInt(modAmount); // clean the value from reminder if not divisible by numWinners
		const prizeTime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await hre.ethers.provider.send('evm_mine');
		let tx = await cBidder.doClaim();
		let receipt = await tx.wait();
		let balanceAfter = await hre.ethers.provider.getBalance(await cBidder.getAddress());
		let balanceCharityAfter = await hre.ethers.provider.getBalance(charityAddr);
		let balanceStakingAfter = await hre.ethers.provider.getBalance(await stakingWalletCosmicSignatureNft.getAddress());

		let topic_sig = cosmicGameProxy.interface.getEvent('RaffleETHWinnerEvent').topicHash;
		let deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		const unique_winners = [];
		let sumDeposits = 0n;
		for (let i = 0; i < deposit_logs.length; i++) {
			let wlog = cosmicGameProxy.interface.parseLog(deposit_logs[i]);
			let args = wlog.args.toObject();
			let winnerAddress_ = args.winnerAddress;
			sumDeposits = sumDeposits + args.amount;
			if (typeof unique_winners[winnerAddress_] === 'undefined') {
				if (winnerAddress_ != (await cBidder.getAddress())) {
					let winner_signer = await hre.ethers.getSigner(winnerAddress_);
					await prizesWallet.connect(winner_signer).withdrawEth();
				}
				unique_winners[winnerAddress_] = 1;
			}
		}
		expect(sumDeposits).to.equal(raffleAmount);

		let expectedBalanceAfter = balanceBefore + mainPrizeAmount_;
		expect(expectedBalanceAfter).to.equal(balanceAfter);
		let expectedBalanceCharityAfter = balanceCharityBefore + charityAmount;
		expect(expectedBalanceCharityAfter).to.equal(balanceCharityAfter);
		let expectedBalanceStakingAfter = balanceStakingBefore + stakingAmount;
		expect(expectedBalanceStakingAfter).to.equal(balanceStakingAfter);
	});
	it("The msg.sender will get the prize if the lastBidderAddress won't claim it", async function () {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNft,
			stakingWallet,
			marketingWallet
		} = await basicDeployment(
			contractDeployerAcct,
			'',
			1,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true
		);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicGameErrors");

		// in this test we will make one bid as EOA, after that we will wait for claimPrize() timeout
		// and call the claimPrize() function from a contract. The contract should get the (main) prize.

		const BidderContract = await hre.ethers.getContractFactory('BidderContract');
		const bContract = await BidderContract.deploy(await cosmicGameProxy.getAddress());

		let donationAmount = hre.ethers.parseEther('10');
		await cosmicGameProxy.donate({ value: donationAmount });

		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { message: "", randomWalkNftId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		// forward time 2 days
		await hre.ethers.provider.send('evm_increaseTime', [Number(prizeTime) + (48 * 3600)]);
		await hre.ethers.provider.send('evm_mine');

		let tx = await bContract.connect(addr2).doClaim();
		let receipt = await tx.wait();
		let topic_sig = cosmicGameProxy.interface.getEvent('MainPrizeClaimed').topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicGameProxy.interface.parseLog(log);
		expect(parsed_log.args.beneficiaryAddress).to.equal(await bContract.getAddress());
	});
});
