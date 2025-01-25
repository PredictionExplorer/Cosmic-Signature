"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
// const { basicDeployment } = require("../src/Deploy.js");
const { deployContractsForTesting } = require("../src/ContractTestingHelpers.js");

describe("Security", function () {
	it("Vulnerability to claimMainPrize() multiple times", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1, addr2, addr3,] = signers;
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		await cosmicSignatureGameProxy.setActivationTime(123_456_789_012n);

		// await cosmicSignatureGameProxy.setCosmicSignatureToken(await cosmicSignatureToken.getAddress());
		// await cosmicSignatureGameProxy.setRandomWalkNft(await randomWalkNft.getAddress());
		// await cosmicSignatureGameProxy.setCosmicSignatureNft(await cosmicSignatureNft.getAddress());
		// await cosmicSignatureGameProxy.setPrizesWallet(await prizesWallet.getAddress());
		// await cosmicSignatureGameProxy.setCharityAddress(await charityWallet.getAddress());
		await cosmicSignatureGameProxy.setMainEthPrizeAmountPercentage(10n);

		// Issue. According to Comment-202411168, this is really not supposed to be in the past, let alone zero.
		// But, hopefully, it will work somehow.
		await cosmicSignatureGameProxy.setActivationTime(0);

		// await cosmicSignatureGameProxy.setRuntimeMode();
		// const latestBlock_ = await hre.ethers.provider.getBlock("latest");
		// await cosmicSignatureGameProxy.setActivationTime(latestBlock_.timestamp + 1);

		const ReClaim = await hre.ethers.getContractFactory("ReClaim");
		const reclaim = await ReClaim.deploy(await cosmicSignatureGameProxy.getAddress());

		let donationAmount_ = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount_ });

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(addr3).bid((-1), "", { value: nextEthBidPrice_ }); // this works
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) + 24 * 60 * 60]);
		// await hre.ethers.provider.send("evm_mine");

		// let mainEthPrizeAmount_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();
		// let reclaim_bal_before = await hre.ethers.provider.getBalance(await reclaim.getAddress());
		// Make sure there is no re-entrancy
		await expect(reclaim.connect(addr3).claimAndReset(1n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "FundTransferFailed");
	});
	it("It's impossible to claim the main prize before someone bids", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1,] = signers;

		let donationAmount_ = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donateEth({ value: donationAmount_ });
		// await hre.ethers.provider.send("evm_mine"); // begin
		const durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await expect(durationUntilMainPrize_).lessThan(-1e9);
		// await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		let mainEthPrizeAmount_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();
		await expect(mainEthPrizeAmount_).greaterThan(0);
		// let balance_before = await hre.ethers.provider.getBalance(addr1);
		await expect(cosmicSignatureGameProxy.connect(addr1).claimMainPrize())
			.revertedWithCustomError(cosmicSignatureGameProxy, "NoBidsPlacedInCurrentRound");
	});

	// // todo-1 This test is now broken because I have moved NFT donations to `PrizesWallet`.
	// // todo-1 Besides, `PrizesWallet.donateNft` is not non-reentrant.
	// it("donateNft() function is confirmed to be non-reentrant", async function () {
	// 	const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForTesting);
	// 	const [owner,] = signers;
	//
	// 	// todo-1 Why do we need this donation here? Comment it out?
	// 	const donationAmount_ = hre.ethers.parseEther("10");
	// 	await cosmicSignatureGameProxy.donateEth({ value: donationAmount_ });
	//
	// 	const MaliciousNft = await hre.ethers.getContractFactory("MaliciousNft1");
	// 	const maliciousNft = await MaliciousNft.deploy("Bad NFT", "BAD");
	// 	await maliciousNft.waitForDeployment();
	//
	// 	// todo-1 This will probably now revert due to `onlyGame`.
	// 	await expect(cosmicSignatureGameProxy.connect(owner).donateNft(await maliciousNft.getAddress(), 0)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "ReentrancyGuardReentrantCall");
	// });
	
	it("bidAndDonateNft() function is confirmed to be non-reentrant", async function () {
		const {signers, cosmicSignatureGameProxy, prizesWallet,} = await loadFixture(deployContractsForTesting);
		const [owner,] = signers;
	
		const bidAmount_ = hre.ethers.parseEther("1");
		const donationAmount_ = bidAmount_ * 10n;
		// await cosmicSignatureGameProxy.donateEth({value: donationAmount_});
	
		const MaliciousNft = await hre.ethers.getContractFactory("MaliciousNft2");
		const maliciousNft = await MaliciousNft.deploy(await cosmicSignatureGameProxy.getAddress(), "Bad NFT", "BAD");
		await maliciousNft.waitForDeployment();
		await owner.sendTransaction({to: await maliciousNft.getAddress(), value: donationAmount_});

		// await expect(cosmicSignatureGameProxy.connect(owner).donateNft(await maliciousNft.getAddress(), 0)).revertedWithCustomError(cosmicSignatureGameProxy, "ReentrancyGuardReentrantCall");
		await expect(cosmicSignatureGameProxy.connect(owner).bidAndDonateNft(-1n, "", await maliciousNft.getAddress(), 0, {value: bidAmount_})).revertedWithCustomError(prizesWallet, "UnauthorizedCaller");
	});
});
