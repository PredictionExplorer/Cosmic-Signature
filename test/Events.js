"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

describe("Events", function () {
	const INITIAL_AMOUNT = hre.ethers.parseUnits("10",18);
	async function deployCosmicSignature() {
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
			// todo-1 This `bidLogic` thing doesn't exist.
			// todo-1 I've seen it in many places.
			bidLogic,
		} = await basicDeployment(contractDeployerAcct, "", 1, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", true);
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
			bidLogic,
		};
	}
	const bidParamsEncoding = {
		type: "tuple(string,int256)",
		name: "BidParams",
		components: [
			{ name: "message", type: "string" },
			{ name: "randomWalkNftId", type: "int256" },
		],
	};
	it("should emit the correct events in the CosmicSignatureNft contract", async function () {
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, cosmicSignatureDao, prizesWallet, randomWalkNft } =
			await loadFixture(deployCosmicSignature);
		const [owner, charityAddress, donor, bidder1, bidder2, bidder3, daoOwner] = await hre.ethers.getSigners();
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		let bidParams = { message: "", randomWalkNftId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicSignatureGameProxy.connect(bidder1).bid(params, { value: bidPrice });
		await hre.ethers.provider.send("evm_increaseTime", [26 * 3600]);
		await hre.ethers.provider.send("evm_mine");
		const tx = await cosmicSignatureGameProxy.connect(bidder1).claimPrize();
		await tx.wait();
		let seed = await cosmicSignatureNft.getNftSeed(0);
		expect(tx).to.emit(cosmicSignatureNft, "NftMinted").withArgs(0n, bidder1.address, seed, 0n);
	});
	it("should emit the correct events in the CharityWallet contract", async function () {
		const [owner, charityAddress, donor, bidder1, bidder2, bidder3, daoOwner] = await hre.ethers.getSigners();
		const { cosmicSignatureGameProxy, cosmicSignatureToken, charityWallet, cosmicSignatureDao, prizesWallet, randomWalkNft } =
			await basicDeployment(owner, "", 1, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", false);
		// DonationReceivedEvent
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		let bidParams = { message: "", randomWalkNftId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicSignatureGameProxy.connect(bidder1).bid(params, { value: bidPrice });
		let charityAmount = await cosmicSignatureGameProxy.charityAmount();
		let stakingAmount = await cosmicSignatureGameProxy.stakingAmount();
		await hre.ethers.provider.send("evm_increaseTime", [26 * 3600]);
		await hre.ethers.provider.send("evm_mine");
		await expect(cosmicSignatureGameProxy.connect(bidder1).claimPrize())
			.to.emit(charityWallet, "DonationReceivedEvent")
			.withArgs(await cosmicSignatureGameProxy.getAddress(), charityAmount + stakingAmount);
		const balance = await hre.ethers.provider.getBalance(await charityWallet.getAddress());
		expect(balance).to.equal(charityAmount + stakingAmount);

		// CharityAddressChanged
		await expect(charityWallet.connect(owner).setCharityAddress(bidder3.address))
			.to.emit(charityWallet, "CharityAddressChanged")
			.withArgs(bidder3.address);

		// DonationSentEvent
		await expect(charityWallet.connect(bidder2).send())
			.to.emit(charityWallet, "DonationSentEvent")
			.withArgs(bidder3.address, balance);
	});
	it("should emit DonationEvent on successful donation", async function () {
		const { cosmicSignatureGameProxy, cosmicSignatureToken, charityWallet, cosmicSignatureDao, prizesWallet, randomWalkNft } =
			await loadFixture(deployCosmicSignature);
		const [owner, charityAddress, donor, bidder1, bidder2, bidder3, daoOwner] = await hre.ethers.getSigners();
		await cosmicSignatureGameProxy.connect(owner).donate({ value: INITIAL_AMOUNT });
		const donationAmount = hre.ethers.parseEther("1");

		let roundNum = 0;
		await expect(cosmicSignatureGameProxy.connect(donor).donate({ value: donationAmount }))
			.to.emit(cosmicSignatureGameProxy, "DonationEvent")
			.withArgs(donor.address, donationAmount, roundNum);

		const contractBalance = await hre.ethers.provider.getBalance(await cosmicSignatureGameProxy.getAddress());
		expect(contractBalance).to.equal(donationAmount+INITIAL_AMOUNT);
	});

	// todo-1 This test is now broken because I have moved NFT donations to `PrizesWallet`.
	it("should emit MainPrizeClaimed and update winner on successful prize claim", async function () {
		const { cosmicSignatureGameProxy, cosmicSignatureToken, charityWallet, cosmicSignatureDao, prizesWallet, randomWalkNft } =
			await loadFixture(deployCosmicSignature);
		const [owner, charityAddress, donor, bidder1, bidder2, bidder3, daoOwner] = await hre.ethers.getSigners();
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		// ToDo-202411202-1 applies.
		cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(0);

		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();

		let mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(donor).mint({ value: mintPrice });

		// await randeomWalkNFT.connect(donor).setApprovalForAll(await cosmicSignatureGameProxy.getAddress(), true);
		await randomWalkNft.connect(donor).setApprovalForAll(await cosmicSignatureGameProxy.prizesWallet(), true);

		let bidParams = { message: "", randomWalkNftId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicSignatureGameProxy.connect(donor).bidAndDonateNft(params,await randomWalkNft.getAddress(), 0, { value: bidPrice });

		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		bidParams = { message: "", randomWalkNftId: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicSignatureGameProxy.connect(bidder1).bid(params, { value: bidPrice });

		// todo-1 I have moved NFT donations to `PrizesWallet`.
		await expect(cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(0)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "DonatedNftClaimDenied");

		await hre.ethers.provider.send("evm_increaseTime", [26 * 3600]);
		await hre.ethers.provider.send("evm_mine");

		let mainPrizeAmountBeforeClaim_ = await cosmicSignatureGameProxy.mainPrizeAmount();

		await expect(cosmicSignatureGameProxy.connect(bidder1).claimPrize())
			.to.emit(cosmicSignatureGameProxy, "MainPrizeClaimed")
			.withArgs(0, bidder1.address, mainPrizeAmountBeforeClaim_);

		const roundMainPrizeWinnerAddress_ = await cosmicSignatureGameProxy.winners(0);
		expect(roundMainPrizeWinnerAddress_).to.equal(bidder1.address);

		const mainPrizeAmountAfterClaim_ = await cosmicSignatureGameProxy.mainPrizeAmount();
		const balance = await hre.ethers.provider.getBalance(await cosmicSignatureGameProxy.getAddress());
		const mainPrizeExpectedAmount_ = balance * 25n / 100n;
		expect(mainPrizeAmountAfterClaim_).to.equal(mainPrizeExpectedAmount_);

		// todo-1 I have moved NFT donations to `PrizesWallet`.
		await expect(cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(1)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "InvalidDonatedNftIndex");

		// todo-1 I have moved NFT donations to `PrizesWallet`.
		await cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(0);
		await expect(cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(0)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "DonatedNftAlreadyClaimed");

		mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(donor).mint({ value: mintPrice });
		mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(donor).mint({ value: mintPrice });

		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		bidParams = { message: "", randomWalkNftId: -1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicSignatureGameProxy.connect(bidder1).bid(params, { value: bidPrice });

		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		bidParams = { message: "hello", randomWalkNftId: 1 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicSignatureGameProxy.connect(donor).bidAndDonateNft(params, await randomWalkNft.getAddress(), 2, { value: bidPrice });

		await hre.ethers.provider.send("evm_increaseTime", [26 * 3600]);
		await hre.ethers.provider.send("evm_mine");

		mainPrizeAmountBeforeClaim_ = await cosmicSignatureGameProxy.mainPrizeAmount();
		await expect(cosmicSignatureGameProxy.connect(donor).claimPrize())
			.to.emit(cosmicSignatureGameProxy, "MainPrizeClaimed")
			.withArgs(1, donor.address, mainPrizeAmountBeforeClaim_);

		expect(await randomWalkNft.balanceOf(donor.address)).to.equal(1);
		// todo-1 I have moved NFT donations to `PrizesWallet`.
		await cosmicSignatureGameProxy.connect(donor).claimDonatedNft(1);
		expect(await randomWalkNft.balanceOf(donor.address)).to.equal(2);

		expect(await cosmicSignatureGameProxy.roundNum()).to.equal(2);
	});

	it("BidEvent is correctly emitted", async function () {
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			bidLogic,
		} = await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();

		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [2000000000]);
		let bidParams = { message: "simple text", randomWalkNftId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		expect(await cosmicSignatureGameProxy.connect(addr1).bid(params, { value: bidPrice }))
			.to.emit(bidLogic, "BidEvent")
			.withArgs(addr1.address, 0, bidPrice, -1, -1, 2000090000, "simple text");
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [2100000000]);
		const mintPrice = await randomWalkNft.getMintPrice();
		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await randomWalkNft.connect(addr1).mint({ value: mintPrice });
		bidParams = { message: "random walk", randomWalkNftId: 0 };
		params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		expect(await cosmicSignatureGameProxy.connect(addr1).bid(params, { value: bidPrice }))
			.to.emit(bidLogic, "BidEvent")
			.withArgs(addr1.address, 0, 1020100000000000, 0, -1, 2100003601, "random walk");
	});
	it("bidPrice for RandomWalk is 50% lower", async function () {
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			bidLogic,
		} = await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();

		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		let rwalkBidPrice = bidPrice / 2n;
		const mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr1).mint({ value: mintPrice });
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [2000000000]);
		let bidParams = { message: "random walk", randomWalkNftId: 0 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await expect(cosmicSignatureGameProxy.connect(addr1).bid(params, { value: bidPrice }))
			.to.emit(cosmicSignatureGameProxy, "BidEvent")
			.withArgs(addr1.address, 0, rwalkBidPrice, 0, -1, 2000090000, "random walk");
	});

	// todo-1 This test is now broken because I have moved NFT donations to `PrizesWallet`.
	it("DonatedNftClaimedEvent is correctly emitted", async function () {
		const { cosmicSignatureGameProxy, cosmicSignatureToken, charityWallet, cosmicSignatureDao, prizesWallet, randomWalkNft } =
			await loadFixture(deployCosmicSignature);
		const [owner, charityAddress, donor, bidder1, bidder2, bidder3, daoOwner] = await hre.ethers.getSigners();

		// ToDo-202411202-1 applies.
		cosmicSignatureGameProxy.setDelayDurationBeforeNextRound(0);

		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		let bidParams = { message: "", randomWalkNftId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(bidder1).mint({ value: mintPrice });
		// await randomWalkNft.connect(bidder1).setApprovalForAll(await cosmicSignatureGameProxy.getAddress(), true);
		await randomWalkNft.connect(bidder1).setApprovalForAll(await cosmicSignatureGameProxy.prizesWallet(), true);
		await cosmicSignatureGameProxy.connect(bidder1).bidAndDonateNft(params, await randomWalkNft.getAddress(), 0, { value: bidPrice });

		let prizeTimeInc = await cosmicSignatureGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTimeInc)]);

		await expect(cosmicSignatureGameProxy.connect(bidder1).claimPrize());

		// todo-1 I have moved NFT donations to `PrizesWallet`.
		await expect(cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(0))
			.to.emit(cosmicSignatureGameProxy, "DonatedNftClaimedEvent")
			.withArgs(0, 0, bidder1.address, await randomWalkNft.getAddress(), 0);
	});

	it("should not be possible to bid before activation", async function () {
		const [owner, charityAddress, donor, bidder1, bidder2, bidder3, daoOwner] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
		// } = await basicDeploymentAdvanced("SpecialCosmicSignatureGame", owner, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);

		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		// const sevenDays = 7 * 24 * 60 * 60;

		const blockNumBefore = await hre.ethers.provider.getBlockNumber();
		const blockBefore = await hre.ethers.provider.getBlock(blockNumBefore);
		const timestampBefore = blockBefore.timestamp;

		// await cosmicSignatureGameProxy.connect(owner).setActivationTimeRaw(timestampBefore + 100);
		await cosmicSignatureGameProxy.connect(owner).setActivationTime(timestampBefore + 100);

		let bidParams = { message: "", randomWalkNftId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await expect(cosmicSignatureGameProxy.connect(bidder1).bid(params, { value: bidPrice })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");
		await expect(
			bidder2.sendTransaction({
				to: await cosmicSignatureGameProxy.getAddress(),
				value: bidPrice,
			}),
		).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "SystemIsInactive");

		await hre.ethers.provider.send("evm_increaseTime", [100]);
		await hre.ethers.provider.send("evm_mine");

		// bidParams = { message: "", randomWalkNftId: -1 };
		// params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		// bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		expect((await cosmicSignatureGameProxy.getBidPrice()) === bidPrice);
		await cosmicSignatureGameProxy.connect(bidder1).bid(params, { value: bidPrice });
		expect((await cosmicSignatureGameProxy.getBidPrice()) > bidPrice);
	});
	it("should be possible to bid by sending to the contract", async function () {
		const [owner, charityAddress, donor, bidder1, bidder2, bidder3, daoOwner] = await hre.ethers.getSigners();
		const { cosmicSignatureGameProxy, cosmicSignatureToken, charityWallet, cosmicSignatureDao, prizesWallet, randomWalkNft } =
			await loadFixture(deployCosmicSignature);
		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		let bidParams = { message: "", randomWalkNftId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicSignatureGameProxy.connect(bidder1).bid(params, { value: bidPrice });
		expect((await cosmicSignatureGameProxy.getBidPrice()) > bidPrice);

		bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await bidder2.sendTransaction({
			to: await cosmicSignatureGameProxy.getAddress(),
			value: bidPrice,
		});
		expect((await cosmicSignatureGameProxy.getBidPrice()) > bidPrice);
	});
	// todo-1 Move this to "SystemManagement.js"?
	// todo-1 This appears to be missing some tests.
	it("Admin events should work", async function () {
		const signers = await hre.ethers.getSigners();
		const owner = signers[0];
		let testAcct_ = signers[1];
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);

		let percentage = 11n;
		await expect(cosmicSignatureGameProxy.connect(owner).setMainPrizePercentage(percentage))
			.to.emit(cosmicSignatureGameProxy, "MainPrizePercentageChanged")
			.withArgs(percentage);
		expect((await cosmicSignatureGameProxy.mainPrizePercentage()).toString()).to.equal(percentage.toString());

		percentage = 12n;
		await expect(cosmicSignatureGameProxy.connect(owner).setChronoWarriorEthPrizePercentage(percentage))
			.to.emit(cosmicSignatureGameProxy, "ChronoWarriorEthPrizePercentageChanged")
			.withArgs(percentage);
		expect((await cosmicSignatureGameProxy.chronoWarriorEthPrizePercentage()).toString()).to.equal(percentage.toString());

		percentage = 13n;
		await expect(cosmicSignatureGameProxy.connect(owner).setRafflePercentage(percentage))
			.to.emit(cosmicSignatureGameProxy, "RafflePercentageChanged")
			.withArgs(percentage);
		expect((await cosmicSignatureGameProxy.rafflePercentage()).toString()).to.equal(percentage.toString());

		// todo-1 percentage = 14n;
		// todo-1 setStakingPercentage(percentage)

		percentage = 15n;
		await expect(cosmicSignatureGameProxy.connect(owner).setCharityPercentage(percentage))
			.to.emit(cosmicSignatureGameProxy, "CharityPercentageChanged")
			.withArgs(percentage);
		expect((await cosmicSignatureGameProxy.charityPercentage()).toString()).to.equal(percentage.toString());

		let num_winners = 11n;
		await expect(cosmicSignatureGameProxy.connect(owner).setNumRaffleETHWinnersBidding(num_winners))
			.to.emit(cosmicSignatureGameProxy, "NumRaffleETHWinnersBiddingChanged")
			.withArgs(num_winners);
		expect((await cosmicSignatureGameProxy.numRaffleETHWinnersBidding()).toString()).to.equal(num_winners.toString());

		num_winners = 12n;
		await expect(cosmicSignatureGameProxy.connect(owner).setNumRaffleNftWinnersBidding(num_winners))
			.to.emit(cosmicSignatureGameProxy, "NumRaffleNftWinnersBiddingChanged")
			.withArgs(num_winners);
		expect((await cosmicSignatureGameProxy.numRaffleNftWinnersBidding()).toString()).to.equal(num_winners.toString());

		num_winners = 14n;
		await expect(cosmicSignatureGameProxy.connect(owner).setNumRaffleNftWinnersStakingRWalk(num_winners))
			.to.emit(cosmicSignatureGameProxy, "NumRaffleNftWinnersStakingRWalkChanged")
			.withArgs(num_winners);
		expect((await cosmicSignatureGameProxy.numRaffleNftWinnersStakingRWalk()).toString()).to.equal(num_winners.toString());

		testAcct_ = hre.ethers.Wallet.createRandom();
		await expect(cosmicSignatureGameProxy.connect(owner).setCharityAddress(testAcct_.address))
			.to.emit(cosmicSignatureGameProxy, "CharityAddressChanged")
			.withArgs(testAcct_.address);
		expect((await cosmicSignatureGameProxy.charityAddress()).toString()).to.equal(testAcct_.address.toString());

		testAcct_ = hre.ethers.Wallet.createRandom();
		await expect(cosmicSignatureGameProxy.connect(owner).setRandomWalkNft(testAcct_.address))
			.to.emit(cosmicSignatureGameProxy, "RandomWalkNftAddressChanged")
			.withArgs(testAcct_.address);
		expect(await cosmicSignatureGameProxy.randomWalkNft()).to.equal(testAcct_.address);

		testAcct_ = hre.ethers.Wallet.createRandom();
		await expect(cosmicSignatureGameProxy.connect(owner).setPrizesWallet(testAcct_.address))
			.to.emit(cosmicSignatureGameProxy, "PrizesWalletAddressChanged")
			.withArgs(testAcct_.address);
		expect(await cosmicSignatureGameProxy.prizesWallet()).to.equal(testAcct_.address);

		testAcct_ = hre.ethers.Wallet.createRandom();
		await expect(cosmicSignatureGameProxy.connect(owner).setTokenContract(testAcct_.address))
			.to.emit(cosmicSignatureGameProxy, "TokenContractAddressChanged")
			.withArgs(testAcct_.address);
		expect(await cosmicSignatureGameProxy.token()).to.equal(testAcct_.address);

		testAcct_ = hre.ethers.Wallet.createRandom();
		await expect(cosmicSignatureGameProxy.connect(owner).setCosmicSignatureNft(testAcct_.address))
			.to.emit(cosmicSignatureGameProxy, "CosmicSignatureNftAddressChanged")
			.withArgs(testAcct_.address);
		expect(await cosmicSignatureGameProxy.nft()).to.equal(testAcct_.address);

		const time_increase = 1001n;
		await expect(cosmicSignatureGameProxy.connect(owner).setTimeIncrease(time_increase))
			.to.emit(cosmicSignatureGameProxy, "TimeIncreaseChanged")
			.withArgs(time_increase);
		expect((await cosmicSignatureGameProxy.timeIncrease()).toString()).to.equal(time_increase.toString());

		const timeoutDurationToClaimMainPrize_ = 1003n;
		await expect(cosmicSignatureGameProxy.connect(owner).setTimeoutDurationToClaimMainPrize(timeoutDurationToClaimMainPrize_))
			.to.emit(cosmicSignatureGameProxy, "TimeoutDurationToClaimMainPrizeChanged")
			.withArgs(timeoutDurationToClaimMainPrize_);
		expect(await cosmicSignatureGameProxy.timeoutDurationToClaimMainPrize()).to.equal(timeoutDurationToClaimMainPrize_);

		const price_increase = 1002n;
		await expect(cosmicSignatureGameProxy.connect(owner).setPriceIncrease(price_increase))
			.to.emit(cosmicSignatureGameProxy, "PriceIncreaseChanged")
			.withArgs(price_increase);
		expect((await cosmicSignatureGameProxy.priceIncrease()).toString()).to.equal(price_increase.toString());

		const nanoseconds = 1003n;
		await expect(cosmicSignatureGameProxy.connect(owner).setNanoSecondsExtra(nanoseconds))
			.to.emit(cosmicSignatureGameProxy, "NanoSecondsExtraChanged")
			.withArgs(nanoseconds);
		expect((await cosmicSignatureGameProxy.nanoSecondsExtra()).toString()).to.equal(nanoseconds.toString());

		const initialseconds = 1004n;
		await expect(cosmicSignatureGameProxy.connect(owner).setInitialSecondsUntilPrize(initialseconds))
			.to.emit(cosmicSignatureGameProxy, "InitialSecondsUntilPrizeChanged")
			.withArgs(initialseconds);
		expect((await cosmicSignatureGameProxy.initialSecondsUntilPrize()).toString()).to.equal(initialseconds.toString());

		const bidamount = 1005n;
		await expect(cosmicSignatureGameProxy.connect(owner).updateInitialBidAmountFraction(bidamount))
			.to.emit(cosmicSignatureGameProxy, "InitialBidAmountFractionChanged")
			.withArgs(bidamount);
		expect((await cosmicSignatureGameProxy.initialBidAmountFraction()).toString()).to.equal(bidamount.toString());

		const activationTime_ = 123_456_789_012n;
		await expect(cosmicSignatureGameProxy.connect(owner).setActivationTime(activationTime_))
			.to.emit(cosmicSignatureGameProxy, "ActivationTimeChanged")
			.withArgs(activationTime_);
		expect((await cosmicSignatureGameProxy.activationTime()).toString()).to.equal(activationTime_.toString());
	});
});
