const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const SKIP_LONG_TESTS = "1";
const { basicDeployment,basicDeploymentAdvanced } = require("../src//Deploy.js");

describe("Cosmic Set2", function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
	async function deployCosmic(deployerAcct) {
		let contractDeployerAcct;
		[contractDeployerAcct] = await ethers.getSigners();
		const {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWalletCST,
			sttaingWaalletRWalk,
			marketingWallet,
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,true);

		return {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWalletCST,
			stakingWalletRWalk,
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
	const InvalidBidderQueryRoundDef = {
		type: "tuple(string,uint256,uint256)",
		name: "InvalidBidderQueryRound",
		components: [
			{ name: "errStr", type: "string"},
			{ name: "providedRound", type: "uint256"},
			{ name:	"totalRounds", type: "uint256"},
		],
	};
	it("After bid() , bid-related counters have correct values", async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let donationAmount = ethers.utils.parseEther("10");
		await cosmicGame.donate({ value: donationAmount });
		var bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGame.getBidPrice();
		await cosmicGame.bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();

		let aLen = await cosmicGame.CSTAuctionLength();
		await ethers.provider.send("evm_increaseTime", [aLen.toNumber()]);	// make CST price drop to 0
		await ethers.provider.send("evm_mine");

		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.mint({ value: tokenPrice }); // tokenId=0

		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "rwalk bid", rwalk: 0 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.bid(params, { value: bidPrice });

		lastBidType = await cosmicGame.lastBidType();
		expect(lastBidType).to.equal(1);

		await cosmicGame.bidWithCST("cst bid");

		lastBidType = await cosmicGame.lastBidType();
		expect(lastBidType).to.equal(2);

	});
	it("Bidder is receiving correct refund amount when using larger bidPrice than required", async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let donationAmount = ethers.utils.parseEther("1");
		await cosmicGame.donate({ value: donationAmount });

		// we are using BidderContract for this test because there won't be any subtraction
		// for paying gas price since it is accounted on the EOA that sends the TX,
		// and this will guarantee clean calculations
		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();
		let balanceBefore = await ethers.provider.getBalance(cBidder.address);
		let amountSent = ethers.utils.parseEther("2");

		let bidPrice = await cosmicGame.getBidPrice();
		await cBidder.doBid2({value: amountSent});

		let balanceAfter = await ethers.provider.getBalance(cBidder.address);
		let expectedBalanceAfter = amountSent.sub(bidPrice);
		expect(expectedBalanceAfter).to.equal(balanceAfter);
	});
	it("Bidder is receiving correct refund amount when using larger bidPrice than required using RandomWalk", async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let donationAmount = ethers.utils.parseEther("1");
		await cosmicGame.donate({ value: donationAmount });

		// we are using BidderContract for this test because there won't be any subtraction
		// for paying gas price since it is accounted on the EOA that sends the TX,
		// and this will guarantee clean calculations
		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();
		let balanceBefore = await ethers.provider.getBalance(cBidder.address);
		let amountSent = ethers.utils.parseEther("2");

		await randomWalkNFT.setApprovalForAll(cosmicGame.address, true);
		await randomWalkNFT.setApprovalForAll(cBidder.address, true);
		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.mint({ value: tokenPrice }); // tokenId=0
		bidPrice = await cosmicGame.getBidPrice();
		await cBidder.doBidRWalk2(0,{ value: amountSent});

		let balanceAfter = await ethers.provider.getBalance(cBidder.address);
		let discountedBidPrice = bidPrice.div(2);
		let expectedBalanceAfter = amountSent.sub(discountedBidPrice);
		expect(expectedBalanceAfter).to.equal(balanceAfter);
	});
	it("Maintenance mode works as expected", async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let donationAmount = ethers.utils.parseEther("10");
		await cosmicGame.donate({ value: donationAmount });
		var bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGame.getBidPrice();
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });

		let sysMode = await cosmicGame.systemMode();
		expect(sysMode.toString()).to.equal("0");

		await cosmicGame.connect(owner).prepareMaintenance();
		await expect(cosmicGame.connect(addr1).prepareMaintenance()).to.be.revertedWith("Ownable: caller is not the owner");

		sysMode = await cosmicGame.systemMode();
		expect(sysMode.toString()).to.equal("1");

		prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await ethers.provider.send("evm_mine");
		await cosmicGame.connect(addr1).claimPrize();

		sysMode = await cosmicGame.systemMode();
		expect(sysMode.toString()).to.equal("2");

		await cosmicGame.setRuntimeMode();
		sysMode = await cosmicGame.systemMode();
		expect(sysMode.toString()).to.equal("0");

		// make another bid just to make sure runtime mode is enabled
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		bidPrice = await cosmicGame.getBidPrice();
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
	})
	it("Bidding a lot & staking a lot works correctly ", async function () {
		[owner, addr1, addr2, addr3, addr4, addr5] = await ethers.getSigners();
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let donationAmount = ethers.utils.parseEther("100");
		await cosmicGame.donate({ value: donationAmount });
	
		let bidParams,params,prizeTime;
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		for (let i=0;i<30;i++) {
			bidPrice = await cosmicGame.getBidPrice();
			await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
			bidPrice = await cosmicGame.getBidPrice();
			await cosmicGame.connect(addr2).bid(params, { value: bidPrice });
			bidPrice = await cosmicGame.getBidPrice();
			await cosmicGame.connect(addr3).bid(params, { value: bidPrice });
			bidPrice = await cosmicGame.getBidPrice();
			await cosmicGame.connect(addr4).bid(params, { value: bidPrice });
			prizeTime = await cosmicGame.timeUntilPrize();
			await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
			await ethers.provider.send("evm_mine");
			await cosmicGame.connect(addr4).claimPrize();
		}
		let tx,receipt,log,parsed_log;
		let topic_sig = stakingWalletCST.interface.getEventTopic("StakeActionEvent");
		let ts = await cosmicSignature.totalSupply();
		let rn = await cosmicGame.roundNum();
		let tokensByStaker = {};
		for (let i =0; i<ts.toNumber(); i++) {
		    let ownr = await cosmicSignature.ownerOf(i)
			let userTokens = tokensByStaker[ownr];
			if (userTokens === undefined) {
				userTokens = [];
			}
			userTokens.push(i);
			tokensByStaker[ownr] = userTokens;
		    let owner_signer = cosmicGame.provider.getSigner(ownr);
		    await cosmicSignature.connect(owner_signer).setApprovalForAll(stakingWalletCST.address, true);
		    tx = await stakingWalletCST.connect(owner_signer).stake(i);
		    receipt = await tx.wait();
		    log = receipt.logs.find(x=>x.topics.indexOf(topic_sig)>=0);
		    parsed_log = stakingWalletCST.interface.parseLog(log);
		}
		bidPrice = await cosmicGame.getBidPrice();
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();
		await cosmicGame.connect(addr3).bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();
		await cosmicGame.connect(addr4).bid(params, { value: bidPrice });
		prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await ethers.provider.send("evm_mine");
		prizeTime = await cosmicGame.timeoutClaimPrize();	// we need another time increase to claim as addr5 (addr5 has no bids, won't get raffle NFTs)
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await ethers.provider.send("evm_mine");
		let totSupBefore = await cosmicSignature.totalSupply();
		tx = await cosmicGame.connect(addr5).claimPrize();
		receipt = await tx.wait();
		topic_sig = cosmicGame.interface.getEventTopic("RaffleNFTWinnerEvent");
		let raffle_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		// all Raffle NFTs must have zero address because they are not staked, verify it
		for (let i=0; i<raffle_logs.length; i++) {
			let rlog = cosmicGame.interface.parseLog(raffle_logs[i]);
			let winner = rlog.args.winner;
			let owner = await cosmicSignature.ownerOf(rlog.args.tokenId);
			let stakerAddr = await stakingWalletCST.stakerByTokenId(rlog.args.tokenId);
			expect(stakerAddr).to.equal("0x0000000000000000000000000000000000000000");
		}
		// all the remaining NFTs must have stakerByTokenId() equal to the addr who staked it
		// also check the correctness of lastActionId map
		ts = await cosmicSignature.totalSupply();
		for (let i =0; i<ts.toNumber(); i++) {
			let stakerAddr = await stakingWalletCST.stakerByTokenId(i);
			if (stakerAddr == "0x0000000000000000000000000000000000000000") {
				let ownr = await cosmicSignature.ownerOf(i);
				let userTokens = tokensByStaker[ownr];
				if (userTokens === undefined) {
					userTokens = [];
				}
				userTokens.push(i);
				tokensByStaker[ownr] = userTokens;
				if (i >= totSupBefore.toNumber()) {	// this is new token, it is not staked yet
					continue;
				}
			}
			let isStaked = await stakingWalletCST.isTokenStaked(i);
			expect(isStaked).to.equal(true);
			let lastActionId = await stakingWalletCST.lastActionIdByTokenId(i);
			lastActionId = lastActionId.toNumber();
			if (lastActionId < 0) {
				throw "Invalid action id" + lastActionId;
			}
			let stakeActionRecord = await stakingWalletCST.stakeActions(lastActionId);
			expect(stakeActionRecord.owner).to.equal(stakerAddr);
		}
		await ethers.provider.send("evm_increaseTime", [3600*24*60]);
		await ethers.provider.send("evm_mine");
		let num_actions;
		num_actions = await stakingWalletCST.numStakeActions();
		for (let i = 0; i < num_actions.toNumber(); i++) {
			let action_rec = await stakingWalletCST.stakeActions(i);
			let ownr = action_rec.owner;
			let owner_signer = cosmicGame.provider.getSigner(ownr);
			await ethers.provider.send("evm_increaseTime", [100]);
			await stakingWalletCST.connect(owner_signer).unstake(i);
		}
		// at this point, all tokens were unstaked
		num_actions  = await stakingWalletCST.numStakeActions();
		for (let i =0; i<num_actions.toNumber(); i++) {
			let action_rec = await stakingWalletCST.stakeActions(i);
			let ownr = action_rec.owner;
			let num_deposits = await stakingWalletCST.numETHDeposits();
			let owner_signer = stakingWalletCST.provider.getSigner(ownr);
			for (let j = 0; j < num_deposits.toNumber(); j++) {
				let deposit_rec = await stakingWalletCST.ETHDeposits(j);
				await stakingWalletCST.connect(owner_signer).claimReward(i,j);
			}
		}
		let contractBalance = await ethers.provider.getBalance(stakingWalletCST.address);
		let m = await stakingWalletCST.modulo();
		expect(m).to.equal(contractBalance);
		
        // check that every staker has its own tokens back
		for (user in tokensByStaker) {
			let userTokens = tokensByStaker[user];
			for (let i = 0; i < userTokens.length; i++ ) {
				let o = await cosmicSignature.ownerOf(userTokens[i]);
				expect(o).to.equal(user);
			}
		}
	})
	it("Bidding with CST works", async function () {
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();
		await cosmicGame.connect(addr3).bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await cosmicGame.connect(addr1).claimPrize();

		await ethers.provider.send("evm_increaseTime", [20000]);	// make CST bid price cheaper
		await ethers.provider.send("evm_mine");
		await cosmicGame.connect(addr1).bidWithCST("cst bid");

		let input = cosmicGame.interface.encodeFunctionData("currentCSTPrice", []);
		let message = await cosmicGame.provider.call({
			to: cosmicGame.address,
			data: input,
		});
		let res = cosmicGame.interface.decodeFunctionResult("currentCSTPrice", message);
		let priceBytes = res[0].slice(130, 194);
		let cstPrice = ethers.utils.defaultAbiCoder.decode(["uint256"], "0x" + priceBytes);
		expect(cstPrice.toString()).to.equal("200000000000000000000");

		let tx = await cosmicGame.connect(addr1).bidWithCST("cst bid");
		let receipt = await tx.wait();
		let topic_sig = cosmicGame.interface.getEventTopic("BidEvent");
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicGame.interface.parseLog(log);
		expect("199995400000000000000").to.equal(parsed_log.args.numCSTTokens.toString());
		expect(parsed_log.args.bidPrice.toNumber()).to.equal(-1);
		expect(parsed_log.args.lastBidder).to.equal(addr1.address);
		expect(parsed_log.args.message).to.equal("cst bid");
		
	});
	it("Distribution of prize amounts matches specified business logic", async function () {
		[owner, addr1, addr2,addr3, ...addrs] = await ethers.getSigners();
		const {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bidLogic,
		} = await basicDeploymentAdvanced("SpecialCosmicGame",owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,true);

		let donationAmount = ethers.utils.parseEther("1");
		await cosmicGame.donate({ value: donationAmount });
		let charityAddr = await cosmicGame.charity();
		
		await cosmicGame.mintCST(addr1.address,0);	// mint a token so we can stake
		await cosmicSignature.connect(addr1).setApprovalForAll(stakingWalletCST.address, true);
		await stakingWalletCST.connect(addr1).stake(0);	// stake a token so the deposits to staking wallet go to staking wallet , not to charity

		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();
		await cosmicGame.connect(addr3).bid(params, { value: bidPrice });

		// we are using BidderContract for this test because there won't be any subtraction
		// for paying gas price since it is accounted on the EOA that sends the TX,
		// and this will guarantee clean calculations
		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();

		bidPrice = await cosmicGame.getBidPrice();
		await cBidder.doBid({value: bidPrice});

		let mainPrizeAmount = await cosmicGame.prizeAmount();
		let charityAmount = await cosmicGame.charityAmount();
		let stakingAmount = await cosmicGame.stakingAmount();
		let balanceBefore = await ethers.provider.getBalance(cBidder.address);
		let balanceCharityBefore = await ethers.provider.getBalance(charityAddr);
		let balanceStakingBefore = await ethers.provider.getBalance(stakingWalletCST.address);
		let raffleAmount = await cosmicGame.raffleAmount();
		let numWinners = await cosmicGame.numRaffleETHWinnersBidding();
		let amountPerWinner = raffleAmount.div(numWinners);
		let modAmount = raffleAmount.mod(numWinners);
		raffleAmount = raffleAmount.sub(modAmount);	// clean the value from reminder if not divisible by numWinners
		prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await ethers.provider.send("evm_mine");
		let tx  = await cBidder.doClaim();
		let receipt = await tx.wait();
		let balanceAfter = await ethers.provider.getBalance(cBidder.address);
		let balanceCharityAfter = await ethers.provider.getBalance(charityAddr);
		let balanceStakingAfter = await ethers.provider.getBalance(stakingWalletCST.address);

		let topic_sig = cosmicGame.interface.getEventTopic("RaffleETHWinnerEvent");
		let deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		var unique_winners = [];
		var sumDeposits = ethers.BigNumber.from("0");
		for (let i = 0; i < deposit_logs.length; i++) {
			let wlog = cosmicGame.interface.parseLog(deposit_logs[i]);
			let winner = wlog.args.winner;
			sumDeposits = sumDeposits.add(wlog.args.amount);
			let winner_signer = cosmicGame.provider.getSigner(winner);
			if (typeof unique_winners[winner] === "undefined") {
				if (winner != cBidder.address) {
					await raffleWallet.connect(winner_signer).withdraw();
				}
				unique_winners[winner] = 1; 
			}
		}
		expect(sumDeposits).to.equal(raffleAmount);

		let expectedBalanceAfter = balanceBefore.add(mainPrizeAmount);
		expect(expectedBalanceAfter).to.equal(balanceAfter);
		let expectedBalanceCharityAfter = balanceCharityBefore.add(charityAmount);
		expect(expectedBalanceCharityAfter).to.equal(balanceCharityAfter);
		let expectedBalanceStakingAfter = balanceStakingBefore.add(stakingAmount);
		expect(expectedBalanceStakingAfter).to.equal(balanceStakingAfter);
	});
	it("Function bidderAddress() works as expected", async function () {
		[owner, addr1, addr2, addr3, addr4, addr5] = await ethers.getSigners();
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		 let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();
		await cosmicGame.connect(addr3).bid(params, { value: bidPrice });

		let input = cosmicGame.interface.encodeFunctionData("bidderAddress",[0,0]);
		let message = await cosmicGame.provider.call({
			to: cosmicGame.address,
			data: input,
		});
		let res = cosmicGame.interface.decodeFunctionResult("bidderAddress", message);
		expect(res[0]).to.equal(addr3.address);

		input = cosmicGame.interface.encodeFunctionData("bidderAddress",[0,1]);
		message = await cosmicGame.provider.call({
			to: cosmicGame.address,
			data: input,
		});
		res = cosmicGame.interface.decodeFunctionResult("bidderAddress", message);
		expect(res[0]).to.equal(addr2.address);

		input = cosmicGame.interface.encodeFunctionData("bidderAddress",[0,2]);
		message = await cosmicGame.provider.call({
			to: cosmicGame.address,
			data: input,
		});
		res = cosmicGame.interface.decodeFunctionResult("bidderAddress", message);
		expect(res[0]).to.equal(addr1.address);

		input = cosmicGame.interface.encodeFunctionData("bidderAddress",[1,2]);
		await expect(cosmicGame.callStatic.bidderAddress(1,2)).to.be.revertedWithCustomError(contractErrors,"InvalidBidderQueryRound");
		await expect(cosmicGame.callStatic.bidderAddress(0,3)).to.be.revertedWithCustomError(contractErrors,"InvalidBidderQueryOffset");
		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await cosmicGame.connect(addr3).claimPrize();
		await expect(cosmicGame.callStatic.bidderAddress(1,1)).to.be.revertedWithCustomError(contractErrors,"BidderQueryNoBidsYet");

		// lets check roundNum > 0 now
		
		bidPrice = await cosmicGame.getBidPrice();
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();
		await cosmicGame.connect(addr3).bid(params, { value: bidPrice });

		input = cosmicGame.interface.encodeFunctionData("bidderAddress",[1,0]);
		message = await cosmicGame.provider.call({
			to: cosmicGame.address,
			data: input,
		});
		res = cosmicGame.interface.decodeFunctionResult("bidderAddress", message);
		expect(res[0]).to.equal(addr3.address);

		input = cosmicGame.interface.encodeFunctionData("bidderAddress",[1,1]);
		message = await cosmicGame.provider.call({
			to: cosmicGame.address,
			data: input,
		});
		res = cosmicGame.interface.decodeFunctionResult("bidderAddress", message);
		expect(res[0]).to.equal(addr2.address);

		input = cosmicGame.interface.encodeFunctionData("bidderAddress",[1,2]);
		message = await cosmicGame.provider.call({
			to: cosmicGame.address,
			data: input,
		});
		res = cosmicGame.interface.decodeFunctionResult("bidderAddress", message);
		expect(res[0]).to.equal(addr1.address);
	});
	it("Bid statistics are generating correct values for giving complementary prizes", async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let donationAmount = ethers.utils.parseEther("9000");
		await cosmicGame.donate({ value: donationAmount });
		var bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGame.getBidPrice();
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGame.timeUntilPrize();
        await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
        await ethers.provider.send("evm_mine");
        await cosmicGame.connect(addr1).claimPrize();	// we need to claim prize because we want updated bidPrice (larger value)

		bidPrice = await cosmicGame.getBidPrice();
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		let maxBidderAddr = await cosmicGame.stellarSpender();
		let maxEthBidderAmount = await cosmicGame.stellarSpenderAmount();

		expect(maxBidderAddr).to.equal(addr1.address);
		expect(maxEthBidderAmount).to.equal(bidPrice);
	});
});
