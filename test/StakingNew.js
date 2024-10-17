// todo-1 Add this to all ".js" files".
"use strict";

const hre = require("hardhat");
const { time, loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
// const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');
const { expect } = require('chai');
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");
// const { toUtf8Bytes } = require('@ethersproject/strings');

const SKIP_LONG_TESTS = "0";

describe('Staking CST tests', function () {
	// ToDo-202410075-0 applies.
	// todo-1 `deployerAcct` wasn't used, so I have commented it out. Do the same in other tests.
	async function deployCosmic(/*deployerAcct*/) {
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
			cosmicGame,
		} = await basicDeployment(contractDeployerAcct, '', 0, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', false);

		return {
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
			cosmicGameImplementation: cosmicGame,
		};
	}
	const bidParamsEncoding = {
		type: 'tuple(string,int256)',
		name: 'bidparams',
		components: [
			{ name: 'msg', type: 'string' },
			{ name: 'rwalk', type: 'int256' }
		]
	};
	it("payReward() works as expected", async function () {
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
		    cosmicGame	
		} = await basicDeploymentAdvanced(
			'SpecialCosmicGame',
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			false
		);
		// const contractErrors = await hre.ethers.getContractFactory('CosmicGameErrors');

		const CosmicSignature = await hre.ethers.getContractFactory('CosmicSignature');
		let newCosmicSignature = await CosmicSignature.deploy(owner.address);
		await newCosmicSignature.waitForDeployment();

		await newCosmicSignature.connect(owner).mint(addr1.address, 0);
		await newCosmicSignature.connect(owner).mint(addr1.address, 1);

		const StakingWalletCosmicSignatureNft = await hre.ethers.getContractFactory('StakingWalletCosmicSignatureNft');
		let newStakingWalletCosmicSignatureNft = await StakingWalletCosmicSignatureNft.deploy(
			await newCosmicSignature.getAddress(),
			owner.address
		);
		await newStakingWalletCosmicSignatureNft.waitForDeployment();
		await newCosmicSignature.connect(addr1).setApprovalForAll(await newStakingWalletCosmicSignatureNft.getAddress(), true);
		await cosmicGameProxy.setRuntimeMode();

		await newStakingWalletCosmicSignatureNft.connect(addr1).stake(0);	// actionCounter = 1
		await newStakingWalletCosmicSignatureNft.connect(addr1).stake(1);	// actionCounter = 2

		await newStakingWalletCosmicSignatureNft.depositIfPossible(1,{value: hre.ethers.parseEther("1")}); // actionCounter = 3, depositId = 3, depositIndex = 1
		await newStakingWalletCosmicSignatureNft.depositIfPossible(2,{value: hre.ethers.parseEther("1")}); // actionCounter = 4, depositId = 4, depositIndex = 1

		await newStakingWalletCosmicSignatureNft.connect(addr1).unstake(1,1);	// only 1 ETH paid in this unstake()
		await newStakingWalletCosmicSignatureNft.connect(addr1).payReward(1,1); // attempt to get payment for the remaining 1 ETH
	});
});
