"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { ENABLE_ASSERTS, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { activateCurrentRound, getLatestBlockTimestamp } = require("../src/V2UpgradeTestHelpers.js");
const { deployV1CompleteRoundZeroAndUpgradeToV2AndV3 } = require("../src/V3UpgradeTestHelpers.js");
const { bidWithEthAt } = require("../src/GameRoundTestHelpers.js");

const DONATED_TOKEN_AMOUNT = 10n ** 18n;

/** Places an ETH bid with a donation, paying the exact price quoted for the next block. */
async function bidWithEthAndDonate(game_, bidder_, methodName_, donatedContractAddress_, donatedAmountOrNftId_) {
	const timeStamp_ = (await getLatestBlockTimestamp()) + 1n;
	const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(1n);
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);
	return waitForTransactionReceipt(
		game_.connect(bidder_)[methodName_](-1n, "", 0n, donatedContractAddress_, donatedAmountOrNftId_, { value: ethBidPrice_, })
	);
}

async function claimMainPrizeAtMainPrizeTime(game_, claimer_) {
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime()),]);
	return waitForTransactionReceipt(game_.connect(claimer_).claimMainPrize());
}

describe("PrizesWallet-Replacement", function () {
	it("past winners withdraw and claim from the replaced PrizesWallet after the V3 upgrade", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const oldPrizesWallet_ = contracts_.prizesWallet;
		const [bidder1_, bidder2_,] = contracts_.signers.slice(1, 3);
		const mockErc20_ = await (await hre.ethers.getContractFactory("FuzzTestMockErc20", contracts_.deployerSigner)).deploy();
		const mockErc721_ = await (await hre.ethers.getContractFactory("FuzzTestMockErc721", contracts_.deployerSigner)).deploy();
		const mockErc20Address_ = await mockErc20_.getAddress();
		const mockErc721Address_ = await mockErc721_.getAddress();
		await waitForTransactionReceipt(mockErc20_.mint(bidder1_.address, DONATED_TOKEN_AMOUNT));
		await waitForTransactionReceipt(mockErc721_.mint(bidder1_.address));
		await waitForTransactionReceipt(mockErc721_.mint(bidder1_.address));
		const [oldWalletDonatedNftId_, newWalletDonatedNftId_,] = [1n, 2n,];

		// #region A round that ends while the old `PrizesWallet` is registered with the Game.

		const oldWalletRoundNum_ = await game_.roundNum();
		await activateCurrentRound(game_, contracts_.ownerSigner);
		await waitForTransactionReceipt(mockErc20_.connect(bidder1_).approve(contracts_.prizesWalletAddress, DONATED_TOKEN_AMOUNT));
		await bidWithEthAndDonate(game_, bidder1_, "bidWithEthAndDonateToken", mockErc20Address_, DONATED_TOKEN_AMOUNT);
		await waitForTransactionReceipt(mockErc721_.connect(bidder1_).approve(contracts_.prizesWalletAddress, oldWalletDonatedNftId_));
		await bidWithEthAndDonate(game_, bidder1_, "bidWithEthAndDonateNft", mockErc721Address_, oldWalletDonatedNftId_);
		await bidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + 1n);

		// The old wallet also holds ETH prizes from earlier rounds.
		const oldWalletEthBalanceBeforeClaim_ = await hre.ethers.provider.getBalance(contracts_.prizesWalletAddress);
		await claimMainPrizeAtMainPrizeTime(game_, bidder2_);
		const oldWalletEthBalanceAmounts_ = {};
		for (const bidder_ of [bidder1_, bidder2_,]) {
			oldWalletEthBalanceAmounts_[bidder_.address] =
				await oldPrizesWallet_["getEthBalanceAmount(uint256,address)"](oldWalletRoundNum_, bidder_.address);
		}
		expect(oldWalletEthBalanceAmounts_[bidder1_.address] + oldWalletEthBalanceAmounts_[bidder2_.address])
			.equal((await hre.ethers.provider.getBalance(contracts_.prizesWalletAddress)) - oldWalletEthBalanceBeforeClaim_);

		// #endregion
		// #region Replacing `PrizesWallet` between rounds, like Comment-202607153 does.

		const newPrizesWallet_ = await contracts_.prizesWalletFactory.deploy(contracts_.cosmicSignatureGameProxyAddress);
		await newPrizesWallet_.waitForDeployment();
		const newPrizesWalletAddress_ = await newPrizesWallet_.getAddress();
		await waitForTransactionReceipt(newPrizesWallet_.transferOwnership(contracts_.ownerSigner.address));
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setPrizesWallet(newPrizesWalletAddress_));

		// #endregion
		// #region A round that ends while the new `PrizesWallet` is registered with the Game.

		const newWalletRoundNum_ = await game_.roundNum();
		await activateCurrentRound(game_, contracts_.ownerSigner);
		await waitForTransactionReceipt(mockErc721_.connect(bidder1_).approve(newPrizesWalletAddress_, newWalletDonatedNftId_));
		await bidWithEthAndDonate(game_, bidder1_, "bidWithEthAndDonateNft", mockErc721Address_, newWalletDonatedNftId_);
		if (ENABLE_ASSERTS) {
			// Comment-202610038 applies.
			await waitForTransactionReceipt(newPrizesWallet_.connect(contracts_.ownerSigner).setBypassSomeAsserts(true));
		}
		await claimMainPrizeAtMainPrizeTime(game_, bidder1_);
		if (ENABLE_ASSERTS) {
			await waitForTransactionReceipt(newPrizesWallet_.connect(contracts_.ownerSigner).setBypassSomeAsserts(false));
		}

		// Each wallet knows only about the rounds that ended while it was registered.
		expect(await oldPrizesWallet_.mainPrizeBeneficiaryAddresses(oldWalletRoundNum_)).equal(bidder2_.address);
		expect(await oldPrizesWallet_.roundTimeoutTimesToWithdrawPrizes(newWalletRoundNum_)).equal(0n);
		expect(await newPrizesWallet_.mainPrizeBeneficiaryAddresses(newWalletRoundNum_)).equal(bidder1_.address);
		expect(await newPrizesWallet_.roundTimeoutTimesToWithdrawPrizes(oldWalletRoundNum_)).equal(0n);

		// Donated NFT indexes are per wallet, so the same index refers to different NFTs in the 2 wallets.
		expect(await oldPrizesWallet_.nextDonatedNftIndex()).equal(1n);
		expect(await newPrizesWallet_.nextDonatedNftIndex()).equal(1n);
		expect((await oldPrizesWallet_.donatedNfts(0n)).nftId).equal(oldWalletDonatedNftId_);
		expect((await newPrizesWallet_.donatedNfts(0n)).nftId).equal(newWalletDonatedNftId_);

		// #endregion
		// #region The old wallet's winners still withdraw and claim everything, before the timeout, from the old wallet.

		for (const bidder_ of [bidder1_, bidder2_,]) {
			const ethBalanceAmount_ = oldWalletEthBalanceAmounts_[bidder_.address];
			if (ethBalanceAmount_ > 0n) {
				await expect(oldPrizesWallet_.connect(bidder_)["withdrawEth(uint256)"](oldWalletRoundNum_))
					.changeEtherBalance(bidder_, ethBalanceAmount_);
			}
		}
		expect(await hre.ethers.provider.getBalance(contracts_.prizesWalletAddress)).equal(oldWalletEthBalanceBeforeClaim_);
		await waitForTransactionReceipt(oldPrizesWallet_.connect(bidder2_).claimDonatedToken(oldWalletRoundNum_, mockErc20Address_, 0n));
		expect(await mockErc20_.balanceOf(bidder2_.address)).equal(DONATED_TOKEN_AMOUNT);
		await waitForTransactionReceipt(oldPrizesWallet_.connect(bidder2_).claimDonatedNft(0n));
		expect(await mockErc721_.ownerOf(oldWalletDonatedNftId_)).equal(bidder2_.address);

		// The new wallet's NFT with the same index goes to the new round's beneficiary.
		await waitForTransactionReceipt(newPrizesWallet_.connect(bidder1_).claimDonatedNft(0n));
		expect(await mockErc721_.ownerOf(newWalletDonatedNftId_)).equal(bidder1_.address);

		// #endregion
	});
});
