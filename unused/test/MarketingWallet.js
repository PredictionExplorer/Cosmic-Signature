"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { basicDeployment, basicDeploymentAdvanced } = require("../src/Deploy.js");

describe("MarketingWallet", function () {
	// async function deployCosmicSignature(deployerAcct) {
	// 	const [contractDeployerAcct, addr1,] = await hre.ethers.getSigners();
	// 	const {
	// 		cosmicSignatureGameProxy,
	// 		cosmicSignatureToken,
	// 		cosmicSignatureNft,
	// 		charityWallet,
	// 		cosmicSignatureDao,
	// 		prizesWallet,
	// 		randomWalkNft,
	// 		stakingWalletCosmicSignatureNft,
	// 		stakingWalletRandomWalkNft,
	// 		marketingWallet,
	// 		// cosmicSignatureGame,
	// 	} = await basicDeployment(contractDeployerAcct, "", 1, addr1.address, false);
	// 	return {
	// 		cosmicSignatureGameProxy: cosmicSignatureGameProxy,
	// 		cosmicSignatureToken,
	// 		cosmicSignatureNft,
	// 		charityWallet,
	// 		cosmicSignatureDao,
	// 		prizesWallet,
	// 		randomWalkNft,
	// 		stakingWalletCosmicSignatureNft,
	// 		stakingWalletRandomWalkNft,
	// 		marketingWallet,
	// 		// cosmicSignatureGame,
	// 	};
	// }
	// const bidParamsEncoding = {
	// 	type: "tuple(string,int256)",
	// 	name: "BidParams",
	// 	components: [
	// 		{ name: "message", type: "string" },
	// 		{ name: "randomWalkNftId", type: "int256" },
	// 	],
	// };
	it("MarketingWallet.setCosmicSignatureToken functions correctly", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			charityWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
		} = await basicDeploymentAdvanced(
			"SpecialCosmicSignatureGame",
			owner,
			'',
			0,
			addr1.address,
			true
		);
		// const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		await expect(marketingWallet.connect(addr1).setCosmicSignatureToken(addr1.address)).to.be.revertedWithCustomError(marketingWallet, "OwnableUnauthorizedAccount");
		await expect(marketingWallet.setCosmicSignatureToken(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(marketingWallet, "ZeroAddress");
		await expect(marketingWallet.setCosmicSignatureToken(addr2.address)).to.emit(marketingWallet, "CosmicSignatureTokenAddressChanged").withArgs(addr2.address);
	});
	it("MarketingWallet.payReward functions correctly", async function () {
		const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
		const {
			cosmicSignatureGameProxy,
			cosmicSignatureToken,
			charityWallet,
			randomWalkNft,
			stakingWalletCosmicSignatureNft,
			stakingWalletRandomWalkNft,
			marketingWallet,
		} = await basicDeployment(owner, "", 1, addr1.address, true);
		// const cosmicSignatureGameErrorsFactory_ = await hre.ethers.getContractFactory("CosmicSignatureErrors");

		const BidderContract = await hre.ethers.getContractFactory("BidderContract");
		const cBidder = await BidderContract.deploy(await cosmicSignatureGameProxy.getAddress());
		await cBidder.waitForDeployment();

		let bidPrice = await cosmicSignatureGameProxy.getBidPrice();
		await cBidder.doBid({ value: bidPrice });

		const marketingReward = hre.ethers.parseEther('15');
		// await expect(marketingWallet.payReward(hre.ethers.ZeroAddress, marketingReward)).to.be.revertedWithCustomError(marketingWallet, "ZeroAddress");
		await expect(marketingWallet.payReward(hre.ethers.ZeroAddress, marketingReward)).to.be.revertedWithCustomError(cosmicSignatureToken, "ERC20InvalidReceiver");
		// await expect(marketingWallet.payReward(addr1.address, 0n)).to.be.revertedWithCustomError(marketingWallet, "NonZeroValueRequired");
		await marketingWallet.payReward(addr1, 0n);
		await expect(marketingWallet.connect(addr1).payReward(await cBidder.getAddress(), 0n)).to.be.revertedWithCustomError(marketingWallet, "OwnableUnauthorizedAccount");
		await marketingWallet.payReward(addr1, marketingReward);
		await marketingWallet.setCosmicSignatureToken(await cBidder.getAddress());
		await expect(marketingWallet.connect(addr1).setCosmicSignatureToken(await cBidder.getAddress())).to.be.revertedWithCustomError(marketingWallet, "OwnableUnauthorizedAccount");

		// note : following call reverts because of unknown selector, not because of require() in the fallback function of BidderContract
		// so no need to use startBlockingDeposits() function in this case
		await expect(marketingWallet.payReward(await cBidder.getAddress(), marketingReward)).to.be.reverted;

		let balanceAfter = await cosmicSignatureToken.balanceOf(addr1);
		expect(balanceAfter).to.equal(marketingReward);
	});
});
