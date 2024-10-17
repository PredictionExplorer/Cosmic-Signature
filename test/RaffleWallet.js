const hre = require("hardhat");
const { expect } = require("chai");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("RaffleWallet", function () {
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
			stakingWalletRandomWalkNft,
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
			stakingWalletRandomWalkNft,
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
	it("deposit() works as expected", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			bidLogic
		} = await basicDeploymentAdvanced(
			'CosmicGame',
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			true
		);
		const contractErrors = await hre.ethers.getContractFactory('CosmicGameErrors');

		const NewRaffleWallet = await hre.ethers.getContractFactory('RaffleWallet');
		let newRaffleWallet = await NewRaffleWallet.deploy(owner.address);
		await newRaffleWallet.waitForDeployment();
		await expect(newRaffleWallet.deposit(hre.ethers.ZeroAddress)).to.revertedWithCustomError(contractErrors, "ZeroAddress");
		await expect(newRaffleWallet.deposit(addr1.address)).to.revertedWithCustomError(contractErrors, "NonZeroValueRequired");
		await expect(newRaffleWallet.connect(addr1).deposit(addr1.address,{value: 1000000n})).to.revertedWithCustomError(contractErrors, "DepositFromUnauthorizedSender");
		expect(newRaffleWallet.connect(owner).deposit({value:1000000n})).not.to.be.reverted;
	});
	it("withdraw() works as expected", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			bidLogic
		} = await basicDeploymentAdvanced(
			'CosmicGame',
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			true
		);
		const contractErrors = await hre.ethers.getContractFactory('CosmicGameErrors');

		const NewRaffleWallet = await hre.ethers.getContractFactory('RaffleWallet');
		let newRaffleWallet = await NewRaffleWallet.deploy(owner.address);
		await newRaffleWallet.waitForDeployment();
		await newRaffleWallet.connect(owner).deposit(addr1.address,{value: 1000n});

		await expect(newRaffleWallet.connect(addr2).withdraw()).to.be.revertedWithCustomError(contractErrors,"ZeroBalance");
	});
});
