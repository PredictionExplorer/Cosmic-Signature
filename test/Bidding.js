"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

const SKIP_LONG_TESTS = false;

describe("Bidding", function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
	// [ToDo-202410075-0]
	// Review all functions named like this and all calls to them.
	// The same applies to `basicDeployment`, `basicDeploymentAdvanced`.
	// Make sure something like `randomWalkNft` is not assigned to a variable named like `stakingWalletCosmicSignatureNft`.
	// Maybe move these functions to a single file and import it?
	// >>> Actually this probably works correct. But the order of variables still should be fixed.
	// [/ToDo-202410075-0]
	async function deployCosmicSignature(deployerAcct) {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
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
			marketingWallet,
			// cosmicSignatureGame,
		} = await basicDeployment(contractDeployerAcct, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
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
			marketingWallet,
			// cosmicSignatureGame,
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
	it("Should be possible to bid", async function () {
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, randomWalkNft, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, } =
			await loadFixture(deployCosmicSignature);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		// [ToDo-202411202-1]
		// This is a quick hack.
		// To be revisited.
		// [/ToDo-202411202-1]
		cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(0);

		const donationAmount = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount });
		expect(await cosmicSignatureGameProxy.mainPrizeAmount()).to.equal((donationAmount * 25n) / 100n);
		// todo-1 We now also have chrono-warrior.
		// let echamp = await cosmicSignatureGameProxy.tryGetCurrentEnduranceChampion();
		let echamp = await cosmicSignatureGameProxy.tryGetCurrentChampions();
		expect(echamp[0]).to.equal(hre.ethers.ZeroAddress);
		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: 1 })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "BidPrice");
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await expect(cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice - 1n })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "BidPrice");

		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.timeUntilPrize();
		expect(durationUntilMainPrize_).to.equal(0);

		const nanoSecondsExtra1 = await cosmicSignatureGameProxy.nanoSecondsExtra();

		// check that if we sent too much, we get our money back
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: (bidPrice + 1000n) }); // this works
		const contractBalance = await hre.ethers.provider.getBalance(cosmicSignatureGameProxy.getAddress());
		expect(contractBalance).to.equal(donationAmount + bidPrice);

		let spent = await cosmicSignatureGameProxy.getTotalSpentByBidder(addr1.address);
		expect(spent[0]).to.equal(bidPrice);

		// console.log((await hre.ethers.provider.getBlock("latest")).timestamp);
		await hre.ethers.provider.send("evm_increaseTime", [100]);
		// console.log((await hre.ethers.provider.getBlock("latest")).timestamp);
		await hre.ethers.provider.send("evm_mine");
		// console.log((await hre.ethers.provider.getBlock("latest")).timestamp);

		// todo-1 We now also have chrono-warrior.
		// echamp = await cosmicSignatureGameProxy.tryGetCurrentEnduranceChampion();
		echamp = await cosmicSignatureGameProxy.tryGetCurrentChampions();
		expect(echamp[0]).to.equal(addr1.address);

		// console.log((await hre.ethers.provider.getBlock("latest")).timestamp);
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.timeUntilPrize();
		expect(durationUntilMainPrize_).to.equal((24n * 60n * 60n) + (nanoSecondsExtra1 / 1000000000n) - 100n);

		const nanoSecondsExtra2 = await cosmicSignatureGameProxy.nanoSecondsExtra();
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });
		// console.log((await hre.ethers.provider.getBlock("latest")).timestamp);
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.timeUntilPrize();
		expect(durationUntilMainPrize_).to.equal((24n * 60n * 60n) + (nanoSecondsExtra1 / 1000000000n) - 100n + (nanoSecondsExtra2 / 1000000000n) - 1n);

		const nanoSecondsExtra3 = await cosmicSignatureGameProxy.nanoSecondsExtra();
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });
		// console.log((await hre.ethers.provider.getBlock("latest")).timestamp);
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.timeUntilPrize();
		expect(durationUntilMainPrize_).to.equal((24n * 60n * 60n) + (nanoSecondsExtra1 / 1000000000n) - 100n + (nanoSecondsExtra2 / 1000000000n) - 1n + (nanoSecondsExtra3 / 1000000000n) - 1n);
		await expect(cosmicSignatureGameProxy.connect(addr1).claimPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "EarlyClaim");

		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: bidPrice });
		await expect(cosmicSignatureGameProxy.connect(addr2).claimPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "EarlyClaim");
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number((durationUntilMainPrize_ - 100n))]);
		await hre.ethers.provider.send("evm_mine");
		await expect(cosmicSignatureGameProxy.connect(addr2).claimPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "EarlyClaim");

		await hre.ethers.provider.send("evm_increaseTime", [100]);
		await hre.ethers.provider.send("evm_mine");

		await expect(cosmicSignatureGameProxy.connect(addr1).claimPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "LastBidderOnly");

		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: bidPrice });
		await hre.ethers.provider.send("evm_increaseTime", [100]);
		await hre.ethers.provider.send("evm_mine");

		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ (-1), "", { value: bidPrice });
		await hre.ethers.provider.send("evm_increaseTime", [10]);
		await hre.ethers.provider.send("evm_mine");

		// todo-1 We now also have chrono-warrior.
		// echamp = await cosmicSignatureGameProxy.tryGetCurrentEnduranceChampion();
		echamp = await cosmicSignatureGameProxy.tryGetCurrentChampions();
		expect(echamp[0]).to.equal(addr2.address);

		durationUntilMainPrize_ = await cosmicSignatureGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) + 1]);
		await hre.ethers.provider.send("evm_mine");
		let mainPrizeAmount_ = await cosmicSignatureGameProxy.mainPrizeAmount();
		let charityAmount = await cosmicSignatureGameProxy.charityAmount();
		// let raffleAmount = await cosmicSignatureGameProxy.raffleAmount();
		await cosmicSignatureGameProxy.connect(addr3).claimPrize();
		let mainPrizeAmount2_ = await cosmicSignatureGameProxy.mainPrizeAmount();
		let balance = await hre.ethers.provider.getBalance(await cosmicSignatureGameProxy.getAddress());
		let mainPrizeExpectedAmount_ = (balance * 25n) / 100n;
		expect(mainPrizeAmount2_).to.equal(mainPrizeExpectedAmount_);
		let w = await cosmicSignatureGameProxy.tryGetRoundMainPrizeWinnerAddress(0);
		expect(w).to.equal(addr3.address);

		// after the prize has been claimed, let's bid again!

		await expect(cosmicSignatureGameProxy.connect(addr2).claimPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "NoLastBidder");

		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });
		await expect(cosmicSignatureGameProxy.connect(addr1).claimPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "EarlyClaim");

		durationUntilMainPrize_ = await cosmicSignatureGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		await hre.ethers.provider.send("evm_mine");

		mainPrizeAmount_ = await cosmicSignatureGameProxy.mainPrizeAmount();
		charityAmount = await cosmicSignatureGameProxy.charityAmount();
		await cosmicSignatureGameProxy.connect(addr1).claimPrize();
		mainPrizeAmount2_ = await cosmicSignatureGameProxy.mainPrizeAmount();
		balance = await hre.ethers.provider.getBalance(await cosmicSignatureGameProxy.getAddress());
		mainPrizeExpectedAmount_ = (balance * 25n) / 100n;
		expect(mainPrizeAmount2_).to.equal(mainPrizeExpectedAmount_);

		// 3 hours after the deadline, anyone should be able to claim the prize
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });
		expect(await cosmicSignatureGameProxy.getTotalBids()).to.equal(1);
		expect(await cosmicSignatureGameProxy.getBidderAddressAtPosition(0)).to.equal(addr1.address);
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		await hre.ethers.provider.send("evm_mine");

		await expect(cosmicSignatureGameProxy.connect(addr2).claimPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "LastBidderOnly");

		await hre.ethers.provider.send("evm_increaseTime", [3600 * 24]);
		await hre.ethers.provider.send("evm_mine");

		await cosmicSignatureGameProxy.connect(addr2).claimPrize();
		expect(await cosmicSignatureGameProxy.lastBidderAddress()).to.equal("0x0000000000000000000000000000000000000000");
	});
	it("Should be possible to bid with RandomWalk token", async function () {
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, randomWalkNft, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, } =
			await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
		let tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr1).mint({ value: tokenPrice }); // nftId=0

		// switch to another account and attempt to use nftId=0 which we don't own
		// let bidParams = { message: "hello", randomWalkNftId: 0 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await expect(cosmicSignatureGameProxy.connect(owner).bid(/*params*/ 0, "hello", { value: bidPrice })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "IncorrectERC721TokenOwner");
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ 0, "hello", { value: bidPrice });
		await hre.ethers.provider.send("evm_mine");
		tokenPrice = await randomWalkNft.getMintPrice();
		let tx = await randomWalkNft.connect(owner).mint({ value: tokenPrice });
		let receipt = await tx.wait();
		let topic_sig = randomWalkNft.interface.getEvent("MintEvent").topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = randomWalkNft.interface.parseLog(log);
		let token_id = parsed_log.args[0];
		// bidParams = { message: "", randomWalkNftId: token_id };
		// params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicSignatureGameProxy.connect(owner).bid(/*params*/ token_id, "", { value: 0 })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "BidPrice");
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(owner).bid(/*params*/ token_id, "", { value: bidPrice });
		// expect(await cosmicSignatureGameProxy.wasRandomWalkNftUsed(token_id)).to.equal(true);
		expect(await cosmicSignatureGameProxy.usedRandomWalkNfts(token_id)).to.equal(1);

		// try to bid again using the same nftId
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await expect(cosmicSignatureGameProxy.connect(owner).bid(/*params*/ token_id, "", { value: bidPrice })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "UsedRandomWalkNft");
	});
	it("Shouldn't be possible to bid if bidder doesn't accept refunds on oversized bid() calls", async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, randomWalkNft, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, } =
			await loadFixture(deployCosmicSignature);
		let donationAmount = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount });

		const BidderContract = await hre.ethers.getContractFactory("BidderContract");
		const cBidder = await BidderContract.deploy(await cosmicSignatureGameProxy.getAddress());
		await cBidder.waitForDeployment();

		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
		await expect(cBidder.doFailedBid({ value: donationAmount })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "FundTransferFailed");
	});
	it("Shouldn't be possible to bid using very long message", async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, randomWalkNft, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, } =
			await loadFixture(deployCosmicSignature);
		let donationAmount = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount });
		const longMsg = "a".repeat(280 + 1);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
		// let bidParams = { message: longMsg, randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await expect(cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), longMsg, { value: bidPrice })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "BidMessageLengthOverflow");
	});
	it("getCstAuctionDuration() method works", async function () {
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, randomWalkNft, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, } =
			await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();

		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });

		await cosmicSignatureGameProxy.connect(addr1).bidWithCst(10n ** 30n, "cst bid");

		const res = await cosmicSignatureGameProxy.getCstAuctionDuration();
		// const duration_ = res[1];
		const elapsedDuration_ = res[0];
		expect(elapsedDuration_).to.equal(0);
	});
	it("There is an execution path for all bidders being RWalk token bidders", async function () {
		async function mint_rwalk(a) {
			const tokenPrice = await randomWalkNft.getMintPrice();
			let tx = await randomWalkNft.connect(a).mint({ value: tokenPrice });
			let receipt = await tx.wait();
			let topic_sig = randomWalkNft.interface.getEvent("MintEvent").topicHash;
			let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
			let parsed_log = randomWalkNft.interface.parseLog(log);
			let token_id = parsed_log.args[0];
			return token_id;
		}

		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, randomWalkNft, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, } =
			await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2, addr3, addr4, addr5, addr6, ...addrs] = await hre.ethers.getSigners();
		let token_id = await mint_rwalk(addr1);
		// let bidParams = { message: "bidWithRWalk", randomWalkNftId: token_id };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ token_id, "bidWithRWalk", { value: bidPrice });
		token_id = await mint_rwalk(addr2);
		// bidParams = { message: "bidWithRWalk", randomWalkNftId: token_id };
		// params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ token_id, "bidWithRWalk", { value: bidPrice });
		token_id = await mint_rwalk(addr3);
		// bidParams = { message: "bidWithRWalk", randomWalkNftId: token_id };
		// params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ token_id, "bidWithRWalk", { value: bidPrice });
		token_id = await mint_rwalk(addr4);
		// bidParams = { message: "bidWithRWalk", randomWalkNftId: token_id };
		// params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr4).bid(/*params*/ token_id, "bidWithRWalk", { value: bidPrice });
		token_id = await mint_rwalk(addr5);
		// bidParams = { message: "bidWithRWalk", randomWalkNftId: token_id };
		// params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr5).bid(/*params*/ token_id, "bidWithRWalk", { value: bidPrice });

		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) + 1]);
		await hre.ethers.provider.send("evm_mine");
		// todo-1 Take a closer look at this. What if it reverts with a different error?
		await expect(cosmicSignatureGameProxy.connect(addr5).claimPrize()).not.to.be.revertedWith("panic code 0x12"); // divide by zero
	});
	it("After bid() , bid-related counters have correct values", async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, randomWalkNft, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, } =
			await loadFixture(deployCosmicSignature);
		
		let donationAmount = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount });
		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.bid(/*params*/ (-1), "", { value: bidPrice });
		// bidPrice = await cosmicSignatureGameProxy.getBidPrice();

		let aLen = await cosmicSignatureGameProxy.cstAuctionLength();
		await hre.ethers.provider.send('evm_increaseTime', [Number(aLen)]); // make CST price drop to 0
		await hre.ethers.provider.send('evm_mine');

		let tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.mint({ value: tokenPrice }); // nftId=0

		// bidParams = { message: "rwalk bid", randomWalkNftId: 0 };
		// params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.bid(/*params*/ 0, "rwalk bid", { value: bidPrice });

		// let lastBidType = await cosmicSignatureGameProxy.lastBidType();
		// expect(lastBidType).to.equal(1);

		await cosmicSignatureGameProxy.bidWithCst(10n ** 30n, "cst bid");

		// lastBidType = await cosmicSignatureGameProxy.lastBidType();
		// expect(lastBidType).to.equal(2);
	});
	it("Bidder is receiving correct refund amount when using larger bidPrice than required", async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, randomWalkNft, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, } =
			await loadFixture(deployCosmicSignature);
		let donationAmount = hre.ethers.parseEther("1");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount });
		let cosmicSignatureGameProxyAddr = await cosmicSignatureGameProxy.getAddress();

		// we are using BidderContract for this test because there won't be any subtraction
		// for paying gas price since it is accounted on the EOA that sends the TX,
		// and this will guarantee clean calculations
		const BidderContract = await hre.ethers.getContractFactory("BidderContract");
		const cBidder = await BidderContract.deploy(cosmicSignatureGameProxyAddr);
		await cBidder.waitForDeployment();
		// let balanceBefore = await hre.ethers.provider.getBalance(await cBidder.getAddress());
		let amountSent = hre.ethers.parseEther("2");
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cBidder.doBid2({ value: amountSent });
		let balanceAfter = await hre.ethers.provider.getBalance(await cBidder.getAddress());
		let expectedBalanceAfter = amountSent - bidPrice;
		expect(expectedBalanceAfter).to.equal(balanceAfter);
	});
	it("Bidder is receiving correct refund amount when using larger bidPrice than required using RandomWalk", async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, randomWalkNft, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, } =
			await loadFixture(deployCosmicSignature);
		let donationAmount = hre.ethers.parseEther("1");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount });
		let cosmicSignatureGameProxyAddr = await cosmicSignatureGameProxy.getAddress();

		// we are using BidderContract for this test because there won't be any subtraction
		// for paying gas price since it is accounted on the EOA that sends the TX,
		// and this will guarantee clean calculations
		const BidderContract = await hre.ethers.getContractFactory("BidderContract");
		const cBidder = await BidderContract.deploy(cosmicSignatureGameProxyAddr);
		await cBidder.waitForDeployment();
		// let balanceBefore = await hre.ethers.provider.getBalance(await cBidder.getAddress());
		let amountSent = hre.ethers.parseUnits("1",15);

		await randomWalkNft.setApprovalForAll(cosmicSignatureGameProxyAddr, true);
		await randomWalkNft.setApprovalForAll(await cBidder.getAddress(), true);

		let tokenPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.mint({ value: tokenPrice }); // nftId=0
		const bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cBidder.doBidRWalk2(0, { value: amountSent });
		let balanceAfter = await hre.ethers.provider.getBalance(await cBidder.getAddress());
		let discountedBidPrice = bidPrice / 2n;
		let expectedBalanceAfter = amountSent - discountedBidPrice;
		expect(expectedBalanceAfter).to.equal(balanceAfter);
	});
	it("Bidding a lot & staking a lot works correctly", async function () {
		const [owner, addr1, addr2, addr3, addr4, addr5] = await hre.ethers.getSigners();
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, randomWalkNft, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, } =
			await loadFixture(deployCosmicSignature);

		// ToDo-202411202-1 applies.
		cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(0);

		let donationAmount = hre.ethers.parseEther("100");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount });

		let durationUntilMainPrize_, bidPrice;
		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		for (let i = 0; i < 30; i++) {
			bidPrice = await cosmicSignatureGameProxy.getBidPrice();
			await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });
			bidPrice = await cosmicSignatureGameProxy.getBidPrice();
			await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: bidPrice });
			bidPrice = await cosmicSignatureGameProxy.getBidPrice();
			await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ (-1), "", { value: bidPrice });
			bidPrice = await cosmicSignatureGameProxy.getBidPrice();
			await cosmicSignatureGameProxy.connect(addr4).bid(/*params*/ (-1), "", { value: bidPrice });
			durationUntilMainPrize_ = await cosmicSignatureGameProxy.timeUntilPrize();
			await hre.ethers.provider.send('evm_increaseTime', [Number(durationUntilMainPrize_)]);
			await hre.ethers.provider.send('evm_mine');
			await cosmicSignatureGameProxy.connect(addr4).claimPrize();
		}
		let tx, receipt, log, parsed_log;
		let topic_sig = stakingWalletCosmicSignatureNft.interface.getEvent("NftStaked").topicHash;
		let ts = await cosmicSignatureNft.totalSupply();
		// let rn = await cosmicSignatureGameProxy.roundNum();
		const tokensByStaker = {};
		const stakeActionIds_ = [];
		for (let i = 0; i < Number(ts); i++) {
			let ownr = await cosmicSignatureNft.ownerOf(i);
			let owner_signer = await hre.ethers.getSigner(ownr);
			let userTokens = tokensByStaker[ownr];
			if (userTokens === undefined) {
				await cosmicSignatureNft.connect(owner_signer).setApprovalForAll(await stakingWalletCosmicSignatureNft.getAddress(), true);
				userTokens = [];
			}
			userTokens.push(i);
			tokensByStaker[ownr] = userTokens;
			tx = await stakingWalletCosmicSignatureNft.connect(owner_signer).stake(i);
			receipt = await tx.wait();
			log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
			parsed_log = stakingWalletCosmicSignatureNft.interface.parseLog(log);
			// console.log(log.args.stakeActionId);
			stakeActionIds_.push(log.args.stakeActionId);
		}
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ (-1), "", { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr4).bid(/*params*/ (-1), "", { value: bidPrice });
		durationUntilMainPrize_ = await cosmicSignatureGameProxy.timeUntilPrize();

		// We need another time increase to claim as `addr5` (it has no bids, won't get raffle NFTs).
		const durationUntilTimeoutTimeToClaimMainPrize_ = durationUntilMainPrize_ + await cosmicSignatureGameProxy.timeoutDurationToClaimMainPrize();

		await hre.ethers.provider.send('evm_increaseTime', [Number(durationUntilTimeoutTimeToClaimMainPrize_)]);
		await hre.ethers.provider.send('evm_mine');
		let totSupBefore = await cosmicSignatureNft.totalSupply();
		tx = await cosmicSignatureGameProxy.connect(addr5).claimPrize();
		receipt = await tx.wait();
		topic_sig = cosmicSignatureGameProxy.interface.getEvent('RaffleNftWinnerEvent').topicHash;
		let raffle_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);

		// all Raffle NFTs must have zero address because they are not staked, verify it
		for (let i = 0; i < raffle_logs.length; i++) {
			let rlog = cosmicSignatureGameProxy.interface.parseLog(raffle_logs[i]);
			// let winnerAddress_ = rlog.args.winnerAddress;
			// let ownr = await cosmicSignatureNft.ownerOf(rlog.args.nftId);
			// let stakerAddr = await stakingWalletCosmicSignatureNft.stakerByTokenId(rlog.args.nftId);
			// expect(stakerAddr).to.equal("0x0000000000000000000000000000000000000000");
			const nftWasUsed_ = await stakingWalletCosmicSignatureNft.wasNftUsed(rlog.args.nftId);
			// expect(nftWasUsed_).to.equal(false);
			expect(nftWasUsed_).to.equal(0n);
		}

		// all the remaining NFTs must have stakerByTokenId() equal to the addr who staked it
		// also check the correctness of lastActionId map
		ts = await cosmicSignatureNft.totalSupply();
		for (let i = 0; i < Number(ts); i++) {
			// let stakerAddr = await stakingWalletCosmicSignatureNft.stakerByTokenId(i);
			// if (stakerAddr == "0x0000000000000000000000000000000000000000") {
			const nftWasUsed_ = await stakingWalletCosmicSignatureNft.wasNftUsed(i);
			// if ( ! nftWasUsed_ ) {
			if (nftWasUsed_ == 0n) {
				let ownr = await cosmicSignatureNft.ownerOf(i);
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
			// todo-1 Why do we convert this to `Number`? Review all conversions like this.
			lastActionId = Number(lastActionId);
			// if (lastActionId < 0) {
			if (lastActionId <= 0) {
				throw 'Invalid action id ' + lastActionId;
			}
			// let stakeActionRecord = await stakingWalletCosmicSignatureNft.stakeActions(lastActionId);
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
			await stakingWalletCosmicSignatureNft.connect(owner_signer).unstake(stakeActionIds_[i], 1000);
		}

		// at this point, all tokens were unstaked

		// num_actions = await stakingWalletCosmicSignatureNft.numStakeActions();
		num_actions = await stakingWalletCosmicSignatureNft.numStakedNfts();
		expect(num_actions).to.equal(0);
		// for (let i = 0; i < Number(num_actions); i++) {
		// 	// let action_rec = await stakingWalletCosmicSignatureNft.stakeActions(i);
		// 	let action_rec = await stakingWalletCosmicSignatureNft.stakeActions(stakeActionIds_[i]);
		// 	action_rec = action_rec.toObject();
		// 	let ownr = action_rec.nftOwnerAddress;
		// 	let num_deposits = await stakingWalletCosmicSignatureNft.numEthDeposits();
		// 	let owner_signer = await hre.ethers.getSigner(ownr);
		// 	for (let j = 0; j < Number(num_deposits); j++) {
		// 		let deposit_rec = await stakingWalletCosmicSignatureNft.ethDeposits(j);
		// 		// await stakingWalletCosmicSignatureNft.connect(owner_signer).claimManyRewards([i], [j]);
		// 		await stakingWalletCosmicSignatureNft.connect(owner_signer).claimManyRewards([stakeActionIds_[i]], [j]);
		// 	}
		// }

		// // Comment-202409209 applies.
		// const contractBalance = await hre.ethers.provider.getBalance(await stakingWalletCosmicSignatureNft.getAddress());
		// const m = await stakingWalletCosmicSignatureNft.modulo();
		// expect(m).to.equal(contractBalance);

		// check that every staker has its own tokens back
		for (let user in tokensByStaker) {
			let userTokens = tokensByStaker[user];
			for (let i = 0; i < userTokens.length; i++) {
				let o = await cosmicSignatureNft.ownerOf(userTokens[i]);
				expect(o).to.equal(user);
			}
		}
	});
	it("Bidding with CST works", async function () {
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, randomWalkNft, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, } =
			await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();

		// ToDo-202411202-1 applies.
		cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(0);

		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ (-1), "", { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.timeUntilPrize();
		await hre.ethers.provider.send('evm_increaseTime', [Number(durationUntilMainPrize_)]);
		await cosmicSignatureGameProxy.connect(addr1).claimPrize();

		await hre.ethers.provider.send('evm_increaseTime', [20000]); // make CST bid price cheaper
		await hre.ethers.provider.send('evm_mine');
		let startingBidPriceCST_ = await cosmicSignatureGameProxy.startingBidPriceCST();
		expect(startingBidPriceCST_).to.equal(200n * (10n ** 18n));
		let lastCstBidTimeStamp_ = await cosmicSignatureGameProxy.lastCstBidTimeStamp();
		expect(lastCstBidTimeStamp_).to.equal(await cosmicSignatureGameProxy.activationTime());
		let latestBlockTimeStamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp);
		let cstDutchAuctionRemainingDuration_ = (12n * 60n * 60n) - (latestBlockTimeStamp_ - lastCstBidTimeStamp_);
		let cstBidExpectedPrice_ = startingBidPriceCST_ * cstDutchAuctionRemainingDuration_ / (12n * 60n * 60n);
		let cstBidPrice_ = await cosmicSignatureGameProxy.getCurrentBidPriceCST();
		expect(cstBidPrice_).to.equal(cstBidExpectedPrice_);
		-- cstDutchAuctionRemainingDuration_;
		cstBidExpectedPrice_ = startingBidPriceCST_ * cstDutchAuctionRemainingDuration_ / (12n * 60n * 60n);
		await cosmicSignatureGameProxy.connect(addr1).bidWithCst(cstBidExpectedPrice_, "cst bid");
		startingBidPriceCST_ = await cosmicSignatureGameProxy.startingBidPriceCST();
		expect(startingBidPriceCST_).to.equal(cstBidExpectedPrice_ * 2n);

		cstDutchAuctionRemainingDuration_ = (12n * 60n * 60n) - 1n;
		cstBidExpectedPrice_ = startingBidPriceCST_ * cstDutchAuctionRemainingDuration_ / (12n * 60n * 60n);
		let tx = await cosmicSignatureGameProxy.connect(addr1).bidWithCst(cstBidExpectedPrice_ * 10n, "cst bid");
		let receipt = await tx.wait();
		let topic_sig = cosmicSignatureGameProxy.interface.getEvent("BidEvent").topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicSignatureGameProxy.interface.parseLog(log);
		let args = parsed_log.args.toObject();
		expect(args.numCSTTokens).to.equal(cstBidExpectedPrice_);
		expect(args.bidPrice).to.equal(-1n);
		expect(args.lastBidderAddress).to.equal(addr1.address);
		expect(args.message).to.equal("cst bid");
	});
	it("Function bidderAddress() works as expected", async function () {
		const [owner, addr1, addr2, addr3, addr4, addr5] = await hre.ethers.getSigners();
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, randomWalkNft, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, } =
			await loadFixture(deployCosmicSignature);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		// ToDo-202411202-1 applies.
		cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(0);

		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ (-1), "", { value: bidPrice });

		let bAddr = await cosmicSignatureGameProxy.bidderAddress(0,0);
		expect(bAddr).to.equal(addr3.address);

		bAddr = await cosmicSignatureGameProxy.bidderAddress(0,1); 
		expect(bAddr).to.equal(addr2.address);

		bAddr = await cosmicSignatureGameProxy.bidderAddress(0,2); 
		expect(bAddr).to.equal(addr1.address);

		bAddr = await expect(cosmicSignatureGameProxy.bidderAddress(1,2)).to.be.revertedWithCustomError(
			cosmicSignatureGameErrorsFactory_,
			"InvalidBidderQueryRoundNum"
		);
		bAddr = await expect(cosmicSignatureGameProxy.bidderAddress(0,3)).to.be.revertedWithCustomError(
			cosmicSignatureGameErrorsFactory_,
			"InvalidBidderQueryOffset"
		);
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.timeUntilPrize();
		await hre.ethers.provider.send('evm_increaseTime', [Number(durationUntilMainPrize_)]);
		await cosmicSignatureGameProxy.connect(addr3).claimPrize();
		await expect(cosmicSignatureGameProxy.bidderAddress(1, 1)).to.be.revertedWithCustomError(
			cosmicSignatureGameErrorsFactory_,
			"BidderQueryNoBidsYet"
		);

		// lets check roundNum > 0 now

		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr3).bid(/*params*/ (-1), "", { value: bidPrice });

		bAddr = await cosmicSignatureGameProxy.bidderAddress(1,0);
		expect(bAddr).to.equal(addr3.address);

		bAddr = await cosmicSignatureGameProxy.bidderAddress(1,1);
		expect(bAddr).to.equal(addr2.address);

		bAddr = await cosmicSignatureGameProxy.bidderAddress(1,2);
		expect(bAddr).to.equal(addr1.address);
	});
	// todo-1 This test is now broken because I have replaced the stellar spender with the last CST bidder.
	it("Bid statistics are generating correct values and StellarSpender addr is assigned correctly", async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, randomWalkNft, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, } =
			await loadFixture(deployCosmicSignature);
		let spent,spentEth,spentCst,cstAuctionDuration_,auctionLength,tx,topic_sig,receipt,log,evt,bidPriceCst;
		cstAuctionDuration_ = await cosmicSignatureGameProxy.getCstAuctionDuration();
		auctionLength = cstAuctionDuration_[1];
		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });
		spent = await cosmicSignatureGameProxy.getTotalSpentByBidder(addr1.address);
		spentEth = spent[0];
		expect(spentEth).to.equal(bidPrice);
		await hre.ethers.provider.send('evm_increaseTime', [Number(auctionLength)-600]); // lower price to pay in CST
		await hre.ethers.provider.send('evm_mine');
		tx = await cosmicSignatureGameProxy.connect(addr1).bidWithCst(10n ** 30n, "");
		topic_sig = cosmicSignatureGameProxy.interface.getEvent("BidEvent").topicHash;
		receipt = await tx.wait();
		log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		evt = log.args.toObject();
		bidPriceCst = evt.numCSTTokens;
		spent = await cosmicSignatureGameProxy.getTotalSpentByBidder(addr1.address);
		spentCst = spent[1];
		expect(spentCst).to.equal(bidPriceCst);

		// check that CST and ETH are accumulated in statistics
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });
		let totalEthSpent = bidPrice + spentEth;
		spent = await cosmicSignatureGameProxy.getTotalSpentByBidder(addr1.address);
		spentEth = spent[0];
		expect(spentEth).to.equal(totalEthSpent);

		tx = await cosmicSignatureGameProxy.connect(addr1).bidWithCst(10n ** 30n, "");
		receipt = await tx.wait();
		log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		evt = log.args.toObject();
		bidPriceCst = evt.numCSTTokens;
		let totalSpentCst_ = bidPriceCst + spentCst;
		spent = await cosmicSignatureGameProxy.getTotalSpentByBidder(addr1.address);
		spentCst = spent[1];
		expect(spentCst).to.equal(totalSpentCst_);

		let maxBidderAddr = await cosmicSignatureGameProxy.stellarSpender();
		let maxCstBidderAmount_ = await cosmicSignatureGameProxy.stellarSpenderTotalSpentCst();

		spent = await cosmicSignatureGameProxy.getTotalSpentByBidder(addr1.address);
		expect(maxBidderAddr).to.equal(addr1.address);
	});
	it("It is not possible to bid with CST if balance is not enough", async function () {
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, randomWalkNft, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, } =
			await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();

		// Refactored due to Comment-202409181.
		const cosmicSignatureTokenFactory = await hre.ethers.getContractFactory('CosmicSignatureToken');
		// await expect(cosmicSignatureGameProxy.connect(addr1).bidWithCst(10n ** 30n, "cst bid")).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "InsufficientCSTBalance");
		await expect(cosmicSignatureGameProxy.connect(addr1).bidWithCst(10n ** 30n, "cst bid")).to.be.revertedWithCustomError(cosmicSignatureTokenFactory, "ERC20InsufficientBalance");
	});
	it("getBidderAddressAtPosition() reverts if invalid position index is provided", async function () {
		const [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, randomWalkNft, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, } =
			await loadFixture(deployCosmicSignature);
		
		let donationAmount = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount });
		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice });
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.connect(addr2).bid(/*params*/ (-1), "", { value: bidPrice });
		// bidPrice = await cosmicSignatureGameProxy.getBidPrice();

		expect(await cosmicSignatureGameProxy.getBidderAddressAtPosition(0)).to.equal(addr1.address);
		expect(await cosmicSignatureGameProxy.getBidderAddressAtPosition(1)).to.equal(addr2.address);
		await expect(cosmicSignatureGameProxy.getBidderAddressAtPosition(2)).to.be.revertedWith("Position out of bounds");
	});
	// todo-1 Are this and the next tests exactly the same? If so is it a bug or a feature?
	it("Shouldn't be possible to bid if minting of Cosmic Signature Tokens fails", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			randomWalkNft,
			stakingWallet,
			marketingWallet,
		// } = await basicDeploymentAdvanced("SpecialCosmicSignatureGame", owner, "", 1, addr1.address, true);
		} = await loadFixture(deployCosmicSignature);
		// const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		const activationTime_ = await cosmicSignatureGameProxy.activationTime();
		cosmicSignatureGameProxy.setActivationTime(activationTime_ + 60n);

		const BrokenToken = await hre.ethers.getContractFactory("BrokenERC20");
		let newToken= await BrokenToken.deploy(0);
		await newToken.waitForDeployment();
		// await cosmicSignatureGameProxy.setCosmicSignatureTokenRaw(await newToken.getAddress());
		await cosmicSignatureGameProxy.setTokenContract(await newToken.getAddress());

		cosmicSignatureGameProxy.setActivationTime(activationTime_);

		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		// See ToDo-202409245-0.
		// await expect(cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ERC20Mint");
		await expect(cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice })).to.be.revertedWith("Test mint() (ERC20) failed");
	});
	it("Shouldn't be possible to bid if minting of Cosmic Signature Tokens fails (second mint)", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			randomWalkNft,
			// todo-1 Everywhere, specify what kind of staking wallet is this.
			// todo-1 Search for reg-ex pattern, case insensitive: stakingWallet(?!CST|RWalk)
			stakingWallet,
			marketingWallet,
		// } = await basicDeploymentAdvanced("SpecialCosmicSignatureGame", owner, "", 1, addr1.address, true);
		} = await loadFixture(deployCosmicSignature);
		// const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		const activationTime_ = await cosmicSignatureGameProxy.activationTime();
		cosmicSignatureGameProxy.setActivationTime(activationTime_ + 60n);

		const BrokenToken = await hre.ethers.getContractFactory("BrokenERC20");
		let newToken= await BrokenToken.deploy(1);
		await newToken.waitForDeployment();
		// await cosmicSignatureGameProxy.setCosmicSignatureTokenRaw(await newToken.getAddress());
		await cosmicSignatureGameProxy.setTokenContract(await newToken.getAddress());

		cosmicSignatureGameProxy.setActivationTime(activationTime_);

		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		// See ToDo-202409245-0.
		// await expect(cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ERC20Mint");
		await expect(cosmicSignatureGameProxy.connect(addr1).bid(/*params*/ (-1), "", { value: bidPrice })).to.be.revertedWith("Test mint() (ERC20) failed");
	});
	it("Long term bidding with CST doesn't produce irregularities", async function () {
		if (SKIP_LONG_TESTS) return;
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, randomWalkNft, stakingWalletCosmicSignatureNft, stakingWalletRandomWalkNft, marketingWallet, } =
			await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2, addr3,addr4,addr5, ...addrs] = await hre.ethers.getSigners();
		let timeBump = 24*3600;
		let balance, cstBidPrice_;
		let numIterationsMain = 30;
		let numIterationsSecondary = 100000;
		// let bidParams = { message: "", randomWalkNftId: -1 };
		// let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cosmicSignatureGameProxy.bid(/*params*/ (-1), "", { value: bidPrice });
		for ( let i = 0; i < numIterationsMain; ++ i ) {
			// let b = await hre.ethers.provider.getBalance(owner.address);
			let j = 0;
			while (true) {
				balance = await cosmicSignatureToken.balanceOf(owner.address);
				cstBidPrice_ = await cosmicSignatureGameProxy.getCurrentBidPriceCST();
				bidPrice = await cosmicSignatureGameProxy.getBidPrice();
				await cosmicSignatureGameProxy.bid(/*params*/ (-1), "", { value: bidPrice });
				if (balance > cstBidPrice_) {
					break;
				}
				if (( ++ j ) >= numIterationsSecondary) {
					break;
				}
			}

			// Issue. What was this ugly error handling for? I have commented it out.
			// try {
				await cosmicSignatureGameProxy.bidWithCst(cstBidPrice_, "");
			// } catch (e) {
			// 	console.log(e);
			// 	let balanceEth = await hre.ethers.provider.getBalance(owner.address);
			// 	let tb = await cosmicSignatureToken.balanceOf(owner.address);
			// 	process.exit(1);
			// }

			await hre.ethers.provider.send("evm_increaseTime", [timeBump]);
			await hre.ethers.provider.send("evm_mine");
			let cstAuctionLength_ = await cosmicSignatureGameProxy.cstAuctionLength();
		}
	});
});
