const { time, loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require("hardhat");
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');
const { expect } = require('chai');
const SKIP_LONG_TESTS = '1';
const { basicDeployment, basicDeploymentAdvanced } = require('../src//Deploy.js');

describe('File pending for deletion', function () {
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
			cosmicGame
		} = await basicDeployment(
			contractDeployerAcct,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			true
		);
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
			cosmicGame,
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
	const InvalidBidderQueryRoundDef = {
		type: 'tuple(string,uint256,uint256)',
		name: 'InvalidBidderQueryRound',
		components: [
			{ name: 'errStr', type: 'string' },
			{ name: 'providedRound', type: 'uint256' },
			{ name: 'totalRounds', type: 'uint256' }
		]
	};
});
