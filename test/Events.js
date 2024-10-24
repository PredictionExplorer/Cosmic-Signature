const hre = require("hardhat");
const { expect } = require("chai");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Events", function () {
	const INITIAL_AMOUNT = hre.ethers.parseUnits("10",18);
	async function deployCosmic() {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			ethPrizesWallet,
			randomWalkNFT,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			bidLogic,
		} = await basicDeployment(contractDeployerAcct, "", 0, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", true);

		return {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			ethPrizesWallet,
			randomWalkNFT,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
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
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, ethPrizesWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		const [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await hre.ethers.getSigners();
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(bidder1).bid(params, { value: bidPrice });
		await hre.ethers.provider.send("evm_increaseTime", [26 * 3600]);
		await hre.ethers.provider.send("evm_mine");
		const tx = await cosmicGameProxy.connect(bidder1).claimPrize();
		await tx.wait();
		let seed = await cosmicSignature.seeds(0);
		expect(tx).to.emit(cosmicSignature, "MintEvent").withArgs(0, bidder1.address, seed);
	});
	it("should emit the correct events in the CharityWallet contract", async function () {
		const [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, ethPrizesWallet, randomWalkNFT } =
			await basicDeployment(owner, "", 0, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", false);
		// DonationReceivedEvent
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(bidder1).bid(params, { value: bidPrice });
		let charityAmount = await cosmicGameProxy.charityAmount();
		let stakingAmount = await cosmicGameProxy.stakingAmount();
		await hre.ethers.provider.send("evm_increaseTime", [26 * 3600]);
		await hre.ethers.provider.send("evm_mine");
		await expect(cosmicGameProxy.connect(bidder1).claimPrize())
			.to.emit(charityWallet, "DonationReceivedEvent")
			.withArgs(await cosmicGameProxy.getAddress(), charityAmount + stakingAmount);
		let balance = await hre.ethers.provider.getBalance(await charityWallet.getAddress());
		expect(balance).to.equal(charityAmount + stakingAmount);

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
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, ethPrizesWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		const [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await hre.ethers.getSigners();
		await cosmicGameProxy.connect(owner).donate({ value: INITIAL_AMOUNT });
		const donationAmount = hre.ethers.parseEther("1");

		let roundNum = 0;
		await expect(cosmicGameProxy.connect(donor).donate({ value: donationAmount }))
			.to.emit(cosmicGameProxy, "DonationEvent")
			.withArgs(donor.address, donationAmount, roundNum);

		const contractBalance = await hre.ethers.provider.getBalance(await cosmicGameProxy.getAddress());
		expect(contractBalance).to.equal(donationAmount+INITIAL_AMOUNT);
	});
	it("should emit MainPrizeClaimed and update winner on successful prize claim", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, ethPrizesWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		const [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await hre.ethers.getSigners();
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");
		let bidPrice = await cosmicGameProxy.getBidPrice();

		let mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(donor).mint({ value: mintPrice });

		await randomWalkNFT.connect(donor).setApprovalForAll(await cosmicGameProxy.getAddress(), true);

		let bidParams = { msg: "", rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(donor).bidAndDonateNFT(params,await randomWalkNFT.getAddress(), 0, { value: bidPrice });

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(bidder1).bid(params, { value: bidPrice });

		await expect(cosmicGameProxy.connect(bidder1).claimDonatedNFT(0)).to.be.revertedWithCustomError(contractErrors,"NonExistentWinner");

		await hre.ethers.provider.send("evm_increaseTime", [26 * 3600]);
		await hre.ethers.provider.send("evm_mine");

		let prizeAmountBeforeClaim = await cosmicGameProxy.prizeAmount();

		await expect(cosmicGameProxy.connect(bidder1).claimPrize())
			.to.emit(cosmicGameProxy, "MainPrizeClaimed")
			.withArgs(0, bidder1.address, prizeAmountBeforeClaim);

		const winner = await cosmicGameProxy.winners(0);
		expect(winner).to.equal(bidder1.address);

		const prizeAmountAfterClaim = await cosmicGameProxy.prizeAmount();
		balance = await hre.ethers.provider.getBalance(await cosmicGameProxy.getAddress());
		expectedPrizeAmount = balance * 25n / 100n;
		expect(prizeAmountAfterClaim).to.equal(expectedPrizeAmount);

		await expect(cosmicGameProxy.connect(bidder1).claimDonatedNFT(1)).to.be.revertedWithCustomError(contractErrors,"InvalidDonatedNFTIndex");

		await cosmicGameProxy.connect(bidder1).claimDonatedNFT(0);
		await expect(cosmicGameProxy.connect(bidder1).claimDonatedNFT(0)).to.be.revertedWithCustomError(contractErrors,"NFTAlreadyClaimed");

		mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(donor).mint({ value: mintPrice });
		mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(donor).mint({ value: mintPrice });

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(bidder1).bid(params, { value: bidPrice });

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "hello", rwalk: 1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(donor).bidAndDonateNFT(params, await randomWalkNFT.getAddress(), 2, { value: bidPrice });

		await hre.ethers.provider.send("evm_increaseTime", [26 * 3600]);
		await hre.ethers.provider.send("evm_mine");

		prizeAmountBeforeClaim = await cosmicGameProxy.prizeAmount();
		await expect(cosmicGameProxy.connect(donor).claimPrize())
			.to.emit(cosmicGameProxy, "MainPrizeClaimed")
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
			ethPrizesWallet,
			randomWalkNFT,
			bidLogic,
		} = await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();

		let bidPrice = await cosmicGameProxy.getBidPrice();

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [2000000000]);
		let bidParams = { msg: "simple text", rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		expect(await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice }))
			.to.emit(bidLogic, "BidEvent")
			.withArgs(addr1.address, 0, bidPrice, -1, -1, 2000090000, "simple text");
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [2100000000]);
		const mintPrice = await randomWalkNFT.getMintPrice();
		bidPrice = await cosmicGameProxy.getBidPrice();
		await randomWalkNFT.connect(addr1).mint({ value: mintPrice });
		bidParams = { msg: "random walk", rwalk: 0 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
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
			ethPrizesWallet,
			randomWalkNFT,
			bidLogic,
		} = await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let rwalkBidPrice = bidPrice / 2n;
		const mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(addr1).mint({ value: mintPrice });
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [2000000000]);
		let bidParams = { msg: "random walk", rwalk: 0 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice }))
			.to.emit(cosmicGameProxy, "BidEvent")
			.withArgs(addr1.address, 0, rwalkBidPrice, 0, -1, 2000090000, "random walk");
	});
	it("DonatedNFTClaimedEvent is correctly emitted", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, ethPrizesWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		const [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await hre.ethers.getSigners();
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let mintPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.connect(bidder1).mint({ value: mintPrice });
		await randomWalkNFT.connect(bidder1).setApprovalForAll(await cosmicGameProxy.getAddress(), true);
		await cosmicGameProxy.connect(bidder1).bidAndDonateNFT(params, await randomWalkNFT.getAddress(), 0, { value: bidPrice });

		let prizeTimeInc = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTimeInc)]);

		await expect(cosmicGameProxy.connect(bidder1).claimPrize());

		await expect(cosmicGameProxy.connect(bidder1).claimDonatedNFT(0))
			.to.emit(cosmicGameProxy, "DonatedNFTClaimedEvent")
			.withArgs(0, 0, bidder1.address, await randomWalkNFT.getAddress(), 0);
	});
	it("should not be possible to bid before activation", async function () {
		const [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			ethPrizesWallet,
			randomWalkNFT,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
		} = await basicDeploymentAdvanced("SpecialCosmicGame", owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true, true);

		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");

		const sevenDays = 7 * 24 * 60 * 60;

		const blockNumBefore = await hre.ethers.provider.getBlockNumber();
		const blockBefore = await hre.ethers.provider.getBlock(blockNumBefore);
		const timestampBefore = blockBefore.timestamp;

		await cosmicGameProxy.connect(owner).setActivationTimeRaw(timestampBefore + 100);

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicGameProxy.connect(bidder1).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(contractErrors,"ActivationTime");

		await expect(
			bidder2.sendTransaction({
				to: await cosmicGameProxy.getAddress(),
				value: bidPrice,
			}),
		).to.be.revertedWithCustomError(contractErrors,"ActivationTime");

		await hre.ethers.provider.send("evm_increaseTime", [100]);
		await hre.ethers.provider.send("evm_mine");

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: "", rwalk: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(bidder1).bid(params, { value: bidPrice });
		expect((await cosmicGameProxy.getBidPrice()) > bidPrice);
	});
	it("should be possible to bid by sending to the contract", async function () {
		const [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner] = await hre.ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, ethPrizesWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(bidder1).bid(params, { value: bidPrice });
		expect((await cosmicGameProxy.getBidPrice()) > bidPrice);

		bidPrice = await cosmicGameProxy.getBidPrice();
		await bidder2.sendTransaction({
			to: await cosmicGameProxy.getAddress(),
			value: bidPrice,
		});
		expect((await cosmicGameProxy.getBidPrice()) > bidPrice);
	});
	it("Admin events should work", async function () {
		const signers = await hre.ethers.getSigners();
		const owner = signers[0];
		let testAcct = signers[1];
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			ethPrizesWallet,
			randomWalkNFT,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,false);

		let percentage = 11n;
		await expect(cosmicGameProxy.connect(owner).setCharityPercentage(percentage))
			.to.emit(cosmicGameProxy, "CharityPercentageChanged")
			.withArgs(percentage);
		expect((await cosmicGameProxy.charityPercentage()).toString()).to.equal(percentage.toString());

		percentage = 12n;
		await expect(cosmicGameProxy.connect(owner).setPrizePercentage(percentage))
			.to.emit(cosmicGameProxy, "PrizePercentageChanged")
			.withArgs(percentage);
		expect((await cosmicGameProxy.prizePercentage()).toString()).to.equal(percentage.toString());

		percentage = 13n;
		await expect(cosmicGameProxy.connect(owner).setRafflePercentage(percentage))
			.to.emit(cosmicGameProxy, "RafflePercentageChanged")
			.withArgs(percentage);
		expect((await cosmicGameProxy.rafflePercentage()).toString()).to.equal(percentage.toString());

		let num_winners = 11n;
		await expect(cosmicGameProxy.connect(owner).setNumRaffleETHWinnersBidding(num_winners))
			.to.emit(cosmicGameProxy, "NumRaffleETHWinnersBiddingChanged")
			.withArgs(num_winners);
		expect((await cosmicGameProxy.numRaffleETHWinnersBidding()).toString()).to.equal(num_winners.toString());

		num_winners = 12n;
		await expect(cosmicGameProxy.connect(owner).setNumRaffleNFTWinnersBidding(num_winners))
			.to.emit(cosmicGameProxy, "NumRaffleNFTWinnersBiddingChanged")
			.withArgs(num_winners);
		expect((await cosmicGameProxy.numRaffleNFTWinnersBidding()).toString()).to.equal(num_winners.toString());

		num_winners = 14n;
		await expect(cosmicGameProxy.connect(owner).setNumRaffleNFTWinnersStakingRWalk(num_winners))
			.to.emit(cosmicGameProxy, "NumRaffleNFTWinnersStakingRWalkChanged")
			.withArgs(num_winners);
		expect((await cosmicGameProxy.numRaffleNFTWinnersStakingRWalk()).toString()).to.equal(num_winners.toString());

		testAcct = hre.ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setCharity(testAcct.address))
			.to.emit(cosmicGameProxy, "CharityAddressChanged")
			.withArgs(testAcct.address);
		expect((await cosmicGameProxy.charity()).toString()).to.equal(testAcct.address.toString());

		testAcct = hre.ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setRandomWalkNft(testAcct.address))
			.to.emit(cosmicGameProxy, "RandomWalkNftAddressChanged")
			.withArgs(testAcct.address);
		expect(await cosmicGameProxy.randomWalkNft()).to.equal(testAcct.address);

		testAcct = hre.ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setEthPrizesWallet(testAcct.address))
			.to.emit(cosmicGameProxy, "EthPrizesWalletAddressChanged")
			.withArgs(testAcct.address);
		expect(await cosmicGameProxy.ethPrizesWallet()).to.equal(testAcct.address);

		testAcct = hre.ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setTokenContract(testAcct.address))
			.to.emit(cosmicGameProxy, "CosmicTokenAddressChanged")
			.withArgs(testAcct.address);
		expect(await cosmicGameProxy.token()).to.equal(testAcct.address);

		testAcct = hre.ethers.Wallet.createRandom();
		await expect(cosmicGameProxy.connect(owner).setNftContract(testAcct.address))
			.to.emit(cosmicGameProxy, "CosmicSignatureAddressChanged")
			.withArgs(testAcct.address);
		expect(await cosmicGameProxy.nft()).to.equal(testAcct.address);

		const time_increase = 1001n;
		await expect(cosmicGameProxy.connect(owner).setTimeIncrease(time_increase))
			.to.emit(cosmicGameProxy, "TimeIncreaseChanged")
			.withArgs(time_increase);
		expect((await cosmicGameProxy.timeIncrease()).toString()).to.equal(time_increase.toString());

		const timeout_claim_prize = 1003n;
		await expect(cosmicGameProxy.connect(owner).setTimeoutClaimPrize(timeout_claim_prize))
			.to.emit(cosmicGameProxy, "TimeoutClaimPrizeChanged")
			.withArgs(timeout_claim_prize);
		expect((await cosmicGameProxy.timeoutClaimPrize()).toString()).to.equal(timeout_claim_prize.toString());

		const price_increase = 1002n;
		await expect(cosmicGameProxy.connect(owner).setPriceIncrease(price_increase))
			.to.emit(cosmicGameProxy, "PriceIncreaseChanged")
			.withArgs(price_increase);
		expect((await cosmicGameProxy.priceIncrease()).toString()).to.equal(price_increase.toString());

		const nanoseconds = 1003n;
		await expect(cosmicGameProxy.connect(owner).setNanoSecondsExtra(nanoseconds))
			.to.emit(cosmicGameProxy, "NanoSecondsExtraChanged")
			.withArgs(nanoseconds);
		expect((await cosmicGameProxy.nanoSecondsExtra()).toString()).to.equal(nanoseconds.toString());

		const initialseconds = 1004n;
		await expect(cosmicGameProxy.connect(owner).setInitialSecondsUntilPrize(initialseconds))
			.to.emit(cosmicGameProxy, "InitialSecondsUntilPrizeChanged")
			.withArgs(initialseconds);
		expect((await cosmicGameProxy.initialSecondsUntilPrize()).toString()).to.equal(initialseconds.toString());

		const bidamount = 1005n;
		await expect(cosmicGameProxy.connect(owner).updateInitialBidAmountFraction(bidamount))
			.to.emit(cosmicGameProxy, "InitialBidAmountFractionChanged")
			.withArgs(bidamount);
		expect((await cosmicGameProxy.initialBidAmountFraction()).toString()).to.equal(bidamount.toString());

		const activationtime = 1006n;
		await expect(cosmicGameProxy.connect(owner).setActivationTime(activationtime))
			.to.emit(cosmicGameProxy, "ActivationTimeChanged")
			.withArgs(activationtime);
		expect((await cosmicGameProxy.activationTime()).toString()).to.equal(activationtime.toString());
	});
});
