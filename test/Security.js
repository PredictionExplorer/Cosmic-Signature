"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("Security", function () {
	it("claimMainPrize is non-reentrant (so it's impossible to claim multiple times)", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {deployerAcct, ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1, signer2, signer3,] = signers;

		// await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(123_456_789_012n);

		await cosmicSignatureGameProxy.connect(ownerAcct).setMainEthPrizeAmountPercentage(10n);

		// Issue. According to Comment-202503135, this is really not supposed to be in the past, let alone zero.
		// But, hopefully, it will work somehow.
		await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(0);

		// const latestBlock_ = await hre.ethers.provider.getBlock("latest");
		// await cosmicSignatureGameProxy.connect(ownerAcct).setRoundActivationTime(latestBlock_.timestamp + 1);

		const maliciousMainPrizeClaimerFactory = await hre.ethers.getContractFactory("MaliciousMainPrizeClaimer", deployerAcct);
		const maliciousMainPrizeClaimer = await maliciousMainPrizeClaimerFactory.deploy(cosmicSignatureGameProxyAddr);
		await maliciousMainPrizeClaimer.waitForDeployment();

		let donationAmount_ = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.connect(signer0).donateEth({ value: donationAmount_ });

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cosmicSignatureGameProxy.connect(signer3).bidWithEth((-1), "", { value: nextEthBidPrice_ }); // this works
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) + 24 * 60 * 60]);
		// await hre.ethers.provider.send("evm_mine");

		// let mainEthPrizeAmount_ = await cosmicSignatureGameProxy.getMainEthPrizeAmount();
		// let maliciousMainPrizeClaimer_bal_before = await hre.ethers.provider.getBalance(maliciousMainPrizeClaimerAddr);
		// Make sure there is no re-entrancy
		await expect(maliciousMainPrizeClaimer.connect(signer3).resetAndClaimMainPrize(1n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "FundTransferFailed");
	});
	
	// // todo-1 This test is now broken because I have moved NFT donations to `PrizesWallet`.
	// // todo-1 Besides, `PrizesWallet.donateNft` is not non-reentrant.
	// it("The donateNft method is confirmed to be non-reentrant", async function () {
	// 	// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
	// 	const {deployerAcct, signers, cosmicSignatureGameProxy,} = await loadFixture(deployContractsForUnitTesting);
	// 	const [signer0,] = signers;
	//
	// 	// todo-1 Why do we need this donation here? Comment it out?
	// 	const donationAmount_ = hre.ethers.parseEther("10");
	// 	await expect(cosmicSignatureGameProxy.connect(signer0).donateEth({value: donationAmount_})).not.reverted;
	//
	// 	const maliciousNftFactory = await hre.ethers.getContractFactory("MaliciousNft1", deployerAcct);
	// 	const maliciousNft = await maliciousNftFactory.deploy("Bad NFT", "BAD");
	// 	await maliciousNft.waitForDeployment();
	// 	const maliciousNftAddr = await maliciousNft.getAddress();
	//
	// 	// todo-1 This will probably now revert due to `_onlyGame`.
	// 	await expect(cosmicSignatureGameProxy.connect(signer0).donateNft(maliciousNftAddr, 0n)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "ReentrancyGuardReentrantCall");
	// });
	
	// todo-0 Do we need a similar test for `bidWithCstAndDonateNft`? Maybe not, but think.
	it("The bidWithEthAndDonateNft method is non-reentrant", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {deployerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, prizesWallet,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0,] = signers;
	
		const bidAmount_ = hre.ethers.parseEther("1");
		const donationAmount_ = bidAmount_ * 10n;
		// await expect(cosmicSignatureGameProxy.connect(signer0).donateEth({value: donationAmount_})).not.reverted;
	
		const maliciousNftFactory = await hre.ethers.getContractFactory("MaliciousNft2", deployerAcct);
		const maliciousNft = await maliciousNftFactory.deploy(cosmicSignatureGameProxyAddr, "Bad NFT", "BAD");
		await maliciousNft.waitForDeployment();
		const maliciousNftAddr = await maliciousNft.getAddress();

		await expect(signer0.sendTransaction({to: maliciousNftAddr, value: donationAmount_,})).not.reverted;
		await expect(cosmicSignatureGameProxy.connect(signer0).bidWithEthAndDonateNft((-1n), "", maliciousNftAddr, 0n, {value: bidAmount_})).revertedWithCustomError(cosmicSignatureGameProxy, "ReentrancyGuardReentrantCall");
	});
});
