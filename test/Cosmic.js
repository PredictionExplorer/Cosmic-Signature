const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const SKIP_LONG_TESTS = "1";
const { basicDeployment,basicDeploymentAdvanced } = require("../src//Deploy.js");

describe("Cosmic", function () {
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
	it("Should set the right unlockTime", async function () {
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		expect(await cosmicGame.nanoSecondsExtra()).to.equal(3600 * 1000 * 1000 * 1000);
		expect(await cosmicToken.totalSupply()).to.equal(0);
	});
	it("Should be possible to bid", async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let donationAmount = ethers.utils.parseEther("10");
		await cosmicGame.donate({ value: donationAmount });
		expect(await cosmicGame.prizeAmount()).to.equal(donationAmount.mul(25).div(100));
		var bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGame.connect(addr1).bid(params, { value: 1 })).to.be.revertedWith(
			"The value submitted for this transaction is too low.",
		);
		let bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		expect(cosmicGame.connect(addr1).bid(params, { value: bidPrice.sub(1) })).to.be.revertedWith(
			"Call to business logic failed.",
		);

		let prizeTime = await cosmicGame.timeUntilPrize();
		expect(prizeTime).to.equal(0);
		// check that if we sent too much, we get our money back
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice.add(1000) }); // this works
		const contractBalance = await ethers.provider.getBalance(cosmicGame.address);
		expect(contractBalance).to.equal(donationAmount.add(bidPrice));

		let nanoSecondsExtra = await cosmicGame.nanoSecondsExtra();
		prizeTime = await cosmicGame.timeUntilPrize();
		expect(prizeTime).to.equal(nanoSecondsExtra.div(1000000000).add(24 * 3600));

		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		prizeTime = await cosmicGame.timeUntilPrize();
		expect(prizeTime).to.equal(
			nanoSecondsExtra
				.div(1000000000)
				.mul(2)
				.add(24 * 3600 - 1),
		);

		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		prizeTime = await cosmicGame.timeUntilPrize();
		expect(prizeTime).to.equal(
			nanoSecondsExtra
				.div(1000000000)
				.mul(3)
				.add(24 * 3600 - 2),
		); // not super clear why we are subtracting 2 here and 1 above
		await expect(cosmicGame.connect(addr1).claimPrize()).to.be.revertedWith("Not enough time has elapsed.");

		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });
		await expect(cosmicGame.connect(addr2).claimPrize()).to.be.revertedWith("Not enough time has elapsed.");

		prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.sub(100).toNumber()]);
		await ethers.provider.send("evm_mine");
		await expect(cosmicGame.connect(addr2).claimPrize()).to.be.revertedWith("Not enough time has elapsed.");

		await ethers.provider.send("evm_increaseTime", [100]);
		await ethers.provider.send("evm_mine");

		await expect(cosmicGame.connect(addr1).claimPrize()).to.be.revertedWith(
			"Only the last bidder can claim the prize during the first 24 hours.",
		);

		let prizeAmount = await cosmicGame.prizeAmount();
		let charityAmount = await cosmicGame.charityAmount();
		let raffleAmount = await cosmicGame.raffleAmount();
		await cosmicGame.connect(addr2).claimPrize();
		let prizeAmount2 = await cosmicGame.prizeAmount();
		let balance = await ethers.provider.getBalance(cosmicGame.address);
		let expectedprizeAmount = balance.mul(25).div(100);
		expect(prizeAmount2).to.equal(expectedprizeAmount);

		// after the prize has been claimed, let's bid again!

		await expect(cosmicGame.connect(addr2).claimPrize()).to.be.revertedWith("There is no last bidder.");

		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		await expect(cosmicGame.connect(addr1).claimPrize()).to.be.revertedWith("Not enough time has elapsed.");

		prizeTime = await cosmicGame.timeUntilPrize();
		expect(prizeTime).to.equal(nanoSecondsExtra.div(1000000000).add(24 * 3600));

		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await ethers.provider.send("evm_mine");

		prizeAmount = await cosmicGame.prizeAmount();
		charityAmount = await cosmicGame.charityAmount();
		await cosmicGame.connect(addr1).claimPrize();
		prizeAmount2 = await cosmicGame.prizeAmount();
		balance = await ethers.provider.getBalance(cosmicGame.address);
		expectedPrizeAmount = balance.mul(25).div(100);
		expect(prizeAmount2).to.equal(expectedPrizeAmount);

		// 3 hours after the deadline, anyone should be able to claim the prize
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await ethers.provider.send("evm_mine");

		await expect(cosmicGame.connect(addr2).claimPrize()).to.be.revertedWith(
			"Only the last bidder can claim the prize during the first 24 hours.",
		);

		await ethers.provider.send("evm_increaseTime", [3600 * 24]);
		await ethers.provider.send("evm_mine");

		await cosmicGame.connect(addr2).claimPrize();
		expect(await cosmicGame.lastBidder()).to.equal("0x0000000000000000000000000000000000000000");
	});
	it("Should be possible to bid with RandomWalk token", async function () {
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: tokenPrice }); // tokenId=0

		let bidPrice = await cosmicGame.getBidPrice();
		// switch to another account and attempt to use tokenId=0 which we don't own
		var bidParams = { msg: "hello", rwalk: 0 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGame.connect(owner).bid(params, { value: bidPrice })).to.be.revertedWith(
			"You must be the owner of the RandomWalkNFT.",
		); //tokenId=0
		await expect(cosmicGame.connect(addr1).bid(params, { value: bidPrice })); //tokenId=0
		await ethers.provider.send("evm_mine");
		tokenPrice = await randomWalkNFT.getMintPrice();
		let tx = await randomWalkNFT.connect(owner).mint({ value: tokenPrice });
		let receipt = await tx.wait();
		let topic_sig = randomWalkNFT.interface.getEventTopic("MintEvent");
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = randomWalkNFT.interface.parseLog(log);
		let token_id = parsed_log.args[0];
		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: token_id.toNumber() };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGame.connect(owner).bid(params, { value: 0 })).to.be.revertedWith(
			"The value submitted for this transaction with RandomWalk is too low.",
		);
		await cosmicGame.connect(owner).bid(params, { value: bidPrice });

		// try to mint again using the same tokenId
		bidPrice = await cosmicGame.getBidPrice();
		await expect(cosmicGame.connect(owner).bid(params, { value: bidPrice })).to.be.revertedWith(
			"This RandomWalkNFT has already been used for bidding.",
		); //tokenId=0
	});
	it("Shouldn't be possible to bid if bidder doesn't accept refunds on oversized bid() calls", async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let donationAmount = ethers.utils.parseEther("10");
		await cosmicGame.donate({ value: donationAmount });

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();

		await expect(cBidder.doFailedBid({ value: donationAmount })).to.be.revertedWith("Refund transfer failed.");
	});
	it("Shouldn't be possible to bid using very long message", async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let donationAmount = ethers.utils.parseEther("10");
		await cosmicGame.donate({ value: donationAmount });
		let longMsg = "";
		for (let i = 0; i < 280 + 1; i++) {
			longMsg = longMsg + "a";
		}
		let bidPrice = await cosmicGame.getBidPrice();
		var bidParams = { msg: longMsg, rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGame.connect(addr1).bid(params, { value: bidPrice })).to.be.revertedWith(
			"Message is too long.",
		);
	});
	it("Should not be possible to mint CosmicSignature token by anyone", async function () {
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		await expect(
			cosmicSignature.connect(owner).mint(owner.address, ethers.BigNumber.from("0")),
		).to.be.revertedWith("Only the CosmicGame contract can mint.");
	});
	it("Should be possible to setTokenName()", async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		let tx = await cosmicGame.connect(addr1).claimPrize();
		let receipt = await tx.wait();
		let topic_sig = cosmicSignature.interface.getEventTopic("MintEvent");
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicSignature.interface.parseLog(log);
		let token_id = parsed_log.args.tokenId;
		tx = await cosmicSignature.connect(addr1).setTokenName(token_id, "name 0");
		receipt = await tx.wait();
		topic_sig = cosmicSignature.interface.getEventTopic("TokenNameEvent");
		log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		parsed_log = cosmicSignature.interface.parseLog(log);
		let name = parsed_log.args.newName;
		expect(name).to.equal("name 0");
		expect(token_id).to.equal(parsed_log.args.tokenId);

		let remote_token_name = await cosmicSignature.connect(addr1).tokenNames(token_id);
		expect(remote_token_name).to.equal("name 0");

		await expect(cosmicSignature.connect(addr2).setTokenName(token_id, "name 000")).to.be.revertedWith(
			"setTokenName caller is not owner nor approved.",
		);
		await expect(
			cosmicSignature.connect(addr1).setTokenName(token_id, "012345678901234567890123456789012"),
		).to.be.revertedWith("Token name is too long.");
	});
	it("Should not be possible to mint ERC721 tokens by anyone", async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		await expect(
			cosmicSignature.connect(addr1).mint(addr1.address, ethers.BigNumber.from("0")),
		).to.be.revertedWith("Only the CosmicGame contract can mint.");
	});
	it("Should not be possible to donate 0 value", async function () {
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		await expect(cosmicGame.connect(addr1).donate()).to.be.revertedWith(
			"Donation amount must be greater than 0.",
		);
	});
	it("Raffle deposits sent should match raffle deposits received", async function () {
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3, addr4, addr5, addr6, ...addrs] = await ethers.getSigners();

		// we need to mint Rwalk because our Rwalk contract is empty and doesn't have any holder
		// but they are needed to test token distribution in claimPrize()
		let rwalkTokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: rwalkTokenPrice });
		rwalkTokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr2).mint({ value: rwalkTokenPrice });

		// now we need to do a dummy claimPrize() because our CosmicSignature contract is empty
		// and does not contain any tokens but we need them to test token distribution (the holder loop)
		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await cosmicGame.connect(addr1).claimPrize();
		let totalSupplyBefore = (await cosmicSignature.totalSupply()).toNumber();

		// at this point all required data was initialized, we can proceed with the test
		let topic_sig = raffleWallet.interface.getEventTopic("RaffleDepositEvent");
		let tx, receipt, log, parsed_log, winner;

		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr3).bid(params, { value: bidPrice });

		prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.add(1).toNumber()]);
		await ethers.provider.send("evm_mine");

		let roundNumBefore = await cosmicGame.roundNum();

		tx = await cosmicGame.connect(addr3).claimPrize();
		receipt = await tx.wait();

		// check tnat roundNum is incremented
		let roundNumAfter = await cosmicGame.roundNum();
		expect(roundNumAfter.sub(1).toNumber()).to.equal(roundNumBefore);

		// check winners[] map contains correct winner value
		let curWinner = await cosmicGame.winners(roundNumBefore);
		expect(curWinner).to.equal(addr3.address);

		//make sure the number of deposits matches numRaffleWinnersPerRound variable
		let deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		let nrwpr = await cosmicGame.numRaffleWinnersPerRound();
		let num_raffle_winners = await cosmicGame.numRaffleNFTWinnersPerRound();
		let num_holder_winners = await cosmicGame.numHolderNFTWinnersPerRound();
		let sum_winners = num_raffle_winners.toNumber() + 2 * num_holder_winners.toNumber();
		expect(nrwpr.toNumber()).to.equal(deposit_logs.length);
		expect(sum_winners).to.equal(sum_winners);
		let prize_winner_mints = 1;
		let expected_total_supply = totalSupplyBefore + prize_winner_mints + sum_winners;
		let curTotalSupply = (await cosmicSignature.totalSupply()).toNumber();
		expect(await cosmicSignature.totalSupply()).to.equal(curTotalSupply);
		let last_cosmic_signature_supply = sum_winners + prize_winner_mints;

		// let's begin a new round
		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr3).bid(params, { value: bidPrice });

		prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.add(1).toNumber()]);
		await ethers.provider.send("evm_mine");

		let raffleAmount = await cosmicGame.raffleAmount();
		tx = await cosmicGame.connect(addr3).claimPrize();
		receipt = await tx.wait();
		deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);

		// make sure numRaffleParticipants have been reset
		let numRaffleParticipants = await cosmicGame.numRaffleParticipants();
		expect(numRaffleParticipants.toNumber()).to.equal(0);

		var unique_winners = [];
		for (let i = 0; i < deposit_logs.length; i++) {
			let wlog = raffleWallet.interface.parseLog(deposit_logs[i]);
			let winner = wlog.args.winner;
			let winner_signer = cosmicGame.provider.getSigner(winner);
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
			let topic_sig = randomWalkNFT.interface.getEventTopic("MintEvent");
			let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
			let parsed_log = randomWalkNFT.interface.parseLog(log);
			let token_id = parsed_log.args[0];
			return token_id;
		}

		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3, addr4, addr5, addr6, ...addrs] = await ethers.getSigners();
		let token_id = await mint_rwalk(addr1);
		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = { msg: "bidWithRWLK", rwalk: token_id.toNumber() };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		token_id = await mint_rwalk(addr2);
		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "bidWithRWLK", rwalk: token_id.toNumber() };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });
		token_id = await mint_rwalk(addr3);
		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "bidWithRWLK", rwalk: token_id.toNumber() };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr3).bid(params, { value: bidPrice });
		token_id = await mint_rwalk(addr4);
		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "bidWithRWLK", rwalk: token_id.toNumber() };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr4).bid(params, { value: bidPrice });
		token_id = await mint_rwalk(addr5);
		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "bidWithRWLK", rwalk: token_id.toNumber() };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr5).bid(params, { value: bidPrice });

		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.add(1).toNumber()]);
		await ethers.provider.send("evm_mine");
		await expect(cosmicGame.connect(addr5).claimPrize()).not.to.be.revertedWith("panic code 0x12"); // divide by zero
	});
	it("Setters are working", async function () {
		let runtimeMode = false;
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
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,runtimeMode);
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		await expect(
			cosmicSignature.connect(owner).mint(owner.address, ethers.BigNumber.from("0")),
		).to.be.revertedWith("Only the CosmicGame contract can mint.");

		let sysMode = await cosmicGame.systemMode();
		expect(sysMode.toString()).to.equal("2");

		var testAcct;
		testAcct = ethers.Wallet.createRandom();
		await cosmicGame.connect(owner).setCharity(testAcct.address);
		expect(await cosmicGame.charity()).to.equal(testAcct.address);

		testAcct = ethers.Wallet.createRandom();
		await cosmicGame.connect(owner).setRandomWalk(testAcct.address);
		expect(await cosmicGame.randomWalk()).to.equal(testAcct.address);

		testAcct = ethers.Wallet.createRandom();
		await cosmicGame.connect(owner).setRaffleWallet(testAcct.address);
		expect(await cosmicGame.raffleWallet()).to.equal(testAcct.address);

		testAcct = ethers.Wallet.createRandom();
		await cosmicGame.connect(owner).setStakingWallet(testAcct.address);
		expect(await cosmicGame.stakingWallet()).to.equal(testAcct.address);

		await cosmicGame.connect(owner).setNumRaffleWinnersPerRound(ethers.BigNumber.from("99"));
		expect(await cosmicGame.numRaffleWinnersPerRound()).to.equal(ethers.BigNumber.from("99"));

		await cosmicGame.connect(owner).setNumRaffleNFTWinnersPerRound(ethers.BigNumber.from("99"));
		expect(await cosmicGame.numRaffleNFTWinnersPerRound()).to.equal(ethers.BigNumber.from("99"));

		await cosmicGame.connect(owner).setCharityPercentage(ethers.BigNumber.from("11"));
		expect((await cosmicGame.charityPercentage()).toString()).to.equal("11");

		await cosmicGame.connect(owner).setRafflePercentage(ethers.BigNumber.from("6"));
		expect(await cosmicGame.rafflePercentage()).to.equal(ethers.BigNumber.from("6"));

		await cosmicGame.connect(owner).setStakingPercentage(ethers.BigNumber.from("6"));
		expect(await cosmicGame.stakingPercentage()).to.equal(ethers.BigNumber.from("6"));

		testAcct = ethers.Wallet.createRandom();
		await cosmicGame.connect(owner).setTokenContract(testAcct.address);
		expect(await cosmicGame.token()).to.equal(testAcct.address);

		testAcct = ethers.Wallet.createRandom();
		await cosmicGame.connect(owner).setNftContract(testAcct.address);
		expect(await cosmicGame.nft()).to.equal(testAcct.address);

		testAcct = ethers.Wallet.createRandom();
		await cosmicGame.connect(owner).setBusinessLogicContract(testAcct.address);
		expect(await cosmicGame.bLogic()).to.equal(testAcct.address);

		await cosmicGame.connect(owner).setTimeIncrease(ethers.BigNumber.from("99"));
		expect(await cosmicGame.timeIncrease()).to.equal(ethers.BigNumber.from("99"));

		await cosmicGame.connect(owner).setTimeoutClaimPrize(ethers.BigNumber.from("99"));
		expect(await cosmicGame.timeoutClaimPrize()).to.equal(ethers.BigNumber.from("99"));

		await cosmicGame.connect(owner).setPriceIncrease(ethers.BigNumber.from("99"));
		expect(await cosmicGame.priceIncrease()).to.equal(ethers.BigNumber.from("99"));

		await cosmicGame.connect(owner).setNanoSecondsExtra(ethers.BigNumber.from("99"));
		expect(await cosmicGame.nanoSecondsExtra()).to.equal(ethers.BigNumber.from("99"));

		await cosmicGame.connect(owner).setInitialSecondsUntilPrize(ethers.BigNumber.from("99"));
		expect(await cosmicGame.initialSecondsUntilPrize()).to.equal(ethers.BigNumber.from("99"));

		await cosmicGame.connect(owner).setPrizePercentage(ethers.BigNumber.from("26"));
		expect(await cosmicGame.prizePercentage()).to.equal(ethers.BigNumber.from("26"));

		await cosmicGame.connect(owner).updateInitialBidAmountFraction(ethers.BigNumber.from("99"));
		expect(await cosmicGame.initialBidAmountFraction()).to.equal(ethers.BigNumber.from("99"));

		await cosmicGame.connect(owner).setActivationTime(ethers.BigNumber.from("99"));
		expect(await cosmicGame.activationTime()).to.equal(ethers.BigNumber.from("99"));

		await cosmicGame.connect(owner).setETHToCSTBidRatio(ethers.BigNumber.from("99"));
		expect(await cosmicGame.ETHToCSTBidRatio()).to.equal(ethers.BigNumber.from("99"));

		await cosmicGame.connect(owner).setRoundStartCSTAuctionLength(ethers.BigNumber.from("3600"));
		expect(await cosmicGame.RoundStartCSTAuctionLength()).to.equal(ethers.BigNumber.from("3600"));

		await expect(cosmicGame.connect(owner).prepareMaintenance()).to.be.revertedWith("System must be in MODE_MAINTENANCE");
		await cosmicGame.setRuntimeMode();

		await cosmicGame.connect(owner).transferOwnership(addr2.address);
		expect((await cosmicGame.owner()).toString()).to.equal(addr2.address.toString());
		await cosmicGame.connect(addr2).transferOwnership(owner.address);
		expect((await cosmicGame.owner()).toString()).to.equal(owner.address.toString());

		await cosmicSignature.connect(owner).setTokenGenerationScriptURL("url://");
		expect(await cosmicSignature.tokenGenerationScriptURL()).to.equal("url://");
	});
	it("Setters are not available in run-time mode", async function () {
		let runtimeMode = true;
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
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,runtimeMode);
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();

		let sysMode = await cosmicGame.systemMode();
		expect(sysMode.toString()).to.equal("0");
		var testAcct;
		testAcct = ethers.Wallet.createRandom();

		let revertStr = "System must be in MODE_MAINTENANCE";
		await expect(cosmicGame.connect(owner).setCharity(testAcct.address)).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).setRandomWalk(testAcct.address)).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).setRaffleWallet(testAcct.address)).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).setStakingWallet(testAcct.address)).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).setNumRaffleWinnersPerRound(ethers.BigNumber.from("99"))).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).setNumRaffleNFTWinnersPerRound(ethers.BigNumber.from("99"))).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).setCharityPercentage(ethers.BigNumber.from("11"))).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).setRafflePercentage(ethers.BigNumber.from("6"))).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).setStakingPercentage(ethers.BigNumber.from("6"))).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).setTokenContract(testAcct.address)).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).setNftContract(testAcct.address)).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).setBusinessLogicContract(testAcct.address)).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).setTimeIncrease(ethers.BigNumber.from("99"))).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).setTimeoutClaimPrize(ethers.BigNumber.from("99"))).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).setPriceIncrease(ethers.BigNumber.from("99"))).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).setNanoSecondsExtra(ethers.BigNumber.from("99"))).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).setInitialSecondsUntilPrize(ethers.BigNumber.from("99"))).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).setPrizePercentage(ethers.BigNumber.from("26"))).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).updateInitialBidAmountFraction(ethers.BigNumber.from("99"))).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).setActivationTime(ethers.BigNumber.from("99"))).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).setETHToCSTBidRatio(ethers.BigNumber.from("10"))).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).setRoundStartCSTAuctionLength(ethers.BigNumber.from("3600"))).to.be.revertedWith(revertStr);
		await expect(cosmicGame.connect(owner).setRuntimeMode()).to.be.revertedWith(revertStr);
		await cosmicGame.connect(owner).prepareMaintenance();
	});
	it("BaseURI/TokenURI works", async function () {
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		let tx = await cosmicGame.connect(addr1).claimPrize();
		let receipt = await tx.wait();
		await cosmicSignature.connect(owner).setBaseURI("somebase/");
		expect(await cosmicSignature.tokenURI(ethers.BigNumber.from("0"))).to.equal("somebase/0");
	});
	it("CharityWallet is sending the right amount", async function () {
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		let amountSent = ethers.utils.parseEther("9");
		let receiver = await charityWallet.charityAddress();
		await addr2.sendTransaction({ to: charityWallet.address, value: amountSent });
		let balanceBefore = await ethers.provider.getBalance(receiver);
		await charityWallet.send();
		let balanceAfter = await ethers.provider.getBalance(receiver);
		expect(balanceAfter).to.equal(balanceBefore.add(amountSent));
	});
	it("claimManyDonatedNFTs() works properly", async function () {
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();

		let bidPrice = await cosmicGame.getBidPrice();
		let mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: mintPrice });
		await randomWalkNFT.connect(addr1).setApprovalForAll(cosmicGame.address, true);
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		let tx = await cosmicGame
			.connect(addr1)
			.bidAndDonateNFT(params, randomWalkNFT.address, 0, { value: bidPrice });
		let receipt = await tx.wait();
		let topic_sig = cosmicGame.interface.getEventTopic("NFTDonationEvent");
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicGame.interface.parseLog(log);
		expect(parsed_log.args.donor).to.equal(addr1.address);
		expect(parsed_log.args.tokenId).to.equal(0);

		bidPrice = await cosmicGame.getBidPrice();
		mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: mintPrice });
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bidAndDonateNFT(params, randomWalkNFT.address, 1, { value: bidPrice });

		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.add(100).toNumber()]);
		await ethers.provider.send("evm_mine");
		await expect(cosmicGame.connect(addr1).claimPrize());

		tx = await cosmicGame.connect(addr1).claimManyDonatedNFTs([0, 1]);
		receipt = await tx.wait();
		topic_sig = cosmicGame.interface.getEventTopic("DonatedNFTClaimedEvent");
		let event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		expect(event_logs.length).to.equal(2);
		parsed_log = cosmicGame.interface.parseLog(event_logs[0]);
		expect(parsed_log.args.tokenId).to.equal(0);
		expect(parsed_log.args.winner).to.equal(addr1.address);
		expect(parsed_log.args.nftAddressdonatedNFTs).to.equal(randomWalkNFT.address);
		expect(parsed_log.args.round).to.equal(0);
		expect(parsed_log.args.index).to.equal(0);

		parsed_log = cosmicGame.interface.parseLog(event_logs[1]);
		expect(parsed_log.args.tokenId).to.equal(1);
		expect(parsed_log.args.winner).to.equal(addr1.address);
		expect(parsed_log.args.nftAddressdonatedNFTs).to.equal(randomWalkNFT.address);
		expect(parsed_log.args.round).to.equal(0);
		expect(parsed_log.args.index).to.equal(1);
	});
	it("Check access to privileged functions", async function () {
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);

		[owner, addr1] = await ethers.getSigners();
		await expect(
			cosmicToken.connect(addr1).mint(addr1.address, ethers.BigNumber.from("10000")),
		).to.be.revertedWith("Ownable: caller is not the owner");
		await expect(cosmicGame.connect(addr1).setCharity(addr1.address)).to.be.revertedWith(
			"Ownable: caller is not the owner",
		);
		await expect(cosmicGame.connect(addr1).setRandomWalk(addr1.address)).to.be.revertedWith(
			"Ownable: caller is not the owner",
		);
		await expect(cosmicGame.connect(addr1).setRaffleWallet(addr1.address)).to.be.revertedWith(
			"Ownable: caller is not the owner",
		);
		await expect(
			cosmicGame.connect(addr1).setNumRaffleWinnersPerRound(ethers.BigNumber.from("1")),
		).to.be.revertedWith("Ownable: caller is not the owner");
		await expect(
			cosmicGame.connect(addr1).setNumRaffleNFTWinnersPerRound(ethers.BigNumber.from("1")),
		).to.be.revertedWith("Ownable: caller is not the owner");
		await expect(
			cosmicGame.connect(addr1).setNumHolderNFTWinnersPerRound(ethers.BigNumber.from("1")),
		).to.be.revertedWith("Ownable: caller is not the owner");
		await expect(cosmicGame.connect(addr1).setPrizePercentage(ethers.BigNumber.from("1"))).to.be.revertedWith(
			"Ownable: caller is not the owner",
		);
		await expect(cosmicGame.connect(addr1).setCharityPercentage(ethers.BigNumber.from("1"))).to.be.revertedWith(
			"Ownable: caller is not the owner",
		);
		await expect(cosmicGame.connect(addr1).setRafflePercentage(ethers.BigNumber.from("1"))).to.be.revertedWith(
			"Ownable: caller is not the owner",
		);
		await expect(cosmicGame.connect(addr1).setTokenContract(addr1.address)).to.be.revertedWith(
			"Ownable: caller is not the owner",
		);
		await expect(cosmicGame.connect(addr1).setNftContract(addr1.address)).to.be.revertedWith(
			"Ownable: caller is not the owner",
		);
		await expect(cosmicGame.connect(addr1).setTimeIncrease(ethers.BigNumber.from("1"))).to.be.revertedWith(
			"Ownable: caller is not the owner",
		);
		await expect(cosmicGame.connect(addr1).setTimeoutClaimPrize(ethers.BigNumber.from("1"))).to.be.revertedWith(
			"Ownable: caller is not the owner",
		);
		await expect(cosmicGame.connect(addr1).setPriceIncrease(ethers.BigNumber.from("1"))).to.be.revertedWith(
			"Ownable: caller is not the owner",
		);
		await expect(cosmicGame.connect(addr1).setNanoSecondsExtra(ethers.BigNumber.from("1"))).to.be.revertedWith(
			"Ownable: caller is not the owner",
		);
		await expect(
			cosmicGame.connect(addr1).setInitialSecondsUntilPrize(ethers.BigNumber.from("1")),
		).to.be.revertedWith("Ownable: caller is not the owner");
		await expect(
			cosmicGame.connect(addr1).updateInitialBidAmountFraction(ethers.BigNumber.from("1")),
		).to.be.revertedWith("Ownable: caller is not the owner");
		await expect(cosmicGame.connect(addr1).setActivationTime(ethers.BigNumber.from("1"))).to.be.revertedWith(
			"Ownable: caller is not the owner",
		);
		await expect(charityWallet.connect(addr1).setCharity(addr1.address)).to.be.revertedWith(
			"Ownable: caller is not the owner",
		);
		await expect(cosmicSignature.connect(addr1).setBaseURI("://uri")).to.be.revertedWith(
			"Ownable: caller is not the owner",
		);
	});
	it("Change charityAddress via DAO (Governor) is working", async function () {
		if (SKIP_LONG_TESTS == "1") return;
		const forward_blocks = async n => {
			for (let i = 0; i < n; i++) {
				await ethers.provider.send("evm_mine");
			}
		};
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

		let tx, receipt, log, parsed_log, bidPrice, winner, donationAmount;

		donationAmount = ethers.utils.parseEther("10");
		await cosmicGame.donate({ value: donationAmount });

		bidPrice = await cosmicGame.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(owner).bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr3).bid(params, { value: bidPrice });

		let voting_delay = await cosmicDAO.votingDelay();
		let voting_period = await cosmicDAO.votingPeriod();

		await cosmicToken.connect(owner).delegate(owner.address);
		await cosmicToken.connect(addr1).delegate(addr1.address);
		await cosmicToken.connect(addr2).delegate(addr2.address);
		await cosmicToken.connect(addr3).delegate(addr3.address);
		let proposal_func = charityWallet.interface.encodeFunctionData("setCharity", [addr1.address]);
		let proposal_desc = "set charityWallet to new addr";
		tx = await cosmicDAO.connect(owner).propose([charityWallet.address], [0], [proposal_func], proposal_desc);
		receipt = await tx.wait();

		parsed_log = cosmicDAO.interface.parseLog(receipt.logs[0]);
		let proposal_id = parsed_log.args.proposalId;

		await forward_blocks(voting_delay.toNumber());

		let vote = await cosmicDAO.connect(addr1).castVote(proposal_id, 1);
		vote = await cosmicDAO.connect(addr2).castVote(proposal_id, 1);
		vote = await cosmicDAO.connect(addr3).castVote(proposal_id, 1);

		await forward_blocks(voting_period);

		let desc_hash = hre.ethers.utils.id(proposal_desc);
		tx = await cosmicDAO.connect(owner).execute([charityWallet.address], [0], [proposal_func], desc_hash);
		receipt = await tx.wait();

		let new_charity_addr = await charityWallet.charityAddress();
		expect(new_charity_addr.toString()).to.equal(addr1.address.toString());
	});
	it("StakingWallet is properly distributing prize amount()", async function () {
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
		const {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
		} = await loadFixture(deployCosmic);

		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await cosmicGame.connect(addr1).claimPrize();

		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });
		prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await cosmicGame.connect(addr2).claimPrize();

		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr3).bid(params, { value: bidPrice });
		prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);
		await cosmicGame.connect(addr3).claimPrize();

		await cosmicSignature.connect(addr1).setApprovalForAll(stakingWallet.address, true);
		await cosmicSignature.connect(addr2).setApprovalForAll(stakingWallet.address, true);
		await cosmicSignature.connect(addr3).setApprovalForAll(stakingWallet.address, true);

		// make all winners to stake their tokens
		let CSTtotalSupply = await cosmicSignature.totalSupply();
		for (let i = 0; i < CSTtotalSupply.toNumber(); i++) {
			let o = await cosmicSignature.ownerOf(i);
			let ownerSigner = cosmicSignature.provider.getSigner(o);
			await stakingWallet.connect(ownerSigner).stake(i);
		}

		// at this point we have initial data with 3 token holders (holding 1 or more
		// CS tokens with stake operation executed. Now we are ready to test staking

		bidPrice = await cosmicGame.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr3).bid(params, { value: bidPrice });
		prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()]);

		let previousModulo = await stakingWallet.modulo();
		let previousStakingAmount = await cosmicGame.stakingAmount();
		let csTotalSupply = await cosmicSignature.totalSupply();
		let roundNum = await cosmicGame.roundNum();
		let tx = await cosmicGame.connect(addr3).claimPrize();
		let receipt = await tx.wait();
		let topic_sig = stakingWallet.interface.getEventTopic("EthDepositEvent");
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = stakingWallet.interface.parseLog(log);
		let depositRecord = await stakingWallet.ETHDeposits(parsed_log.args.depositNum);
		let amountInRound = depositRecord.depositAmount.div(depositRecord.numStaked);
		let moduloInRound = depositRecord.depositAmount.mod(depositRecord.numStaked);
		expect(parsed_log.args.amount).to.equal(previousStakingAmount);
		expect(parsed_log.args.modulo).to.equal(moduloInRound);
	});
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
		expect("199989000000000000000").to.equal(parsed_log.args.numCSTTokens.toString());
		expect(parsed_log.args.bidPrice.toNumber()).to.equal(-1);
		expect(parsed_log.args.lastBidder).to.equal(addr1.address);
		expect(parsed_log.args.message).to.equal("cst bid");
		
	});
	it("ProxyCall() method works", async function () {
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
		// we will use nanoSecondsExtra value for verification purposes
		let nsec = await cosmicGame.nanoSecondsExtra();
		let input = cosmicGame.interface.encodeFunctionData("proxyCall", ["0x9136d6d9", 0]);
		let message = await cosmicGame.provider.call({
			to: cosmicGame.address,
			data: input,
		});
		let res = cosmicGame.interface.decodeFunctionResult("proxyCall", message);
		let value = ethers.utils.defaultAbiCoder.decode(["uint256"], res[0]);
		expect(value.toString()).to.equal(nsec.toString());

		// now lets test if revert string is properly returned, we will use donate() method
		let params = ethers.utils.defaultAbiCoder.encode(["uint256"], [ethers.BigNumber.from("0")]);
		await expect(cosmicGame.proxyCall("0xed88c68e", params, { gasLimit: 30000000 })).to.be.revertedWith(
			"Donation amount must be greater than 0.",
		);
	});
	it("auctionDuration() method works", async function () {
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
		let input = cosmicGame.interface.encodeFunctionData("auctionDuration", []);
		let message = await cosmicGame.provider.call({
			to: cosmicGame.address,
			data: input,
		});
		let res = cosmicGame.interface.decodeFunctionResult("auctionDuration", message);
		let bytes = res[0].slice(130, 258);
		let values = ethers.utils.defaultAbiCoder.decode(["uint256", "uint256"], "0x" + bytes);
		let secondsElapsed = values[0];
		let duration = values[1];
		await cosmicGame.connect(addr1).bidWithCST("cst bid");

		input = cosmicGame.interface.encodeFunctionData("auctionDuration", []);
		message = await cosmicGame.provider.call({
			to: cosmicGame.address,
			data: input,
		});
		res = cosmicGame.interface.decodeFunctionResult("auctionDuration", message);
		bytes = res[0].slice(130, 258);
		values = ethers.utils.defaultAbiCoder.decode(["uint256", "uint256"], "0x" + bytes);
		secondsElapsed = values[0];
		duration = values[1];
		expect(secondsElapsed).to.equal(0);
	});
	it("It is not possible to claim the prize if the deposit to the winner fails", async function () {
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
		const {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
		} = await loadFixture(deployCosmic);

		const BidderContract = await ethers.getContractFactory("BidderContract");
		let cBidder = await BidderContract.deploy(cosmicGame.address);
		await cBidder.deployed();

		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()+24*60*60+1]);

		await cBidder.startBlockingDeposits();
		await expect(cBidder.doClaim()).to.be.revertedWith("Transfer to the winner failed.");
	});
	it("It is not possible to claim the prize if the deposit to CharityWallet fails", async function () {
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
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
		} = await basicDeploymentAdvanced("SpecialCosmicGame",owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,true);

		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()+24*60*60+1]);

		const BrokenCharity = await ethers.getContractFactory("BrokenCharity");
		let newCharity= await BrokenCharity.deploy();
		await newCharity.deployed();
		await cosmicGame.setCharityRaw(newCharity.address);

		await expect(cosmicGame.claimPrize()).to.be.revertedWith("Transfer to charity contract failed.");
	});
	it("It is not possible to claim the prize if the deposit to RaffleWallet fails", async function () {
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
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
		} = await basicDeploymentAdvanced("SpecialCosmicGame",owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,true);

		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.toNumber()+24*60*60+1]);

		const RaffleWallet = await ethers.getContractFactory("RaffleWallet");
		let newRaffleWallet = await RaffleWallet.deploy(owner.address);
		await newRaffleWallet.deployed();
		await cosmicGame.setRaffleWalletRaw(newRaffleWallet.address);

		await expect(cosmicGame.claimPrize()).to.be.revertedWith("Raffle deposit failed.");
    });
	it("It is not possible to withdraw from CharityWallet if transfer to the destination fails", async function () {
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
		var transferOwnership = false;
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
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", transferOwnership);

		const BrokenCharity = await ethers.getContractFactory("BrokenCharity");
		let brokenCharity = await BrokenCharity.deploy();
		await brokenCharity.deployed();

		await owner.sendTransaction({ to: charityWallet.address, value: ethers.utils.parseEther("3")});
		await charityWallet.setCharity(brokenCharity.address);
		await expect(charityWallet.send()).to.be.revertedWith("Transfer failed.");
    });
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
});
