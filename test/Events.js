const { expect } = require("chai");
const { ethers } = require("hardhat");
const { basicDeployment,basicDeploymentAdvanced } = require("../src/Deploy.js");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Events", function () {
	let INITIAL_AMOUNT = ethers.utils.parseEther("10");
	async function deployCosmic() {
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
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bidLogic,
		} = await basicDeployment(contractDeployerAcct, "", 0, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", true);

		return {
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
			bidLogic,
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
	it("should emit the correct events in the CosmicSignature contract", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet } =
			await loadFixture(deployCosmic);
		[owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await ethers.getSigners();
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(bidder1).bid(params, { value: bidPrice });
		await ethers.provider.send("evm_increaseTime", [26 * 3600]);
		await ethers.provider.send("evm_mine");
		const tx = await cosmicGameProxy.connect(bidder1).claimPrize();
		await tx.wait();
		let seed = await cosmicSignature.seeds(0);
		expect(tx).to.emit(cosmicSignature, "MintEvent").withArgs(0, bidder1.address, seed);
	});

	it("should emit the correct events in the CharityWallet contract", async function () {
		[owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await basicDeployment(owner, "", 0, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", false);
		// DonationReceivedEvent
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(bidder1).bid(params, { value: bidPrice });
		let charityAmount = await cosmicGameProxy.charityAmount();
		await ethers.provider.send("evm_increaseTime", [26 * 3600]);
		await ethers.provider.send("evm_mine");
		await expect(cosmicGameProxy.connect(bidder1).claimPrize())
			.to.emit(charityWallet, "DonationReceivedEvent")
			.withArgs(cosmicGameProxy.address, charityAmount);
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
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet } =
			await loadFixture(deployCosmic);
		[owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await ethers.getSigners();
		await cosmicGameProxy.connect(owner).donate({ value: INITIAL_AMOUNT });
		const donationAmount = ethers.utils.parseEther("1");

		let roundNum = 0;
		await expect(cosmicGameProxy.connect(donor).donate({ value: donationAmount }))
			.to.emit(cosmicGameProxy, "DonationEvent")
			.withArgs(donor.address, donationAmount, roundNum);

		const contractBalance = await ethers.provider.getBalance(cosmicGameProxy.address);
		expect(contractBalance).to.equal(donationAmount.add(INITIAL_AMOUNT));
	});
	it("should emit PrizeClaimEvent and update winner on successful prize claim", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet } =
			await loadFixture(deployCosmic);
		[owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await ethers.getSigners();
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");
		let bidPrice = await cosmicGameProxy.getBidPrice();

		let mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(donor).mint({ value: mintPrice });

		await randomWalkNFT.connect(donor).setApprovalForAll(cosmicGameProxy.address, true);

		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(donor).bidAndDonateNFT(params, randomWalkNFT.address, 0, { value: bidPrice });

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(bidder1).bid(params, { value: bidPrice });

		await expect(cosmicGameProxy.connect(bidder1).claimDonatedNFT(0)).to.be.revertedWithCustomError(contractErrors,"NonExistentWinner");

		await ethers.provider.send("evm_increaseTime", [26 * 3600]);
		await ethers.provider.send("evm_mine");

		let prizeAmountBeforeClaim = await cosmicGameProxy.prizeAmount();

		await expect(cosmicGameProxy.connect(bidder1).claimPrize())
			.to.emit(cosmicGameProxy, "PrizeClaimEvent")
			.withArgs(0, bidder1.address, prizeAmountBeforeClaim);

		const winner = await cosmicGameProxy.winners(0);
		expect(winner).to.equal(bidder1.address);

		const prizeAmountAfterClaim = await cosmicGameProxy.prizeAmount();
		balance = await ethers.provider.getBalance(cosmicGameProxy.address);
		expectedPrizeAmount = balance.mul(25).div(100);
		expect(prizeAmountAfterClaim).to.equal(expectedPrizeAmount);

		await expect(cosmicGameProxy.connect(bidder1).claimDonatedNFT(1)).to.be.revertedWithCustomError(contractErrors,"NonExistentDonatedNFT");

		await cosmicGameProxy.connect(bidder1).claimDonatedNFT(0);
		await expect(cosmicGameProxy.connect(bidder1).claimDonatedNFT(0)).to.be.revertedWithCustomError(contractErrors,"NFTAlreadyClaimed");

		mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(donor).mint({ value: mintPrice });
		mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(donor).mint({ value: mintPrice });

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(bidder1).bid(params, { value: bidPrice });

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "hello", rwalk: 1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(donor).bidAndDonateNFT(params, randomWalkNFT.address, 2, { value: bidPrice });

		await ethers.provider.send("evm_increaseTime", [26 * 3600]);
		await ethers.provider.send("evm_mine");

		prizeAmountBeforeClaim = await cosmicGameProxy.prizeAmount();
		await expect(cosmicGameProxy.connect(donor).claimPrize())
			.to.emit(cosmicGameProxy, "PrizeClaimEvent")
			.withArgs(1, donor.address, prizeAmountBeforeClaim);

		expect(await randomWalkNFT.balanceOf(donor.address)).to.equal(1);
		await cosmicGameProxy.connect(donor).claimDonatedNFT(1);
		expect(await randomWalkNFT.balanceOf(donor.address)).to.equal(2);

		expect(await cosmicGameProxy.roundNum()).to.equal(2);
	});
	it("BidEvent is correctly emitted", async function () {
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			bidLogic,
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();

		let bidPrice = await cosmicGameProxy.getBidPrice();

		await ethers.provider.send("evm_setNextBlockTimestamp", [2000000000]);
		let bidParams = { msg: "simple text", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		expect(await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice }))
			.to.emit(bidLogic, "BidEvent")
			.withArgs(addr1.address, 0, bidPrice, -1, -1, 2000090000, "simple text");
		await ethers.provider.send("evm_setNextBlockTimestamp", [2100000000]);
		var mintPrice = await randomWalkNFT.getMintPrice();
		bidPrice = await cosmicGameProxy.getBidPrice();
		await randomWalkNFT.connect(addr1).mint({ value: mintPrice });
		bidParams = { msg: "random walk", rwalk: 0 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		expect(await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice }))
			.to.emit(bidLogic, "BidEvent")
			.withArgs(addr1.address, 0, 1020100000000000, 0, -1, 2100003601, "random walk");
	});
	it("bidPrice for RandomWalk is 50% lower", async function () {
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			bidLogic,
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let rwalkBidPrice = bidPrice.div(ethers.BigNumber.from("2"));
		var mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: mintPrice });
		await ethers.provider.send("evm_setNextBlockTimestamp", [2000000000]);
		let bidParams = { msg: "random walk", rwalk: 0 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice }))
			.to.emit(cosmicGameProxy, "BidEvent")
			.withArgs(addr1.address, 0, rwalkBidPrice, 0, -1, 2000090000, "random walk");
	});
	it("DonatedNFTClaimedEvent is correctly emitted", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet } =
			await loadFixture(deployCosmic);
		[owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await ethers.getSigners();
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		let mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(bidder1).mint({ value: mintPrice });
		await randomWalkNFT.connect(bidder1).setApprovalForAll(cosmicGameProxy.address, true);
		await cosmicGameProxy.connect(bidder1).bidAndDonateNFT(params, randomWalkNFT.address, 0, { value: bidPrice });

		let prizeTimeInc = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send("evm_increaseTime", [prizeTimeInc.toNumber()]);

		await expect(cosmicGameProxy.connect(bidder1).claimPrize());

		await expect(cosmicGameProxy.connect(bidder1).claimDonatedNFT(0))
			.to.emit(cosmicGameProxy, "DonatedNFTClaimedEvent")
			.withArgs(0, 0, bidder1.address, randomWalkNFT.address, 0);
	});
	it("should not be possible to bid before activation", async function () {
		[owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await ethers.getSigners();
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
		} = await basicDeploymentAdvanced("SpecialCosmicGameProxy",owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,true);

		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");

		const sevenDays = 7 * 24 * 60 * 60;

		const blockNumBefore = await ethers.provider.getBlockNumber();
		const blockBefore = await ethers.provider.getBlock(blockNumBefore);
		const timestampBefore = blockBefore.timestamp;

		await cosmicGameProxy.connect(owner).setActivationTimeRaw(timestampBefore + 100);

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(bidder1).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(contractErrors,"ActivationTime");

		await expect(
			bidder2.sendTransaction({
				to: cosmicGameProxy.address,
				value: bidPrice,
			}),
		).to.be.revertedWithCustomError(contractErrors,"ActivationTime");

		await ethers.provider.send("evm_increaseTime", [100]);
		await ethers.provider.send("evm_mine");

		bidParams = { msg: "", rwalk: -1 };
		params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(bidder1).bid(params, { value: bidPrice });
		expect((await cosmicGameProxy.getBidPrice()) > bidPrice);
	});
	it("should be possible to bid by sending to the contract", async function () {
		[owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT, raffleWallet } =
			await loadFixture(deployCosmic);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(bidder1).bid(params, { value: bidPrice });
		expect((await cosmicGameProxy.getBidPrice()) > bidPrice);

		bidPrice = await cosmicGameProxy.getBidPrice();
		await bidder2.sendTransaction({
			to: cosmicGameProxy.address,
			value: bidPrice,
		});
		expect((await cosmicGameProxy.getBidPrice()) > bidPrice);
	});

	it("Admin events should work", async function () {
		[owner] = await ethers.getSigners();
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
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,false);

		[owner, testAcct] = await ethers.getSigners();
		var percentage = ethers.BigNumber.from("11");
		await expect(cosmicGameProxy.connect(owner).setCharityPercentage(percentage))
			.to.emit(cosmicGameProxy, "CharityPercentageChanged")
			.withArgs(percentage);
		expect((await cosmicGameProxy.charityPercentage()).toString()).to.equal(percentage.toString());

		percentage = ethers.BigNumber.from("12");
		await expect(cosmicGameProxy.connect(owner).setPrizePercentage(percentage))
			.to.emit(cosmicGameProxy, "PrizePercentageChanged")
			.withArgs(percentage);
		expect((await cosmicGameProxy.prizePercentage()).toString()).to.equal(percentage.toString());

		percentage = ethers.BigNumber.from("13");
		await expect(cosmicGameProxy.connect(owner).setRafflePercentage(percentage))
			.to.emit(cosmicGameProxy, "RafflePercentageChanged")
			.withArgs(percentage);
		expect((await cosmicGameProxy.rafflePercentage()).toString()).to.equal(percentage.toString());

		var num_winners = ethers.BigNumber.from("11");
		await expect(cosmicGameProxy.connect(owner).setNumRaffleETHWinnersBidding(num_winners))
			.to.emit(cosmicGameProxy, "NumRaffleETHWinnersBiddingChanged")
			.withArgs(num_winners);
		expect((await cosmicGameProxy.numRaffleETHWinnersBidding()).toString()).to.equal(num_winners.toString());

		num_winners = ethers.BigNumber.from("12");
		await expect(cosmicGameProxy.connect(owner).setNumRaffleNFTWinnersBidding(num_winners))
			.to.emit(cosmicGameProxy, "NumRaffleNFTWinnersBiddingChanged")
			.withArgs(num_winners);
		expect((await cosmicGameProxy.numRaffleNFTWinnersBidding()).toString()).to.equal(num_winners.toString());

		num_winners = ethers.BigNumber.from("14");
		await expect(cosmicGameProxy.connect(owner).setNumRaffleNFTWinnersStakingRWalk(num_winners))
			.to.emit(cosmicGameProxy, "NumRaffleNFTWinnersStakingRWalkChanged")
			.withArgs(num_winners);
		expect((await cosmicGameProxy.numRaffleNFTWinnersStakingRWalk()).toString()).to.equal(num_winners.toString());

		testAcct = ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setCharity(testAcct.address))
			.to.emit(cosmicGameProxy, "CharityAddressChanged")
			.withArgs(testAcct.address);
		expect((await cosmicGameProxy.charity()).toString()).to.equal(testAcct.address.toString());

		testAcct = ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setRandomWalk(testAcct.address))
			.to.emit(cosmicGameProxy, "RandomWalkAddressChanged")
			.withArgs(testAcct.address);
		expect(await cosmicGameProxy.randomWalk()).to.equal(testAcct.address);

		testAcct = ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setRaffleWallet(testAcct.address))
			.to.emit(cosmicGameProxy, "RaffleWalletAddressChanged")
			.withArgs(testAcct.address);
		expect(await cosmicGameProxy.raffleWallet()).to.equal(testAcct.address);

		testAcct = ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setTokenContract(testAcct.address))
			.to.emit(cosmicGameProxy, "CosmicTokenAddressChanged")
			.withArgs(testAcct.address);
		expect(await cosmicGameProxy.token()).to.equal(testAcct.address);

		testAcct = ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setNftContract(testAcct.address))
			.to.emit(cosmicGameProxy, "CosmicSignatureAddressChanged")
			.withArgs(testAcct.address);
		expect(await cosmicGameProxy.nft()).to.equal(testAcct.address);

		var time_increase = ethers.BigNumber.from("1001");
		await expect(cosmicGameProxy.connect(owner).setTimeIncrease(time_increase))
			.to.emit(cosmicGameProxy, "TimeIncreaseChanged")
			.withArgs(time_increase);
		expect((await cosmicGameProxy.timeIncrease()).toString()).to.equal(time_increase.toString());

		var timeout_claim_prize = ethers.BigNumber.from("1003");
		await expect(cosmicGameProxy.connect(owner).setTimeoutClaimPrize(timeout_claim_prize))
			.to.emit(cosmicGameProxy, "TimeoutClaimPrizeChanged")
			.withArgs(timeout_claim_prize);
		expect((await cosmicGameProxy.timeoutClaimPrize()).toString()).to.equal(timeout_claim_prize.toString());

		var price_increase = ethers.BigNumber.from("1002");
		await expect(cosmicGameProxy.connect(owner).setPriceIncrease(price_increase))
			.to.emit(cosmicGameProxy, "PriceIncreaseChanged")
			.withArgs(price_increase);
		expect((await cosmicGameProxy.priceIncrease()).toString()).to.equal(price_increase.toString());

		var nanoseconds = ethers.BigNumber.from("1003");
		await expect(cosmicGameProxy.connect(owner).setNanoSecondsExtra(nanoseconds))
			.to.emit(cosmicGameProxy, "NanoSecondsExtraChanged")
			.withArgs(nanoseconds);
		expect((await cosmicGameProxy.nanoSecondsExtra()).toString()).to.equal(nanoseconds.toString());

		var initialseconds = ethers.BigNumber.from("1004");
		await expect(cosmicGameProxy.connect(owner).setInitialSecondsUntilPrize(initialseconds))
			.to.emit(cosmicGameProxy, "InitialSecondsUntilPrizeChanged")
			.withArgs(initialseconds);
		expect((await cosmicGameProxy.initialSecondsUntilPrize()).toString()).to.equal(initialseconds.toString());

		var bidamount = ethers.BigNumber.from("1005");
		await expect(cosmicGameProxy.connect(owner).updateInitialBidAmountFraction(bidamount))
			.to.emit(cosmicGameProxy, "InitialBidAmountFractionChanged")
			.withArgs(bidamount);
		expect((await cosmicGameProxy.initialBidAmountFraction()).toString()).to.equal(bidamount.toString());

		var activationtime = ethers.BigNumber.from("1006");
		await expect(cosmicGameProxy.connect(owner).setActivationTime(activationtime))
			.to.emit(cosmicGameProxy, "ActivationTimeChanged")
			.withArgs(activationtime);
		expect((await cosmicGameProxy.activationTime()).toString()).to.equal(activationtime.toString());
	});
});
