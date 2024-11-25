"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment } = require("../src/Deploy.js");

describe("Security", function () {
	const bidParamsEncoding = {
		type: "tuple(string,int256)",
		name: "BidParams",
		components: [
			{ name: "message", type: "string" },
			{ name: "randomWalkNftId", type: "int256" },
		],
	};
	async function deployCosmicSignature(deployerAcct) {
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
			cosmicSignatureGame,
		} = await basicDeployment(contractDeployerAcct, '', 1, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', false);
		return {
			cosmicSignatureGameProxy: cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			cosmicSignatureGame,
		};
	}
	it("Vulnerability to claimPrize() multiple times", async function () {
		const [contractDeployerAcct, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			cosmicSignatureNft,
			charityWallet,
			cosmicSignatureDao,
			prizesWallet,
			randomWalkNft,
			stakingWallet,
			marketingWallet,
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		await cosmicSignatureGameProxy.setPrizesWallet(await prizesWallet.getAddress());
		await cosmicSignatureGameProxy.setTokenContract(await cosmicSignatureToken.getAddress());
		await cosmicSignatureGameProxy.setCosmicSignatureNft(await cosmicSignatureNft.getAddress());
		await cosmicSignatureGameProxy.setRandomWalkNft(await randomWalkNft.getAddress());
		await cosmicSignatureGameProxy.setCharity(await charityWallet.getAddress());
		await cosmicSignatureGameProxy.setMainPrizePercentage(10n);

		// Issue. According to Comment-202411168, this is really not supposed to be in the past, let alone zero.
		// But, hopefully, it will work somehow.
		await cosmicSignatureGameProxy.setActivationTime(0);

		// await cosmicSignatureGameProxy.setRuntimeMode();
		// const latestBlock_ = await hre.ethers.provider.getBlock("latest");
		// await cosmicSignatureGameProxy.setActivationTime(latestBlock_.timestamp);

		const ReClaim = await hre.ethers.getContractFactory("ReClaim");
		const reclaim = await ReClaim.deploy(await cosmicSignatureGameProxy.getAddress());

		let donationAmount = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donate({ value: donationAmount });

		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		let bidParams = { message: "", randomWalkNftId: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicSignatureGameProxy.connect(addr3).bid(params, { value: bidPrice }); // this works
		let prizeTime = await cosmicSignatureGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime) + 24 * 3600]);
		await hre.ethers.provider.send("evm_mine");

		let mainPrizeAmount_ = await cosmicSignatureGameProxy.mainPrizeAmount();
		let reclaim_bal_before = await hre.ethers.provider.getBalance(await reclaim.getAddress());
		// Make sure there is no re-entrancy
		await expect(reclaim.connect(addr3).claimAndReset(1n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "FundTransferFailed");
	});
	it("Is possible to take prize before activation", async function () {
		const { cosmicSignatureGameProxy, cosmicSignatureToken, cosmicSignatureNft, charityWallet, cosmicSignatureDao, randomWalkNft } =
			await loadFixture(deployCosmicSignature);
		const [owner, addr1, ...addrs] = await hre.ethers.getSigners();
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
		let donationAmount = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donate({ value: donationAmount });
		await hre.ethers.provider.send("evm_mine"); // begin
		const prizeTime = await cosmicSignatureGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime) + 1]);
		await hre.ethers.provider.send("evm_mine");
		let mainPrizeAmount_ = await cosmicSignatureGameProxy.mainPrizeAmount();
		let balance_before = await hre.ethers.provider.getBalance(addr1);
		await expect(cosmicSignatureGameProxy.connect(addr1).claimPrize()).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "NoLastBidder");
	});

	// todo-1 This test is now broken because I have moved NFT donations to `PrizesWallet`.
	// todo-1 Besides, `PrizesWallet.donateNft` is not non-reentrant.
	it("donateNft() function is confirmed to be non-reentrant", async function () {
		const [owner,] = await hre.ethers.getSigners();
		const {cosmicSignatureGameProxy,} =
			await basicDeployment(owner, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		// const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		// todo-1 Why do we need this donation here? Comment it out?
		const donationAmount = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donate({ value: donationAmount });

		const MaliciousNft = await hre.ethers.getContractFactory("MaliciousNft1");
		const maliciousNft = await MaliciousNft.deploy("Bad NFT", "BAD");
		await maliciousNft.waitForDeployment();

		// todo-1 This will probably now revert due to `onlyGame`.
		await expect(cosmicSignatureGameProxy.connect(owner).donateNft(await maliciousNft.getAddress(), 0)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "ReentrancyGuardReentrantCall");
	});
	
	// todo-1 This test is now broken because I have moved NFT donations to `PrizesWallet`.
	it("bidAndDonateNft() function is confirmed to be non-reentrant", async function () {
		const [owner,] = await hre.ethers.getSigners();
		const {cosmicSignatureGameProxy,} =
			await basicDeployment(owner, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		// const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
	
		// todo-1 Why do we need this donation here? Comment it out?
		const donationAmount = hre.ethers.parseEther("10");
		await cosmicSignatureGameProxy.donate({ value: donationAmount });
	
		const MaliciousNft = await hre.ethers.getContractFactory("MaliciousNft2");
		const maliciousNft = await MaliciousNft.deploy(/*await cosmicSignatureGameProxy.getAddress(),*/ "Bad NFT", "BAD");
		await maliciousNft.waitForDeployment();
	
		// todo-1 Given the test title, isn't this supposed to call `bidAndDonateNft`?
		// todo-1 This will probably now revert due to `onlyGame`.
		await expect(cosmicSignatureGameProxy.connect(owner).donateNft(await maliciousNft.getAddress(), 0)).to.be.revertedWithCustomError(cosmicSignatureGameProxy, "ReentrancyGuardReentrantCall");
	});
});
