"use strict";

// Tests `MainPrizeV3`'s V3 ETH distribution and multi-NFT main prize: the main prize beneficiary
// receives `mainPrizeNumCosmicSignatureNfts` Cosmic Signature NFTs with sequential IDs, and the V3
// `MainPrizeClaimed` event reports the first of them plus their count.

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { generateRandomUInt256, waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	getLatestBlockTimestamp,
	activateCurrentRound,
} = require("../src/V2UpgradeTestHelpers.js");
const {
	DEFAULT_CHRONO_WARRIOR_ETH_PRIZE_AMOUNT_PERCENTAGE_V3,
	DEFAULT_CHARITY_ETH_DONATION_AMOUNT_PERCENTAGE_V3,
	DEFAULT_COSMIC_SIGNATURE_NFT_STAKING_TOTAL_ETH_REWARD_AMOUNT_PERCENTAGE_V3,
	DEFAULT_MAIN_ETH_PRIZE_AMOUNT_PERCENTAGE_V3,
	DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS,
	DEFAULT_PAID_ETH_PRIZE_AMOUNT_PERCENTAGE_V3,
	DEFAULT_RAFFLE_TOTAL_ETH_PRIZE_AMOUNT_FOR_BIDDERS_PERCENTAGE_V3,
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
} = require("../src/V3UpgradeTestHelpers.js");

