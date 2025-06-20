"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("MarketingWallet-Old", function () {
	// it("MarketingWallet.setCosmicSignatureToken behaves correctly", async function () {
	// 	// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
	// 	const {ownerAcct, signers, marketingWallet,} = await loadFixture(deployContractsForUnitTesting);
	// 	const [signer0, signer1, signer2,] = signers;
	//
	// 	await expect(marketingWallet.connect(signer1).setCosmicSignatureToken(signer1.address)).revertedWithCustomError(marketingWallet, "OwnableUnauthorizedAccount");
	// 	await expect(marketingWallet.connect(ownerAcct).setCosmicSignatureToken(hre.ethers.ZeroAddress)).revertedWithCustomError(marketingWallet, "ZeroAddress");
	// 	await expect(marketingWallet.connect(ownerAcct).setCosmicSignatureToken(signer2.address)).to.emit(marketingWallet, "CosmicSignatureTokenAddressChanged").withArgs(signer2.address);
	// });
	
	it("MarketingWallet.payReward behaves correctly", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {deployerAcct, ownerAcct, signers, cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, cosmicSignatureToken, marketingWallet,} =
			await loadFixture(deployContractsForUnitTesting);
		const [signer0, signer1,] = signers;

		const bidderContractFactory_ = await hre.ethers.getContractFactory("BidderContract", deployerAcct);
		const bidderContract_ = await bidderContractFactory_.deploy(cosmicSignatureGameProxyAddr);
		await bidderContract_.waitForDeployment();
		const bidderContractAddr_ = await bidderContract_.getAddress();

		let nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await bidderContract_.connect(signer0).doBidWithEth({value: nextEthBidPrice_,});
		let durationUntilMainPrize_ = await cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		await bidderContract_.connect(signer0).doClaimMainPrize();

		const marketingRewardAmount = hre.ethers.parseEther("15");
		// await expect(marketingWallet.connect(ownerAcct).payReward(hre.ethers.ZeroAddress, marketingRewardAmount)).revertedWithCustomError(marketingWallet, "ZeroAddress");
		await expect(marketingWallet.connect(ownerAcct).payReward(hre.ethers.ZeroAddress, marketingRewardAmount)).revertedWithCustomError(cosmicSignatureToken, "ERC20InvalidReceiver");
		// await expect(marketingWallet.connect(ownerAcct).payReward(signer1.address, 0n)).revertedWithCustomError(marketingWallet, "ZeroValue");
		await marketingWallet.connect(ownerAcct).payReward(signer1, 0n);
		await expect(marketingWallet.connect(signer1).payReward(bidderContractAddr_, 0n)).revertedWithCustomError(marketingWallet, "OwnableUnauthorizedAccount");
		await marketingWallet.connect(ownerAcct).payReward(signer1, marketingRewardAmount);

		// // Issue. Because I eliminated `MarketingWallet.setCosmicSignatureToken`,
		// // this part of the test no longer works.
		// {
		// 	await marketingWallet.connect(ownerAcct).setCosmicSignatureToken(bidderContractAddr_);
		// 	await expect(marketingWallet.connect(signer1).setCosmicSignatureToken(bidderContractAddr_)).revertedWithCustomError(marketingWallet, "OwnableUnauthorizedAccount");
		//			
		// 	// note : following call reverts because of unknown selector, not because of require() in the fallback function of BidderContract
		// 	// so no need to use startBlockingDeposits() function in this case
		// 	// todo-9 `revertedWithoutReason`?
		// 	await expect(marketingWallet.connect(ownerAcct).payReward(bidderContractAddr_, marketingRewardAmount)).to.be.reverted;
		// }

		let balanceAmountAfter = await cosmicSignatureToken.balanceOf(signer1);
		expect(balanceAmountAfter).equal(marketingRewardAmount);
	});

	// todo-1 We don't need this test any morfe, right?
	// it("Shouldn't be possible to set MarketingWallet.token to a zero-address", async function () {
	// 	// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
	// 	const {ownerAcct, marketingWallet,} = await loadFixture(deployContractsForUnitTesting);
	//	
	// 	await expect(marketingWallet.connect(ownerAcct).setCosmicSignatureToken(hre.ethers.ZeroAddress)).revertedWithCustomError(marketingWallet, "ZeroAddress");
	// });

	it("Shouldn't be possible to deploy MarketingWallet with zero-address-ed parameters", async function () {
		// todo-1 Call `loadFixtureDeployContractsForUnitTesting` instead of `loadFixture(deployContractsForUnitTesting)`.
		const {marketingWalletFactory,} = await loadFixture(deployContractsForUnitTesting);

		await expect(marketingWalletFactory.deploy(hre.ethers.ZeroAddress /* , {gasLimit: 3000000} */)).revertedWithCustomError(marketingWalletFactory, "ZeroAddress");
	});
});
