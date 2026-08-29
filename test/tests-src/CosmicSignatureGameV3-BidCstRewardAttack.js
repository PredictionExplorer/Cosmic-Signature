"use strict";

// Proves that the attack discussed in Comment-202607163 is impossible: a bidder contract that cannot
// (or refuses to) receive anything cannot block the last bidder bid CST reward share minting,
// and therefore cannot prevent other people from bidding, nor prevent the bidding round from completing.
// The reward is minted, not transferred, and `CosmicSignatureToken` minting performs no call into the recipient.

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	getLatestBlockTimestamp,
	blockTimestampOfReceipt,
	activateCurrentRound,
	findParsedEvent,
} = require("../src/V2UpgradeTestHelpers.js");
const {
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
	getV3BidCstRewardAmount,
	splitV3BidCstRewardAmount,
	findTimeStampWithAffordableCstBidPrice,
} = require("../src/V3UpgradeTestHelpers.js");

// A high reward rate, so that the hostile contract can quickly afford CST bids: 300 CST per minute.
const RATE_PER_MINUTE = 300n * 10n ** 18n;

async function deployGameAndHostileBidder() {
	const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
	const game_ = contracts_.cosmicSignatureGameV3Proxy;
	await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setBidCstRewardAmountPerMinute(RATE_PER_MINUTE));
	await activateCurrentRound(game_, contracts_.ownerSigner);
	const hostileBidderFactory_ = await hre.ethers.getContractFactory("HostileBidder", contracts_.signers[10]);
	const hostileBidder_ = await hostileBidderFactory_.deploy(await game_.getAddress());
	await hostileBidder_.waitForDeployment();
	return { contracts_, game_, hostileBidder_ };
}

/** Executes an ETH bid at exactly the given block timestamp, paying the exact bid price. */
async function bidWithEthAt(game_, bidderSigner_, timeStamp_) {
	const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(timeStamp_ - await getLatestBlockTimestamp());
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);
	const receipt_ = await waitForTransactionReceipt(
		game_.connect(bidderSigner_).bidWithEth(-1n, "", 0n, {value: ethBidPrice_,})
	);
	expect(await blockTimestampOfReceipt(receipt_)).equal(timeStamp_);
	return receipt_;
}

/** Makes the hostile contract place an ETH bid at exactly the given block timestamp, paying the exact bid price. */
async function hostileBidWithEthAt(game_, hostileBidder_, callerSigner_, timeStamp_) {
	const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(timeStamp_ - await getLatestBlockTimestamp());
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);
	const receipt_ = await waitForTransactionReceipt(
		hostileBidder_.connect(callerSigner_).doBidWithEth(-1n, "hostile bid", 0n, {value: ethBidPrice_,})
	);
	expect(await blockTimestampOfReceipt(receipt_)).equal(timeStamp_);
	return receipt_;
}

