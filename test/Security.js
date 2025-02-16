"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("Security", function () {
	it("Vulnerability to claimMainPrize() multiple times", async function () {
		const {deployerAcct, ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2, signer3,] = signers;

		await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(123_456_789_012n);

		await cosmicSignatureGameProxy.connect(ownerAcct).setMainEthPrizeAmountPercentage(10n);

		// Issue. According to Comment-202411168, this is really not supposed to be in the past, let alone zero.
		// But, hopefully, it will work somehow.
		await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(0);

		// const latestBlock_ = await hre.ethers.provider.getBlock("latest");
		// await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(latestBlock_.timestamp + 1);

		const reClaimFactory = await hre.ethers.getContractFactory("ReClaim", deployerAcct);
		const reClaim = await reClaimFactory.deploy(cosmicSignatureGameProxyAddr);
		await reClaim.waitForDeployment();

		let donationAmount_ = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.connect(signer0).donateEth({ value: donationAmount_ });

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer3).bidWithEth((-1), "", { value: nextEthBidPrice_ }); // this works
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) + 24 * 60 * 60]);
		// await hre.ethers.provider.send("evm_mine");

		// let mainEthPrizeAmount_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();
		// let reclaim_bal_before = await hre.ethers.provider.getBalance(reClaimAddr);
		// Make sure there is no re-entrancy
		await expect(reClaim.connect(signer3).claimAndReset(1n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "FundTransferFailed");
	});
	it("It's impossible to claim the main prize before someone bids", async function () {
		const {signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;

		let donationAmount_ = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.connect(signer0).donateEth({ value: donationAmount_ });
		// await hre.ethers.provider.send("evm_mine"); // begin
		const durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await expect(durationUntilMainPrize_).lessThan(-1e9);
		// await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		let mainEthPrizeAmount_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();
		await expect(mainEthPrizeAmount_).greaterThan(0);
		// let balance_before = await hre.ethers.provider.getBalance(signer1);
		await expect(cosmicSignatureGameProxy.connect(signer1).claimMainPrize())
			.revertedWithCustomError(cosmicSignatureGameProxy, "NoBidsPlacedInCurrentRound");
	});

	// // todo-1 This test is now broken because I have moved NFT donations to `PrizesWallet`.
	// // todo-1 Besides, `PrizesWallet.donateNft` is not non-reentrant.
	// it("The donateNft method is confirmed to be non-reentrant", async function () {
	// 	const {deployerAcct, signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);
	// 	const [signer0,] = signers;
	//
	// 	// todo-1 Why do we need this donation here? Comment it out?
	// 	const donationAmount_ = hre.ethers.parseEther("10");
	// 	await cosmicSignatureGameProxy.connect(signer0).donateEth({ value: donationAmount_ });
	//
	// 	const maliciousNftFactory = await hre.ethers.getContractFactory("MaliciousNft1", deployerAcct);
	// 	const maliciousNft = await maliciousNftFactory.deploy("Bad NFT", "BAD");
	// 	await maliciousNft.waitForDeployment();
	// 	const maliciousNftAddr = await maliciousNft.getAddress();
	//
	// 	// todo-1 This will probably now revert due to `onlyGame`.
	// 	await expect(cosmicSignatureGameProxy.connect(signer0).donateNft(maliciousNftAddr, 0)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "ReentrancyGuardReentrantCall");
	// });
	
	// todo-1 Do we need a similar test for `bidWithCstAndDonateNft`? Maybe not, but think.
	it("The bidWithEthAndDonateNft method is confirmed to be non-reentrant", async function () {
		const {deployerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, prizesWallet,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0,] = signers;
	
		const bidAmount_ = hre.ethers.parseEther("1");
		const donationAmount_ = bidAmount_ * 10n;
		// await cosmicSignatureGameProxy.connect(signer0).donateEth({value: donationAmount_});
	
		const maliciousNftFactory = await hre.ethers.getContractFactory("MaliciousNft2", deployerAcct);
		const maliciousNft = await maliciousNftFactory.deploy(cosmicSignatureGameProxyAddr, "Bad NFT", "BAD");
		await maliciousNft.waitForDeployment();
		const maliciousNftAddr = await maliciousNft.getAddress();

		await signer0.sendTransaction({to: maliciousNftAddr, value: donationAmount_});
		await expect(cosmicSignatureGameProxy.connect(signer0).bidWithEthAndDonateNft((-1n), "", maliciousNftAddr, 0, {value: bidAmount_})).revertedWithCustomError(cosmicSignatureGameProxy, "ReentrancyGuardReentrantCall");
	});
});
