const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { basicDeployment } = require("../src//Deploy.js");

describe("Zero-address checking", function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
	async function deployCosmic(deployerAcct) {
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
			cosmicGameImplementation,
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", false);

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
			cosmicGameImplementation,
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
	it("Shouldn't be possible to set a zero-address for CharityWallet", async function () {
		const {
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
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");
		let addr = ethers.utils.getAddress("0x0000000000000000000000000000000000000000");
		await expect(charityWallet.setCharity(addr)).to.be.revertedWithCustomError(contractErrors,"ZeroAddress");
	});
	it("Shouldn't be possible to set a zero-address for token contract in MarketingWallet", async function () {
		const {
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
		} = await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");
		let addr = ethers.utils.getAddress("0x0000000000000000000000000000000000000000");
		await expect(marketingWallet.setTokenContract(addr)).to.be.revertedWithCustomError(contractErrors,"ZeroAddress");
	});
	it("Shouldn't be possible to deploy StakingWalletCST with zero-address-ed parameters", async function () {
		let zaddr = ethers.utils.getAddress("0x0000000000000000000000000000000000000000");
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");
		const StakingWalletCST = await ethers.getContractFactory("StakingWalletCST");
		await expect(StakingWalletCST.deploy(zaddr,addr1.address, addr2.address, {gasLimit:3000000})).to.be.revertedWithCustomError(contractErrors,"ZeroAddress");
		await expect(StakingWalletCST.deploy(owner.address,zaddr, addr2.address, {gasLimit:3000000})).to.be.revertedWithCustomError(contractErrors,"ZeroAddress");
		await expect(StakingWalletCST.deploy(addr1.address, addr2.address,zaddr,{gasLimit:3000000})).to.be.revertedWithCustomError(contractErrors,"ZeroAddress");
	});
	it("Shouldn't be possible to deploy StakingWalletRWalk with zero-address-ed parameters", async function () {
		let zaddr = ethers.utils.getAddress("0x0000000000000000000000000000000000000000");
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");
		const StakingWalletRWalk = await ethers.getContractFactory("StakingWalletRWalk");
		await expect(StakingWalletRWalk.deploy(zaddr,addr1.address, {gasLimit:3000000})).to.be.revertedWithCustomError(contractErrors,"ZeroAddress");
		await expect(StakingWalletRWalk.deploy(owner.address,zaddr, {gasLimit:3000000})).to.be.revertedWithCustomError(contractErrors,"ZeroAddress");
	});
	it("Shouldn't be possible to deploy CosmicSignature with zero-address-ed parameters", async function () {
		let zaddr = ethers.utils.getAddress("0x0000000000000000000000000000000000000000");
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");
		const CosmicSignature = await ethers.getContractFactory("CosmicSignature");
		await expect(CosmicSignature.deploy(zaddr,{gasLimit:3000000})).to.be.revertedWithCustomError(contractErrors,"ZeroAddress");
	});
	it("Shouldn't be possible to deploy RaffleWallet with zero-address-ed parameters", async function () {
		let zaddr = ethers.utils.getAddress("0x0000000000000000000000000000000000000000");
		let = contractErrors = await ethers.getContractFactory("CosmicGameErrors");
		const RaffleWallet = await ethers.getContractFactory("RaffleWallet");
		await expect(RaffleWallet.deploy(zaddr,{gasLimit:3000000})).to.be.revertedWithCustomError(contractErrors,"ZeroAddress");
	});
});
