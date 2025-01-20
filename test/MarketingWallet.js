"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForTesting } = require("../src/ContractTestingHelpers.js");

describe("MarketingWallet", function () {
	// const bidParamsEncoding = {
	// 	type: "tuple(string,int256)",
	// 	name: "BidParams",
	// 	components: [
	// 		{ name: "message", type: "string" },
	// 		{ name: "randomWalkNftId", type: "int256" },
	// 	],
	// };
	it("MarketingWallet.setCosmicSignatureToken behaves correctly", async function () {
		const {signers, marketingWallet,} = await loadFixture(deployContractsForTesting);
		const [owner, addr1, addr2,] = signers;

		await expect(marketingWallet.connect(addr1).setCosmicSignatureToken(addr1.address)).to.be.revertedWithCustomError(marketingWallet, "OwnableUnauthorizedAccount");
		await expect(marketingWallet.setCosmicSignatureToken(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(marketingWallet, "ZeroAddress");
		await expect(marketingWallet.setCosmicSignatureToken(addr2.address)).to.emit(marketingWallet, "CosmicSignatureTokenAddressChanged").withArgs(addr2.address);
	});
	it("MarketingWallet.payReward behaves correctly", async function () {
		const {signers, cosmicSignatureGameProxy, cosmicSignatureToken, marketingWallet,} =
			await loadFixture(deployContractsForTesting);
		const [owner, addr1,] = signers;

		const BidderContract = await hre.ethers.getContractFactory("BidderContract");
		const cBidder = await BidderContract.deploy(await cosmicSignatureGameProxy.getAddress());
		await cBidder.waitForDeployment();

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await cBidder.doBid({ value: nextEthBidPrice_ });
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		await cBidder.doClaim();

		const marketingReward = hre.ethers.parseEther("15");
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
