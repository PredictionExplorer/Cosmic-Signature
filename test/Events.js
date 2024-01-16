const { expect } = require("chai");
const { ethers } = require("hardhat");
const { basicDeployment } = require("../src/Deploy.js");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Events", function () {
	let INITIAL_AMOUNT = ethers.utils.parseEther("10");
	async function deployCosmic() {
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
			bidLogic,
		} = await basicDeployment(contractDeployerAcct, "", 0, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", true);

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
			bidLogic,
		};
	}
	const bidParamsEncoding = {
						type: 'tuple(string,int256)',
						name: 'bidparams',
						components: [
							{name: 'msg', type: 'string'},
							{name: 'rwalk',type: 'int256'},
						]
	};
	it("should emit the correct events in the CosmicSignature contract", async function () {
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet } =
			await loadFixture(deployCosmic);
		[owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await ethers.getSigners();
		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = {msg:'',rwalk:-1};
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding],[bidParams])
		await cosmicGame.connect(bidder1).bid(params, { value: bidPrice });
		await ethers.provider.send("evm_increaseTime", [26 * 3600]);
		await ethers.provider.send("evm_mine");
		const tx = await cosmicGame.connect(bidder1).claimPrize();
		await tx.wait();
		let seed = await cosmicSignature.seeds(0);
		expect(tx).to.emit(cosmicSignature, "MintEvent").withArgs(0, bidder1.address, seed);
	});

	it("should emit the correct events in the CharityWallet contract", async function () {
		[owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await ethers.getSigners();
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await basicDeployment(owner, "", 0, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", false);
		// DonationReceivedEvent
		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = {msg:'',rwalk:-1};
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding],[bidParams])
		await cosmicGame.connect(bidder1).bid(params, { value: bidPrice });
		let charityAmount = await cosmicGame.charityAmount();
		await ethers.provider.send("evm_increaseTime", [26 * 3600]);
		await ethers.provider.send("evm_mine");
		await expect(cosmicGame.connect(bidder1).claimPrize())
			.to.emit(charityWallet, "DonationReceivedEvent")
			.withArgs(cosmicGame.address, charityAmount);
		let balance = await ethers.provider.getBalance(charityWallet.address);
		expect(balance).to.equal(charityAmount);

		// CharityUpdatedEvent
		await expect(charityWallet.connect(owner).setCharity(bidder3.address))
			.to.emit(charityWallet, "CharityUpdatedEvent")
			.withArgs(bidder3.address);

		// DonationSentEvent
		await expect(charityWallet.connect(bidder2).send())
			.to.emit(charityWallet, "DonationSentEvent")
			.withArgs(bidder3.address, balance);
	});

	it("should emit DonationEvent on successful donation", async function () {
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet } =
			await loadFixture(deployCosmic);
		[owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await ethers.getSigners();
		await cosmicGame.connect(owner).donate({ value: INITIAL_AMOUNT });
		const donationAmount = ethers.utils.parseEther("1");

		await expect(cosmicGame.connect(donor).donate({ value: donationAmount }))
			.to.emit(cosmicGame, "DonationEvent")
			.withArgs(donor.address, donationAmount);

		const contractBalance = await ethers.provider.getBalance(cosmicGame.address);
		expect(contractBalance).to.equal(donationAmount.add(INITIAL_AMOUNT));
	});

	it("Number of Raffle events match the configuration", async function () {
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();

		// we need to min RWalk tokens for all bidders that participate to avoid missing events
		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: tokenPrice });
		tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr2).mint({ value: tokenPrice });
		tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr3).mint({ value: tokenPrice });

		// we need to creat CosmicToken holders prior to our test
		let p = await cosmicGame.getBidPrice();
		let bidParams = {msg:'',rwalk:-1};
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding],[bidParams])
		await cosmicGame.connect(addr1).bid(params, { value: p });
		let ptime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [ptime.toNumber()]);
		await cosmicGame.connect(addr1).claimPrize();

		// test begins here
		let rwalkTokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: rwalkTokenPrice });
		rwalkTokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr2).mint({ value: rwalkTokenPrice });
		let tx, receipt, log, parsed_log, bidPrice, winner;
		bidPrice = await cosmicGame.getBidPrice();
		bidParams = {msg:'',rwalk:-1};
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding],[bidParams])
		await cosmicGame.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();
		bidParams = {msg:'',rwalk:-1};
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding],[bidParams])
		await cosmicGame.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGame.getBidPrice();
		bidParams = {msg:'',rwalk:-1};
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding],[bidParams])
		await cosmicGame.connect(addr3).bid(params, { value: bidPrice });

		let prizeTime = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTime.add(1).toNumber()]);
		await ethers.provider.send("evm_mine");

		tx = await cosmicGame.connect(addr3).claimPrize();
		receipt = await tx.wait();

		let num_raffle_nft_winners = await cosmicGame.numRaffleNFTWinnersPerRound();
		let num_holder_nft_winners = await cosmicGame.numHolderNFTWinnersPerRound();
		let total_nft_winners = num_raffle_nft_winners.toNumber() + num_holder_nft_winners.toNumber() * 2;
		let topic_sig = cosmicGame.interface.getEventTopic("RaffleNFTWinnerEvent");
		let deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		expect(total_nft_winners).to.equal(deposit_logs.length);

		let num_eth_winners = await cosmicGame.numRaffleWinnersPerRound();
		topic_sig = raffleWallet.interface.getEventTopic("RaffleDepositEvent");
		deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		expect(num_eth_winners).to.equal(deposit_logs.length);
	});
	it("should emit PrizeClaimEvent and update winner on successful prize claim", async function () {
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet } =
			await loadFixture(deployCosmic);
		[owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await ethers.getSigners();
		let bidPrice = await cosmicGame.getBidPrice();

		let mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(donor).mint({ value: mintPrice });

		await randomWalkNFT.connect(donor).setApprovalForAll(cosmicGame.address, true);

		let bidParams = {msg:'',rwalk:-1};
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding],[bidParams])
		await cosmicGame
			.connect(donor)
			.bidAndDonateNFT(params, randomWalkNFT.address, 0, { value: bidPrice });

		bidPrice = await cosmicGame.getBidPrice();
		bidParams = {msg:'',rwalk:-1};
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding],[bidParams])
		await cosmicGame.connect(bidder1).bid(params, { value: bidPrice });

		await expect(cosmicGame.connect(bidder1).claimDonatedNFT(0)).to.be.revertedWith(
			"Non-existent winner for the round.",
		);
		await ethers.provider.send("evm_increaseTime", [26 * 3600]);
		await ethers.provider.send("evm_mine");

		let prizeAmountBeforeClaim = await cosmicGame.prizeAmount();

		await expect(cosmicGame.connect(bidder1).claimPrize())
			.to.emit(cosmicGame, "PrizeClaimEvent")
			.withArgs(0, bidder1.address, prizeAmountBeforeClaim);

		const winner = await cosmicGame.winners(0);
		expect(winner).to.equal(bidder1.address);

		const prizeAmountAfterClaim = await cosmicGame.prizeAmount();
		balance = await ethers.provider.getBalance(cosmicGame.address);
		expectedPrizeAmount = balance.mul(25).div(100);
		expect(prizeAmountAfterClaim).to.equal(expectedPrizeAmount);

		await expect(cosmicGame.connect(bidder1).claimDonatedNFT(1)).to.be.revertedWith(
			"The donated NFT does not exist.",
		);

		await cosmicGame.connect(bidder1).claimDonatedNFT(0);
		await expect(cosmicGame.connect(bidder1).claimDonatedNFT(0)).to.be.revertedWith(
			"The NFT has already been claimed.",
		);

		mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(donor).mint({ value: mintPrice });
		mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(donor).mint({ value: mintPrice });

		bidPrice = await cosmicGame.getBidPrice();
		bidParams = {msg:'',rwalk:-1};
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding],[bidParams])
		await cosmicGame.connect(bidder1).bid(params, { value: bidPrice });

		bidPrice = await cosmicGame.getBidPrice();
		bidParams = {msg:'hello',rwalk:1};
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding],[bidParams])
		await cosmicGame.connect(donor).bidAndDonateNFT(params, randomWalkNFT.address, 2, { value: bidPrice });

		await ethers.provider.send("evm_increaseTime", [26 * 3600]);
		await ethers.provider.send("evm_mine");

		prizeAmountBeforeClaim = await cosmicGame.prizeAmount();
		await expect(cosmicGame.connect(donor).claimPrize())
			.to.emit(cosmicGame, "PrizeClaimEvent")
			.withArgs(1, donor.address, prizeAmountBeforeClaim);

		expect(await randomWalkNFT.balanceOf(donor.address)).to.equal(1);
		await cosmicGame.connect(donor).claimDonatedNFT(1);
		expect(await randomWalkNFT.balanceOf(donor.address)).to.equal(2);

		expect(await cosmicGame.roundNum()).to.equal(2);
	});
	it("BidEvent is correctly emitted", async function () {
		const {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			bidLogic,
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();

		let bidPrice = await cosmicGame.getBidPrice();

		await ethers.provider.send("evm_setNextBlockTimestamp", [2000000000]);
		let bidParams = {msg:'simple text',rwalk:-1};
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding],[bidParams])
		expect(await cosmicGame.connect(addr1).bid(params, { value: bidPrice }))
			.to.emit(bidLogic, "BidEvent")
			.withArgs(addr1.address, 0, bidPrice, -1, -1, 2000090000, "simple text");
		await ethers.provider.send("evm_setNextBlockTimestamp", [2100000000]);
		var mintPrice = await randomWalkNFT.getMintPrice();
		bidPrice = await cosmicGame.getBidPrice();
		await randomWalkNFT.connect(addr1).mint({ value: mintPrice });
		bidParams = {msg:'random walk',rwalk:0};
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding],[bidParams])
		expect(await cosmicGame.connect(addr1).bid(params, { value: bidPrice }))
			.to.emit(bidLogic, "BidEvent")
			.withArgs(addr1.address, 0, 1020100000000000, 0, -1, 2100003601, "random walk");
	});
	it("bidPrice for RandomWalk is 50% lower", async function () {
		const {
			cosmicGame,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			bidLogic,
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();

		let bidPrice = await cosmicGame.getBidPrice();
		let rwalkBidPrice = bidPrice.div(ethers.BigNumber.from("2"));
		var mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: mintPrice });
		await ethers.provider.send("evm_setNextBlockTimestamp", [2000000000]);
		let bidParams = {msg:'random walk',rwalk:0};
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding],[bidParams])
		await expect(cosmicGame.connect(addr1).bid(params, { value: bidPrice }))
			.to.emit(cosmicGame, "BidEvent")
			.withArgs(addr1.address, 0, rwalkBidPrice, 0, -1, 2000090000, "random walk");
	});
	it("DonatedNFTClaimedEvent is correctly emitted", async function () {
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet } =
			await loadFixture(deployCosmic);
		[owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await ethers.getSigners();
		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = {msg:'',rwalk:-1};
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding],[bidParams])
		let mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(bidder1).mint({ value: mintPrice });
		await randomWalkNFT.connect(bidder1).setApprovalForAll(cosmicGame.address, true);
		await cosmicGame
			.connect(bidder1)
			.bidAndDonateNFT(params, randomWalkNFT.address, 0, { value: bidPrice });

		let prizeTimeInc = await cosmicGame.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTimeInc.toNumber()]);

		await expect(cosmicGame.connect(bidder1).claimPrize());

		await expect(cosmicGame.connect(bidder1).claimDonatedNFT(0))
			.to.emit(cosmicGame, "DonatedNFTClaimedEvent")
			.withArgs(0, 0, bidder1.address, randomWalkNFT.address, 0);
	});

	it("should not be possible to bid before activation", async function () {
		[owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await ethers.getSigners();
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet } =
			await loadFixture(deployCosmic);
		const sevenDays = 7 * 24 * 60 * 60;

		const blockNumBefore = await ethers.provider.getBlockNumber();
		const blockBefore = await ethers.provider.getBlock(blockNumBefore);
		const timestampBefore = blockBefore.timestamp;

		await cosmicGame.connect(owner).setActivationTime(timestampBefore + 100);

		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = {msg:'',rwalk:-1};
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding],[bidParams])
		await expect(
			cosmicGame.connect(bidder1).bid(params, { value: bidPrice }),
		).to.be.revertedWith("Call to bid logic failed.");

		await expect(
			bidder2.sendTransaction({
				to: cosmicGame.address,
				value: bidPrice,
			}),
		).to.be.revertedWith("Call to bid logic failed.");

		await ethers.provider.send("evm_increaseTime", [100]);
		await ethers.provider.send("evm_mine");

		bidParams = {msg:'',rwalk:-1};
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding],[bidParams])
		await cosmicGame.connect(bidder1).bid(params, { value: bidPrice });
		expect((await cosmicGame.getBidPrice()) > bidPrice);
	});

	it("should be possible to bid by sending to the contract", async function () {
		[owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await ethers.getSigners();
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet } =
			await loadFixture(deployCosmic);
		let bidPrice = await cosmicGame.getBidPrice();
		let bidParams = {msg:'',rwalk:-1};
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding],[bidParams])
		await cosmicGame.connect(bidder1).bid(params, { value: bidPrice });
		expect((await cosmicGame.getBidPrice()) > bidPrice);

		bidPrice = await cosmicGame.getBidPrice();
		await bidder2.sendTransaction({
			to: cosmicGame.address,
			value: bidPrice,
		});
		expect((await cosmicGame.getBidPrice()) > bidPrice);
	});

	it("Admin events should work", async function () {
		const { cosmicGame, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet } =
			await loadFixture(deployCosmic);

		[owner, testAcct] = await ethers.getSigners();
		var percentage = ethers.BigNumber.from("11");
		await expect(cosmicGame.connect(owner).setCharityPercentage(percentage))
			.to.emit(cosmicGame, "CharityPercentageChanged")
			.withArgs(percentage);
		expect((await cosmicGame.charityPercentage()).toString()).to.equal(percentage.toString());

		percentage = ethers.BigNumber.from("12");
		await expect(cosmicGame.connect(owner).setPrizePercentage(percentage))
			.to.emit(cosmicGame, "PrizePercentageChanged")
			.withArgs(percentage);
		expect((await cosmicGame.prizePercentage()).toString()).to.equal(percentage.toString());

		percentage = ethers.BigNumber.from("13");
		await expect(cosmicGame.connect(owner).setRafflePercentage(percentage))
			.to.emit(cosmicGame, "RafflePercentageChanged")
			.withArgs(percentage);
		expect((await cosmicGame.rafflePercentage()).toString()).to.equal(percentage.toString());

		var num_winners = ethers.BigNumber.from("11");
		await expect(cosmicGame.connect(owner).setNumRaffleWinnersPerRound(num_winners))
			.to.emit(cosmicGame, "NumRaffleWinnersPerRoundChanged")
			.withArgs(num_winners);
		expect((await cosmicGame.numRaffleWinnersPerRound()).toString()).to.equal(num_winners.toString());

		var num_winners = ethers.BigNumber.from("12");
		await expect(cosmicGame.connect(owner).setNumRaffleNFTWinnersPerRound(num_winners))
			.to.emit(cosmicGame, "NumRaffleNFTWinnersPerRoundChanged")
			.withArgs(num_winners);
		expect((await cosmicGame.numRaffleNFTWinnersPerRound()).toString()).to.equal(num_winners.toString());

		var num_winners = ethers.BigNumber.from("13");
		await expect(cosmicGame.connect(owner).setNumHolderNFTWinnersPerRound(num_winners))
			.to.emit(cosmicGame, "NumHolderNFTWinnersPerRoundChanged")
			.withArgs(num_winners);
		expect((await cosmicGame.numHolderNFTWinnersPerRound()).toString()).to.equal(num_winners.toString());

		testAcct = ethers.Wallet.createRandom();
		await expect(cosmicGame.connect(owner).setCharity(testAcct.address))
			.to.emit(cosmicGame, "CharityAddressChanged")
			.withArgs(testAcct.address);
		expect((await cosmicGame.charity()).toString()).to.equal(testAcct.address.toString());

		testAcct = ethers.Wallet.createRandom();
		await expect(cosmicGame.connect(owner).setRandomWalk(testAcct.address))
			.to.emit(cosmicGame, "RandomWalkAddressChanged")
			.withArgs(testAcct.address);
		expect(await cosmicGame.randomWalk()).to.equal(testAcct.address);

		testAcct = ethers.Wallet.createRandom();
		await expect(cosmicGame.connect(owner).setRaffleWallet(testAcct.address))
			.to.emit(cosmicGame, "RaffleWalletAddressChanged")
			.withArgs(testAcct.address);
		expect(await cosmicGame.raffleWallet()).to.equal(testAcct.address);

		testAcct = ethers.Wallet.createRandom();
		await expect(cosmicGame.connect(owner).setTokenContract(testAcct.address))
			.to.emit(cosmicGame, "CosmicTokenAddressChanged")
			.withArgs(testAcct.address);
		expect(await cosmicGame.token()).to.equal(testAcct.address);

		testAcct = ethers.Wallet.createRandom();
		await expect(cosmicGame.connect(owner).setNftContract(testAcct.address))
			.to.emit(cosmicGame, "CosmicSignatureAddressChanged")
			.withArgs(testAcct.address);
		expect(await cosmicGame.nft()).to.equal(testAcct.address);

		var time_increase = ethers.BigNumber.from("1001");
		await expect(cosmicGame.connect(owner).setTimeIncrease(time_increase))
			.to.emit(cosmicGame, "TimeIncreaseChanged")
			.withArgs(time_increase);
		expect((await cosmicGame.timeIncrease()).toString()).to.equal(time_increase.toString());

		var timeout_claim_prize = ethers.BigNumber.from("1003");
		await expect(cosmicGame.connect(owner).setTimeoutClaimPrize(timeout_claim_prize))
			.to.emit(cosmicGame, "TimeoutClaimPrizeChanged")
			.withArgs(timeout_claim_prize);
		expect((await cosmicGame.timeoutClaimPrize()).toString()).to.equal(timeout_claim_prize.toString());

		var price_increase = ethers.BigNumber.from("1002");
		await expect(cosmicGame.connect(owner).setPriceIncrease(price_increase))
			.to.emit(cosmicGame, "PriceIncreaseChanged")
			.withArgs(price_increase);
		expect((await cosmicGame.priceIncrease()).toString()).to.equal(price_increase.toString());

		var nanoseconds = ethers.BigNumber.from("1003");
		await expect(cosmicGame.connect(owner).setNanoSecondsExtra(nanoseconds))
			.to.emit(cosmicGame, "NanoSecondsExtraChanged")
			.withArgs(nanoseconds);
		expect((await cosmicGame.nanoSecondsExtra()).toString()).to.equal(nanoseconds.toString());

		var initialseconds = ethers.BigNumber.from("1004");
		await expect(cosmicGame.connect(owner).setInitialSecondsUntilPrize(initialseconds))
			.to.emit(cosmicGame, "InitialSecondsUntilPrizeChanged")
			.withArgs(initialseconds);
		expect((await cosmicGame.initialSecondsUntilPrize()).toString()).to.equal(initialseconds.toString());

		var bidamount = ethers.BigNumber.from("1005");
		await expect(cosmicGame.connect(owner).updateInitialBidAmountFraction(bidamount))
			.to.emit(cosmicGame, "InitialBidAmountFractionChanged")
			.withArgs(bidamount);
		expect((await cosmicGame.initialBidAmountFraction()).toString()).to.equal(bidamount.toString());

		var activationtime = ethers.BigNumber.from("1006");
		await expect(cosmicGame.connect(owner).setActivationTime(activationtime))
			.to.emit(cosmicGame, "ActivationTimeChanged")
			.withArgs(activationtime);
		expect((await cosmicGame.activationTime()).toString()).to.equal(activationtime.toString());
	});
});
