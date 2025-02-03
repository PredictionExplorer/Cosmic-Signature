"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
// const { basicDeployment } = require("../src/Deploy.js");
const { deployContractsForTesting } = require("../src/ContractTestingHelpers.js");

describe("Events", function () {
	it("should emit the correct events in the CosmicSignatureNft contract", async function () {
		const {signers, cosmicSignatureGameProxy, cosmicSignatureNft,} =
			await loadFixture(deployContractsForTesting);
		const [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner,] = signers;
		
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(bidder1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		await hre.ethers.provider.send("evm_increaseTime", [26 * 60 * 60]);
		// await hre.ethers.provider.send("evm_mine");
		const tx = await cosmicSignatureGameProxy.connect(bidder1).claimMainPrize();
		await tx.wait();
		let seed = await cosmicSignatureNft.getNftSeed(0);
		expect(tx).to.emit(cosmicSignatureNft, "NftMinted").withArgs(0n, bidder1.address, seed, 0n);
	});
	it("should emit the correct events in the CharityWallet contract", async function () {
		const {signers, cosmicSignatureGameProxy, charityWallet,} = await loadFixture(deployContractsForTesting);
		const [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner,] = signers;

		// DonationReceived
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(bidder1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		let charityEthDonationAmount_ = await cosmicSignatureGameProxy.getCharityEthDonationAmount();
		let cosmicSignatureNftStakingTotalEthRewardAmount_ = await cosmicSignatureGameProxy.getCosmicSignatureNftStakingTotalEthRewardAmount();
		await hre.ethers.provider.send("evm_increaseTime", [26 * 60 * 60]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(cosmicSignatureGameProxy.connect(bidder1).claimMainPrize())
			.to.emit(charityWallet, "DonationReceived")
			.withArgs(await cosmicSignatureGameProxy.getAddress(), charityEthDonationAmount_ + cosmicSignatureNftStakingTotalEthRewardAmount_);
		const balance = await hre.ethers.provider.getBalance(await charityWallet.getAddress());
		expect(balance).to.equal(charityEthDonationAmount_ + cosmicSignatureNftStakingTotalEthRewardAmount_);

		// CharityAddressChanged
		await expect(charityWallet.connect(owner).setCharityAddress(bidder3.address))
			.to.emit(charityWallet, "CharityAddressChanged")
			.withArgs(bidder3.address);

		// // DonationSent
		// await expect(charityWallet.connect(bidder2).send())
		// 	.to.emit(charityWallet, "DonationSent")
		// 	.withArgs(bidder3.address, balance);

		// FundsTransferredToCharity
		await expect(charityWallet.connect(bidder2).send())
			.to.emit(charityWallet, "FundsTransferredToCharity")
			.withArgs(bidder3.address, balance);
	});
	it("should emit EthDonated on successful donation", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner,] = signers;

		const INITIAL_AMOUNT = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.connect(owner).donateEth({ value: INITIAL_AMOUNT });

		const donationAmount_ = hre.ethers.parseEther("1");
		let roundNum = 0;
		await expect(cosmicSignatureGameProxy.connect(donor).donateEth({ value: donationAmount_ }))
			.to.emit(cosmicSignatureGameProxy, "EthDonated")
			.withArgs(roundNum, donor.address, donationAmount_);

		const contractBalance = await hre.ethers.provider.getBalance(await cosmicSignatureGameProxy.getAddress());
		expect(contractBalance).to.equal(donationAmount_ + INITIAL_AMOUNT);
	});
	it("Shall emit MainPrizeClaimed and update main prize beneficiary on successful main prize claim", async function () {
		const {signers, cosmicSignatureGameProxy, prizesWallet, randomWalkNft,} =
			await loadFixture(deployContractsForTesting);
		const [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner,] = signers;
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		// ToDo-202411202-1 applies.
		cosmicSignatureGameProxy.setDelayDurationBeforeRoundActivation(0n);

		let mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(donor).mint({ value: mintPrice });

		// await randeomWalkNFT.connect(donor).setApprovalForAll(await cosmicSignatureGameProxy.getAddress(), true);
		await randomWalkNft.connect(donor).setApprovalForAll(await prizesWallet.getAddress(), true);

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(donor).bidWithEthAndDonateNft((-1), "", await randomWalkNft.getAddress(), 0, { value: nextEthBidPrice_ });

		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(bidder1).bidWithEth((-1), "", { value: nextEthBidPrice_ });

		// await expect(cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(0)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "DonatedNftClaimDenied");
		await expect(prizesWallet.connect(bidder1).claimDonatedNft(0)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "DonatedNftClaimDenied");

		await hre.ethers.provider.send("evm_increaseTime", [26 * 60 * 60]);
		// await hre.ethers.provider.send("evm_mine");

		let mainEthPrizeAmountBeforeClaim_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();

		await expect(cosmicSignatureGameProxy.connect(bidder1).claimMainPrize())
			.to.emit(cosmicSignatureGameProxy, "MainPrizeClaimed")
			.withArgs(0, bidder1.address, mainEthPrizeAmountBeforeClaim_, 0);

		// const mainPrizeBeneficiaryAddress_ = await cosmicSignatureGameProxy.winners(0);
		const mainPrizeBeneficiaryAddress_ = await prizesWallet.mainPrizeBeneficiaryAddresses(0);
		expect(mainPrizeBeneficiaryAddress_).to.equal(bidder1.address);

		const mainEthPrizeAmountAfterClaim_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();
		const balance = await hre.ethers.provider.getBalance(await cosmicSignatureGameProxy.getAddress());
		const mainEthPrizeExpectedAmount_ = balance * 25n / 100n;
		expect(mainEthPrizeAmountAfterClaim_).to.equal(mainEthPrizeExpectedAmount_);

		// await expect(cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(1)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "InvalidDonatedNftIndex");
		await expect(prizesWallet.connect(bidder1).claimDonatedNft(1)).to.be.revertedWithCustomError(prizesWallet, "InvalidDonatedNftIndex");

		// await cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(0);
		await prizesWallet.connect(bidder1).claimDonatedNft(0);
		// await expect(cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(0)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "DonatedNftAlreadyClaimed");
		await expect(prizesWallet.connect(bidder1).claimDonatedNft(0)).to.be.revertedWithCustomError(prizesWallet, "DonatedNftAlreadyClaimed");

		mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(donor).mint({ value: mintPrice });
		mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(donor).mint({ value: mintPrice });

		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(bidder1).bidWithEth((-1), "", { value: nextEthBidPrice_ });

		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		let nextEthPlusRandomWalkNftBidPrice_ = await cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await cosmicSignatureGameProxy.connect(donor).bidWithEthAndDonateNft(1, "hello", await randomWalkNft.getAddress(), 2, { value: nextEthPlusRandomWalkNftBidPrice_ });

		await hre.ethers.provider.send("evm_increaseTime", [26 * 60 * 60]);
		// await hre.ethers.provider.send("evm_mine");

		mainEthPrizeAmountBeforeClaim_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();
		await expect(cosmicSignatureGameProxy.connect(donor).claimMainPrize())
			.to.emit(cosmicSignatureGameProxy, "MainPrizeClaimed")
			.withArgs(1, donor.address, mainEthPrizeAmountBeforeClaim_, 7);

		expect(await randomWalkNft.balanceOf(donor.address)).to.equal(1);
		// await cosmicSignatureGameProxy.connect(donor).claimDonatedNft(1);
		await prizesWallet.connect(donor).claimDonatedNft(1);
		expect(await randomWalkNft.balanceOf(donor.address)).to.equal(2);

		expect(await cosmicSignatureGameProxy.roundNum()).to.equal(2);
	});
	it("BidPlaced is correctly emitted", async function () {
		const {signers, cosmicSignatureGameProxy, randomWalkNft,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1,] = signers;

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [2000000000]);
		// await hre.ethers.provider.send("evm_mine");
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		expect(await cosmicSignatureGameProxy.connect(addr1).bidWithEth((-1), "simple text", { value: nextEthBidPrice_ }))
			.to.emit(cosmicSignatureGameProxy, "BidPlaced")
			.withArgs(0, addr1.address, nextEthBidPrice_, -1, -1, "simple text", 2000090000);
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [2100000000]);
		// await hre.ethers.provider.send("evm_mine");
		const mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr1).mint({ value: mintPrice });
		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		let nextEthPlusRandomWalkNftBidPrice_ = await cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		expect(await cosmicSignatureGameProxy.connect(addr1).bidWithEth(0, "random walk", { value: nextEthPlusRandomWalkNftBidPrice_ }))
			.to.emit(cosmicSignatureGameProxy, "BidPlaced")
			.withArgs(0, addr1.address, 1020100000000000, -1, 0, "random walk", 2100003601);
	});
	// todo-1 Consifder moving this to Bidding tests.
	it("ETH + RandomWalk NFT bid price is 50% lower", async function () {
		// todo-1 For the complete code coverage, this test needs to make multiple bids, claim main prize, more bids.

		const {signers, cosmicSignatureGameProxy, randomWalkNft,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1,] = signers;

		const mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(addr1).mint({ value: mintPrice });
		let initialDurationUntilMainPrize_ = await cosmicSignatureGameProxy.getInitialDurationUntilMainPrize();
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		let nextEthPlusRandomWalkNftBidPrice_ = await cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		expect(nextEthPlusRandomWalkNftBidPrice_).to.equal((nextEthBidPrice_ + 1n) / 2n);
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_000_000]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(cosmicSignatureGameProxy.connect(addr1).bidWithEth(0, "random walk", {value: nextEthPlusRandomWalkNftBidPrice_}))
			.to.emit(cosmicSignatureGameProxy, "BidPlaced")
			.withArgs(0, addr1.address, nextEthPlusRandomWalkNftBidPrice_, -1, 0, "random walk", 100_000_000_000n + initialDurationUntilMainPrize_);
	});
	it("DonatedNftClaimedEvent is correctly emitted", async function () {
		const {signers, cosmicSignatureGameProxy, prizesWallet, randomWalkNft,} =
			await loadFixture(deployContractsForTesting);
		const [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner,] = signers;

		// ToDo-202411202-1 applies.
		cosmicSignatureGameProxy.setDelayDurationBeforeRoundActivation(0n);

		let mintPrice = await randomWalkNft.getMintPrice();
		await randomWalkNft.connect(bidder1).mint({ value: mintPrice });
		// await randomWalkNft.connect(bidder1).setApprovalForAll(await cosmicSignatureGameProxy.getAddress(), true);
		await randomWalkNft.connect(bidder1).setApprovalForAll(await prizesWallet.getAddress(), true);
		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(bidder1).bidWithEthAndDonateNft((-1), "", await randomWalkNft.getAddress(), 0, { value: nextEthBidPrice_ });

		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(cosmicSignatureGameProxy.connect(bidder1).claimMainPrize());

		// await expect(cosmicSignatureGameProxy.connect(bidder1).claimDonatedNft(0))
		// 	.to.emit(cosmicSignatureGameProxy, "DonatedNftClaimedEvent")
		// 	.withArgs(0, 0, bidder1.address, await randomWalkNft.getAddress(), 0);
		await expect(prizesWallet.connect(bidder1).claimDonatedNft(0))
			.to.emit(prizesWallet, "DonatedNftClaimed")
			.withArgs(0, bidder1.address, await randomWalkNft.getAddress(), 0, 0);
	});
	// todo-1 Consider moving this test to "Bidding.js".
	it("It's not permitted to bid before round activation", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner,] = signers;
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		// Comment-202501192 applies.
		await hre.ethers.provider.send("evm_mine");

		const latestBlock_ = await hre.ethers.provider.getBlock("latest");
		const timestampBefore = latestBlock_.timestamp;

		await cosmicSignatureGameProxy.connect(owner).setRoundActivationTime(timestampBefore + 4);

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(cosmicSignatureGameProxy.connect(bidder1).bidWithEth((-1), "", { value: nextEthBidPrice_ })).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "RoundIsInactive");
		await expect(
			bidder2.sendTransaction({
				to: await cosmicSignatureGameProxy.getAddress(),
				value: nextEthBidPrice_,
			}),
		).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "RoundIsInactive");

		// await hre.ethers.provider.send("evm_increaseTime", [100]);
		// await hre.ethers.provider.send("evm_mine");

		// nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		expect((await cosmicSignatureGameProxy.getNextEthBidPrice(1n)) === nextEthBidPrice_);
		await cosmicSignatureGameProxy.connect(bidder1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		expect((await cosmicSignatureGameProxy.getNextEthBidPrice(1n)) > nextEthBidPrice_);
	});
	// todo-1 Consider moving this test to "Bidding.js".
	it("should be possible to bid by sending to the contract", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, charity, donor, bidder1, bidder2, bidder3, daoOwner,] = signers;

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(bidder1).bidWithEth((-1), "", { value: nextEthBidPrice_ });
		expect((await cosmicSignatureGameProxy.getNextEthBidPrice(1n)) > nextEthBidPrice_);

		nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await bidder2.sendTransaction({
			to: await cosmicSignatureGameProxy.getAddress(),
			value: nextEthBidPrice_,
		});
		expect((await cosmicSignatureGameProxy.getNextEthBidPrice(1n)) > nextEthBidPrice_);
	});
	// todo-1 Move this to "SystemManagement.js"?
	it("Admin events should work", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner,] = signers;

		const roundActivationTime_ = 123_456_789_012n;
		await expect(cosmicSignatureGameProxy.connect(owner).setRoundActivationTime(roundActivationTime_))
			.to.emit(cosmicSignatureGameProxy, "RoundActivationTimeChanged")
			.withArgs(roundActivationTime_);
		expect(await cosmicSignatureGameProxy.roundActivationTime()).to.equal(roundActivationTime_);

		// todo-1 setDelayDurationBeforeRoundActivation

		// todo-1 setMarketingWalletCstContributionAmount

		// todo-1 setBidMessageLengthMaxLimit

		let testAcct_ = hre.ethers.Wallet.createRandom();
		await expect(cosmicSignatureGameProxy.connect(owner).setCosmicSignatureToken(testAcct_.address))
			.to.emit(cosmicSignatureGameProxy, "CosmicSignatureTokenAddressChanged")
			.withArgs(testAcct_.address);
		expect(await cosmicSignatureGameProxy.token()).to.equal(testAcct_.address);

		testAcct_ = hre.ethers.Wallet.createRandom();
		await expect(cosmicSignatureGameProxy.connect(owner).setRandomWalkNft(testAcct_.address))
			.to.emit(cosmicSignatureGameProxy, "RandomWalkNftAddressChanged")
			.withArgs(testAcct_.address);
		expect(await cosmicSignatureGameProxy.randomWalkNft()).to.equal(testAcct_.address);

		testAcct_ = hre.ethers.Wallet.createRandom();
		await expect(cosmicSignatureGameProxy.connect(owner).setCosmicSignatureNft(testAcct_.address))
			.to.emit(cosmicSignatureGameProxy, "CosmicSignatureNftAddressChanged")
			.withArgs(testAcct_.address);
		expect(await cosmicSignatureGameProxy.nft()).to.equal(testAcct_.address);

		testAcct_ = hre.ethers.Wallet.createRandom();
		await expect(cosmicSignatureGameProxy.connect(owner).setPrizesWallet(testAcct_.address))
			.to.emit(cosmicSignatureGameProxy, "PrizesWalletAddressChanged")
			.withArgs(testAcct_.address);
		expect(await cosmicSignatureGameProxy.prizesWallet()).to.equal(testAcct_.address);

		// todo-1 setStakingWalletRandomWalkNft

		// todo-1 setStakingWalletCosmicSignatureNft

		// todo-1 setMarketingWallet

		testAcct_ = hre.ethers.Wallet.createRandom();
		await expect(cosmicSignatureGameProxy.connect(owner).setCharityAddress(testAcct_.address))
			.to.emit(cosmicSignatureGameProxy, "CharityAddressChanged")
			.withArgs(testAcct_.address);
		expect((await cosmicSignatureGameProxy.charityAddress()).toString()).to.equal(testAcct_.address.toString());

		const initialDurationUntilMainPrizeDivisor_ = 1004n;
		await expect(cosmicSignatureGameProxy.connect(owner).setInitialDurationUntilMainPrizeDivisor(initialDurationUntilMainPrizeDivisor_))
			.to.emit(cosmicSignatureGameProxy, "InitialDurationUntilMainPrizeDivisorChanged")
			.withArgs(initialDurationUntilMainPrizeDivisor_);
		expect((await cosmicSignatureGameProxy.initialDurationUntilMainPrizeDivisor()).toString()).to.equal(initialDurationUntilMainPrizeDivisor_.toString());

		const mainPrizeTimeIncrementInMicroSeconds_ = 1003n;
		await expect(cosmicSignatureGameProxy.connect(owner).setMainPrizeTimeIncrementInMicroSeconds(mainPrizeTimeIncrementInMicroSeconds_))
			.to.emit(cosmicSignatureGameProxy, "MainPrizeTimeIncrementInMicroSecondsChanged")
			.withArgs(mainPrizeTimeIncrementInMicroSeconds_);
		expect(await cosmicSignatureGameProxy.mainPrizeTimeIncrementInMicroSeconds()).to.equal(mainPrizeTimeIncrementInMicroSeconds_);

		const mainPrizeTimeIncrementIncreaseDivisor_ = 1001n;
		await expect(cosmicSignatureGameProxy.connect(owner).setMainPrizeTimeIncrementIncreaseDivisor(mainPrizeTimeIncrementIncreaseDivisor_))
			.to.emit(cosmicSignatureGameProxy, "MainPrizeTimeIncrementIncreaseDivisorChanged")
			.withArgs(mainPrizeTimeIncrementIncreaseDivisor_);
		expect(await cosmicSignatureGameProxy.mainPrizeTimeIncrementIncreaseDivisor()).to.equal(mainPrizeTimeIncrementIncreaseDivisor_);

		const ethDutchAuctionEndingBidPriceDivisor_ = 1006n;
		await expect(cosmicSignatureGameProxy.connect(owner).setEthDutchAuctionEndingBidPriceDivisor(ethDutchAuctionEndingBidPriceDivisor_))
			.to.emit(cosmicSignatureGameProxy, "EthDutchAuctionEndingBidPriceDivisorChanged")
			.withArgs(ethDutchAuctionEndingBidPriceDivisor_);
		expect((await cosmicSignatureGameProxy.ethDutchAuctionEndingBidPriceDivisor()).toString()).to.equal(ethDutchAuctionEndingBidPriceDivisor_.toString());

		const nextEthBidPriceIncreaseDivisor_ = 1002n;
		await expect(cosmicSignatureGameProxy.connect(owner).setNextEthBidPriceIncreaseDivisor(nextEthBidPriceIncreaseDivisor_))
			.to.emit(cosmicSignatureGameProxy, "NextEthBidPriceIncreaseDivisorChanged")
			.withArgs(nextEthBidPriceIncreaseDivisor_);
		expect(await cosmicSignatureGameProxy.nextEthBidPriceIncreaseDivisor()).equal(nextEthBidPriceIncreaseDivisor_);

		// todo-1 setCstDutchAuctionDurationDivisor
		// todo-1 Also the same for ETH.

		// todo-1 setCstDutchAuctionBeginningBidPriceMinLimit

		// todo-1 setCstRewardAmountForBidding

		let percentage_ = 11n;
		await expect(cosmicSignatureGameProxy.connect(owner).setMainEthPrizeAmountPercentage(percentage_))
			.to.emit(cosmicSignatureGameProxy, "MainEthPrizeAmountPercentageChanged")
			.withArgs(percentage_);
		expect(await cosmicSignatureGameProxy.mainEthPrizeAmountPercentage()).to.equal(percentage_);
		
		percentage_ = 12n;
		await expect(cosmicSignatureGameProxy.connect(owner).setChronoWarriorEthPrizeAmountPercentage(percentage_))
			.to.emit(cosmicSignatureGameProxy, "ChronoWarriorEthPrizeAmountPercentageChanged")
			.withArgs(percentage_);
		expect(await cosmicSignatureGameProxy.chronoWarriorEthPrizeAmountPercentage()).to.equal(percentage_);

		percentage_ = 13n;
		await expect(cosmicSignatureGameProxy.connect(owner).setRaffleTotalEthPrizeAmountForBiddersPercentage(percentage_))
			.to.emit(cosmicSignatureGameProxy, "RaffleTotalEthPrizeAmountForBiddersPercentageChanged")
			.withArgs(percentage_);
		expect(await cosmicSignatureGameProxy.raffleTotalEthPrizeAmountForBiddersPercentage()).to.equal(percentage_);

		// todo-1 percentage_ = 14n;
		// todo-1 setCosmicSignatureNftStakingTotalEthRewardAmountPercentage(percentage_)

		percentage_ = 15n;
		await expect(cosmicSignatureGameProxy.connect(owner).setCharityEthDonationAmountPercentage(percentage_))
			.to.emit(cosmicSignatureGameProxy, "CharityEthDonationAmountPercentageChanged")
			.withArgs(percentage_);
		expect(await cosmicSignatureGameProxy.charityEthDonationAmountPercentage()).to.equal(percentage_);

		const timeoutDurationToClaimMainPrize_ = 1003n;
		await expect(cosmicSignatureGameProxy.connect(owner).setTimeoutDurationToClaimMainPrize(timeoutDurationToClaimMainPrize_))
			.to.emit(cosmicSignatureGameProxy, "TimeoutDurationToClaimMainPrizeChanged")
			.withArgs(timeoutDurationToClaimMainPrize_);
		expect(await cosmicSignatureGameProxy.timeoutDurationToClaimMainPrize()).to.equal(timeoutDurationToClaimMainPrize_);

		// todo-1 setCstRewardAmountMultiplier

		let numPrizes_ = 11n;
		await expect(cosmicSignatureGameProxy.connect(owner).setNumRaffleEthPrizesForBidders(numPrizes_))
			.to.emit(cosmicSignatureGameProxy, "NumRaffleEthPrizesForBiddersChanged")
			.withArgs(numPrizes_);
		expect((await cosmicSignatureGameProxy.numRaffleEthPrizesForBidders()).toString()).to.equal(numPrizes_.toString());

		numPrizes_ = 12n;
		await expect(cosmicSignatureGameProxy.connect(owner).setNumRaffleCosmicSignatureNftsForBidders(numPrizes_))
			.to.emit(cosmicSignatureGameProxy, "NumRaffleCosmicSignatureNftsForBiddersChanged")
			.withArgs(numPrizes_);
		expect((await cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForBidders()).toString()).to.equal(numPrizes_.toString());

		numPrizes_ = 14n;
		await expect(cosmicSignatureGameProxy.connect(owner).setNumRaffleCosmicSignatureNftsForRandomWalkNftStakers(numPrizes_))
			.to.emit(cosmicSignatureGameProxy, "NumRaffleCosmicSignatureNftsForRandomWalkNftStakersChanged")
			.withArgs(numPrizes_);
		expect((await cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForRandomWalkNftStakers()).toString()).to.equal(numPrizes_.toString());
	});
});
