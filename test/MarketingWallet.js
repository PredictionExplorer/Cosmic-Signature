"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("MarketingWallet", function () {
	// it("MarketingWallet.setCosmicSignatureToken behaves correctly", async function () {
	// 	// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
	// 	const {ownerAcct, signers, marketingWallet,} = await loadFixture(deployContractsForUnitTesting);
	// 	const [signer0, signer1, signer2,] = signers;
	//
	// 	await expect(marketingWallet.connect(signer1).setCosmicSignatureToken(signer1.address)).to.be.revertedWithCustomError(marketingWallet, "OwnableUnauthorizedAccount");
	// 	await expect(marketingWallet.connect(ownerAcct).setCosmicSignatureToken(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(marketingWallet, "ZeroAddress");
	// 	await expect(marketingWallet.connect(ownerAcct).setCosmicSignatureToken(signer2.address)).to.emit(marketingWallet, "CosmicSignatureTokenAddressChanged").withArgs(signer2.address);
	// });
	
	it("MarketingWallet.payReward behaves correctly", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {deployerAcct, ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, cosmicSignatureToken, marketingWallet,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;

		const bidderContractFactory = await hre.ethers.getContractFactory("BidderContract", deployerAcct);
		const bidderContract = await bidderContractFactory.deploy(cosmicSignatureGameProxyAddr);
		await bidderContract.waitForDeployment();
		const bidderContractAddr = await bidderContract.getAddress();

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await bidderContract.connect(signer0).doBidWithEth({ value: nextEthBidPrice_ });
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
		// await hre.ethers.provider.send("evm_mine");
		await bidderContract.connect(signer0).doClaimMainPrize();

		const marketingRewardAmount = hre.ethers.parseEther("15");
		// await expect(marketingWallet.connect(ownerAcct).payReward(hre.ethers.ZeroAddress, marketingRewardAmount)).to.be.revertedWithCustomError(marketingWallet, "ZeroAddress");
		await expect(marketingWallet.connect(ownerAcct).payReward(hre.ethers.ZeroAddress, marketingRewardAmount)).to.be.revertedWithCustomError(cosmicSignatureToken, "ERC20InvalidReceiver");
		// await expect(marketingWallet.connect(ownerAcct).payReward(signer1.address, 0n)).to.be.revertedWithCustomError(marketingWallet, "ZeroValue");
		await marketingWallet.connect(ownerAcct).payReward(signer1, 0n);
		await expect(marketingWallet.connect(signer1).payReward(bidderContractAddr, 0n)).to.be.revertedWithCustomError(marketingWallet, "OwnableUnauthorizedAccount");
		await marketingWallet.connect(ownerAcct).payReward(signer1, marketingRewardAmount);

		// // Issue. Because I eliminated `MarketingWallet.setCosmicSignatureToken`,
		// // this part of the test no longer works.
		// {
		// 	await marketingWallet.connect(ownerAcct).setCosmicSignatureToken(bidderContractAddr);
		// 	await expect(marketingWallet.connect(signer1).setCosmicSignatureToken(bidderContractAddr)).to.be.revertedWithCustomError(marketingWallet, "OwnableUnauthorizedAccount");
		//			
		// 	// note : following call reverts because of unknown selector, not because of require() in the fallback function of BidderContract
		// 	// so no need to use startBlockingDeposits() function in this case
		// 	// todo-9 `revertedWithoutReason`?
		// 	await expect(marketingWallet.connect(ownerAcct).payReward(bidderContractAddr, marketingRewardAmount)).to.be.reverted;
		// }

		let balanceAmountAfter = await cosmicSignatureToken.balanceOf(signer1);
		expect(balanceAmountAfter).to.equal(marketingRewardAmount);
	});
});
