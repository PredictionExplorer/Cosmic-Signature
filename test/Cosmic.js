const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");
const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { expect } = require("chai");
const { basicDeployment,basicDeploymentAdvanced } = require("../src//Deploy.js");

describe("Cosmic Set1", function () {
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
	it("Should set the right unlockTime", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		expect(await cosmicGameProxy.nanoSecondsExtra()).to.equal(3600 * 1000 * 1000 * 1000);
		expect(await cosmicToken.totalSupply()).to.equal(0);
	});
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
	it("ERC20 nonces() function exists", async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");
		await expect(
			cosmicToken.nonces(owner.address),
		).not.to.be.reverted;
	});
	it("Should not be possible to donate 0 value", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");
		await expect(cosmicGameProxy.connect(addr1).donate()).to.be.revertedWithCustomError(contractErrors,"NonZeroValueRequired");
	});
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
	it("Setters are working", async function () {
		let runtimeMode = false;
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
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,runtimeMode);
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		let errObj;

		let sysMode = await cosmicGameProxy.systemMode();
		expect(sysMode.toString()).to.equal("2");

		let testAcct;
		testAcct = ethers.Wallet.createRandom();
		await cosmicGameProxy.connect(owner).setCharity(testAcct.address);
		expect(await cosmicGameProxy.charity()).to.equal(testAcct.address);

		testAcct = ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setRandomWalk(ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicGameProxy,"ZeroAddress");
		await cosmicGameProxy.connect(owner).setRandomWalk(testAcct.address);
		expect(await cosmicGameProxy.randomWalk()).to.equal(testAcct.address);

		testAcct = ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setRaffleWallet(ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicGameProxy,"ZeroAddress");
		await cosmicGameProxy.connect(owner).setRaffleWallet(testAcct.address);
		expect(await cosmicGameProxy.raffleWallet()).to.equal(testAcct.address);

		testAcct = ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setStakingWalletCST(ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicGameProxy,"ZeroAddress");
		await cosmicGameProxy.connect(owner).setStakingWalletCST(testAcct.address);
		expect(await cosmicGameProxy.stakingWalletCST()).to.equal(testAcct.address);

		testAcct = ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setStakingWalletRWalk(ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicGameProxy,"ZeroAddress");
		await cosmicGameProxy.connect(owner).setStakingWalletRWalk(testAcct.address);
		expect(await cosmicGameProxy.stakingWalletRWalk()).to.equal(testAcct.address);

		await cosmicGameProxy.connect(owner).setNumRaffleETHWinnersBidding(99n);
		expect(await cosmicGameProxy.numRaffleETHWinnersBidding()).to.equal(99n);

		await cosmicGameProxy.connect(owner).setNumRaffleNFTWinnersBidding(99n);
		expect(await cosmicGameProxy.numRaffleNFTWinnersBidding()).to.equal(99n);

		await cosmicGameProxy.connect(owner).setNumRaffleNFTWinnersStakingRWalk(99n);
		expect(await cosmicGameProxy.numRaffleNFTWinnersStakingRWalk()).to.equal(99n);

		await expect(cosmicGameProxy.connect(owner).setCharityPercentage(60n)).to.be.revertedWithCustomError(cosmicGameProxy,"PercentageValidation");
		let charityPercentage = await cosmicGameProxy.charityPercentage();
		await cosmicGameProxy.connect(owner).setCharityPercentage(11n);
		expect(await cosmicGameProxy.charityPercentage()).to.equal(11n);
		await cosmicGameProxy.setCharityPercentage(charityPercentage);

		await expect(cosmicGameProxy.connect(owner).setRafflePercentage(55n)).to.be.revertedWithCustomError(cosmicGameProxy,"PercentageValidation");
		let rafflePercentage = await cosmicGameProxy.rafflePercentage();
		await cosmicGameProxy.connect(owner).setRafflePercentage(6n);
		expect(await cosmicGameProxy.rafflePercentage()).to.equal(6n);
		await cosmicGameProxy.setRafflePercentage(rafflePercentage);

		await expect(cosmicGameProxy.connect(owner).setStakingPercentage(60n)).to.be.revertedWithCustomError(cosmicGameProxy,"PercentageValidation");
		let stakingPercentage = await cosmicGameProxy.stakingPercentage();
		await cosmicGameProxy.connect(owner).setStakingPercentage(6n);
		expect(await cosmicGameProxy.stakingPercentage()).to.equal(6n);
		await cosmicGameProxy.setStakingPercentage(stakingPercentage);

		await expect(cosmicGameProxy.connect(owner).setPrizePercentage(75n)).to.be.revertedWithCustomError(cosmicGameProxy,"PercentageValidation");
		await cosmicGameProxy.connect(owner).setPrizePercentage(26n);
		expect(await cosmicGameProxy.prizePercentage()).to.equal(26n);

		testAcct = ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setTokenContract(ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicGameProxy,"ZeroAddress");
		await cosmicGameProxy.connect(owner).setTokenContract(testAcct.address);
		expect(await cosmicGameProxy.token()).to.equal(testAcct.address);

		testAcct = ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setNftContract(ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicGameProxy,"ZeroAddress");
		await cosmicGameProxy.connect(owner).setNftContract(testAcct.address);
		expect(await cosmicGameProxy.nft()).to.equal(testAcct.address);

		testAcct = ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setMarketingWallet(ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicGameProxy,"ZeroAddress");
		await cosmicGameProxy.connect(owner).setMarketingWallet(testAcct.address);
		expect(await cosmicGameProxy.marketingWallet()).to.equal(testAcct.address);

		await cosmicGameProxy.connect(owner).setTimeIncrease(99n);
		expect(await cosmicGameProxy.timeIncrease()).to.equal(99n);

		await cosmicGameProxy.connect(owner).setTimeoutClaimPrize(99n);
		expect(await cosmicGameProxy.timeoutClaimPrize()).to.equal(99n);

		await cosmicGameProxy.connect(owner).setPriceIncrease(99n);
		expect(await cosmicGameProxy.priceIncrease()).to.equal(99n);

		await cosmicGameProxy.connect(owner).setNanoSecondsExtra(99n);
		expect(await cosmicGameProxy.nanoSecondsExtra()).to.equal(99n);

		await cosmicGameProxy.connect(owner).setInitialSecondsUntilPrize(99n);
		expect(await cosmicGameProxy.initialSecondsUntilPrize()).to.equal(99n);

		await cosmicGameProxy.connect(owner).updateInitialBidAmountFraction(99n);
		expect(await cosmicGameProxy.initialBidAmountFraction()).to.equal(99n);

		await cosmicGameProxy.connect(owner).setActivationTime(99n);
		expect(await cosmicGameProxy.activationTime()).to.equal(99n);

		await expect(cosmicGameProxy.connect(addr1).setRoundStartCSTAuctionLength(11n)).to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await cosmicGameProxy.connect(owner).setRoundStartCSTAuctionLength(3600n);
		expect(await cosmicGameProxy.RoundStartCSTAuctionLength()).to.equal(3600n);

		await expect(cosmicGameProxy.connect(addr1).setTokenReward(11n)).to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await cosmicGameProxy.connect(owner).setTokenReward(1234567890n);
		expect(await cosmicGameProxy.tokenReward()).to.equal(1234567890n);

		await cosmicGameProxy.connect(owner).setMarketingReward(1234567890n);
		expect(await cosmicGameProxy.marketingReward()).to.equal(1234567890n);

		await cosmicGameProxy.connect(owner).setMaxMessageLength(1234567890n);
		expect(await cosmicGameProxy.maxMessageLength()).to.equal(1234567890n);

		await expect(cosmicGameProxy.connect(addr1).setErc20RewardMultiplier(11n)).to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await cosmicGameProxy.connect(owner).setErc20RewardMultiplier(99n);
		expect(await cosmicGameProxy.erc20RewardMultiplier()).to.equal(99n);

		expect(await cosmicGameProxy.getSystemMode()).to.equal(2);

		await expect(cosmicGameProxy.connect(owner).prepareMaintenance()).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode");
		await expect(cosmicGameProxy.connect(addr1).setRuntimeMode()).to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await cosmicGameProxy.setRuntimeMode();

		await cosmicGameProxy.connect(owner).transferOwnership(addr2.address);
		expect((await cosmicGameProxy.owner()).toString()).to.equal(addr2.address.toString());
		await cosmicGameProxy.connect(addr2).transferOwnership(owner.address);
		expect((await cosmicGameProxy.owner()).toString()).to.equal(owner.address.toString());

	});
	it("Setters are not available in run-time mode", async function () {
		let runtimeMode = true;
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
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,runtimeMode);
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();

		let sysMode = await cosmicGameProxy.systemMode();
		expect(sysMode.toString()).to.equal("0");
		let testAcct;
		testAcct = ethers.Wallet.createRandom();

		let revertStr = "System must be in MODE_MAINTENANCE";
		await expect(cosmicGameProxy.connect(owner).setCharity(testAcct.address)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setRandomWalk(testAcct.address)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setRaffleWallet(testAcct.address)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setStakingWalletCST(testAcct.address)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setStakingWalletRWalk(testAcct.address)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setNumRaffleETHWinnersBidding(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setNumRaffleNFTWinnersBidding(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setNumRaffleNFTWinnersStakingRWalk(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0);
		await expect(cosmicGameProxy.connect(owner).setTokenReward(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0);
		await expect(cosmicGameProxy.connect(owner).setMarketingReward(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0);
		await expect(cosmicGameProxy.connect(owner).setCharityPercentage(11n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setRafflePercentage(6n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setStakingPercentage(6n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setTokenContract(testAcct.address)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setNftContract(testAcct.address)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setMarketingWallet(testAcct.address)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setTimeIncrease(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setTimeoutClaimPrize(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setPriceIncrease(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setNanoSecondsExtra(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setInitialSecondsUntilPrize(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setPrizePercentage(26n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).updateInitialBidAmountFraction(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setActivationTime(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setRoundStartCSTAuctionLength(3600n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await expect(cosmicGameProxy.connect(owner).setMaxMessageLength(99n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0);
		await expect(cosmicGameProxy.connect(owner).setErc20RewardMultiplier(11n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode");
		await expect(cosmicGameProxy.connect(owner).setRuntimeMode()).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,0n);
		await cosmicGameProxy.connect(owner).prepareMaintenance();
	});
	it("In maintenance mode, runtime-mode funtions are not available", async function () {
		let runtimeMode = false;
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
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,runtimeMode);
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();

		let revertStr="System in maintenance mode";

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.bid(params, { value: bidPrice })).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,2n);
		await expect(cosmicGameProxy.bidAndDonateNFT(params,owner.address,0, { value: bidPrice })).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,2n);
		await expect(cosmicGameProxy.bidWithCST("")).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,2n);
		await expect(cosmicGameProxy.claimPrize()).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,2);
		await expect(cosmicGameProxy.claimDonatedNFT(0)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,2n);
		await expect(cosmicGameProxy.claimManyDonatedNFTs([0])).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,2n);
		await expect(owner.sendTransaction({ to: await cosmicGameProxy.getAddress(), value: bidPrice})).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,2n);
		await expect(cosmicGameProxy.donate({value: bidPrice})).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,2n);
		await expect(cosmicGameProxy.donateWithInfo("{}",{value: bidPrice})).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,2n);

		let mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: mintPrice });
		await randomWalkNFT.connect(addr1).setApprovalForAll(await cosmicGameProxy.getAddress(), true);
		await expect(cosmicGameProxy.connect(addr1).donateNFT(await randomWalkNFT.getAddress(),0n)).to.be.revertedWithCustomError(cosmicGameProxy,"SystemMode").withArgs(revertStr,2n);
	});
	it("BaseURI/TokenURI works", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [Number(prizeTime)]);
		let tx = await cosmicGameProxy.connect(addr1).claimPrize();
		let receipt = await tx.wait();
		await cosmicSignature.connect(owner).setBaseURI("somebase/");
		expect(await cosmicSignature.tokenURI(0n)).to.equal("somebase/0");
	});
	it("claimManyDonatedNFTs() works properly", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: mintPrice });
		await randomWalkNFT.connect(addr1).setApprovalForAll(await cosmicGameProxy.getAddress(), true);
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let tx = await cosmicGameProxy
			.connect(addr1)
			.bidAndDonateNFT(params, await randomWalkNFT.getAddress(), 0, { value: bidPrice });
		let receipt = await tx.wait();
		let topic_sig = cosmicGameProxy.interface.getEvent("NFTDonationEvent").topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicGameProxy.interface.parseLog(log);
		expect(parsed_log.args.donor).to.equal(addr1.address);
		expect(parsed_log.args.tokenId).to.equal(0);

		bidPrice = await cosmicGameProxy.getBidPrice();
		mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: mintPrice });
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bidAndDonateNFT(params, await randomWalkNFT.getAddress(), 1, { value: bidPrice });

		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [Number(prizeTime)+100]);
		await ethers.provider.send("evm_mine");
		await expect(cosmicGameProxy.connect(addr1).claimPrize()).not.to.be.reverted;

		tx = await cosmicGameProxy.connect(addr1).claimManyDonatedNFTs([0, 1]);
		receipt = await tx.wait();
		topic_sig = cosmicGameProxy.interface.getEvent("DonatedNFTClaimedEvent").topicHash;
		let event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		expect(event_logs.length).to.equal(2);
		parsed_log = cosmicGameProxy.interface.parseLog(event_logs[0]);
		expect(parsed_log.args.tokenId).to.equal(0);
		expect(parsed_log.args.winner).to.equal(addr1.address);
		expect(parsed_log.args.nftAddressdonatedNFTs).to.equal(await randomWalkNFT.getAddress());
		expect(parsed_log.args.round).to.equal(0);
		expect(parsed_log.args.index).to.equal(0);

		parsed_log = cosmicGameProxy.interface.parseLog(event_logs[1]);
		expect(parsed_log.args.tokenId).to.equal(1);
		expect(parsed_log.args.winner).to.equal(addr1.address);
		expect(parsed_log.args.nftAddressdonatedNFTs).to.equal(await randomWalkNFT.getAddress());
		expect(parsed_log.args.round).to.equal(0);
		expect(parsed_log.args.index).to.equal(1);
	});
	it("Check access to privileged functions", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);

		[owner, addr1] = await ethers.getSigners();
		await expect(
			cosmicToken.connect(addr1).mint(addr1.address, 10000n)
		).to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setCharity(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setRandomWalk(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount")
		await expect(cosmicGameProxy.connect(addr1).setRaffleWallet(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setNumRaffleETHWinnersBidding(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setNumRaffleNFTWinnersBidding(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setNumRaffleNFTWinnersStakingRWalk(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setPrizePercentage(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setCharityPercentage(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setRafflePercentage(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setStakingPercentage(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setTokenContract(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setNftContract(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setMarketingWallet(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setStakingWalletCST(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setStakingWalletRWalk(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setTimeIncrease(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setTimeoutClaimPrize(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setPriceIncrease(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setNanoSecondsExtra(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setInitialSecondsUntilPrize(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).updateInitialBidAmountFraction(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setActivationTime(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setMaxMessageLength(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicGameProxy.connect(addr1).setMarketingReward(1n))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(charityWallet.connect(addr1).setCharity(addr1.address))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
		await expect(cosmicSignature.connect(addr1).setBaseURI("://uri"))
			.to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
	});
	it("auctionDuration() method works", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });

		await cosmicGameProxy.connect(addr1).bidWithCST("cst bid");

		res = await cosmicGameProxy.auctionDuration();
		duration = res[1];
		secondsElapsed = res[0];
		expect(secondsElapsed).to.equal(0);
	});
	it("timeUntilActivation() method works properly", async function () {
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWalletCST,
			stakingWalletRWalk
		} = await basicDeploymentAdvanced(
			'CosmicGame',
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			false
		);
		let bnum = await ethers.provider.getBlockNumber();
		let bdata = await ethers.provider.getBlock(bnum);
		let ts = bdata.timestamp;
		ts = ts + 60;
		await cosmicGameProxy.setActivationTime(ts);
		await cosmicGameProxy.setRuntimeMode();
		let at = await cosmicGameProxy.activationTime();
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [ts-1]);
		await hre.ethers.provider.send("evm_mine");
		let tua = await cosmicGameProxy.timeUntilActivation();
		expect(tua).to.equal(1);
	});
});
