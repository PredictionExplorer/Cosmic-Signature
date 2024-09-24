const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");
const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { expect } = require("chai");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

describe("CosmicSignature tests", function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
	async function deployCosmic(deployerAcct) {
		let contractDeployerAcct;
		[contractDeployerAcct] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet,
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,true);

		return {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWallet,
			marketingWallet,
		};
	}
	const bidParamsEncoding = {
		type: "tuple(string,int256)",
		name: "bidparams",
		components: [
			{ name: "msg", type: "string" },
			{ name: "rwalk", type: "int256" },
		],
	};
	it("Raffle deposits sent should match raffle deposits received", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3, addr4, addr5, addr6, ...addrs] = await ethers.getSigners();
	
		let roundNum = 0;
		// we need to mint Rwalk because our Rwalk contract is empty and doesn't have any holder
		// but they are needed to test token distribution in claimPrize()
		let rwalkTokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: rwalkTokenPrice });
		rwalkTokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr2).mint({ value: rwalkTokenPrice });

		// now we need to do a dummy claimPrize() because our CosmicSignature contract is empty
		// and does not contain any tokens but we need them to test token distribution (the holder loop)
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [Number(prizeTime)]);
		await cosmicGameProxy.connect(addr1).claimPrize();
		roundNum = roundNum + 1;
		let totalSupplyBefore = Number(await cosmicSignature.totalSupply());


		// at this point all required data was initialized, we can proceed with the test
		let topic_sig = raffleWallet.interface.getEvent("RaffleDepositEvent").topicHash;
		let tx, receipt, log, parsed_log, winner;

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });

		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [Number(prizeTime)+1]);
		await ethers.provider.send("evm_mine");

		let roundNumBefore = await cosmicGameProxy.roundNum();

		tx = await cosmicGameProxy.connect(addr3).claimPrize();
		roundNum = roundNum + 1;
		receipt = await tx.wait();

		// check tnat roundNum is incremented
		let roundNumAfter = await cosmicGameProxy.roundNum();
		expect(Number(roundNumAfter) - 1).to.equal(Number(roundNumBefore));

		// check winners[] map contains correct winner value
		let curWinner = await cosmicGameProxy.winners(roundNumBefore);
		expect(curWinner).to.equal(addr3.address);

		//make sure the number of deposits matches numRaffleWinnersPerRound variable
		let deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let num_eth_winners_bidders= await cosmicGameProxy.numRaffleETHWinnersBidding();
		let num_raffle_nft_winners_bidding = await cosmicGameProxy.numRaffleNFTWinnersBidding();
		let num_raffle_nft_winners_staking_rwalk = await cosmicGameProxy.numRaffleNFTWinnersStakingRWalk();
		let sum_winners = Number(num_raffle_nft_winners_bidding) + Number(num_raffle_nft_winners_staking_rwalk);
		expect(Number(num_eth_winners_bidders)).to.equal(deposit_logs.length);
		let prize_winner_mints = 1;
		let expected_total_supply = totalSupplyBefore + prize_winner_mints + sum_winners;
		let curTotalSupply = Number(await cosmicSignature.totalSupply());
		expect(await cosmicSignature.totalSupply()).to.equal(curTotalSupply);
		let last_cosmic_signature_supply = sum_winners + prize_winner_mints;

		// let's begin a new round
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });

		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [Number(prizeTime)+1]);
		await ethers.provider.send("evm_mine");

		let raffleAmount = await cosmicGameProxy.raffleAmount();
		tx = await cosmicGameProxy.connect(addr3).claimPrize();
		roundNum = roundNum + 1
		receipt = await tx.wait();
		deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);

		// make sure numRaffleParticipants have been reset
		let numRaffleParticipants = await cosmicGameProxy.numRaffleParticipants(roundNum);
		expect(numRaffleParticipants).to.equal(0);

		var unique_winners = [];
		for (let i = 0; i < deposit_logs.length; i++) {
			let wlog = raffleWallet.interface.parseLog(deposit_logs[i]);
			let args = wlog.args.toObject();
			let winner = args.winner;
			let winner_signer = await ethers.getSigner(winner);
			if (typeof unique_winners[winner] === "undefined") {
				await raffleWallet.connect(winner_signer).withdraw();
				unique_winners[winner] = 1;
			}
		}
	});
	it('Distribution of prize amounts matches specified business logic', async function () {
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bidLogic
		} = await basicDeploymentAdvanced(
			'SpecialCosmicGame',
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			true
		);

		let donationAmount = ethers.parseEther('1');
		await cosmicGameProxy.donate({ value: donationAmount });
		let charityAddr = await cosmicGameProxy.charity();

		await cosmicGameProxy.mintCST(addr1.address, 0); // mint a token so we can stake
		await cosmicSignature.connect(addr1).setApprovalForAll(await stakingWalletCST.getAddress(), true);
		await stakingWalletCST.connect(addr1).stake(0); // stake a token so the deposits to staking wallet go to staking wallet , not to charity

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: '', rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });

		// we are using BidderContract for this test because there won't be any subtraction
		// for paying gas price since it is accounted on the EOA that sends the TX,
		// and this will guarantee clean calculations
		const BidderContract = await ethers.getContractFactory('BidderContract');
		let cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		await cBidder.waitForDeployment();

		bidPrice = await cosmicGameProxy.getBidPrice();
		await cBidder.doBid({ value: bidPrice });

		let mainPrizeAmount = await cosmicGameProxy.prizeAmount();
		let charityAmount = await cosmicGameProxy.charityAmount();
		let stakingAmount = await cosmicGameProxy.stakingAmount();
		let balanceBefore = await ethers.provider.getBalance(await cBidder.getAddress());
		let balanceCharityBefore = await ethers.provider.getBalance(charityAddr);
		let balanceStakingBefore = await ethers.provider.getBalance(await stakingWalletCST.getAddress());
		let raffleAmount = await cosmicGameProxy.raffleAmount();
		let numWinners = await cosmicGameProxy.numRaffleETHWinnersBidding();
		let amountPerWinner = Number(raffleAmount)/Number(numWinners);
		let modAmount = Number(raffleAmount) % Number(numWinners);
		raffleAmount = raffleAmount - BigInt(modAmount); // clean the value from reminder if not divisible by numWinners
		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await ethers.provider.send('evm_mine');
		let tx = await cBidder.doClaim();
		let receipt = await tx.wait();
		let balanceAfter = await ethers.provider.getBalance(await cBidder.getAddress());
		let balanceCharityAfter = await ethers.provider.getBalance(charityAddr);
		let balanceStakingAfter = await ethers.provider.getBalance(await stakingWalletCST.getAddress());

		let topic_sig = cosmicGameProxy.interface.getEvent('RaffleETHWinnerEvent').topicHash;
		let deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		var unique_winners = [];
		var sumDeposits = 0n;
		for (let i = 0; i < deposit_logs.length; i++) {
			let wlog = cosmicGameProxy.interface.parseLog(deposit_logs[i]);
			let args = wlog.args.toObject();
			let winner = args.winner;
			sumDeposits = sumDeposits + args.amount;
			let winner_signer = await ethers.getSigner(winner);
			if (typeof unique_winners[winner] === 'undefined') {
				if (winner != (await cBidder.getAddress())) {
					await raffleWallet.connect(winner_signer).withdraw();
				}
				unique_winners[winner] = 1;
			}
		}
		expect(sumDeposits).to.equal(raffleAmount);

		let expectedBalanceAfter = balanceBefore + mainPrizeAmount;
		expect(expectedBalanceAfter).to.equal(balanceAfter);
		let expectedBalanceCharityAfter = balanceCharityBefore + charityAmount;
		expect(expectedBalanceCharityAfter).to.equal(balanceCharityAfter);
		let expectedBalanceStakingAfter = balanceStakingBefore + stakingAmount;
		expect(expectedBalanceStakingAfter).to.equal(balanceStakingAfter);
	});
	it("The msg.sender will get the prize if the lastBidder won't claim it", async function () {
		[contractDeployerAcct] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet
		} = await basicDeployment(
			contractDeployerAcct,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			true
		);
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		// in this test we will make one bid as EOA, after that we will wait for claimPrize() timeout
		// and call the claimPrize() function from a contract. The contract should get the (main) prize.

		const BidderContract = await ethers.getContractFactory('BidderContract');
		const bContract = await BidderContract.deploy(await cosmicGameProxy.getAddress());

		let donationAmount = hre.ethers.parseEther('10');
		await cosmicGameProxy.donate({ value: donationAmount });

		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

		let bidPrice = await cosmicGameProxy.getBidPrice();
		var bidParams = { msg: '', rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		// forward time 2 days
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime) + (48 * 3600)]);
		await ethers.provider.send('evm_mine');

		let tx = await bContract.connect(addr2).doClaim();
		let receipt = await tx.wait();
		let topic_sig = cosmicGameProxy.interface.getEvent('PrizeClaimEvent').topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicGameProxy.interface.parseLog(log);
		expect(parsed_log.args.destination).to.equal(await bContract.getAddress());
	});

})