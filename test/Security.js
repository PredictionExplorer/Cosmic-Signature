const hre = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { basicDeployment } = require("../src/Deploy.js");

describe("Security", function () {
	const bidParamsEncoding = {
		type: "tuple(string,int256)",
		name: "bidparams",
		components: [
			{ name: "msg", type: "string" },
			{ name: "rwalk", type: "int256" },
		],
	};
	async function deployCosmic(deployerAcct) {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWalletCosmicSignatureNft,
			stakingWalletRWalk,
			marketingWallet,
			cosmicGameImplementation
		} = await basicDeployment(contractDeployerAcct, '', 0, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', false);

		return {
			cosmicGameProxy: cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWalletCosmicSignatureNft,
			stakingWalletRWalk,
			marketingWallet,
			cosmicGameImplementation
		};
	}
	it("Vulnerability to claimPrize() multiple times", async function () {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet,
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,false);
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");

		await cosmicGameProxy.setTokenContract(await cosmicToken.getAddress());
		await cosmicGameProxy.setNftContract(await cosmicSignature.getAddress());
		await cosmicGameProxy.setCharity(await charityWallet.getAddress());
		await cosmicGameProxy.setRaffleWallet(await raffleWallet.getAddress());
		await cosmicGameProxy.setRandomWalk(await randomWalkNFT.getAddress());
		await cosmicGameProxy.setActivationTime(0);
		await cosmicGameProxy.setPrizePercentage(10n);
		await cosmicGameProxy.setRuntimeMode();

		const ReClaim = await hre.ethers.getContractFactory("ReClaim");
		const reclaim = await ReClaim.deploy(await cosmicGameProxy.getAddress());

		let donationAmount = hre.ethers.parseEther("10");
		await cosmicGameProxy.donate({ value: donationAmount });

		const [owner, addr1, addr2, addr3, ...addrs] = await hre.ethers.getSigners();

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice }); // this works
		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime) + 24 * 3600]);
		await hre.ethers.provider.send("evm_mine");

		let prizeAmount = await cosmicGameProxy.prizeAmount();
		let reclaim_bal_before = await hre.ethers.provider.getBalance(await reclaim.getAddress());
		// Make sure there is no re-entrancy
		await expect(reclaim.connect(addr3).claimAndReset(1n)).to.be.revertedWithCustomError(contractErrors,"FundTransferFailed");
	});
	it("Is possible to take prize before activation", async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, randomWalkNFT } = await loadFixture(
			deployCosmic,
		);
		const [owner, addr1, ...addrs] = await hre.ethers.getSigners();
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");
		let donationAmount = hre.ethers.parseEther("10");
		await cosmicGameProxy.donate({ value: donationAmount });
		await hre.ethers.provider.send("evm_mine"); // begin
		const prizeTime = await cosmicGameProxy.timeUntilPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(prizeTime) + 1]);
		await hre.ethers.provider.send("evm_mine");
		let prizeAmount = await cosmicGameProxy.prizeAmount();
		let balance_before = await hre.ethers.provider.getBalance(addr1);
		await expect(cosmicGameProxy.connect(addr1).claimPrize()).to.be.revertedWithCustomError(contractErrors,"NoLastBidder");
	});
	it("donateNFT() function is confirmed to be non-reentrant", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWalletCosmicSignatureNft,
			stakingWalletRWalk,
			marketingWallet,
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,true);
		const contractErrors = await hre.ethers.getContractFactory('CosmicGameErrors');

		let donationAmount = hre.ethers.parseEther("10");
		await cosmicGameProxy.donate({ value: donationAmount });

		const MaliciousToken = await hre.ethers.getContractFactory('MaliciousToken1');
		let maliciousToken = await MaliciousToken.deploy('Bad Token','BAD');
		await maliciousToken.waitForDeployment();

		await expect(cosmicGameProxy.connect(owner).donateNFT(await maliciousToken.getAddress(),0)).to.be.revertedWithCustomError(cosmicGameProxy,'ReentrancyGuardReentrantCall');
	});
	it("bidAnddonateNFT() function is confirmed to be non-reentrant", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWalletCosmicSignatureNft,
			stakingWalletRWalk,
			marketingWallet,
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,true);
		const contractErrors = await hre.ethers.getContractFactory('CosmicGameErrors');

		let donationAmount = hre.ethers.parseEther("10");
		await cosmicGameProxy.donate({ value: donationAmount });

		const MaliciousToken = await hre.ethers.getContractFactory('MaliciousToken2');
		let maliciousToken = await MaliciousToken.deploy(await cosmicGameProxy.getAddress(),'Bad Token','BAD');
		await maliciousToken.waitForDeployment();

		await expect(cosmicGameProxy.connect(owner).donateNFT(await maliciousToken.getAddress(),0)).to.be.revertedWithCustomError(cosmicGameProxy,'ReentrancyGuardReentrantCall');
	});
});
