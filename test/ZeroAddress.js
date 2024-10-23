const hre = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

describe("Zero-address checking", function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
	async function deployCosmic(deployerAcct) {
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
			cosmicGameImplementation,
		} = await basicDeployment(contractDeployerAcct, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", false);

		return {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			ethPrizesWallet,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
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
			ethPrizesWallet,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			bidLogic,
		} = await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");
		await expect(charityWallet.setCharity(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(contractErrors,"ZeroAddress");
	});
	it("Shouldn't be possible to set a zero-address for charity in CosmicGame", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			ethPrizesWallet,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			bidLogic
		} = await basicDeploymentAdvanced(
			'SpecialCosmicGame',
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			false
		);
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");
		await expect(cosmicGameProxy.setCharity(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(contractErrors,"ZeroAddress");
	});
	it("Shouldn't be possible to set a zero-address for token contract in MarketingWallet", async function () {
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			ethPrizesWallet,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			bidLogic,
		} = await loadFixture(deployCosmic);
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");
		await expect(marketingWallet.setTokenContract(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(contractErrors,"ZeroAddress");
	});
	it("Shouldn't be possible to deploy StakingWalletCosmicSignatureNft with zero-address-ed parameters", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");
		const StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory("StakingWalletCosmicSignatureNft");
		await expect(StakingWalletCosmicSignatureNft.deploy(hre.ethers.ZeroAddress, addr1.address, /*addr2.address,*/ {gasLimit:3000000})).to.be.revertedWithCustomError(contractErrors,"ZeroAddress");
		await expect(StakingWalletCosmicSignatureNft.deploy(owner.address, hre.ethers.ZeroAddress, /*addr2.address,*/ {gasLimit:3000000})).to.be.revertedWithCustomError(contractErrors,"ZeroAddress");

		// // Comment-202409209 applies.
		// await expect(StakingWalletCosmicSignatureNft.deploy(addr1.address, addr2.address, hre.ethers.ZeroAddress, {gasLimit:3000000})).to.be.revertedWithCustomError(contractErrors,"ZeroAddress");
	});
	it("Shouldn't be possible to deploy StakingWalletRandomWalkNft with zero-address-ed parameters", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");
		const StakingWalletRandomWalkNft = await hre.ethers.getContractFactory("StakingWalletRandomWalkNft");
		await expect(StakingWalletRandomWalkNft.deploy(hre.ethers.ZeroAddress, {gasLimit:3000000})).to.be.revertedWithCustomError(contractErrors,"ZeroAddress");
	});
	it("Shouldn't be possible to deploy CosmicSignature with zero-address-ed parameters", async function () {
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");
		const CosmicSignature = await hre.ethers.getContractFactory("CosmicSignature");
		await expect(CosmicSignature.deploy(hre.ethers.ZeroAddress,{gasLimit:3000000})).to.be.revertedWithCustomError(contractErrors,"ZeroAddress");
	});
	it("Shouldn't be possible to deploy MarketingWallet with zero-address-ed parameters", async function () {
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");
		const MarketingWallet = await hre.ethers.getContractFactory("MarketingWallet");
		await expect(MarketingWallet.deploy(hre.ethers.ZeroAddress,{gasLimit:3000000})).to.be.revertedWithCustomError(contractErrors,"ZeroAddress");
	});
	it("Shouldn't be possible to deploy EthPrizesWallet with zero-address-ed parameters", async function () {
		const contractErrors = await hre.ethers.getContractFactory("CosmicGameErrors");
		const EthPrizesWallet = await hre.ethers.getContractFactory("EthPrizesWallet");
		await expect(EthPrizesWallet.deploy(hre.ethers.ZeroAddress,{gasLimit:3000000})).to.be.revertedWithCustomError(contractErrors,"ZeroAddress");
	});
});