describe("CosmicSignatureGameV3-BidCstRewardAttack", function () {
	it("a bidder contract that rejects all incoming calls cannot block subsequent ETH or CST bids", async function () {
		const { contracts_, game_, hostileBidder_ } = await deployGameAndHostileBidder();
		const token_ = contracts_.cosmicSignatureToken;
		const hostileBidderAddress_ = await hostileBidder_.getAddress();
		const deployerOfHostileContract_ = contracts_.signers[10];
		const eoaBidder1_ = contracts_.signers[1];
		const eoaBidder2_ = contracts_.signers[2];

		// The first bid in the round is placed by a normal EOA.
		await bidWithEthAt(game_, eoaBidder1_, (await getLatestBlockTimestamp()) + 10n);

		// Try every hostility flavor: revert with a reason, panic, burn all gas.
		for (const hostilityModeCode_ of [1n, 2n, 3n,]) {
			await waitForTransactionReceipt(hostileBidder_.setHostilityModeCode(hostilityModeCode_));

			// While already hostile, the contract places a bid (paying the exact price, so no ETH refund is attempted),
			// which makes it the last bidder, whom the next bidder's 90% CST reward share must be paid to.
			let lastBidTimeStamp_ = (await getLatestBlockTimestamp()) + 30n;
			await hostileBidWithEthAt(game_, hostileBidder_, deployerOfHostileContract_, lastBidTimeStamp_);
			expect(await game_.lastBidderAddress()).equal(hostileBidderAddress_);

			// Sanity check: the hostile contract really is hostile - a plain ETH transfer to it fails.
			await expect(
				eoaBidder1_.sendTransaction({to: hostileBidderAddress_, value: 1n, gasLimit: 1_000_000n,})
			).reverted;

			// An EOA snipes the hostile contract with an ETH bid. If the reward were transferred or pushed
			// with a recipient callback, this would revert; it must succeed, minting 90% to the hostile contract.
			{
				const hostileCstBalanceBefore_ = await token_.balanceOf(hostileBidderAddress_);
				const bidTimeStamp_ = (await getLatestBlockTimestamp()) + 60n;
				const receipt_ = await bidWithEthAt(game_, eoaBidder2_, bidTimeStamp_);
				const totalRewardAmount_ = getV3BidCstRewardAmount(bidTimeStamp_ - lastBidTimeStamp_, RATE_PER_MINUTE);
				const { lastBidderAmount: lastBidderAmount_, } = splitV3BidCstRewardAmount(totalRewardAmount_);
				expect(lastBidderAmount_).greaterThan(0n);
				const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
				expect(bidPlaced_.args.bidCstRewardAmount).equal(totalRewardAmount_);
				expect(
					await token_.balanceOf(hostileBidderAddress_) - hostileCstBalanceBefore_,
					"the hostile contract must have been paid its 90%"
				).equal(lastBidderAmount_);
			}

			// The hostile contract becomes the last bidder again, and an EOA snipes it with a CST bid this time.
			{
				lastBidTimeStamp_ = (await getLatestBlockTimestamp()) + 30n;
				await hostileBidWithEthAt(game_, hostileBidder_, deployerOfHostileContract_, lastBidTimeStamp_);
				const hostileCstBalanceBefore_ = await token_.balanceOf(hostileBidderAddress_);
				const { timeStamp: bidTimeStamp_, price: cstBidPrice_ } = await findTimeStampWithAffordableCstBidPrice(
					game_,
					await token_.balanceOf(eoaBidder2_.address),
					(await getLatestBlockTimestamp()) + 90n
				);
				await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
				const receipt_ = await waitForTransactionReceipt(game_.connect(eoaBidder2_).bidWithCst(cstBidPrice_, "", 0n));
				expect(await blockTimestampOfReceipt(receipt_)).equal(bidTimeStamp_);
				const totalRewardAmount_ = getV3BidCstRewardAmount(bidTimeStamp_ - lastBidTimeStamp_, RATE_PER_MINUTE);
				const { lastBidderAmount: lastBidderAmount_, } = splitV3BidCstRewardAmount(totalRewardAmount_);
				expect(lastBidderAmount_).greaterThan(0n);
				expect(await token_.balanceOf(hostileBidderAddress_) - hostileCstBalanceBefore_).equal(lastBidderAmount_);
			}
		}

		// While hostile, the contract can even place a CST bid itself (its own CST gets burned and reward shares
		// minted; no ETH or callback touches it).
		{
			const lastBidTimeStamp_ = (await getLatestBlockTimestamp()) + 30n;
			await hostileBidWithEthAt(game_, hostileBidder_, deployerOfHostileContract_, lastBidTimeStamp_);
			const hostileCstBalanceBefore_ = await token_.balanceOf(hostileBidderAddress_);
			const { timeStamp: bidTimeStamp_, price: cstBidPrice_ } = await findTimeStampWithAffordableCstBidPrice(
				game_,
				hostileCstBalanceBefore_,
				(await getLatestBlockTimestamp()) + 60n
			);
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
			const receipt_ = await waitForTransactionReceipt(
				hostileBidder_.connect(deployerOfHostileContract_).doBidWithCst((1n << 255n), "hostile CST bid", 0n)
			);
			expect(await blockTimestampOfReceipt(receipt_)).equal(bidTimeStamp_);

			// A CST self-snipe: the hostile contract accrues both shares, minus the burned price.
			const totalRewardAmount_ = getV3BidCstRewardAmount(bidTimeStamp_ - lastBidTimeStamp_, RATE_PER_MINUTE);
			expect(await token_.balanceOf(hostileBidderAddress_) - hostileCstBalanceBefore_).equal(totalRewardAmount_ - cstBidPrice_);
		}

		// And a normal EOA can still bid afterwards.
		await bidWithEthAt(game_, eoaBidder1_, (await getLatestBlockTimestamp()) + 45n);
	});

	it("a reentrancy attempt via the ETH bid overpayment refund reverts the attacker's own bid only", async function () {
		const { contracts_, game_, hostileBidder_ } = await deployGameAndHostileBidder();
		const deployerOfHostileContract_ = contracts_.signers[10];
		const eoaBidder1_ = contracts_.signers[1];

		await bidWithEthAt(game_, eoaBidder1_, (await getLatestBlockTimestamp()) + 10n);

		// Mode 4 makes the contract reenter `bidWithEth` when it receives ETH.
		// A significantly overpaying bid triggers the refund, the refund triggers the reentry attempt,
		// the reentrancy guard reverts it, and that reverts the refund and the entire hostile bid.
		await waitForTransactionReceipt(hostileBidder_.setHostilityModeCode(4n));
		const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(2n);
		await expect(
			hostileBidder_.connect(deployerOfHostileContract_).doBidWithEth(-1n, "reentry attempt", 0n, {value: ethBidPrice_ + 10n ** 18n,})
		).revertedWithCustomError(game_, "FundTransferFailed");

		// The game is unaffected: the EOA is still the last bidder, and bidding continues normally.
		expect(await game_.lastBidderAddress()).equal(eoaBidder1_.address);
		await bidWithEthAt(game_, eoaBidder1_, (await getLatestBlockTimestamp()) + 30n);
	});

	it("a hostile last bidder cannot block the round from completing", async function () {
		const { contracts_, game_, hostileBidder_ } = await deployGameAndHostileBidder();
		const token_ = contracts_.cosmicSignatureToken;
		const hostileBidderAddress_ = await hostileBidder_.getAddress();
		const deployerOfHostileContract_ = contracts_.signers[10];
		const eoaBidder1_ = contracts_.signers[1];
		const claimant_ = contracts_.signers[3];
		const roundNumBefore_ = await game_.roundNum();

		// The hostile contract ends up being the last bidder and refuses everything.
		await bidWithEthAt(game_, eoaBidder1_, (await getLatestBlockTimestamp()) + 10n);
		await waitForTransactionReceipt(hostileBidder_.setHostilityModeCode(1n));
		await hostileBidWithEthAt(game_, hostileBidder_, deployerOfHostileContract_, (await getLatestBlockTimestamp()) + 30n);
		expect(await game_.lastBidderAddress()).equal(hostileBidderAddress_);

		// It never claims (its `claimMainPrize` would revert on the main ETH prize transfer anyway),
		// so after the timeout somebody else claims. Nothing the hostile contract does can prevent that:
		// its prizes are either minted (CST, CS NFTs) or deposited into `PrizesWallet` (ETH) for pull-withdrawal.
		const claimTimeStamp_ = (await game_.mainPrizeTime()) + (await game_.timeoutDurationToClaimMainPrize()) + 1n;
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(claimTimeStamp_),]);
		const hostileCstBalanceBefore_ = await token_.balanceOf(hostileBidderAddress_);
		const receipt_ = await waitForTransactionReceipt(game_.connect(claimant_).claimMainPrize());
		expect(receipt_.status).equal(1);
		expect(await game_.roundNum()).equal(roundNumBefore_ + 1n);

		// Per the design, the reward accrued by the hostile contract since its last bid (which would be
		// hundreds of `cstPrizeAmount`s at this rate over the 2-day timeout) is NOT minted at claim time.
		// Any CST it received in the claim are secondary prizes, each of `cstPrizeAmount`
		// (endurance champion, chrono-warrior, and/or CST raffle prizes).
		const cstPrizeAmount_ = await game_.cstPrizeAmount();
		const maxNumCstPrizes_ = 2n + await game_.numRaffleCosmicSignatureNftsForBidders();
		const hostileCstBalanceChange_ = await token_.balanceOf(hostileBidderAddress_) - hostileCstBalanceBefore_;
		expect(hostileCstBalanceChange_ % cstPrizeAmount_).equal(0n);
		expect(hostileCstBalanceChange_ / cstPrizeAmount_).lessThanOrEqual(maxNumCstPrizes_);
	});
});