describe("CosmicSignatureGameV3-MainPrize", function () {
	it("pays the V3 ETH prize split and leaves 50 percent in the game", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;

		// Stake one of the CS NFTs minted in round 0 so the staking deposit succeeds and can be reconciled.
		const staker_ = contracts_.signers[1];
		const stakedCosmicSignatureNftId_ = 0n;
		expect(await contracts_.cosmicSignatureNft.ownerOf(stakedCosmicSignatureNftId_)).equal(staker_.address);
		await waitForTransactionReceipt(
			contracts_.cosmicSignatureNft
				.connect(staker_)
				.setApprovalForAll(contracts_.stakingWalletCosmicSignatureNftAddress, true)
		);
		await waitForTransactionReceipt(
			contracts_.stakingWalletCosmicSignatureNft.connect(staker_).stake(stakedCosmicSignatureNftId_)
		);

		await activateCurrentRound(game_, contracts_.ownerSigner);
		const bidders_ = contracts_.signers.slice(2, 5);
		for (const bidder_ of bidders_) {
			const bidTimeStamp_ = (await getLatestBlockTimestamp()) + 1n;
			const bidPrice_ = await game_.getNextEthBidPriceAdvanced(1n);
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
			await waitForTransactionReceipt(
				game_.connect(bidder_).bidWithEth(-1n, "", 0n, {value: bidPrice_,})
			);
		}
		const beneficiary_ = bidders_.at(-1);

		// Make the balance divisible by 300 so every percentage and each of the 3 raffle draws is exact.
		let gameEthBalance_ = await hre.ethers.provider.getBalance(contracts_.cosmicSignatureGameProxyAddress);
		const balanceRemainder_ = gameEthBalance_ % 300n;
		const donationAmount_ = (balanceRemainder_ === 0n) ? 300n : 300n - balanceRemainder_;
		await waitForTransactionReceipt(
			game_.connect(contracts_.signers[0]).donateEth({value: donationAmount_,})
		);
		gameEthBalance_ = await hre.ethers.provider.getBalance(contracts_.cosmicSignatureGameProxyAddress);
		expect(gameEthBalance_ % 300n).equal(0n);

		const mainEthPrizeAmount_ = await game_.getMainEthPrizeAmount();
		const charityEthDonationAmount_ = await game_.getCharityEthDonationAmount();
		const raffleTotalEthPrizeAmountForBidders_ = await game_.getRaffleTotalEthPrizeAmountForBidders();
		const cosmicSignatureNftStakingTotalEthRewardAmount_ = await game_.getCosmicSignatureNftStakingTotalEthRewardAmount();
		const chronoWarriorEthPrizeAmount_ = await game_.getChronoWarriorEthPrizeAmount();

		expect(mainEthPrizeAmount_).equal(gameEthBalance_ * DEFAULT_MAIN_ETH_PRIZE_AMOUNT_PERCENTAGE_V3 / 100n);
		expect(charityEthDonationAmount_).equal(gameEthBalance_ * DEFAULT_CHARITY_ETH_DONATION_AMOUNT_PERCENTAGE_V3 / 100n);
		expect(raffleTotalEthPrizeAmountForBidders_).equal(gameEthBalance_ * DEFAULT_RAFFLE_TOTAL_ETH_PRIZE_AMOUNT_FOR_BIDDERS_PERCENTAGE_V3 / 100n);
		expect(cosmicSignatureNftStakingTotalEthRewardAmount_).equal(gameEthBalance_ * DEFAULT_COSMIC_SIGNATURE_NFT_STAKING_TOTAL_ETH_REWARD_AMOUNT_PERCENTAGE_V3 / 100n);
		expect(chronoWarriorEthPrizeAmount_).equal(gameEthBalance_ * DEFAULT_CHRONO_WARRIOR_ETH_PRIZE_AMOUNT_PERCENTAGE_V3 / 100n);

		const numRaffleEthPrizesForBidders_ = await game_.numRaffleEthPrizesForBidders();
		expect(numRaffleEthPrizesForBidders_).equal(3n);
		expect(raffleTotalEthPrizeAmountForBidders_ % numRaffleEthPrizesForBidders_).equal(0n);
		expect(raffleTotalEthPrizeAmountForBidders_ / numRaffleEthPrizesForBidders_)
			.equal(gameEthBalance_ * DEFAULT_RAFFLE_TOTAL_ETH_PRIZE_AMOUNT_FOR_BIDDERS_PERCENTAGE_V3 / 100n / 3n);

		const totalEthPrizeAmount_ =
			mainEthPrizeAmount_ +
			charityEthDonationAmount_ +
			raffleTotalEthPrizeAmountForBidders_ +
			cosmicSignatureNftStakingTotalEthRewardAmount_ +
			chronoWarriorEthPrizeAmount_;
		expect(totalEthPrizeAmount_).equal(gameEthBalance_ * DEFAULT_PAID_ETH_PRIZE_AMOUNT_PERCENTAGE_V3 / 100n);
		expect(gameEthBalance_ - totalEthPrizeAmount_).equal(gameEthBalance_ * 50n / 100n);

		const beneficiaryEthBalanceBefore_ = await hre.ethers.provider.getBalance(beneficiary_.address);
		const charityWalletEthBalanceBefore_ = await hre.ethers.provider.getBalance(contracts_.charityWalletAddress);
		const prizesWalletEthBalanceBefore_ = await hre.ethers.provider.getBalance(contracts_.prizesWalletAddress);
		const stakingWalletEthBalanceBefore_ =
			await hre.ethers.provider.getBalance(contracts_.stakingWalletCosmicSignatureNftAddress);

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime()),]);
		const claimReceipt_ = await waitForTransactionReceipt(game_.connect(beneficiary_).claimMainPrize());

		expect(await hre.ethers.provider.getBalance(beneficiary_.address))
			.equal(beneficiaryEthBalanceBefore_ + mainEthPrizeAmount_ - claimReceipt_.fee);
		expect(await hre.ethers.provider.getBalance(contracts_.charityWalletAddress))
			.equal(charityWalletEthBalanceBefore_ + charityEthDonationAmount_);
		expect(await hre.ethers.provider.getBalance(contracts_.prizesWalletAddress))
			.equal(prizesWalletEthBalanceBefore_ + raffleTotalEthPrizeAmountForBidders_ + chronoWarriorEthPrizeAmount_);
		expect(await hre.ethers.provider.getBalance(contracts_.stakingWalletCosmicSignatureNftAddress))
			.equal(stakingWalletEthBalanceBefore_ + cosmicSignatureNftStakingTotalEthRewardAmount_);
		expect(await hre.ethers.provider.getBalance(contracts_.cosmicSignatureGameProxyAddress))
			.equal(gameEthBalance_ - totalEthPrizeAmount_);
	});

	it("mints mainPrizeNumCosmicSignatureNfts sequential NFTs to the beneficiary, for various configured counts", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const gameForOwner_ = game_.connect(contracts_.ownerSigner);
		expect(await game_.mainPrizeNumCosmicSignatureNfts()).equal(DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS);

		// Round 1 runs with the default count; further rounds exercise the edge and random counts,
		// including 1 (the V2-equivalent behavior).
		const mainPrizeNumCosmicSignatureNftsValues_ = [
			DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS,
			1n,
			5n,
			1n + generateRandomUInt256() % 5n,
		];

		for (let roundIndex_ = 0; roundIndex_ < mainPrizeNumCosmicSignatureNftsValues_.length; ++ roundIndex_) {
			const mainPrizeNumCosmicSignatureNfts_ = mainPrizeNumCosmicSignatureNftsValues_[roundIndex_];

			// The round is inactive right after the previous claim; configure the count and activate.
			if (mainPrizeNumCosmicSignatureNfts_ !== await game_.mainPrizeNumCosmicSignatureNfts()) {
				await waitForTransactionReceipt(gameForOwner_.setMainPrizeNumCosmicSignatureNfts(mainPrizeNumCosmicSignatureNfts_));
			}
			await activateCurrentRound(game_, contracts_.ownerSigner);

			const roundNum_ = await game_.roundNum();
			const bidder1_ = contracts_.signers[1];
			const bidder2_ = contracts_.signers[2];

			// Two ETH bids, far from `mainPrizeTime` (so the late bid premium stays zero and exact values are simple).
			await waitForTransactionReceipt(game_.connect(bidder1_).bidWithEth(-1n, "", 0n, {value: 10n ** 18n,}));
			await waitForTransactionReceipt(
				game_.connect(bidder2_).bidWithEth(-1n, "", 0n, {value: await game_.getNextEthBidPriceAdvanced(1n),})
			);

			// In even rounds, also place a free CST bid (the CST bid price linearly declines to zero
			// over the stored `cstDutchAuctionDuration`, which `getCstDutchAuctionDurations` reports),
			// covering both the with- and without-last-CST-bidder prize layouts.
			const placeCstBid_ = roundIndex_ % 2 === 0;
			if (placeCstBid_) {
				const cstDutchAuctionEndTime_ =
					(await game_.cstDutchAuctionBeginningTimeStamp()) + (await game_.getCstDutchAuctionDurations())[0];
				if (cstDutchAuctionEndTime_ + 1n > await getLatestBlockTimestamp()) {
					await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(cstDutchAuctionEndTime_ + 1n),]);
				}
				await waitForTransactionReceipt(game_.connect(bidder1_).bidWithCst((1n << 255n), "", 0n));
			}

			// The last bidder claims at `mainPrizeTime`.
			const beneficiary_ = placeCstBid_ ? bidder1_ : bidder2_;
			const mainPrizeTime_ = await game_.mainPrizeTime();
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(mainPrizeTime_),]);

			const gameEthBalanceBefore_ = await hre.ethers.provider.getBalance(contracts_.cosmicSignatureGameProxyAddress);
			const expectedMainEthPrizeAmount_ = gameEthBalanceBefore_ * (await game_.mainEthPrizeAmountPercentage()) / 100n;
			const nftTotalSupplyBefore_ = await contracts_.cosmicSignatureNft.totalSupply();
			const beneficiaryNftBalanceBefore_ = await contracts_.cosmicSignatureNft.balanceOf(beneficiary_.address);

			// Prize CST/NFT recipient slots: main prize beneficiary, last CST bidder (if any),
			// endurance champion, chrono-warrior, raffle winning bidders, lucky RW NFT stakers (none staked here).
			const numCstPrizeMintRecipients_ =
				1n + (placeCstBid_ ? 1n : 0n) + 2n + (await game_.numRaffleCosmicSignatureNftsForBidders());
			const expectedNumNftMints_ = numCstPrizeMintRecipients_ + mainPrizeNumCosmicSignatureNfts_ - 1n;

			const transactionReceipt_ = await waitForTransactionReceipt(game_.connect(beneficiary_).claimMainPrize());

			// #region `MainPrizeClaimed` (the V3 version with `prizeNumCosmicSignatureNfts`).

			let mainPrizeClaimedLog_;
			for (const log_ of transactionReceipt_.logs) {
				if (log_.address !== contracts_.cosmicSignatureGameProxyAddress) {
					continue;
				}
				const parsedLog_ = game_.interface.parseLog(log_);
				if (parsedLog_?.name === "MainPrizeClaimed") {
					mainPrizeClaimedLog_ = parsedLog_;
					break;
				}
			}
			expect(mainPrizeClaimedLog_).not.equal(undefined);
			expect(mainPrizeClaimedLog_.args.roundNum).equal(roundNum_);
			expect(mainPrizeClaimedLog_.args.beneficiaryAddress).equal(beneficiary_.address);
			expect(mainPrizeClaimedLog_.args.ethPrizeAmount).equal(expectedMainEthPrizeAmount_);
			expect(mainPrizeClaimedLog_.args.cstPrizeAmount).equal(await game_.cstPrizeAmount());
			expect(mainPrizeClaimedLog_.args.prizeNumCosmicSignatureNfts).equal(mainPrizeNumCosmicSignatureNfts_);
			expect(mainPrizeClaimedLog_.args.timeoutTimeToWithdrawSecondaryPrizes).greaterThan(mainPrizeTime_);

			// #endregion
			// #region NFT mint count, the beneficiary's sequential NFT ID block, and its position.

			expect(await contracts_.cosmicSignatureNft.totalSupply()).equal(nftTotalSupplyBefore_ + expectedNumNftMints_);

			// The beneficiary's NFTs sit at the end of the minted block (after the per-recipient prize NFTs).
			expect(mainPrizeClaimedLog_.args.prizeFirstCosmicSignatureNftId)
				.equal(nftTotalSupplyBefore_ + numCstPrizeMintRecipients_ - 1n);
			for (let nftIndex_ = 0n; nftIndex_ < mainPrizeNumCosmicSignatureNfts_; ++ nftIndex_) {
				expect(
					await contracts_.cosmicSignatureNft.ownerOf(mainPrizeClaimedLog_.args.prizeFirstCosmicSignatureNftId + nftIndex_),
					`beneficiary must own prize NFT ${nftIndex_} of ${mainPrizeNumCosmicSignatureNfts_}`
				).equal(beneficiary_.address);
			}

			// The beneficiary receives at least its guaranteed block (plus any raffle/champion NFTs it also won).
			expect(await contracts_.cosmicSignatureNft.balanceOf(beneficiary_.address))
				.greaterThanOrEqual(beneficiaryNftBalanceBefore_ + mainPrizeNumCosmicSignatureNfts_);

			// #endregion

			expect(await game_.roundNum()).equal(roundNum_ + 1n);
		}
	});
});
