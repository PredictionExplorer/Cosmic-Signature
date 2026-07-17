"use strict";

// Property tests for the round-termination guarantee of the V3 CST time standard
// (Comment-202607165, Comment-202607166), following "docs/round-termination-proof.md".
//
// The proof's potential function is `Phi = h * sigma + 2R * S` (units: CST Wei * seconds), where
// `h` is the main prize time increment, `sigma` the CST total supply, `R` the CST accrual per
// increment, and `S = mainPrizeTime - now` the round's remaining slack. Cutting a round into
// windows that each end with a CST bid (and start at the previous CST bid, or at the round's
// first bid), the proof shows, for a window of duration `Dt` containing `m` ETH bids:
//
//     DPhi  <=  2*R*h*m  -  (F - 2R)*h  +  2*Dt ,
//
// where `F` is the derived auction restart floor (3R at defaults) and the trailing `2*Dt` is the
// integer-rounding slack (`h*M/I - R < 1` Wei). With `F = 3R`, every CST bid drains the potential
// by about `R*h` (~2 * 10^23 Wei-seconds at defaults) no matter how adversarially the bids are
// timed -- which is what these tests assert against the live chain, with no model shortcuts on
// the burn/mint side (supply and timestamps are read from the chain).

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { generateRandomUInt256, waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	getLatestBlockTimestamp,
	blockTimestampOfReceipt,
	activateCurrentRound,
} = require("../src/V2UpgradeTestHelpers.js");
const {
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
} = require("../src/V3UpgradeTestHelpers.js");

// #region Local helpers.

function createSeededPrng() {
	let randomState_ = generateRandomUInt256() & ((1n << 64n) - 1n);
	if (randomState_ === 0n) {
		randomState_ = 0x9e3779b97f4a7c15n;
	}
	console.info("%s", `Random seed: 0x${randomState_.toString(16)}`);
	const nextRandom_ = () => {
		randomState_ ^= (randomState_ << 13n) & ((1n << 64n) - 1n);
		randomState_ ^= randomState_ >> 7n;
		randomState_ ^= (randomState_ << 17n) & ((1n << 64n) - 1n);
		return randomState_;
	};
	return {
		next: nextRandom_,
		range: (minValue_, maxValue_) => minValue_ + nextRandom_() % (maxValue_ - minValue_ + 1n),
	};
}

/** Executes an ETH bid at exactly the given block timestamp, paying the exact (premium-inclusive) price. */
async function bidWithEthAt(game_, bidderSigner_, timeStamp_) {
	const latestTimeStamp_ = await getLatestBlockTimestamp();
	expect(timeStamp_).greaterThan(latestTimeStamp_);
	const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(timeStamp_ - latestTimeStamp_);
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);
	const receipt_ = await waitForTransactionReceipt(
		game_.connect(bidderSigner_).bidWithEth(-1n, "", 0n, {value: ethBidPrice_,})
	);
	expect(await blockTimestampOfReceipt(receipt_)).equal(timeStamp_);
	return receipt_;
}

/** Executes a CST bid at exactly the given block timestamp, paying the exact (premium-inclusive) price. */
async function bidWithCstAt(game_, bidderSigner_, timeStamp_) {
	const latestTimeStamp_ = await getLatestBlockTimestamp();
	expect(timeStamp_).greaterThan(latestTimeStamp_);
	const cstBidPrice_ = await game_.getNextCstBidPriceAdvanced(timeStamp_ - latestTimeStamp_);
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);
	const receipt_ = await waitForTransactionReceipt(
		game_.connect(bidderSigner_).bidWithCst(cstBidPrice_, "", 0n)
	);
	expect(await blockTimestampOfReceipt(receipt_)).equal(timeStamp_);
	return { receipt_, cstBidPrice_ };
}

/** Reads the proof's parameters from the chain. */
async function readTerminationParams(game_) {
	const mainPrizeTimeIncrementInMicroSeconds_ = await game_.mainPrizeTimeIncrementInMicroSeconds();
	const mainPrizeTimeIncrement_ = mainPrizeTimeIncrementInMicroSeconds_ / 1_000_000n;
	const accrualPerIncrement_ = await game_.getBidCstRewardAmountPerMainPrizeTimeIncrement();
	const floorAmount_ = await game_.getCstDutchAuctionBeginningBidPriceMinLimit();
	// The termination precondition: the floor must exceed twice the accrual per increment.
	expect(floorAmount_).greaterThan(2n * accrualPerIncrement_);
	return { mainPrizeTimeIncrement_, accrualPerIncrement_, floorAmount_ };
}

