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
			stakingWallet,
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

		let numETHBids = await cosmicGame.numETHBids();
		expect(numETHBids).to.equal(1);
		let numCSTBids = await cosmicGame.numCSTBids();
		expect(numCSTBids).to.equal(0);
		let lastBidType = await cosmicGame.lastBidType();
		expect(lastBidType).to.equal(0);

		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.mint({ value: tokenPrice }); // tokenId=0

		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "rwalk bid", rwalk: 0 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.bid(params, { value: bidPrice });

		numETHBids = await cosmicGame.numETHBids();
		expect(numETHBids).to.equal(1);
		numCSTBids = await cosmicGame.numCSTBids();
		expect(numCSTBids).to.equal(0);
		lastBidType = await cosmicGame.lastBidType();
		expect(lastBidType).to.equal(1);

		await cosmicGame.bidWithCST("cst bid");

		numETHBids = await cosmicGame.numETHBids();
		expect(numETHBids).to.equal(1);
		numCSTBids = await cosmicGame.numCSTBids();
		expect(numCSTBids).to.equal(1);
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
	it("Bidding a lot ", async function () {
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
		let topic_sig = stakingWallet.interface.getEventTopic("StakeActionEvent");
		let max_ts = 0;
		let ts = await cosmicSignature.totalSupply();
		let rn = await cosmicGame.roundNum();
		for (let i =0; i<ts.toNumber(); i++) {
		    let ownr = await cosmicSignature.ownerOf(i)
		    let owner_signer = cosmicGame.provider.getSigner(ownr);
		    await cosmicSignature.connect(owner_signer).setApprovalForAll(stakingWallet.address, true);
		    tx = await stakingWallet.connect(owner_signer).stake(i);
		    receipt = await tx.wait();
		    log = receipt.logs.find(x=>x.topics.indexOf(topic_sig)>=0);
		    parsed_log = stakingWallet.interface.parseLog(log);
		    if (max_ts < parsed_log.args.unstakeTime.toNumber()) {
		        max_ts = parsed_log.args.unstakeTime.toNumber();
		    }   
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
		tx = await cosmicGame.connect(addr5).claimPrize();
		receipt = await tx.wait();
		topic_sig = cosmicGame.interface.getEventTopic("RaffleNFTWinnerEvent");
		let raffle_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		// all Raffle NFTs must belong to stakers, and we will verify this is true
		for (let i=0; i<raffle_logs.length; i++) {
			let rlog = cosmicGame.interface.parseLog(raffle_logs[i]);
			let winner = rlog.args.winner;
			let owner = await cosmicSignature.ownerOf(rlog.args.tokenId);
			let isStaker = await stakingWallet.isStaker(owner);
			if (!isStaker) {
				if (owner != addr5.address) {
					throw new Error("not all Raffle NFT winners are stakers");
				}
			}
		}
	})
});
