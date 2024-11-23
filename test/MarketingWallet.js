"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

describe("MarketingWallet", function () {
	async function deployCosmic(deployerAcct) {
		const [contractDeployerAcct] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			cosmicGame,
		} = await basicDeployment(contractDeployerAcct, '', 1, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', false);
		return {
			cosmicGameProxy: cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
			cosmicGame,
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
	it("MarketingWallet.setTokenContract functions correctly", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNft,
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
			true
		);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicGameErrors");

		await expect(marketingWallet.connect(addr1).setTokenContract(addr1.address)).to.be.revertedWithCustomError(marketingWallet, "OwnableUnauthorizedAccount");
		await expect(marketingWallet.setTokenContract(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		await expect(marketingWallet.setTokenContract(addr2.address)).to.emit(marketingWallet, "TokenContractAddressChanged").withArgs(addr2.address);
	});
	it("MarketingWallet.payReward functions correctly", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			prizesWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
		} = await basicDeployment(owner, "", 1, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", true);
		const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicGameErrors");

		const BidderContract = await hre.ethers.getContractFactory('BidderContract');
		const cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		await cBidder.waitForDeployment();

		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cBidder.doBid({ value: bidPrice });

		const marketingReward = hre.ethers.parseEther('15');
		// await expect(marketingWallet.payReward(hre.ethers.ZeroAddress, marketingReward)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "ZeroAddress");
		await expect(marketingWallet.payReward(hre.ethers.ZeroAddress, marketingReward)).to.be.revertedWithCustomError(cosmicToken, "ERC20InvalidReceiver");
		// await expect(marketingWallet.payReward(addr1.address, 0n)).to.be.revertedWithCustomError(cosmicSignatureGameErrorsFactory_, "NonZeroValueRequired");
		await marketingWallet.payReward(addr1, 0n);
		await expect(marketingWallet.connect(addr1).payReward(await cBidder.getAddress(), 0n)).to.be.revertedWithCustomError(marketingWallet, "OwnableUnauthorizedAccount");
		await marketingWallet.payReward(addr1, marketingReward);
		await marketingWallet.setTokenContract(await cBidder.getAddress());
		await expect(marketingWallet.connect(addr1).setTokenContract(await cBidder.getAddress())).to.be.revertedWithCustomError(marketingWallet, "OwnableUnauthorizedAccount");

		// note : following call reverts because of unknown selector, not because of require() in the fallback function of BidderContract
		// so no need to use startBlockingDeposits() function in this case
		await expect(marketingWallet.payReward(await cBidder.getAddress(), marketingReward)).to.be.reverted;

		let balanceAfter = await cosmicToken.balanceOf(addr1);
		expect(balanceAfter).to.equal(marketingReward);
	});
});