/** `Phi = h * sigma + 2R * S`, with `sigma` and `mainPrizeTime` read from the chain at `ts_`. */
async function computePotential(game_, token_, ts_, mainPrizeTimeIncrement_, accrualPerIncrement_) {
	const sigma_ = await token_.totalSupply();
	const slack_ = (await game_.mainPrizeTime()) - ts_;
	return mainPrizeTimeIncrement_ * sigma_ + 2n * accrualPerIncrement_ * slack_;
}

// #endregion

describe("CosmicSignatureGameV3-TerminationInvariant", function () {
	it("the potential Phi = h*sigma + 2R*S decreases per CST-bid window under adversarial bid timing", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const { mainPrizeTimeIncrement_: h_, accrualPerIncrement_: r_, floorAmount_: f_ } = await readTerminationParams(game_);
		const prng_ = createSeededPrng();
		const actorSigners_ = contracts_.signers.slice(1, 4);

		// The round's first bid starts the first window (and the first CST Dutch auction of the round).
		const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		await bidWithEthAt(game_, actorSigners_[0], firstBidTimeStamp_);

		let windowStartTimeStamp_ = firstBidTimeStamp_;
		let potentialAtWindowStart_ = await computePotential(game_, token_, firstBidTimeStamp_, h_, r_);

		// Adversarial gap strategies. "immediate" spams right after the restart (max burn); "subIncrement"
		// and "incrementish" are the round-sustaining cadences the proof is about; "breakeven" hunts the
		// point where the price crosses the accrued reward; "free" waits out the full auction.
		const strategyNames_ = ["immediate", "subIncrement", "incrementish", "breakeven", "free",];
		const strategyUseCounts_ = new Map(strategyNames_.map((name_) => [name_, 0]));
		const numWindows_ = 15;

		for (let windowIndex_ = 0; windowIndex_ < numWindows_; ++ windowIndex_) {
			const strategyName_ = strategyNames_[Number(prng_.range(0n, BigInt(strategyNames_.length - 1)))];
			strategyUseCounts_.set(strategyName_, strategyUseCounts_.get(strategyName_) + 1);

			// The auction in effect began at the window start.
			expect(await game_.cstDutchAuctionBeginningTimeStamp()).equal(windowStartTimeStamp_);
			const [auctionDuration_,] = await game_.getCstDutchAuctionDurations();

			let gapDuration_;
			switch (strategyName_) {
				case "immediate": gapDuration_ = prng_.range(1n, 60n); break;
				case "subIncrement": gapDuration_ = prng_.range(h_ / 4n, h_ - 1n); break;
				case "incrementish": gapDuration_ = prng_.range(h_, 2n * h_); break;
				case "breakeven": {
					// The price crosses the accrued reward at about half the auction; jitter around it.
					gapDuration_ = auctionDuration_ / 2n + prng_.range(0n, 600n);
					break;
				}
				default: gapDuration_ = auctionDuration_ + prng_.range(1n, 600n); break;
			}

			// 0 to 3 ETH bids inside the window, at random distinct times before the CST bid.
			let numEthBidsInWindow_ = Number(prng_.range(0n, 3n));
			if (gapDuration_ <= 4n) {
				numEthBidsInWindow_ = 0;
			}
			for (let ethBidIndex_ = 0; ethBidIndex_ < numEthBidsInWindow_; ++ ethBidIndex_) {
				const ethBidTimeStamp_ =
					windowStartTimeStamp_ + gapDuration_ * BigInt(ethBidIndex_ + 1) / BigInt(numEthBidsInWindow_ + 1);
				if (ethBidTimeStamp_ <= await getLatestBlockTimestamp()) {
					-- numEthBidsInWindow_;
					continue;
				}
				const actorSigner_ = actorSigners_[Number(prng_.range(0n, BigInt(actorSigners_.length - 1)))];
				await bidWithEthAt(game_, actorSigner_, ethBidTimeStamp_);
			}

			// The terminal CST bid of the window. The richest actor bids; if even they cannot afford the
			// price at the planned time, they wait for the auction to fully decay (a free bid is always
			// affordable), which only lengthens the window.
			let cstBidTimeStamp_ = windowStartTimeStamp_ + gapDuration_;
			{
				let richestSigner_ = actorSigners_[0];
				let richestBalance_ = -1n;
				for (const actorSigner_ of actorSigners_) {
					const balance_ = await token_.balanceOf(actorSigner_.address);
					if (balance_ > richestBalance_) {
						richestBalance_ = balance_;
						richestSigner_ = actorSigner_;
					}
				}
				{
					const latestTimeStamp_ = await getLatestBlockTimestamp();
					if (cstBidTimeStamp_ <= latestTimeStamp_) {
						cstBidTimeStamp_ = latestTimeStamp_ + 1n;
					}
					if (await game_.getNextCstBidPriceAdvanced(cstBidTimeStamp_ - latestTimeStamp_) > richestBalance_) {
						const freeTimeStamp_ = windowStartTimeStamp_ + auctionDuration_ + prng_.range(1n, 600n);
						cstBidTimeStamp_ = (freeTimeStamp_ > latestTimeStamp_) ? freeTimeStamp_ : (latestTimeStamp_ + 1n);
						expect(await game_.getNextCstBidPriceAdvanced(cstBidTimeStamp_ - latestTimeStamp_)).equal(0n);
					}
				}
				await bidWithCstAt(game_, richestSigner_, cstBidTimeStamp_);
			}

			// The window's potential change must obey the proof's bound.
			{
				const potentialAtWindowEnd_ = await computePotential(game_, token_, cstBidTimeStamp_, h_, r_);
				const windowDuration_ = cstBidTimeStamp_ - windowStartTimeStamp_;
				const bound_ =
					2n * r_ * h_ * BigInt(numEthBidsInWindow_) -
					(f_ - 2n * r_) * h_ +
					2n * windowDuration_;
				expect(
					potentialAtWindowEnd_ - potentialAtWindowStart_,
					`window ${windowIndex_} (${strategyName_}, ${numEthBidsInWindow_} ETH bids, ${windowDuration_}s): DPhi above the proof's bound`
				).lessThanOrEqual(bound_);

				// The re-armed auction always respects the termination floor.
				expect(await game_.cstDutchAuctionBeginningBidPrice()).greaterThanOrEqual(f_);

				windowStartTimeStamp_ = cstBidTimeStamp_;
				potentialAtWindowStart_ = potentialAtWindowEnd_;
			}
		}

		for (const [strategyName_, useCount_] of strategyUseCounts_) {
			console.info("%s", `Strategy ${strategyName_}: ${useCount_} windows.`);
		}

		// Somebody likes money: the round is (or becomes) claimable and actually ends.
		{
			const mainPrizeTime_ = await game_.mainPrizeTime();
			const roundNumBefore_ = await game_.roundNum();
			const lastBidderAddress_ = await game_.lastBidderAddress();
			const lastBidderSigner_ = actorSigners_.find((signer_) => signer_.address === lastBidderAddress_);
			const latestTimeStamp_ = await getLatestBlockTimestamp();
			if (mainPrizeTime_ > latestTimeStamp_) {
				await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(mainPrizeTime_),]);
			}
			await waitForTransactionReceipt(game_.connect(lastBidderSigner_).claimMainPrize());
			expect(await game_.roundNum()).equal(roundNumBefore_ + 1n);
		}
	});

	it("zombie impossibility: a greedy CST-only cartel cannot keep the round alive", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const { mainPrizeTimeIncrement_: h_, accrualPerIncrement_: r_, floorAmount_: f_ } = await readTerminationParams(game_);
		const seederSigner_ = contracts_.signers[1];
		const botSigners_ = [contracts_.signers[2], contracts_.signers[3],];

		// A single ETH bid seeds the round; from here on, the cartel only places CST bids, each at the
		// EARLIEST moment either bot can afford the price -- the most aggressive round-extension strategy
		// that costs no ETH. (Rewards minted to the cartel stay inside the cartel: the outbid bot receives
		// the 90% share.)
		const firstBidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
		await bidWithEthAt(game_, seederSigner_, firstBidTimeStamp_);

		const maxNumIterations_ = 60;
		let roundDied_ = false;
		for (let iterationIndex_ = 0; iterationIndex_ < maxNumIterations_ && ! roundDied_; ++ iterationIndex_) {
			const restartTimeStamp_ = await game_.cstDutchAuctionBeginningTimeStamp();
			const [auctionDuration_,] = await game_.getCstDutchAuctionDurations();
			const beginningBidPrice_ =
				((await game_.lastCstBidderAddress()) === hre.ethers.ZeroAddress) ?
				await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice() :
				await game_.cstDutchAuctionBeginningBidPrice();
			const mainPrizeTime_ = await game_.mainPrizeTime();
			const latestTimeStamp_ = await getLatestBlockTimestamp();
			const multiplier_ = await game_.bidCstRewardAmountMultiplier();
			const incrementMicroSeconds_ = await game_.mainPrizeTimeIncrementInMicroSeconds();

			// The earliest base-affordable timestamp for each bot (the late-bid premium can only push the
			// real affordable moment even later, which is checked below).
			const durationMaxLimit_ = 12n * incrementMicroSeconds_ / 1_000_000n;
			const auctionIsCapped_ = beginningBidPrice_ > durationMaxLimit_ * multiplier_ / incrementMicroSeconds_;
			let bidderSigner_ = null;
			let bidTimeStamp_ = 0n;
			for (const botSigner_ of botSigners_) {
				const balance_ = await token_.balanceOf(botSigner_.address);
				let earliestTimeStamp_;
				if (balance_ >= beginningBidPrice_) {
					earliestTimeStamp_ = latestTimeStamp_ + 1n;
				} else if (auctionIsCapped_) {
					// Comment-202607170: price(t) = P0 * (T - t) / T <= balance  <=>  t >= T * (P0 - balance) / P0.
					const neededElapsed_ =
						(durationMaxLimit_ * (beginningBidPrice_ - balance_) + (beginningBidPrice_ - 1n)) / beginningBidPrice_;
					earliestTimeStamp_ = restartTimeStamp_ + neededElapsed_;
					if (earliestTimeStamp_ <= latestTimeStamp_) {
						earliestTimeStamp_ = latestTimeStamp_ + 1n;
					}
				} else {
					// price(t) <= balance  <=>  accrued(t - restart) >= P0 - balance.
					const neededDecline_ = beginningBidPrice_ - balance_;
					const neededElapsed_ = (neededDecline_ * incrementMicroSeconds_ + (multiplier_ - 1n)) / multiplier_;
					earliestTimeStamp_ = restartTimeStamp_ + neededElapsed_;
					if (earliestTimeStamp_ <= latestTimeStamp_) {
						earliestTimeStamp_ = latestTimeStamp_ + 1n;
					}
				}
				if (bidderSigner_ === null || earliestTimeStamp_ < bidTimeStamp_) {
					bidderSigner_ = botSigner_;
					bidTimeStamp_ = earliestTimeStamp_;
				}
			}

			// Inside the late-bid premium window the price is inflated; step forward until affordable.
			while (bidTimeStamp_ < mainPrizeTime_) {
				const price_ = await game_.getNextCstBidPriceAdvanced(bidTimeStamp_ - latestTimeStamp_);
				if (price_ <= await token_.balanceOf(bidderSigner_.address)) {
					break;
				}
				bidTimeStamp_ += 60n;
			}

			// The termination signal: neither bot can afford any CST bid before `mainPrizeTime`.
			// The last bidder likes money, so the round ends here.
			if (bidTimeStamp_ >= mainPrizeTime_) {
				roundDied_ = true;
				break;
			}

			const gapDuration_ = bidTimeStamp_ - restartTimeStamp_;
			const totalSupplyBefore_ = await token_.totalSupply();
			await bidWithCstAt(game_, bidderSigner_, bidTimeStamp_);
			const totalSupplyAfter_ = await token_.totalSupply();

			// Proof corollaries, asserted on-chain after every cartel bid:
			// 1. The re-armed auction begins at or above the floor, so its emergent duration is at least
			//    3 increments: a free bid always costs at least 3x the round-life it buys.
			expect(await game_.cstDutchAuctionBeginningBidPrice()).greaterThanOrEqual(f_);
			expect((await game_.getCstDutchAuctionDurations())[0]).greaterThanOrEqual(3n * h_ - 1n);

			// 2. A round-sustaining bid (gap <= h) strictly net-burns: supply drops by at least
			//    F - 2R minus the integer-rounding slack.
			if (gapDuration_ <= h_) {
				expect(
					totalSupplyBefore_ - totalSupplyAfter_,
					`iteration ${iterationIndex_}: a round-sustaining CST bid did not net-burn enough`
				).greaterThanOrEqual(f_ - 2n * r_ - 2n * gapDuration_);
			}
		}

		expect(roundDied_, "the greedy cartel kept the round alive for the whole campaign").equal(true);

		// And the claim goes through: if `mainPrizeTime` passed long ago, anybody may claim after the
		// timeout; otherwise the last bidder claims at `mainPrizeTime`.
		{
			const roundNumBefore_ = await game_.roundNum();
			const mainPrizeTime_ = await game_.mainPrizeTime();
			const latestTimeStamp_ = await getLatestBlockTimestamp();
			const lastBidderAddress_ = await game_.lastBidderAddress();
			const lastBidderSigner_ =
				[seederSigner_, ...botSigners_].find((signer_) => signer_.address === lastBidderAddress_);
			if (mainPrizeTime_ > latestTimeStamp_) {
				await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(mainPrizeTime_),]);
			}
			await waitForTransactionReceipt(game_.connect(lastBidderSigner_).claimMainPrize());
			expect(await game_.roundNum()).equal(roundNumBefore_ + 1n);
		}
	});
});
