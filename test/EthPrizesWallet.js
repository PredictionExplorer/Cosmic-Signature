const hre = require("hardhat");
const { expect } = require("chai");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("EthPrizesWallet", function () {
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
			cosmicGameImplementation
		} = await basicDeployment(contractDeployerAcct, '', 0, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', false);

		return {
			cosmicGameProxy: cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			ethPrizesWallet,
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
			ethPrizesWallet,
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

		const NewEthPrizesWallet = await hre.ethers.getContractFactory('EthPrizesWallet');
		let newEthPrizesWallet = await NewEthPrizesWallet.deploy(owner.address);
		await newEthPrizesWallet.waitForDeployment();

		expect(await newEthPrizesWallet.connect(addr1).deposit(addr1.address,{value: 1000000n})).to.revertedWithCustomError(contractErrors, "DepositFromUnauthorizedSender");

		// // Comment-202411084 relates and/or applies.
		// // I have observed that this now reverts with panic when asserts are enabled.
		// expect(await newEthPrizesWallet.deposit(hre.ethers.ZeroAddress)).to.revertedWithCustomError(contractErrors, "ZeroAddress");

		// Comment-202409215 relates and/or applies.
		// expect(await newEthPrizesWallet.deposit(addr1.address)).to.revertedWithCustomError(contractErrors, "NonZeroValueRequired");
		expect(await newEthPrizesWallet.deposit(addr1.address)).not.to.be.reverted;

		expect(await newEthPrizesWallet.connect(owner).deposit({value:1000000n})).not.to.be.reverted;
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
			ethPrizesWallet,
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

		const NewEthPrizesWallet = await hre.ethers.getContractFactory('EthPrizesWallet');
		let newEthPrizesWallet = await NewEthPrizesWallet.deploy(owner.address);
		await newEthPrizesWallet.waitForDeployment();
		await newEthPrizesWallet.connect(owner).deposit(addr1.address,{value: 1000n});

		// Comment-202409215 relates and/or applies.
		// expect(await newEthPrizesWallet.connect(addr2).withdraw()).to.be.revertedWithCustomError(contractErrors, "ZeroBalance");
		expect(await newEthPrizesWallet.connect(addr2).withdraw()).not.to.be.reverted;
	});
});
