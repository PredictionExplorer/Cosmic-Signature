"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixtureDeployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("MarketingWallet", function () {
	it("Deployment", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		await expect(contracts_.marketingWalletFactory.deploy(hre.ethers.ZeroAddress))
			.revertedWithCustomError(contracts_.marketingWalletFactory, "ZeroAddress");
	});

	it("Paying marketing rewards", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		{
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[10]).bidWithEth(-1n, "", {value: 10n ** 18n,})).not.reverted;
			const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
			// await hre.ethers.provider.send("evm_mine");
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[10]).claimMainPrize()).not.reverted;
		}

		{
			const availableMarketingRewardAmount_ = await contracts_.cosmicSignatureToken.balanceOf(contracts_.marketingWalletAddr);

			await expect(contracts_.marketingWallet.connect(contracts_.signers[0]).payReward(contracts_.signers[1].address, 0n))
				.revertedWithCustomError(contracts_.marketingWallet, "OwnableUnauthorizedAccount");
			await expect(contracts_.marketingWallet.connect(contracts_.ownerAcct).payReward(hre.ethers.ZeroAddress, 0n))
				.revertedWithCustomError(contracts_.cosmicSignatureToken, "ERC20InvalidReceiver");
			await expect(contracts_.marketingWallet.connect(contracts_.ownerAcct).payReward(contracts_.signers[1].address, 0n))
				.emit(contracts_.marketingWallet, "RewardPaid")
				.withArgs(contracts_.signers[1].address, 0n);
			await expect(contracts_.marketingWallet.connect(contracts_.ownerAcct).payReward(contracts_.signers[1].address, 21n))
				.emit(contracts_.marketingWallet, "RewardPaid")
				.withArgs(contracts_.signers[1].address, 21n);

			const marketerAddresses_ = [
				contracts_.signers[3].address,
				contracts_.signers[2].address,
				contracts_.signers[1].address,
			];
			await expect(contracts_.marketingWallet.connect(contracts_.signers[0])["payManyRewards(address[],uint256)"](marketerAddresses_, 31))
				.revertedWithCustomError(contracts_.marketingWallet, "OwnableUnauthorizedAccount");
			await expect(contracts_.marketingWallet.connect(contracts_.ownerAcct)["payManyRewards(address[],uint256)"](marketerAddresses_, 31))
				.emit(contracts_.marketingWallet, "RewardPaid")
				.withArgs(contracts_.signers[1].address, 31n)
				.and.emit(contracts_.marketingWallet, "RewardPaid")
				.withArgs(contracts_.signers[2].address, 31n)
				.and.emit(contracts_.marketingWallet, "RewardPaid")
				.withArgs(contracts_.signers[3].address, 31n);

			const transferSpecs_ = [
				[contracts_.signers[1].address, 41n,],
				[contracts_.signers[2].address, 51n,],
				[contracts_.signers[3].address, 61n,],
			];
			await expect(contracts_.marketingWallet.connect(contracts_.signers[0])["payManyRewards((address,uint256)[])"](transferSpecs_))
				.revertedWithCustomError(contracts_.marketingWallet, "OwnableUnauthorizedAccount");
			await expect(contracts_.marketingWallet.connect(contracts_.ownerAcct)["payManyRewards((address,uint256)[])"](transferSpecs_))
				.emit(contracts_.marketingWallet, "RewardPaid")
				.withArgs(contracts_.signers[3].address, 61n)
				.and.emit(contracts_.marketingWallet, "RewardPaid")
				.withArgs(contracts_.signers[2].address, 51n)
				.and.emit(contracts_.marketingWallet, "RewardPaid")
				.withArgs(contracts_.signers[1].address, 41n);

			const signer1ExpectedBalanceAmount_ = 0n + 21n + 31n + 41n;
			expect(await contracts_.cosmicSignatureToken.balanceOf(contracts_.signers[1].address)).equal(signer1ExpectedBalanceAmount_);
			const signer2ExpectedBalanceAmount_ = 31n + 51n;
			expect(await contracts_.cosmicSignatureToken.balanceOf(contracts_.signers[2].address)).equal(signer2ExpectedBalanceAmount_);
			const signer3ExpectedBalanceAmount_ = 31n + 61n;
			expect(await contracts_.cosmicSignatureToken.balanceOf(contracts_.signers[3].address)).equal(signer3ExpectedBalanceAmount_);
			const marketingWalletExpectedBalanceAmount_ =
				availableMarketingRewardAmount_ - signer1ExpectedBalanceAmount_ - signer2ExpectedBalanceAmount_ - signer3ExpectedBalanceAmount_;
			expect(await contracts_.cosmicSignatureToken.balanceOf(contracts_.marketingWalletAddr)).equal(marketingWalletExpectedBalanceAmount_);
		}
	});
});
