const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");
const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { expect } = require("chai");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");
const SKIP_LONG_TESTS = '1';

describe("Bidding tests", function () {
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
	it("Should be possible to bid", async function () {
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");
		let donationAmount = ethers.parseEther("10");
		await cosmicGameProxy.donate({ value: donationAmount });
		expect(await cosmicGameProxy.prizeAmount()).to.equal((donationAmount * 25n)/100n);
		let echamp = await cosmicGameProxy.currentEnduranceChampion();
		expect(echamp[0]).to.equal(ethers.ZeroAddress);
		var bidParams = { msg: "", rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(addr1).bid(params, { value: 1 })).to.be.revertedWithCustomError(contractErrors,"BidPrice");
		let bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice - 1n })).to.be.revertedWithCustomError(contractErrors,"BidPrice");

		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		expect(prizeTime).to.equal(0);
		// check that if we sent too much, we get our money back
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: (bidPrice+1000n) }); // this works
		const contractBalance = await ethers.provider.getBalance(cosmicGameProxy.getAddress());
		expect(contractBalance).to.equal(donationAmount+bidPrice);
		expect(await cosmicGameProxy.getTotalSpentByBidder(addr1.address)).to.equal(bidPrice);

		await ethers.provider.send("evm_increaseTime",[100]);
		await ethers.provider.send("evm_mine");
		echamp =await cosmicGameProxy.currentEnduranceChampion();
		expect(echamp[0]).to.equal(addr1.address);

		let nanoSecondsExtra = await cosmicGameProxy.nanoSecondsExtra();
		prizeTime = await cosmicGameProxy.timeUntilPrize();
		expect(prizeTime).to.equal((nanoSecondsExtra/ 1000000000n)+(24n * 3600n)-100n);

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
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
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
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
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		await expect(cosmicGameProxy.connect(addr2).claimPrize()).to.be.revertedWithCustomError(contractErrors,"EarlyClaim");

		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [Number((prizeTime-100n))]);
		await ethers.provider.send("evm_mine");
		await expect(cosmicGameProxy.connect(addr2).claimPrize()).to.be.revertedWithCustomError(contractErrors,"EarlyClaim");

		await ethers.provider.send("evm_increaseTime", [100]);
		await ethers.provider.send("evm_mine");

		await expect(cosmicGameProxy.connect(addr1).claimPrize()).to.be.revertedWithCustomError(contractErrors,"LastBidderOnly");

		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		await ethers.provider.send("evm_increaseTime",[100]);
		await ethers.provider.send("evm_mine");

		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });
		await ethers.provider.send("evm_increaseTime",[10]);
		await ethers.provider.send("evm_mine");

		echamp =await cosmicGameProxy.currentEnduranceChampion();
		expect(echamp[0]).to.equal(addr2.address);

		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [Number(prizeTime)+1]);
		await ethers.provider.send("evm_mine");
		let prizeAmount = await cosmicGameProxy.prizeAmount();
		let charityAmount = await cosmicGameProxy.charityAmount();
		let raffleAmount = await cosmicGameProxy.raffleAmount();
		await cosmicGameProxy.connect(addr3).claimPrize();
		let prizeAmount2 = await cosmicGameProxy.prizeAmount();
		let balance = await ethers.provider.getBalance(await cosmicGameProxy.getAddress());
		let expectedprizeAmount = (balance * 25n) / 100n;
		expect(prizeAmount2).to.equal(expectedprizeAmount);
		let w = await cosmicGameProxy.getWinnerByRound(0);
		expect(w).to.equal(addr3.address);

		// after the prize has been claimed, let's bid again!

		await expect(cosmicGameProxy.connect(addr2).claimPrize()).to.be.revertedWithCustomError(contractErrors,"NoLastBidder");

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		await expect(cosmicGameProxy.connect(addr1).claimPrize()).to.be.revertedWithCustomError(contractErrors,"EarlyClaim");

		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [Number(prizeTime)]);
		await ethers.provider.send("evm_mine");

		prizeAmount = await cosmicGameProxy.prizeAmount();
		charityAmount = await cosmicGameProxy.charityAmount();
		await cosmicGameProxy.connect(addr1).claimPrize();
		prizeAmount2 = await cosmicGameProxy.prizeAmount();
		balance = await ethers.provider.getBalance(await cosmicGameProxy.getAddress());
		expectedPrizeAmount = (balance * 25n)/100n;
		expect(prizeAmount2).to.equal(expectedPrizeAmount);

		// 3 hours after the deadline, anyone should be able to claim the prize
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		expect(await cosmicGameProxy.getTotalBids()).to.equal(1);
		expect(await cosmicGameProxy.getBidderAtPosition(0)).to.equal(addr1.address);
		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [Number(prizeTime)]);
		await ethers.provider.send("evm_mine");

		await expect(cosmicGameProxy.connect(addr2).claimPrize()).to.be.revertedWithCustomError(contractErrors,"LastBidderOnly");

		await ethers.provider.send("evm_increaseTime", [3600 * 24]);
		await ethers.provider.send("evm_mine");

		await cosmicGameProxy.connect(addr2).claimPrize();
		expect(await cosmicGameProxy.lastBidder()).to.equal("0x0000000000000000000000000000000000000000");
	});
	it("Should be possible to bid with RandomWalk token", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");
		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: tokenPrice }); // tokenId=0

		let bidPrice = await cosmicGameProxy.getBidPrice();
		// switch to another account and attempt to use tokenId=0 which we don't own
		var bidParams = { msg: "hello", rwalk: 0 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(owner).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(contractErrors,"IncorrectERC721TokenOwner");
		await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice })); //tokenId=0
		await ethers.provider.send("evm_mine");
		tokenPrice = await randomWalkNFT.getMintPrice();
		let tx = await randomWalkNFT.connect(owner).mint({ value: tokenPrice });
		let receipt = await tx.wait();
		let topic_sig = randomWalkNFT.interface.getEvent("MintEvent").topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = randomWalkNFT.interface.parseLog(log);
		let token_id = parsed_log.args[0];
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: Number(token_id) };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(owner).bid(params, { value: 0 })).to.be.revertedWithCustomError(contractErrors,"BidPrice");
		await cosmicGameProxy.connect(owner).bid(params, { value: bidPrice });
		expect(await cosmicGameProxy.isRandomWalkNFTUsed(token_id)).to.equal(true);

		// try to mint again using the same tokenId
		bidPrice = await cosmicGameProxy.getBidPrice();
		await expect(cosmicGameProxy.connect(owner).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(contractErrors,"UsedRandomWalkNFT");
	});
	it("Shouldn't be possible to bid if bidder doesn't accept refunds on oversized bid() calls", async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let donationAmount = ethers.parseEther("10");
		await cosmicGameProxy.donate({ value: donationAmount });

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		await cBidder.waitForDeployment();

		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");
		await expect(cBidder.doFailedBid({ value: donationAmount })).to.be.revertedWithCustomError(contractErrors,"FundTransferFailed");
	});
	it("Shouldn't be possible to bid using very long message", async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let donationAmount = ethers.parseEther("10");
		await cosmicGameProxy.donate({ value: donationAmount });
		let longMsg = "";
		for (let i = 0; i < 280 + 1; i++) {
			longMsg = longMsg + "a";
		}
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");
		let bidPrice = await cosmicGameProxy.getBidPrice();
		var bidParams = { msg: longMsg, rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(contractErrors,"BidMessageLengthOverflow");
	});
	it("auctionDuration() method works", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		// // todo-0 Uncomment this when fixing ToDo-202409199-0.
		// bidPrice = await cosmicGameProxy.getBidPrice();
		// await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });

		await cosmicGameProxy.connect(addr1).bidWithCST("cst bid");

		res = await cosmicGameProxy.auctionDuration();
		duration = res[1];
		secondsElapsed = res[0];
		expect(secondsElapsed).to.equal(0);
	});
	it("There is an execution path for all bidders being RWalk token bidders", async function () {
		async function mint_rwalk(a) {
			tokenPrice = await randomWalkNFT.getMintPrice();
			let tx = await randomWalkNFT.connect(a).mint({ value: tokenPrice });
			let receipt = await tx.wait();
			let topic_sig = randomWalkNFT.interface.getEvent("MintEvent").topicHash;
			let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
			let parsed_log = randomWalkNFT.interface.parseLog(log);
			let token_id = parsed_log.args[0];
			return token_id;
		}

		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3, addr4, addr5, addr6, ...addrs] = await ethers.getSigners();
		let token_id = await mint_rwalk(addr1);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "bidWithRWLK", rwalk: token_id };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		token_id = await mint_rwalk(addr2);
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "bidWithRWLK", rwalk: Number(token_id) };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		token_id = await mint_rwalk(addr3);
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "bidWithRWLK", rwalk: Number(token_id) };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });
		token_id = await mint_rwalk(addr4);
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "bidWithRWLK", rwalk: Number(token_id) };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr4).bid(params, { value: bidPrice });
		token_id = await mint_rwalk(addr5);
		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "bidWithRWLK", rwalk: Number(token_id) };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr5).bid(params, { value: bidPrice });

		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [Number(prizeTime)+1]);
		await ethers.provider.send("evm_mine");
		await expect(cosmicGameProxy.connect(addr5).claimPrize()).not.to.be.revertedWith("panic code 0x12"); // divide by zero
	});
	it('After bid() , bid-related counters have correct values', async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT, stakingWalletCST, stakingWalletRWalk,marketingWallet,cosmicGame} =
			await loadFixture(deployCosmic);
		
		let donationAmount = ethers.parseEther('10');
		await cosmicGameProxy.donate({ value: donationAmount });
		var bidParams = { msg: '', rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();

		let aLen = await cosmicGameProxy.CSTAuctionLength();
		await ethers.provider.send('evm_increaseTime', [Number(aLen)]); // make CST price drop to 0
		await ethers.provider.send('evm_mine');

		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.mint({ value: tokenPrice }); // tokenId=0

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: 'rwalk bid', rwalk: 0 };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.bid(params, { value: bidPrice });

		lastBidType = await cosmicGameProxy.lastBidType();
		expect(lastBidType).to.equal(1);

		await cosmicGameProxy.bidWithCST('cst bid');

		lastBidType = await cosmicGameProxy.lastBidType();
		expect(lastBidType).to.equal(2);
	});
	it('Bidder is receiving correct refund amount when using larger bidPrice than required', async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let donationAmount = ethers.parseEther('1');
		await cosmicGameProxy.donate({ value: donationAmount });
		let cosmicGameAddr = await cosmicGameProxy.getAddress();

		// we are using BidderContract for this test because there won't be any subtraction
		// for paying gas price since it is accounted on the EOA that sends the TX,
		// and this will guarantee clean calculations
		const BidderContract = await ethers.getContractFactory('BidderContract');
		let cBidder = await BidderContract.deploy(cosmicGameAddr);
		await cBidder.waitForDeployment();
		let balanceBefore = await ethers.provider.getBalance(await cBidder.getAddress());
		let amountSent = ethers.parseEther('2');
		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cBidder.doBid2({ value: amountSent });

		let balanceAfter = await ethers.provider.getBalance(await cBidder.getAddress());
		let expectedBalanceAfter = amountSent - bidPrice;
		expect(expectedBalanceAfter).to.equal(balanceAfter);
	});
	it('Bidder is receiving correct refund amount when using larger bidPrice than required using RandomWalk', async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let donationAmount = ethers.parseEther('1');
		await cosmicGameProxy.donate({ value: donationAmount });
		let cosmicGameAddr = await cosmicGameProxy.getAddress();

		// we are using BidderContract for this test because there won't be any subtraction
		// for paying gas price since it is accounted on the EOA that sends the TX,
		// and this will guarantee clean calculations
		const BidderContract = await ethers.getContractFactory('BidderContract');
		let cBidder = await BidderContract.deploy(cosmicGameAddr);
		await cBidder.waitForDeployment();
		let balanceBefore = await ethers.provider.getBalance(await cBidder.getAddress());
		let amountSent = ethers.parseUnits('1',15);

		await randomWalkNFT.setApprovalForAll(cosmicGameAddr, true);
		await randomWalkNFT.setApprovalForAll(await cBidder.getAddress(), true);
		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.mint({ value: tokenPrice }); // tokenId=0
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cBidder.doBidRWalk2(0, { value: amountSent });

		let balanceAfter = await ethers.provider.getBalance(await cBidder.getAddress());
		let discountedBidPrice = Number(bidPrice)/2;
		let expectedBalanceAfter = Number(amountSent) - discountedBidPrice;
		expect(expectedBalanceAfter).to.equal(Number(balanceAfter));
	});
	it('Bidding a lot & staking a lot works correctly ', async function () {
		[owner, addr1, addr2, addr3, addr4, addr5] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let donationAmount = ethers.parseEther('100');
		await cosmicGameProxy.donate({ value: donationAmount });

		let bidParams, params, prizeTime;
		bidParams = { msg: '', rwalk: -1 };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
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
			await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
			await ethers.provider.send('evm_mine');
			await cosmicGameProxy.connect(addr4).claimPrize();
		}
		let tx, receipt, log, parsed_log;
		let topic_sig = stakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		let ts = await cosmicSignature.totalSupply();
		let rn = await cosmicGameProxy.roundNum();
		let tokensByStaker = {};
		for (let i = 0; i < Number(ts); i++) {
			let ownr = await cosmicSignature.ownerOf(i);
			let userTokens = tokensByStaker[ownr];
			if (userTokens === undefined) {
				userTokens = [];
			}
			userTokens.push(i);
			tokensByStaker[ownr] = userTokens;
			let owner_signer = await ethers.getSigner(ownr);
			await cosmicSignature.connect(owner_signer).setApprovalForAll(await stakingWalletCST.getAddress(), true);
			tx = await stakingWalletCST.connect(owner_signer).stake(i);
			receipt = await tx.wait();
			log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
			parsed_log = stakingWalletCST.interface.parseLog(log);
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
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await ethers.provider.send('evm_mine');
		prizeTime = await cosmicGameProxy.timeoutClaimPrize(); // we need another time increase to claim as addr5 (addr5 has no bids, won't get raffle NFTs)
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await ethers.provider.send('evm_mine');
		let totSupBefore = await cosmicSignature.totalSupply();
		tx = await cosmicGameProxy.connect(addr5).claimPrize();
		receipt = await tx.wait();
		topic_sig = cosmicGameProxy.interface.getEvent('RaffleNFTWinnerEvent').topicHash;
		let raffle_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		// all Raffle NFTs must have zero address because they are not staked, verify it
		for (let i = 0; i < raffle_logs.length; i++) {
			let rlog = cosmicGameProxy.interface.parseLog(raffle_logs[i]);
			let winner = rlog.args.winner;
			let owner = await cosmicSignature.ownerOf(rlog.args.tokenId);
			let stakerAddr = await stakingWalletCST.stakerByTokenId(rlog.args.tokenId);
			expect(stakerAddr).to.equal('0x0000000000000000000000000000000000000000');
		}
		// all the remaining NFTs must have stakerByTokenId() equal to the addr who staked it
		// also check the correctness of lastActionId map
		ts = await cosmicSignature.totalSupply();
		for (let i = 0; i < Number(ts); i++) {
			let stakerAddr = await stakingWalletCST.stakerByTokenId(i);
			if (stakerAddr == '0x0000000000000000000000000000000000000000') {
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
			let isStaked = await stakingWalletCST.isTokenStaked(i);
			expect(isStaked).to.equal(true);
			let lastActionId = await stakingWalletCST.lastActionIdByTokenId(i);
			lastActionId = Number(lastActionId);
			if (lastActionId < 0) {
				throw 'Invalid action id' + lastActionId;
			}
			let stakeActionRecord = await stakingWalletCST.stakeActions(lastActionId);
			expect(stakeActionRecord.nftOwner).to.equal(stakerAddr);
		}
		await ethers.provider.send('evm_increaseTime', [3600 * 24 * 60]);
		await ethers.provider.send('evm_mine');
		let num_actions;
		num_actions = await stakingWalletCST.numStakeActions();
		for (let i = 0; i < Number(num_actions); i++) {
			let action_rec = await stakingWalletCST.stakeActions(i);
			action_rec = action_rec.toObject();
			let ownr = action_rec.nftOwner;
			let owner_signer = await ethers.getSigner(ownr);
			await ethers.provider.send('evm_increaseTime', [100]);
			await stakingWalletCST.connect(owner_signer).unstake(i);
		}
		// at this point, all tokens were unstaked
		num_actions = await stakingWalletCST.numStakeActions();
		for (let i = 0; i < Number(num_actions); i++) {
			let action_rec = await stakingWalletCST.stakeActions(i);
			action_rec = action_rec.toObject();
			let ownr = action_rec.nftOwner;
			let num_deposits = await stakingWalletCST.numETHDeposits();
			let owner_signer = await ethers.getSigner(ownr);
			for (let j = 0; j < Number(num_deposits); j++) {
				let deposit_rec = await stakingWalletCST.ETHDeposits(j);
				await stakingWalletCST.connect(owner_signer).claimManyRewards([i], [j]);
			}
		}
		let contractBalance = await ethers.provider.getBalance(await stakingWalletCST.getAddress());
		let m = await stakingWalletCST.modulo();
		expect(m).to.equal(contractBalance);

		// check that every staker has its own tokens back
		for (user in tokensByStaker) {
			let userTokens = tokensByStaker[user];
			for (let i = 0; i < userTokens.length; i++) {
				let o = await cosmicSignature.ownerOf(userTokens[i]);
				expect(o).to.equal(user);
			}
		}
	});
	it('Bidding with CST works', async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: '', rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
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
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await cosmicGameProxy.connect(addr1).claimPrize();

		await ethers.provider.send('evm_increaseTime', [20000]); // make CST bid price cheaper
		await ethers.provider.send('evm_mine');
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
		[owner, addr1, addr2, addr3, addr4, addr5] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: '', rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
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
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await cosmicGameProxy.connect(addr3).claimPrize();
		await expect(cosmicGameProxy.bidderAddress(1, 1)).to.be.revertedWithCustomError(
			contractErrors,
			'BidderQueryNoBidsYet'
		);

		// lets check roundNum > 0 now

		bidPrice = await cosmicGameProxy.getBidPrice();
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
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
	it('Bid statistics are generating correct values for giving complementary prizes', async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let donationAmount = ethers.parseEther('9000');
		await cosmicGameProxy.donate({ value: donationAmount });
		var bidParams = { msg: '', rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await ethers.provider.send('evm_mine');
		await cosmicGameProxy.connect(addr1).claimPrize(); // we need to claim prize because we want updated bidPrice (larger value)

		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		let maxBidderAddr = await cosmicGameProxy.stellarSpender();
		let maxEthBidderAmount = await cosmicGameProxy.stellarSpenderAmount();

		expect(maxBidderAddr).to.equal(addr1.address);
		expect(maxEthBidderAmount).to.equal(bidPrice);
	});
	it('It is not possible to bid with CST if balance is not enough', async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
		await expect(cosmicGameProxy.connect(addr1).bidWithCST('cst bid')).to.be.revertedWithCustomError(cosmicGameProxy,"InsufficientCSTBalance");
	});
	it('getBidderAtPosition() reverts if invalid position index is provided', async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT, stakingWalletCST, stakingWalletRWalk,marketingWallet,cosmicGame} =
			await loadFixture(deployCosmic);
		
		let donationAmount = ethers.parseEther('10');
		await cosmicGameProxy.donate({ value: donationAmount });
		var bidParams = { msg: '', rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
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
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		} = await basicDeploymentAdvanced("SpecialCosmicGame",owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,true);
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		const BrokenToken = await ethers.getContractFactory("BrokenERC20");
		let newToken= await BrokenToken.deploy(0);
		await newToken.waitForDeployment();
		await cosmicGameProxy.setTokenContractRaw(await newToken.getAddress());

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(contractErrors,"ERC20Mint");
	});
	it("Shouldn't be possible to bid if minting of cosmic tokens (ERC20) fails (second mint)", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		} = await basicDeploymentAdvanced("SpecialCosmicGame",owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,true);
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		const BrokenToken = await ethers.getContractFactory("BrokenERC20");
		let newToken= await BrokenToken.deploy(1);
		await newToken.waitForDeployment();
		await cosmicGameProxy.setTokenContractRaw(await newToken.getAddress());

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(contractErrors,"ERC20Mint");
	});
	it("Long term bidding with CST doesn't produce irregularities", async function () {
		if (SKIP_LONG_TESTS == "1") return;
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3,addr4,addr5, ...addrs] = await ethers.getSigners();
		let timeBump = 24*3600;
		let balance,cstPrice;
		let numIterationsMain = 30;
		let numIterationsSecondary = 100000;
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.bid(params, { value: bidPrice });
	 	for (let i=0; i<numIterationsMain; i++) {
			let b = await ethers.provider.getBalance(owner.address);
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
				let balanceEth = await ethers.provider.getBalance(owner.address);
				let tb = await cosmicToken.balanceOf(owner.address);
				process.exit(1);
			}
			await ethers.provider.send("evm_increaseTime", [timeBump]);
			await ethers.provider.send("evm_mine");
			let CSTAuctionLength = await cosmicGameProxy.CSTAuctionLength();
		}
	})
})
