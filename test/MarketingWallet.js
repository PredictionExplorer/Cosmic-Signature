const { expect } = require("chai");
// const { ethers } = require("hardhat");
const hre = require("hardhat");
const { basicDeployment,basicDeploymentAdvanced } = require("../src/Deploy.js");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Events", function () {
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
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			cosmicGameImplementation
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
	it("setTokenContract() emits CosmicTokenAddressChanged event correctly()", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		await expect(marketingWallet.setTokenContract(ethers.ZeroAddress)).to.revertedWithCustomError(contractErrors, "ZeroAddress");
		expect(cosmicGameProxy.setTokenContract(addr2.address)).to.emit(cosmicSignature, "CosmicTokenAddressChanged").withArgs(addr1.address);
	});
	it("MarketinWallet properly send()s accumulated funds", async function () {
		[owner, addr1, addr2, addr3] = await ethers.getSigners();
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
		} = await basicDeployment(owner, "", 0, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true,true);
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: "", rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });

		const marketingReward = ethers.parseEther('15');
		await expect(marketingWallet.send(marketingReward,ethers.ZeroAddress)).to.be.revertedWithCustomError(contractErrors,"ZeroAddress");
		await expect(marketingWallet.send(0n,addr2.address)).to.be.revertedWithCustomError(contractErrors,"NonZeroValueRequired");
		await marketingWallet.send(marketingReward,addr2);

		let balanceAfter = await cosmicToken.balanceOf(addr2);
		expect(balanceAfter).to.equal(marketingReward);

	});
});
