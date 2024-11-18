"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

const SKIP_LONG_TESTS = "0";

describe("Bidding tests", function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
	// [ToDo-202410075-0]
	// Review all functions named like this and all calls to them.
	// The same applies to `basicDeployment`, `basicDeploymentAdvanced`.
	// Make sure something like `randomWalkNFT` is not assigned to a variable named like `stakingWalletCosmicSignatureNft`.
	// Maybe move these functions to a single file and import it?
	// >>> Actually this probably works correct. But the order of variables still should be fixed.
	// [/ToDo-202410075-0]
	async function deployCosmic(deployerAcct) {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNFT,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			cosmicGame,
		} = await basicDeployment(contractDeployerAcct, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		return {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNFT,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			cosmicGame,
		};
	}
	const bidParamsEncoding = {
		type: "tuple(string,int256)",
		name: "BidParams",
		components: [
			{ name: "message", type: "string" },
			{ name: "randomWalkNFTId", type: "int256" },
		],
	};
	it("Should be possible to bid", async function () {
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicGameErrors");

		// [ToDo-202411202-1]
		// This is a quick hack.
		// To be revisited.
		// [/ToDo-202411202-1]
		cosmicGameProxy.setDelayDurationBeforeNextRound(0);

		const donationAmount = hre.ethers.parseEther("10");
		await cosmicGameProxy.donate({ value: donationAmount });
		expect(await cosmicGameProxy.mainPrizeAmount()).to.equal((donationAmount * 25n) / 100n);
		// todo-1 We now also have chrono-warrior.
		let echamp = await cosmicGameProxy.currentEnduranceChampion();
		expect(echamp[0]).to.equal(hre.ethers.ZeroAddress);
		let bidParams = { message: "", randomWalkNFTId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(addr1).bid(params, { value: 1 })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "BidPrice");
		let bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { message: "", randomWalkNFTId: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice - 1n })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "BidPrice");

		let durationUntilMainPrize_ = await cosmicGameProxy.timeUntilPrize();
		expect(durationUntilMainPrize_).to.equal(0);

		const nanoSecondsExtra1 = await cosmicGameProxy.nanoSecondsExtra();

		// check that if we sent too much, we get our money back
		bidParams = { message: "", randomWalkNFTId: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: (bidPrice+1000n) }); // this works
		const contractBalance = await hre.ethers.provider.getBalance(cosmicGameProxy.getAddress());
		expect(contractBalance).to.equal(donationAmount+bidPrice);

		let spent = await cosmicGameProxy.getTotalSpentByBidder(addr1.address);
		expect(spent[0]).to.equal(bidPrice);

		// console.log((await hre.ethers.provider.getBlock("latest")).timestamp);
		await hre.ethers.provider.send("evm_increaseTime", [100]);
		// console.log((await hre.ethers.provider.getBlock("latest")).timestamp);
		await hre.ethers.provider.send("evm_mine");
		// console.log((await hre.ethers.provider.getBlock("latest")).timestamp);

		// todo-1 We now also have chrono-warrior.
		echamp = await cosmicGameProxy.currentEnduranceChampion();
		expect(echamp[0]).to.equal(addr1.address);

		// console.log((await hre.ethers.provider.getBlock("latest")).timestamp);
		durationUntilMainPrize_ = await cosmicGameProxy.timeUntilPrize();
		expect(durationUntilMainPrize_).to.equal((24n * 60n * 60n) + (nanoSecondsExtra1 / 1000000000n) - 100n);

		const nanoSecondsExtra2 = await cosmicGameProxy.nanoSecondsExtra();
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { message: "", randomWalkNFTId: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		// console.log((await hre.ethers.provider.getBlock("latest")).timestamp);
		durationUntilMainPrize_ = await cosmicGameProxy.timeUntilPrize();
		expect(durationUntilMainPrize_).to.equal((24n * 60n * 60n) + (nanoSecondsExtra1 / 1000000000n) - 100n + (nanoSecondsExtra2 / 1000000000n) - 1n);

		const nanoSecondsExtra3 = await cosmicGameProxy.nanoSecondsExtra();
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { message: "", randomWalkNFTId: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		// console.log((await hre.ethers.provider.getBlock("latest")).timestamp);
		durationUntilMainPrize_ = await cosmicGameProxy.timeUntilPrize();
		expect(durationUntilMainPrize_).to.equal((24n * 60n * 60n) + (nanoSecondsExtra1 / 1000000000n) - 100n + (nanoSecondsExtra2 / 1000000000n) - 1n + (nanoSecondsExtra3 / 1000000000n) - 1n);
		await expect(cosmicGameProxy.connect(addr1).claimPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "EarlyClaim");

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { message: "", randomWalkNFTId: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		await expect(cosmicGameProxy.connect(addr2).claimPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "EarlyClaim");
		durationUntilMainPrize_ = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number((durationUntilMainPrize_ - 100n))]);
		await hre.ethers.provider.send("evm_mine");
		await expect(cosmicGameProxy.connect(addr2).claimPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "EarlyClaim");

		await hre.ethers.provider.send("evm_increaseTime", [100]);
		await hre.ethers.provider.send("evm_mine");

		await expect(cosmicGameProxy.connect(addr1).claimPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "LastBidderOnly");

		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		await hre.ethers.provider.send("evm_increaseTime", [100]);
		await hre.ethers.provider.send("evm_mine");

		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });
		await hre.ethers.provider.send("evm_increaseTime", [10]);
		await hre.ethers.provider.send("evm_mine");

		// todo-1 We now also have chrono-warrior.
		echamp = await cosmicGameProxy.currentEnduranceChampion();
		expect(echamp[0]).to.equal(addr2.address);

		durationUntilMainPrize_ = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) + 1]);
		await hre.ethers.provider.send("evm_mine");
		let mainPrizeAmount_ = await cosmicGameProxy.mainPrizeAmount();
		let charityAmount = await cosmicGameProxy.charityAmount();
		// let raffleAmount = await cosmicGameProxy.raffleAmount();
		await cosmicGameProxy.connect(addr3).claimPrize();
		let mainPrizeAmount2_ = await cosmicGameProxy.mainPrizeAmount();
		let balance = await hre.ethers.provider.getBalance(await cosmicGameProxy.getAddress());
		let mainPrizeExpectedAmount_ = (balance * 25n) / 100n;
		expect(mainPrizeAmount2_).to.equal(mainPrizeExpectedAmount_);
		let w = await cosmicGameProxy.tryGetWinnerByRoundNum(0);
		expect(w).to.equal(addr3.address);

		// after the prize has been claimed, let's bid again!

		await expect(cosmicGameProxy.connect(addr2).claimPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "NoLastBidder");

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { message: "", randomWalkNFTId: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		await expect(cosmicGameProxy.connect(addr1).claimPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "EarlyClaim");

		durationUntilMainPrize_ = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		await hre.ethers.provider.send("evm_mine");

		mainPrizeAmount_ = await cosmicGameProxy.mainPrizeAmount();
		charityAmount = await cosmicGameProxy.charityAmount();
		await cosmicGameProxy.connect(addr1).claimPrize();
		mainPrizeAmount2_ = await cosmicGameProxy.mainPrizeAmount();
		balance = await hre.ethers.provider.getBalance(await cosmicGameProxy.getAddress());
		mainPrizeExpectedAmount_ = (balance * 25n)/100n;
		expect(mainPrizeAmount2_).to.equal(mainPrizeExpectedAmount_);

		// 3 hours after the deadline, anyone should be able to claim the prize
		bidParams = { message: "", randomWalkNFTId: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		expect(await cosmicGameProxy.getTotalBids()).to.equal(1);
		expect(await cosmicGameProxy.getBidderAtPosition(0)).to.equal(addr1.address);
		durationUntilMainPrize_ = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		await hre.ethers.provider.send("evm_mine");

		await expect(cosmicGameProxy.connect(addr2).claimPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "LastBidderOnly");

		await hre.ethers.provider.send("evm_increaseTime", [3600 * 24]);
		await hre.ethers.provider.send("evm_mine");

		await cosmicGameProxy.connect(addr2).claimPrize();
		expect(await cosmicGameProxy.lastBidder()).to.equal("0x0000000000000000000000000000000000000000");
	});
	it("Should be possible to bid with RandomWalk token", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicGameErrors");
		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: tokenPrice }); // nftId=0

		let bidPrice = await cosmicGameProxy.getBidPrice();
		// switch to another account and attempt to use nftId=0 which we don't own
		let bidParams = { message: "hello", randomWalkNFTId: 0 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(owner).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "IncorrectERC721TokenOwner");
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice }); //nftId=0
		await hre.ethers.provider.send("evm_mine");
		tokenPrice = await randomWalkNFT.getMintPrice();
		let tx = await randomWalkNFT.connect(owner).mint({ value: tokenPrice });
		let receipt = await tx.wait();
		let topic_sig = randomWalkNFT.interface.getEvent("MintEvent").topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = randomWalkNFT.interface.parseLog(log);
		let token_id = parsed_log.args[0];
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { message: "", randomWalkNFTId: Number(token_id) };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(owner).bid(params, { value: 0 })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "BidPrice");
		await cosmicGameProxy.connect(owner).bid(params, { value: bidPrice });
		expect(await cosmicGameProxy.isRandomWalkNFTUsed(token_id)).to.equal(true);

		// try to bid again using the same nftId
		bidPrice = await cosmicGameProxy.getBidPrice();
		await expect(cosmicGameProxy.connect(owner).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "UsedRandomWalkNFT");
	});
	it("Shouldn't be possible to bid if bidder doesn't accept refunds on oversized bid() calls", async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		let donationAmount = hre.ethers.parseEther("10");
		await cosmicGameProxy.donate({ value: donationAmount });

		const BidderContract = await hre.ethers.getContractFactory("BidderContract");
		const cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		await cBidder.waitForDeployment();

		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicGameErrors");
		await expect(cBidder.doFailedBid({ value: donationAmount })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "FundTransferFailed");
	});
	it("Shouldn't be possible to bid using very long message", async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		let donationAmount = hre.ethers.parseEther("10");
		await cosmicGameProxy.donate({ value: donationAmount });
		let longMsg = "";
		for (let i = 0; i < 280 + 1; i++) {
			longMsg = longMsg + "a";
		}
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicGameErrors");
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { message: longMsg, randomWalkNFTId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "BidMessageLengthOverflow");
	});
	it("getCstAuctionDuration() method works", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();

		let bidParams = { message: "", randomWalkNFTId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		// // todo-0 Uncomment this when fixing ToDo-202409199-0.
		// bidPrice = await cosmicGameProxy.getBidPrice();
		// await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });

		await cosmicGameProxy.connect(addr1).bidWithCst("cst bid");

		const res = await cosmicGameProxy.getCstAuctionDuration();
		const duration = res[1];
		const numSecondsElapsed_ = res[0];
		expect(numSecondsElapsed_).to.equal(0);
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

		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3, addr4, addr5, addr6, ...addrs] = await hre.ethers.getSigners();
		let token_id = await mint_rwalk(addr1);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { message: "bidWithRWLK", randomWalkNFTId: token_id };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		token_id = await mint_rwalk(addr2);
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { message: "bidWithRWLK", randomWalkNFTId: Number(token_id) };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		token_id = await mint_rwalk(addr3);
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { message: "bidWithRWLK", randomWalkNFTId: Number(token_id) };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });
		token_id = await mint_rwalk(addr4);
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { message: "bidWithRWLK", randomWalkNFTId: Number(token_id) };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr4).bid(params, { value: bidPrice });
		token_id = await mint_rwalk(addr5);
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { message: "bidWithRWLK", randomWalkNFTId: Number(token_id) };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr5).bid(params, { value: bidPrice });

		let durationUntilMainPrize_ = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) + 1]);
		await hre.ethers.provider.send("evm_mine");
		// todo-1 Take a closer look at this. What if it reverts with a different error?
		await expect(cosmicGameProxy.connect(addr5).claimPrize()).not.to.be.revertedWith("panic code 0x12"); // divide by zero
	});
	it('After bid() , bid-related counters have correct values', async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		
		let donationAmount = hre.ethers.parseEther('10');
		await cosmicGameProxy.donate({ value: donationAmount });
		let bidParams = { message: "", randomWalkNFTId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();

		let aLen = await cosmicGameProxy.cstAuctionLength();
		await hre.ethers.provider.send('evm_increaseTime', [Number(aLen)]); // make CST price drop to 0
		await hre.ethers.provider.send('evm_mine');

		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.mint({ value: tokenPrice }); // nftId=0

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { message: "rwalk bid", randomWalkNFTId: 0 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.bid(params, { value: bidPrice });

		let lastBidType = await cosmicGameProxy.lastBidType();
		expect(lastBidType).to.equal(1);

		await cosmicGameProxy.bidWithCst('cst bid');

		lastBidType = await cosmicGameProxy.lastBidType();
		expect(lastBidType).to.equal(2);
	});
	it('Bidder is receiving correct refund amount when using larger bidPrice than required', async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, cosmicGame, } =
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
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, cosmicGame, } =
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
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);

		// ToDo-202411202-1 applies.
		cosmicGameProxy.setDelayDurationBeforeNextRound(0);

		let donationAmount = hre.ethers.parseEther('100');
		await cosmicGameProxy.donate({ value: donationAmount });

		let bidParams, params, durationUntilMainPrize_, bidPrice;
		bidParams = { message: "", randomWalkNFTId: -1 };
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
			durationUntilMainPrize_ = await cosmicGameProxy.timeUntilPrize();
			await hre.ethers.provider.send('evm_increaseTime', [Number(durationUntilMainPrize_)]);
			await hre.ethers.provider.send('evm_mine');
			await cosmicGameProxy.connect(addr4).claimPrize();
		}
		let tx, receipt, log, parsed_log;
		let topic_sig = stakingWalletCosmicSignatureNft.interface.getEvent('NftStaked').topicHash;
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
			await cosmicSignature.connect(owner_signer).setApprovalForAll(await stakingWalletCosmicSignatureNft.getAddress(), true);
			tx = await stakingWalletCosmicSignatureNft.connect(owner_signer).stake(i);
			receipt = await tx.wait();
			log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
			parsed_log = stakingWalletCosmicSignatureNft.interface.parseLog(log);
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
		durationUntilMainPrize_ = await cosmicGameProxy.timeUntilPrize();

		// We need another time increase to claim as `addr5` (it has no bids, won't get raffle NFTs).
		const durationUntilTimeoutTimeToClaimMainPrize_ = durationUntilMainPrize_ + await cosmicGameProxy.timeoutDurationToClaimMainPrize();

		await hre.ethers.provider.send('evm_increaseTime', [Number(durationUntilTimeoutTimeToClaimMainPrize_)]);
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
			// let stakerAddr = await stakingWalletCosmicSignatureNft.stakerByTokenId(rlog.args.nftId);
			// expect(stakerAddr).to.equal('0x0000000000000000000000000000000000000000');
			const nftWasUsed_ = await stakingWalletCosmicSignatureNft.wasNftUsed(rlog.args.nftId);
			expect(nftWasUsed_).to.equal(false);
		}
		// all the remaining NFTs must have stakerByTokenId() equal to the addr who staked it
		// also check the correctness of lastActionId map
		ts = await cosmicSignature.totalSupply();
		for (let i = 0; i < Number(ts); i++) {
			// let stakerAddr = await stakingWalletCosmicSignatureNft.stakerByTokenId(i);
			// if (stakerAddr == '0x0000000000000000000000000000000000000000') {
			const nftWasUsed_ = await stakingWalletCosmicSignatureNft.wasNftUsed(i);
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
			// let isStaked = await stakingWalletCosmicSignatureNft.isTokenStaked(i);
			// expect(isStaked).to.equal(true);
			// let lastActionId = await stakingWalletCosmicSignatureNft.lastActionIdByTokenId(i);
			let lastActionId = stakeActionIds_[i];
			lastActionId = Number(lastActionId);
			// if (lastActionId < 0) {
			if (lastActionId <= 0) {
				throw 'Invalid action id ' + lastActionId;
			}
			let stakeActionRecord = await stakingWalletCosmicSignatureNft.stakeActions(lastActionId);
			// expect(stakeActionRecord.nftOwnerAddress).to.equal(stakerAddr);
		}
		await hre.ethers.provider.send('evm_increaseTime', [3600 * 24 * 60]);
		await hre.ethers.provider.send('evm_mine');
		let num_actions;
		// num_actions = await stakingWalletCosmicSignatureNft.numStakeActions();
		num_actions = await stakingWalletCosmicSignatureNft.numStakedNfts();
		for (let i = 0; i < Number(num_actions); i++) {
			// let action_rec = await stakingWalletCosmicSignatureNft.stakeActions(i);
			let action_rec = await stakingWalletCosmicSignatureNft.stakeActions(stakeActionIds_[i]);
			action_rec = action_rec.toObject();
			let ownr = action_rec.nftOwnerAddress;
			let owner_signer = await hre.ethers.getSigner(ownr);
			await hre.ethers.provider.send('evm_increaseTime', [100]);
			// await stakingWalletCosmicSignatureNft.connect(owner_signer).unstake(i);
			await stakingWalletCosmicSignatureNft.connect(owner_signer).unstake(stakeActionIds_[i]);
		}
		// at this point, all tokens were unstaked
		// num_actions = await stakingWalletCosmicSignatureNft.numStakeActions();
		num_actions = await stakingWalletCosmicSignatureNft.numStakedNfts();
		expect(num_actions).to.equal(0);
		for (let i = 0; i < Number(num_actions); i++) {
			// let action_rec = await stakingWalletCosmicSignatureNft.stakeActions(i);
			let action_rec = await stakingWalletCosmicSignatureNft.stakeActions(stakeActionIds_[i]);
			action_rec = action_rec.toObject();
			let ownr = action_rec.nftOwnerAddress;
			let num_deposits = await stakingWalletCosmicSignatureNft.numEthDeposits();
			let owner_signer = await hre.ethers.getSigner(ownr);
			for (let j = 0; j < Number(num_deposits); j++) {
				let deposit_rec = await stakingWalletCosmicSignatureNft.ethDeposits(j);
				// // await stakingWalletCosmicSignatureNft.connect(owner_signer).claimManyRewards([i], [j]);
				// await stakingWalletCosmicSignatureNft.connect(owner_signer).claimManyRewards([stakeActionIds_[i]], [j]);
			}
		}

		// // Comment-202409209 applies.
		// const contractBalance = await hre.ethers.provider.getBalance(await stakingWalletCosmicSignatureNft.getAddress());
		// const m = await stakingWalletCosmicSignatureNft.modulo();
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
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();

		// ToDo-202411202-1 applies.
		cosmicGameProxy.setDelayDurationBeforeNextRound(0);

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { message: "", randomWalkNFTId: -1 };
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
		let durationUntilMainPrize_ = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send('evm_increaseTime', [Number(durationUntilMainPrize_)]);
		await cosmicGameProxy.connect(addr1).claimPrize();

		await hre.ethers.provider.send('evm_increaseTime', [20000]); // make CST bid price cheaper
		await hre.ethers.provider.send('evm_mine');
		await cosmicGameProxy.connect(addr1).bidWithCst('cst bid');

		let cstPrice = await cosmicGameProxy.getCurrentBidPriceCST();
		expect(cstPrice.toString()).to.equal('200000000000000000000');
		// // todo-0 Replace the above with this when fixing ToDo-202409199-0.
		// expect(cstPrice.toString()).to.equal('214831600000000000000');

		let tx = await cosmicGameProxy.connect(addr1).bidWithCst('cst bid');
		let receipt = await tx.wait();
		let topic_sig = cosmicGameProxy.interface.getEvent('BidEvent').topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicGameProxy.interface.parseLog(log);
		let args = parsed_log.args.toObject();
		expect(args.numCSTTokens.toString()).to.equal("199995400000000000000");
		// // todo-0 Replace the above with this when fixing ToDo-202409199-0.
		// expect(args.numCSTTokens.toString()).to.equal('214826658873200000000');
		expect(args.bidPrice.toString()).to.equal("-1");
		expect(args.lastBidder).to.equal(addr1.address);
		expect(args.message).to.equal('cst bid');
	});
	it('Function bidderAddress() works as expected', async function () {
		const [owner, addr1, addr2, addr3, addr4, addr5] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicGameErrors");

		// ToDo-202411202-1 applies.
		cosmicGameProxy.setDelayDurationBeforeNextRound(0);

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { message: "", randomWalkNFTId: -1 };
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
			cosmicSignatureGameErrorsFactory_,
			"InvalidBidderQueryRoundNum"
		);
		bAddr = await expect(cosmicGameProxy.bidderAddress(0,3)).to.be.revertedWithCustomError(
			cosmicSignatureGameErrorsFactory_,
			"InvalidBidderQueryOffset"
		);
		let durationUntilMainPrize_ = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send('evm_increaseTime', [Number(durationUntilMainPrize_)]);
		await cosmicGameProxy.connect(addr3).claimPrize();
		await expect(cosmicGameProxy.bidderAddress(1, 1)).to.be.revertedWithCustomError(
			cosmicSignatureGameErrorsFactory_,
			"BidderQueryNoBidsYet"
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
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		let spent,spentEth,spentCst,cstAuctionDuration_,auctionLength,cstPrice,tx,topic_sig,receipt,log,evt,bidPriceCst;
		cstAuctionDuration_ = await cosmicGameProxy.getCstAuctionDuration();
		auctionLength = cstAuctionDuration_[1];
		let bidParams = { message: "", randomWalkNFTId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		spent = await cosmicGameProxy.getTotalSpentByBidder(addr1.address);
		spentEth = spent[0];
		expect(spentEth).to.equal(bidPrice);
		await hre.ethers.provider.send('evm_increaseTime', [Number(auctionLength)-600]); // lower price to pay in CST
		await hre.ethers.provider.send('evm_mine');
		tx = await cosmicGameProxy.connect(addr1).bidWithCst("");
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

		tx = await cosmicGameProxy.connect(addr1).bidWithCst("");
		receipt = await tx.wait();
		log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		evt = log.args.toObject();
		bidPriceCst = evt.numCSTTokens;
		let totalSpentCst_ = bidPriceCst + spentCst;
		spent = await cosmicGameProxy.getTotalSpentByBidder(addr1.address);
		spentCst = spent[1];
		expect(spentCst).to.equal(totalSpentCst_);

		let maxBidderAddr = await cosmicGameProxy.stellarSpender();
		let maxCstBidderAmount_ = await cosmicGameProxy.stellarSpenderTotalSpentCst();

		spent = await cosmicGameProxy.getTotalSpentByBidder(addr1.address);
		expect(maxBidderAddr).to.equal(addr1.address);
	});
	it('It is not possible to bid with CST if balance is not enough', async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();

		// Refactored due to Comment-202409181.
		const cosmicTokenFactory = await hre.ethers.getContractFactory('CosmicToken');
		// await expect(cosmicGameProxy.connect(addr1).bidWithCst('cst bid')).to.be.revertedWithCustomError(cosmicGameProxy, "InsufficientCSTBalance");
		await expect(cosmicGameProxy.connect(addr1).bidWithCst('cst bid')).to.be.revertedWithCustomError(cosmicTokenFactory, "ERC20InsufficientBalance");
	});
	it('getBidderAtPosition() reverts if invalid position index is provided', async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		
		let donationAmount = hre.ethers.parseEther('10');
		await cosmicGameProxy.donate({ value: donationAmount });
		let bidParams = { message: "", randomWalkNFTId: -1 };
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
	// todo-1 Are this and the next tests exactly the same? If so is it a bug or a feature?
	it("Shouldn't be possible to bid if minting of cosmic tokens (ERC20) fails", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet,
		// } = await basicDeploymentAdvanced("SpecialCosmicGame", owner, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		} = await loadFixture(deployCosmic);
		// const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicGameErrors");

		const activationTime_ = await cosmicGameProxy.activationTime();
		cosmicGameProxy.setActivationTime(activationTime_ + 60n);

		const BrokenToken = await hre.ethers.getContractFactory("BrokenERC20");
		let newToken= await BrokenToken.deploy(0);
		await newToken.waitForDeployment();
		// await cosmicGameProxy.setTokenContractRaw(await newToken.getAddress());
		await cosmicGameProxy.setTokenContract(await newToken.getAddress());

		cosmicGameProxy.setActivationTime(activationTime_);

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { message: "", randomWalkNFTId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		// See ToDo-202409245-0.
		// await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ERC20Mint");
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
			prizesWallet,
			randomWalkNFT,
			// todo-1 Everywhere, specify what kind of staking wallet is this.
			// todo-1 Search for reg-ex pattern, case insensitive: stakingWallet(?!CST|RWalk)
			stakingWallet,
			marketingWallet,
		// } = await basicDeploymentAdvanced("SpecialCosmicGame", owner, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		} = await loadFixture(deployCosmic);
		// const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicGameErrors");

		const activationTime_ = await cosmicGameProxy.activationTime();
		cosmicGameProxy.setActivationTime(activationTime_ + 60n);

		const BrokenToken = await hre.ethers.getContractFactory("BrokenERC20");
		let newToken= await BrokenToken.deploy(1);
		await newToken.waitForDeployment();
		// await cosmicGameProxy.setTokenContractRaw(await newToken.getAddress());
		await cosmicGameProxy.setTokenContract(await newToken.getAddress());

		cosmicGameProxy.setActivationTime(activationTime_);

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { message: "", randomWalkNFTId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		// See ToDo-202409245-0.
		// await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ERC20Mint");
		await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice })).to.be.revertedWith("Test mint() (ERC20) failed");
	});
	it("Long term bidding with CST doesn't produce irregularities", async function () {
		if (SKIP_LONG_TESTS == "1") return;
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, prizesWallet, randomWalkNFT, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, cosmicGame, } =
			await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3,addr4,addr5, ...addrs] = await hre.ethers.getSigners();
		let timeBump = 24*3600;
		let balance,cstPrice;
		let numIterationsMain = 30;
		let numIterationsSecondary = 100000;
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { message: "", randomWalkNFTId: -1 };
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
				await cosmicGameProxy.bidWithCst("");
			} catch (e) {
				console.log(e);
				let balanceEth = await hre.ethers.provider.getBalance(owner.address);
				let tb = await cosmicToken.balanceOf(owner.address);
				process.exit(1);
			}
			await hre.ethers.provider.send("evm_increaseTime", [timeBump]);
			await hre.ethers.provider.send("evm_mine");
			let cstAuctionLength_ = await cosmicGameProxy.cstAuctionLength();
		}
	});
});
