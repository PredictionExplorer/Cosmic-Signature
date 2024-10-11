"use strict";

const hre = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { expect } = require("chai");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

const SKIP_LONG_TESTS = "0";

describe("Bidding tests", function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
	// [ToDo-202410075-0]
	// Review all functions named like this and all calls to them.
	// The same applies to `basicDeployment`, `basicDeploymentAdvanced`.
	// Make sure something like `randomWalkNFT` is not assigned to a variable named like `stakingWalletCST`.
	// Maybe move these functions to a single file and import it?
	// [/ToDo-202410075-0]
	async function deployCosmic(deployerAcct) {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			cosmicGame,
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,true);

		return {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			cosmicGame,
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
	it("Should be possible to bid", async function () {
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT, stakingWalletCST, stakingWalletRWalk, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");
		let donationAmount = hre.ethers.parseEther("10");
		await cosmicGameProxy.donate({ value: donationAmount });
		expect(await cosmicGameProxy.prizeAmount()).to.equal((donationAmount * 25n)/100n);
		let echamp = await cosmicGameProxy.currentEnduranceChampion();
		expect(echamp[0]).to.equal(hre.ethers.ZeroAddress);
		let bidParams = { msg: "", rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(addr1).bid(params, { value: 1 })).to.be.revertedWithCustomError(contractErrors,"BidPrice");
		let bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice - 1n })).to.be.revertedWithCustomError(contractErrors,"BidPrice");

		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		expect(prizeTime).to.equal(0);
		// check that if we sent too much, we get our money back
		bidParams = { msg: "", rwalk: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: (bidPrice+1000n) }); // this works
		const contractBalance = await hre.ethers.provider.getBalance(cosmicGameProxy.getAddress());
		expect(contractBalance).to.equal(donationAmount+bidPrice);

		let spent = await cosmicGameProxy.getTotalSpentByBidder(addr1.address);
		expect(spent[0]).to.equal(bidPrice);

		await hre.ethers.provider.send("evm_increaseTime",[100]);
		await hre.ethers.provider.send("evm_mine");
		echamp =await cosmicGameProxy.currentEnduranceChampion();
		expect(echamp[0]).to.equal(addr1.address);

		let nanoSecondsExtra = await cosmicGameProxy.nanoSecondsExtra();
		prizeTime = await cosmicGameProxy.timeUntilPrize();
		// todo-1 I've seen this line failing at least twice with an error saying something like "expecting 8999, but got 9000".
		// todo-1 But on further test runs the error hasn't reproduced.
		// todo-1 It's possible that a binary of an old version of the contract was executed,
		// todo-1 but this particular logic in the conract probably didn't change recently.
		expect(prizeTime).to.equal((nanoSecondsExtra/ 1000000000n)+(24n * 3600n)-100n);

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		prizeTime = await cosmicGameProxy.timeUntilPrize();
		expect(prizeTime).to.equal(
			((nanoSecondsExtra
				/1000000000n)
				*2n)
				+(24n * 3600n - 1n -100n),
		);

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		prizeTime = await cosmicGameProxy.timeUntilPrize();
		expect(prizeTime).to.equal(
			((nanoSecondsExtra
				/1000000000n)
				*3n)
				+(24n * 3600n - 2n -100n),
		); // not super clear why we are subtracting 2 here and 1 above
		await expect(cosmicGameProxy.connect(addr1).claimPrize()).to.be.revertedWithCustomError(contractErrors,"EarlyClaim");

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		await expect(cosmicGameProxy.connect(addr2).claimPrize()).to.be.revertedWithCustomError(contractErrors,"EarlyClaim");

		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number((prizeTime-100n))]);
		await hre.ethers.provider.send("evm_mine");
		await expect(cosmicGameProxy.connect(addr2).claimPrize()).to.be.revertedWithCustomError(contractErrors,"EarlyClaim");

		await hre.ethers.provider.send("evm_increaseTime", [100]);
		await hre.ethers.provider.send("evm_mine");

		await expect(cosmicGameProxy.connect(addr1).claimPrize()).to.be.revertedWithCustomError(contractErrors,"LastBidderOnly");

		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		await hre.ethers.provider.send("evm_increaseTime",[100]);
		await hre.ethers.provider.send("evm_mine");

		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });
		await hre.ethers.provider.send("evm_increaseTime",[10]);
		await hre.ethers.provider.send("evm_mine");

		echamp =await cosmicGameProxy.currentEnduranceChampion();
		expect(echamp[0]).to.equal(addr2.address);

		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime)+1]);
		await hre.ethers.provider.send("evm_mine");
		let prizeAmount = await cosmicGameProxy.prizeAmount();
		let charityAmount = await cosmicGameProxy.charityAmount();
		let raffleAmount = await cosmicGameProxy.raffleAmount();
		await cosmicGameProxy.connect(addr3).claimPrize();
		let prizeAmount2 = await cosmicGameProxy.prizeAmount();
		let balance = await hre.ethers.provider.getBalance(await cosmicGameProxy.getAddress());
		let expectedprizeAmount = (balance * 25n) / 100n;
		expect(prizeAmount2).to.equal(expectedprizeAmount);
		let w = await cosmicGameProxy.getWinnerByRound(0);
		expect(w).to.equal(addr3.address);

		// after the prize has been claimed, let's bid again!

		await expect(cosmicGameProxy.connect(addr2).claimPrize()).to.be.revertedWithCustomError(contractErrors,"NoLastBidder");

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		await expect(cosmicGameProxy.connect(addr1).claimPrize()).to.be.revertedWithCustomError(contractErrors,"EarlyClaim");

		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime)]);
		await hre.ethers.provider.send("evm_mine");

		prizeAmount = await cosmicGameProxy.prizeAmount();
		charityAmount = await cosmicGameProxy.charityAmount();
		await cosmicGameProxy.connect(addr1).claimPrize();
		prizeAmount2 = await cosmicGameProxy.prizeAmount();
		balance = await hre.ethers.provider.getBalance(await cosmicGameProxy.getAddress());
		const expectedPrizeAmount = (balance * 25n)/100n;
		expect(prizeAmount2).to.equal(expectedPrizeAmount);

		// 3 hours after the deadline, anyone should be able to claim the prize
		bidParams = { msg: "", rwalk: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		expect(await cosmicGameProxy.getTotalBids()).to.equal(1);
		expect(await cosmicGameProxy.getBidderAtPosition(0)).to.equal(addr1.address);
		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime)]);
		await hre.ethers.provider.send("evm_mine");

		await expect(cosmicGameProxy.connect(addr2).claimPrize()).to.be.revertedWithCustomError(contractErrors,"LastBidderOnly");

		await hre.ethers.provider.send("evm_increaseTime", [3600 * 24]);
		await hre.ethers.provider.send("evm_mine");

		await cosmicGameProxy.connect(addr2).claimPrize();
		expect(await cosmicGameProxy.lastBidder()).to.equal("0x0000000000000000000000000000000000000000");
	});
	it("Should be possible to bid with RandomWalk token", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT, stakingWalletCST, stakingWalletRWalk, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");
		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: tokenPrice }); // nftId=0

		let bidPrice = await cosmicGameProxy.getBidPrice();
		// switch to another account and attempt to use nftId=0 which we don't own
		let bidParams = { msg: "hello", rwalk: 0 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(owner).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(contractErrors,"IncorrectERC721TokenOwner");
		await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice })); //nftId=0
		await hre.ethers.provider.send("evm_mine");
		tokenPrice = await randomWalkNFT.getMintPrice();
		let tx = await randomWalkNFT.connect(owner).mint({ value: tokenPrice });
		let receipt = await tx.wait();
		let topic_sig = randomWalkNFT.interface.getEvent("MintEvent").topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = randomWalkNFT.interface.parseLog(log);
		let token_id = parsed_log.args[0];
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: Number(token_id) };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(owner).bid(params, { value: 0 })).to.be.revertedWithCustomError(contractErrors,"BidPrice");
		await cosmicGameProxy.connect(owner).bid(params, { value: bidPrice });
		expect(await cosmicGameProxy.isRandomWalkNFTUsed(token_id)).to.equal(true);

		// try to bid again using the same nftId
		bidPrice = await cosmicGameProxy.getBidPrice();
		await expect(cosmicGameProxy.connect(owner).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(contractErrors,"UsedRandomWalkNFT");
	});
	it("Shouldn't be possible to bid if bidder doesn't accept refunds on oversized bid() calls", async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT, stakingWalletCST, stakingWalletRWalk, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		let donationAmount = hre.ethers.parseEther("10");
		await cosmicGameProxy.donate({ value: donationAmount });

		const BidderContract = await hre.ethers.getContractFactory("BidderContract");
		const cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		await cBidder.waitForDeployment();

		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");
		await expect(cBidder.doFailedBid({ value: donationAmount })).to.be.revertedWithCustomError(contractErrors,"FundTransferFailed");
	});
	it("Shouldn't be possible to bid using very long message", async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT, stakingWalletCST, stakingWalletRWalk, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		let donationAmount = hre.ethers.parseEther("10");
		await cosmicGameProxy.donate({ value: donationAmount });
		let longMsg = "";
		for (let i = 0; i < 280 + 1; i++) {
			longMsg = longMsg + "a";
		}
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: longMsg, rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(contractErrors,"BidMessageLengthOverflow");
	});
	it("auctionDuration() method works", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT, stakingWalletCST, stakingWalletRWalk, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();

		let bidParams = { msg: "", rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		// // todo-0 Uncomment this when fixing ToDo-202409199-0.
		// bidPrice = await cosmicGameProxy.getBidPrice();
		// await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });

		await cosmicGameProxy.connect(addr1).bidWithCST("cst bid");

		const res = await cosmicGameProxy.auctionDuration();
		const duration = res[1];
		const secondsElapsed = res[0];
		expect(secondsElapsed).to.equal(0);
	});
	it("There is an execution path for all bidders being RWalk token bidders", async function () {
		async function mint_rwalk(a) {
			const tokenPrice = await randomWalkNFT.getMintPrice();
			let tx = await randomWalkNFT.connect(a).mint({ value: tokenPrice });
			let receipt = await tx.wait();
			let topic_sig = randomWalkNFT.interface.getEvent("MintEvent").topicHash;
			let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
			let parsed_log = randomWalkNFT.interface.parseLog(log);
			let token_id = parsed_log.args[0];
			return token_id;
		}

		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT, stakingWalletCST, stakingWalletRWalk, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3, addr4, addr5, addr6, ...addrs] = await hre.ethers.getSigners();
		let token_id = await mint_rwalk(addr1);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "bidWithRWLK", rwalk: token_id };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		token_id = await mint_rwalk(addr2);
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "bidWithRWLK", rwalk: Number(token_id) };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		token_id = await mint_rwalk(addr3);
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "bidWithRWLK", rwalk: Number(token_id) };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });
		token_id = await mint_rwalk(addr4);
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "bidWithRWLK", rwalk: Number(token_id) };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr4).bid(params, { value: bidPrice });
		token_id = await mint_rwalk(addr5);
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "bidWithRWLK", rwalk: Number(token_id) };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr5).bid(params, { value: bidPrice });

		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime)+1]);
		await hre.ethers.provider.send("evm_mine");
		await expect(cosmicGameProxy.connect(addr5).claimPrize()).not.to.be.revertedWith("panic code 0x12"); // divide by zero
	});
	it('After bid() , bid-related counters have correct values', async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT, stakingWalletCST, stakingWalletRWalk, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		
		let donationAmount = hre.ethers.parseEther('10');
		await cosmicGameProxy.donate({ value: donationAmount });
		let bidParams = { msg: '', rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();

		let aLen = await cosmicGameProxy.CSTAuctionLength();
		await hre.ethers.provider.send('evm_increaseTime', [Number(aLen)]); // make CST price drop to 0
		await hre.ethers.provider.send('evm_mine');

		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.mint({ value: tokenPrice }); // nftId=0

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: 'rwalk bid', rwalk: 0 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.bid(params, { value: bidPrice });

		let lastBidType = await cosmicGameProxy.lastBidType();
		expect(lastBidType).to.equal(1);

		await cosmicGameProxy.bidWithCST('cst bid');

		lastBidType = await cosmicGameProxy.lastBidType();
		expect(lastBidType).to.equal(2);
	});
	it('Bidder is receiving correct refund amount when using larger bidPrice than required', async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT, stakingWalletCST, stakingWalletRWalk, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		let donationAmount = hre.ethers.parseEther('1');
		await cosmicGameProxy.donate({ value: donationAmount });
		let cosmicGameAddr = await cosmicGameProxy.getAddress();

		// we are using BidderContract for this test because there won't be any subtraction
		// for paying gas price since it is accounted on the EOA that sends the TX,
		// and this will guarantee clean calculations
		const BidderContract = await hre.ethers.getContractFactory('BidderContract');
		const cBidder = await BidderContract.deploy(cosmicGameAddr);
		await cBidder.waitForDeployment();
		let balanceBefore = await hre.ethers.provider.getBalance(await cBidder.getAddress());
		let amountSent = hre.ethers.parseEther('2');
		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cBidder.doBid2({ value: amountSent });

		let balanceAfter = await hre.ethers.provider.getBalance(await cBidder.getAddress());
		let expectedBalanceAfter = amountSent - bidPrice;
		expect(expectedBalanceAfter).to.equal(balanceAfter);
	});
	it('Bidder is receiving correct refund amount when using larger bidPrice than required using RandomWalk', async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT, stakingWalletCST, stakingWalletRWalk, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		let donationAmount = hre.ethers.parseEther('1');
		await cosmicGameProxy.donate({ value: donationAmount });
		let cosmicGameAddr = await cosmicGameProxy.getAddress();

		// we are using BidderContract for this test because there won't be any subtraction
		// for paying gas price since it is accounted on the EOA that sends the TX,
		// and this will guarantee clean calculations
		const BidderContract = await hre.ethers.getContractFactory('BidderContract');
		const cBidder = await BidderContract.deploy(cosmicGameAddr);
		await cBidder.waitForDeployment();
		let balanceBefore = await hre.ethers.provider.getBalance(await cBidder.getAddress());
		let amountSent = hre.ethers.parseUnits('1',15);

		await randomWalkNFT.setApprovalForAll(cosmicGameAddr, true);
		await randomWalkNFT.setApprovalForAll(await cBidder.getAddress(), true);
		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.mint({ value: tokenPrice }); // nftId=0
		const bidPrice = await cosmicGameProxy.getBidPrice();
		await cBidder.doBidRWalk2(0, { value: amountSent });

		let balanceAfter = await hre.ethers.provider.getBalance(await cBidder.getAddress());
		let discountedBidPrice = Number(bidPrice)/2;
		let expectedBalanceAfter = Number(amountSent) - discountedBidPrice;
		expect(expectedBalanceAfter).to.equal(Number(balanceAfter));
	});
	it('Bidding a lot & staking a lot works correctly ', async function () {
		const [owner, addr1, addr2, addr3, addr4, addr5] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT, stakingWalletCST, stakingWalletRWalk, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		let donationAmount = hre.ethers.parseEther('100');
		await cosmicGameProxy.donate({ value: donationAmount });

		let bidParams, params, prizeTime, bidPrice;
		bidParams = { msg: '', rwalk: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		for (let i = 0; i < 30; i++) {
			bidPrice = await cosmicGameProxy.getBidPrice();
			await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
			bidPrice = await cosmicGameProxy.getBidPrice();
			await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
			bidPrice = await cosmicGameProxy.getBidPrice();
			await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });
			bidPrice = await cosmicGameProxy.getBidPrice();
			await cosmicGameProxy.connect(addr4).bid(params, { value: bidPrice });
			prizeTime = await cosmicGameProxy.timeUntilPrize();
			await hre.ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
			await hre.ethers.provider.send('evm_mine');
			await cosmicGameProxy.connect(addr4).claimPrize();
		}
		let tx, receipt, log, parsed_log;
		let topic_sig = stakingWalletCST.interface.getEvent('StakeActionOccurred').topicHash;
		let ts = await cosmicSignature.totalSupply();
		let rn = await cosmicGameProxy.roundNum();
		let tokensByStaker = {};
		const stakeActionIds_ = [];
		for (let i = 0; i < Number(ts); i++) {
			let ownr = await cosmicSignature.ownerOf(i);
			let userTokens = tokensByStaker[ownr];
			if (userTokens === undefined) {
				userTokens = [];
			}
			userTokens.push(i);
			tokensByStaker[ownr] = userTokens;
			let owner_signer = await hre.ethers.getSigner(ownr);
			await cosmicSignature.connect(owner_signer).setApprovalForAll(await stakingWalletCST.getAddress(), true);
			tx = await stakingWalletCST.connect(owner_signer).stake(i);
			receipt = await tx.wait();
			log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
			parsed_log = stakingWalletCST.interface.parseLog(log);
			// console.log(log.args.stakeActionId);
			stakeActionIds_.push(log.args.stakeActionId);
		}
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr4).bid(params, { value: bidPrice });
		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await hre.ethers.provider.send('evm_mine');
		prizeTime = await cosmicGameProxy.timeoutClaimPrize(); // we need another time increase to claim as addr5 (addr5 has no bids, won't get raffle NFTs)
		await hre.ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await hre.ethers.provider.send('evm_mine');
		let totSupBefore = await cosmicSignature.totalSupply();
		tx = await cosmicGameProxy.connect(addr5).claimPrize();
		receipt = await tx.wait();
		topic_sig = cosmicGameProxy.interface.getEvent('RaffleNFTWinnerEvent').topicHash;
		let raffle_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		// all Raffle NFTs must have zero address because they are not staked, verify it
		for (let i = 0; i < raffle_logs.length; i++) {
			let rlog = cosmicGameProxy.interface.parseLog(raffle_logs[i]);
			let winner = rlog.args.winner;
			let owner = await cosmicSignature.ownerOf(rlog.args.nftId);
			// let stakerAddr = await stakingWalletCST.stakerByTokenId(rlog.args.nftId);
			// expect(stakerAddr).to.equal('0x0000000000000000000000000000000000000000');
			const nftWasUsed_ = await stakingWalletCST.wasNftUsed(rlog.args.nftId);
			expect(nftWasUsed_).to.equal(false);
		}
		// all the remaining NFTs must have stakerByTokenId() equal to the addr who staked it
		// also check the correctness of lastActionId map
		ts = await cosmicSignature.totalSupply();
		for (let i = 0; i < Number(ts); i++) {
			// let stakerAddr = await stakingWalletCST.stakerByTokenId(i);
			// if (stakerAddr == '0x0000000000000000000000000000000000000000') {
			const nftWasUsed_ = await stakingWalletCST.wasNftUsed(i);
			if ( ! nftWasUsed_ ) {
				let ownr = await cosmicSignature.ownerOf(i);
				let userTokens = tokensByStaker[ownr];
				if (userTokens === undefined) {
					userTokens = [];
				}
				userTokens.push(i);
				tokensByStaker[ownr] = userTokens;
				if (i >= Number(totSupBefore)) {
					// this is new token, it is not staked yet
					continue;
				}
			}
			// let isStaked = await stakingWalletCST.isTokenStaked(i);
			// expect(isStaked).to.equal(true);
			// let lastActionId = await stakingWalletCST.lastActionIdByTokenId(i);
			let lastActionId = stakeActionIds_[i];
			lastActionId = Number(lastActionId);
			// if (lastActionId < 0) {
			if (lastActionId <= 0) {
				throw 'Invalid action id ' + lastActionId;
			}
			let stakeActionRecord = await stakingWalletCST.stakeActions(lastActionId);
			// expect(stakeActionRecord.nftOwnerAddress).to.equal(stakerAddr);
		}
		await hre.ethers.provider.send('evm_increaseTime', [3600 * 24 * 60]);
		await hre.ethers.provider.send('evm_mine');
		let num_actions;
		// num_actions = await stakingWalletCST.numStakeActions();
		num_actions = await stakingWalletCST.numNftsStaked();
		for (let i = 0; i < Number(num_actions); i++) {
			// let action_rec = await stakingWalletCST.stakeActions(i);
			let action_rec = await stakingWalletCST.stakeActions(stakeActionIds_[i]);
			action_rec = action_rec.toObject();
			let ownr = action_rec.nftOwnerAddress;
			let owner_signer = await hre.ethers.getSigner(ownr);
			await hre.ethers.provider.send('evm_increaseTime', [100]);
			// await stakingWalletCST.connect(owner_signer).unstake(i);
			await stakingWalletCST.connect(owner_signer).unstake(stakeActionIds_[i]);
		}
		// at this point, all tokens were unstaked
		// num_actions = await stakingWalletCST.numStakeActions();
		num_actions = await stakingWalletCST.numNftsStaked();
		expect(num_actions).to.equal(0);
		for (let i = 0; i < Number(num_actions); i++) {
			// let action_rec = await stakingWalletCST.stakeActions(i);
			let action_rec = await stakingWalletCST.stakeActions(stakeActionIds_[i]);
			action_rec = action_rec.toObject();
			let ownr = action_rec.nftOwnerAddress;
			let num_deposits = await stakingWalletCST.numEthDeposits();
			let owner_signer = await hre.ethers.getSigner(ownr);
			for (let j = 0; j < Number(num_deposits); j++) {
				let deposit_rec = await stakingWalletCST.ethDeposits(j);
				// // await stakingWalletCST.connect(owner_signer).claimManyRewards([i], [j]);
				// await stakingWalletCST.connect(owner_signer).claimManyRewards([stakeActionIds_[i]], [j]);
			}
		}

		// // Comment-202409209 applies.
		// const contractBalance = await hre.ethers.provider.getBalance(await stakingWalletCST.getAddress());
		// const m = await stakingWalletCST.modulo();
		// expect(m).to.equal(contractBalance);

		// check that every staker has its own tokens back
		for (let user in tokensByStaker) {
			let userTokens = tokensByStaker[user];
			for (let i = 0; i < userTokens.length; i++) {
				let o = await cosmicSignature.ownerOf(userTokens[i]);
				expect(o).to.equal(user);
			}
		}
	});
	it('Bidding with CST works', async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT, stakingWalletCST, stakingWalletRWalk, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: '', rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });
		// // todo-0 Uncomment this when fixing ToDo-202409199-0.
		// bidPrice = await cosmicGameProxy.getBidPrice();
		// await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await cosmicGameProxy.connect(addr1).claimPrize();

		await hre.ethers.provider.send('evm_increaseTime', [20000]); // make CST bid price cheaper
		await hre.ethers.provider.send('evm_mine');
		await cosmicGameProxy.connect(addr1).bidWithCST('cst bid');

		let cstPrice = await cosmicGameProxy.getCurrentBidPriceCST();
		expect(cstPrice.toString()).to.equal('200000000000000000000');
		// // todo-0 Replace the above with this when fixing ToDo-202409199-0.
		// expect(cstPrice.toString()).to.equal('214831600000000000000');

		let tx = await cosmicGameProxy.connect(addr1).bidWithCST('cst bid');
		let receipt = await tx.wait();
		let topic_sig = cosmicGameProxy.interface.getEvent('BidEvent').topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicGameProxy.interface.parseLog(log);
		let args = parsed_log.args.toObject();
		expect('199995400000000000000').to.equal(args.numCSTTokens.toString());
		// // todo-0 Replace the above with this when fixing ToDo-202409199-0.
		// expect(args.numCSTTokens.toString()).to.equal('214826658873200000000');
		expect(args.bidPrice.toString()).to.equal("-1");
		expect(args.lastBidder).to.equal(addr1.address);
		expect(args.message).to.equal('cst bid');
	});
	it('Function bidderAddress() works as expected', async function () {
		const [owner, addr1, addr2, addr3, addr4, addr5] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT, stakingWalletCST, stakingWalletRWalk, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		const contractErrors = await hre.ethers.getContractFactory('CosmicGameErrors');

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: '', rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });

		let bAddr = await cosmicGameProxy.bidderAddress(0,0);
		expect(bAddr).to.equal(addr3.address);

		bAddr = await cosmicGameProxy.bidderAddress(0,1); 
		expect(bAddr).to.equal(addr2.address);

		bAddr = await cosmicGameProxy.bidderAddress(0,2); 
		expect(bAddr).to.equal(addr1.address);

		bAddr = await expect(cosmicGameProxy.bidderAddress(1,2)).to.be.revertedWithCustomError(
			contractErrors,
			'InvalidBidderQueryRound'
		);
		bAddr = await expect(cosmicGameProxy.bidderAddress(0,3)).to.be.revertedWithCustomError(
			contractErrors,
			'InvalidBidderQueryOffset'
		);
		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await cosmicGameProxy.connect(addr3).claimPrize();
		await expect(cosmicGameProxy.bidderAddress(1, 1)).to.be.revertedWithCustomError(
			contractErrors,
			'BidderQueryNoBidsYet'
		);

		// lets check roundNum > 0 now

		bidPrice = await cosmicGameProxy.getBidPrice();
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });

		bAddr = await cosmicGameProxy.bidderAddress(1,0);
		expect(bAddr).to.equal(addr3.address);

		bAddr = await cosmicGameProxy.bidderAddress(1,1);
		expect(bAddr).to.equal(addr2.address);

		bAddr = await cosmicGameProxy.bidderAddress(1,2);
		expect(bAddr).to.equal(addr1.address);
	});
	it('Bid statistics are generating correct values and StellarSpender addr is assigned correctly', async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT, stakingWalletCST, stakingWalletRWalk, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		let spent,spentEth,spentCst,auctionDuration,auctionLength,cstPrice,tx,topic_sig,receipt,log,evt,bidPriceCst;
		auctionDuration = await cosmicGameProxy.auctionDuration();
		auctionLength = auctionDuration[1];
		let bidParams = { msg: '', rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		spent = await cosmicGameProxy.getTotalSpentByBidder(addr1.address);
		spentEth = spent[0];
		expect(spentEth).to.equal(bidPrice);
		await hre.ethers.provider.send('evm_increaseTime', [Number(auctionLength)-600]); // lower price to pay in CST
		await hre.ethers.provider.send('evm_mine');
		tx = await cosmicGameProxy.connect(addr1).bidWithCST("");
		topic_sig = cosmicGameProxy.interface.getEvent('BidEvent').topicHash;
		receipt = await tx.wait();
		log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		evt = log.args.toObject();
		bidPriceCst = evt.numCSTTokens;
		spent = await cosmicGameProxy.getTotalSpentByBidder(addr1.address);
		spentCst = spent[1];
		expect(spentCst).to.equal(bidPriceCst);

		// check that CST and ETH are accumulated in statistics
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		let totalEthSpent = bidPrice + spentEth;
		spent = await cosmicGameProxy.getTotalSpentByBidder(addr1.address);
		spentEth = spent[0];
		expect(spentEth).to.equal(totalEthSpent);

		tx = await cosmicGameProxy.connect(addr1).bidWithCST("");
		receipt = await tx.wait();
		log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		evt = log.args.toObject();
		bidPriceCst = evt.numCSTTokens;
		let totalSpentCst = bidPriceCst + spentCst;
		spent = await cosmicGameProxy.getTotalSpentByBidder(addr1.address);
		spentCst = spent[1];
		expect(spentCst).to.equal(totalSpentCst);

		let maxBidderAddr = await cosmicGameProxy.stellarSpender();
		let maxEthBidderAmount = await cosmicGameProxy.stellarSpenderAmount();

		spent = await cosmicGameProxy.getTotalSpentByBidder(addr1.address);
		expect(maxBidderAddr).to.equal(addr1.address);
	});
	it('It is not possible to bid with CST if balance is not enough', async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT, stakingWalletCST, stakingWalletRWalk, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();

		// Refactored due to Comment-202409181.
		const cosmicTokenFactory = await hre.ethers.getContractFactory('CosmicToken');
		// await expect(cosmicGameProxy.connect(addr1).bidWithCST('cst bid')).to.be.revertedWithCustomError(cosmicGameProxy, "InsufficientCSTBalance");
		await expect(cosmicGameProxy.connect(addr1).bidWithCST('cst bid')).to.be.revertedWithCustomError(cosmicTokenFactory, "ERC20InsufficientBalance");
	});
	it('getBidderAtPosition() reverts if invalid position index is provided', async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT, stakingWalletCST, stakingWalletRWalk, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		
		let donationAmount = hre.ethers.parseEther('10');
		await cosmicGameProxy.donate({ value: donationAmount });
		let bidParams = { msg: '', rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();

		expect(await cosmicGameProxy.getBidderAtPosition(0)).to.equal(addr1.address);
		expect(await cosmicGameProxy.getBidderAtPosition(1)).to.equal(addr2.address);
		await expect(cosmicGameProxy.getBidderAtPosition(2)).to.be.revertedWith("Position out of bounds");
	});
	it("Shouldn't be possible to bid if minting of cosmic tokens (ERC20) fails", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
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
		} = await basicDeploymentAdvanced("SpecialCosmicGame", owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true, true);
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");

		const BrokenToken = await hre.ethers.getContractFactory("BrokenERC20");
		let newToken= await BrokenToken.deploy(0);
		await newToken.waitForDeployment();
		await cosmicGameProxy.setTokenContractRaw(await newToken.getAddress());

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		// See ToDo-202409245-0.
		// await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(contractErrors, "ERC20Mint");
		await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice })).to.be.revertedWith("Test mint() (ERC20) failed");
	});
	it("Shouldn't be possible to bid if minting of cosmic tokens (ERC20) fails (second mint)", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			// todo-1 Everywhere, specify what kind of staking wallet is this.
			// todo-1 Search for reg-ex pattern, case insensitive: stakingWallet(?!CST|RWalk)
			stakingWallet,
			marketingWallet,
		} = await basicDeploymentAdvanced("SpecialCosmicGame", owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true, true);
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");

		const BrokenToken = await hre.ethers.getContractFactory("BrokenERC20");
		let newToken= await BrokenToken.deploy(1);
		await newToken.waitForDeployment();
		await cosmicGameProxy.setTokenContractRaw(await newToken.getAddress());

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		// See ToDo-202409245-0.
		// await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(contractErrors, "ERC20Mint");
		await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice })).to.be.revertedWith("Test mint() (ERC20) failed");
	});
	it("Long term bidding with CST doesn't produce irregularities", async function () {
		if (SKIP_LONG_TESTS == "1") return;
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT, stakingWalletCST, stakingWalletRWalk, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3,addr4,addr5, ...addrs] = await hre.ethers.getSigners();
		let timeBump = 24*3600;
		let balance,cstPrice;
		let numIterationsMain = 30;
		let numIterationsSecondary = 100000;
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.bid(params, { value: bidPrice });
	 	for (let i=0; i<numIterationsMain; i++) {
			let b = await hre.ethers.provider.getBalance(owner.address);
			let j=0;
			while (true) {
				bidPrice = await cosmicGameProxy.getBidPrice();
				balance = await cosmicToken.balanceOf(owner.address);
				cstPrice = await cosmicGameProxy.getCurrentBidPriceCST();
				await cosmicGameProxy.bid(params, { value: bidPrice });
				if (balance > cstPrice) {
					break;
				}
				j++;
				if (j>= numIterationsSecondary) {
					break;
				}
			}
			try {
				await cosmicGameProxy.bidWithCST("");
			} catch (e) {
				console.log(e);
				let balanceEth = await hre.ethers.provider.getBalance(owner.address);
				let tb = await cosmicToken.balanceOf(owner.address);
				process.exit(1);
			}
			await hre.ethers.provider.send("evm_increaseTime", [timeBump]);
			await hre.ethers.provider.send("evm_mine");
			let CSTAuctionLength = await cosmicGameProxy.CSTAuctionLength();
		}
	})
})
