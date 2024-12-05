"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

describe("ZeroAddressChecking", function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
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
			// cosmicSignatureGame,
		} = await basicDeployment(contractDeployerAcct, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", false);
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
			// cosmicSignatureGame,
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
	it("Shouldn't be possible to set a zero-address for CharityWallet", async function () {
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
			bidLogic,
		} = await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
		await expect(charityWallet.setCharityAddress(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
	});
	it("Shouldn't be possible to set a zero charity address in CosmicSignatureGame", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
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
			bidLogic
		} = await basicDeploymentAdvanced(
			'SpecialCosmicSignatureGame',
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true
		);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
		await expect(cosmicSignatureGameProxy.setCharityAddress(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
	});
	it("Shouldn't be possible to set a zero-address for token contract in MarketingWallet", async function () {
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
			bidLogic,
		} = await loadFixture(deployCosmicSignature);
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
		await expect(marketingWallet.setTokenContract(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
	});
	it("Shouldn't be possible to deploy StakingWalletCosmicSignatureNft with zero-address-ed parameters", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
		const StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory("StakingWalletCosmicSignatureNft");
		await expect(StakingWalletCosmicSignatureNft.deploy(hre.ethers.ZeroAddress, addr1.address, /*addr2.address,*/ {gasLimit:3000000})).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		await expect(StakingWalletCosmicSignatureNft.deploy(owner.address, hre.ethers.ZeroAddress, /*addr2.address,*/ {gasLimit:3000000})).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");

		// // Comment-202409209 applies.
		// await expect(StakingWalletCosmicSignatureNft.deploy(addr1.address, addr2.address, hre.ethers.ZeroAddress, {gasLimit:3000000})).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
	});
	it("Shouldn't be possible to deploy StakingWalletRandomWalkNft with zero-address-ed parameters", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
		const StakingWalletRandomWalkNft = await hre.ethers.getContractFactory("StakingWalletRandomWalkNft");
		await expect(StakingWalletRandomWalkNft.deploy(hre.ethers.ZeroAddress, {gasLimit:3000000})).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
	});
	it("Shouldn't be possible to deploy CosmicSignatureNft with zero-address-ed parameters", async function () {
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
		const CosmicSignatureNft = await hre.ethers.getContractFactory("CosmicSignatureNft");
		await expect(CosmicSignatureNft.deploy(hre.ethers.ZeroAddress,{gasLimit:3000000})).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
	});
	it("Shouldn't be possible to deploy MarketingWallet with zero-address-ed parameters", async function () {
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
		const MarketingWallet = await hre.ethers.getContractFactory("MarketingWallet");
		await expect(MarketingWallet.deploy(hre.ethers.ZeroAddress,{gasLimit:3000000})).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
	});
	it("Shouldn't be possible to deploy PrizesWallet with zero-address-ed parameters", async function () {
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");
		const PrizesWallet = await hre.ethers.getContractFactory("PrizesWallet");
		await expect(PrizesWallet.deploy(hre.ethers.ZeroAddress,{gasLimit:3000000})).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
	});
});
