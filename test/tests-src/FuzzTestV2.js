"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const {
	generateRandomUInt256,
	generateRandomUInt256FromSeedWrapper,
	uint256ToPaddedHexString,
	waitForTransactionReceipt,
} = require("../../src/Helpers.js");
const {
	SKIP_LONG_TESTS,
	tryWaitForTransactionReceipt,
} = require("../../src/ContractTestingHelpers.js");
const {
	activateCurrentRound,
	deployV1CompleteRoundZeroAndUpgradeToV2,
	getLatestBlockTimestamp,
	mineAt,
} = require("../src/V2UpgradeTestHelpers.js");

function parseFuzzSeed(raw_) {
	if (raw_ === undefined || raw_.length <= 0) {
		return undefined;
	}
	return BigInt.asUintN(256, BigInt(raw_.startsWith("0x") ? raw_ : `0x${raw_}`));
}

async function assertTrackedCstSupply(contracts_, participants_) {
	const token_ = contracts_.cosmicSignatureToken;
	const holders_ = [
		...contracts_.signers.map((signer_) => signer_.address),
		...participants_.map((signer_) => signer_.address),
		contracts_.marketingWalletAddress,
		contracts_.cosmicSignatureDaoAddress,
		contracts_.prizesWalletAddress,
		contracts_.charityWalletAddress,
		contracts_.stakingWalletCosmicSignatureNftAddress,
		contracts_.stakingWalletRandomWalkNftAddress,
		contracts_.ownerSigner.address,
		contracts_.deployerSigner.address,
	];
	const uniqueHolders_ = [...new Set(holders_)];
	let sum_ = 0n;
	for (const holder_ of uniqueHolders_) {
		sum_ += await token_.balanceOf(holder_);
	}
	expect(sum_).equal(await token_.totalSupply());
}

async function assertV2FuzzInvariants(contracts_, participants_, previousRoundNum_) {
	const game_ = contracts_.cosmicSignatureGameV2Proxy;
	expect(await game_.roundNum()).gte(previousRoundNum_);
	expect(await game_.getBidCstRewardAmount()).equal(await game_.getBidCstRewardAmountAdvanced(0n));
	expect(await game_.getNextCstBidPrice()).equal(await game_.getNextCstBidPriceAdvanced(0n));
	expect(await game_.cstDutchAuctionDuration()).greaterThan(0n);
	await assertTrackedCstSupply(contracts_, participants_);
}

describe("FuzzTestV2", function () {
	it("randomized V2 gameplay after a V1-to-V2 upgrade preserves core invariants", async function () {
		const seed_ = parseFuzzSeed(process.env.FUZZ_SEED) ?? generateRandomUInt256();
		const seedWrapper_ = { value: seed_ };
		console.info("%s", `FuzzTestV2 seed: ${uint256ToPaddedHexString(seed_)}`);

		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(2n);
		const game_ = contracts_.cosmicSignatureGameV2Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);

		const participants_ = contracts_.signers.slice(2, SKIP_LONG_TESTS ? 6 : 9);
		const numActions_ = SKIP_LONG_TESTS ? 35 : 140;
		let previousRoundNum_ = await game_.roundNum();
		let previousDuration_ = await game_.cstDutchAuctionDuration();

		for (let counter_ = 0; counter_ < numActions_; ++ counter_) {
			const participant_ = participants_[Number(generateRandomUInt256FromSeedWrapper(seedWrapper_) % BigInt(participants_.length))];
			const action_ = Number(generateRandomUInt256FromSeedWrapper(seedWrapper_) % 5n);
			await mineAt((await getLatestBlockTimestamp()) + 1n + generateRandomUInt256FromSeedWrapper(seedWrapper_) % 3600n);

			if (action_ === 0 || await game_.lastBidderAddress() === hre.ethers.ZeroAddress) {
				const price_ = await game_.getNextEthBidPrice();
				const beforeDuration_ = await game_.cstDutchAuctionDuration();
				const receipt_ = await tryWaitForTransactionReceipt(
					game_.connect(participant_).bidWithEth(-1n, "fuzz eth", 0n, { value: price_ + price_ / 10n })
				);
				if (receipt_) {
					const afterDuration_ = await game_.cstDutchAuctionDuration();
					expect(afterDuration_).lte(beforeDuration_);
					previousDuration_ = afterDuration_;
				}
			} else if (action_ === 1) {
				const price_ = await game_.getNextCstBidPrice();
				const balance_ = await contracts_.cosmicSignatureToken.balanceOf(participant_.address);
				if (balance_ >= price_) {
					const beforeDuration_ = await game_.cstDutchAuctionDuration();
					const receipt_ = await tryWaitForTransactionReceipt(
						game_.connect(participant_).bidWithCst(hre.ethers.MaxUint256, "fuzz cst", 0n)
					);
					if (receipt_) {
						const afterDuration_ = await game_.cstDutchAuctionDuration();
						expect(afterDuration_).gte(beforeDuration_);
						previousDuration_ = afterDuration_;
					}
				}
			} else if (action_ === 2) {
				await tryWaitForTransactionReceipt(game_.connect(participant_).donateEth({ value: 10n ** 15n }));
			} else if (action_ === 3) {
				const lastBidder_ = await game_.lastBidderAddress();
				if (lastBidder_ !== hre.ethers.ZeroAddress) {
					const mainPrizeTime_ = await game_.mainPrizeTime();
					if ((await getLatestBlockTimestamp()) >= mainPrizeTime_) {
						await tryWaitForTransactionReceipt(game_.connect(participant_).claimMainPrize());
						if (await game_.lastBidderAddress() === hre.ethers.ZeroAddress) {
							await activateCurrentRound(game_, contracts_.ownerSigner);
						}
					}
				}
			} else {
				await expect(
					game_.connect(participant_).bidWithEth(-1n, "too high min", hre.ethers.MaxUint256, { value: 0n })
				).revertedWithCustomError(game_, "BidCstRewardAmountMinLimitNotReached");
			}

			expect(await game_.cstDutchAuctionDuration()).greaterThan(0n);
			expect(await game_.cstDutchAuctionDuration()).equal(previousDuration_);
			if (counter_ % 10 === 0) {
				await assertV2FuzzInvariants(contracts_, participants_, previousRoundNum_);
				previousRoundNum_ = await game_.roundNum();
			}
		}

		await assertV2FuzzInvariants(contracts_, participants_, previousRoundNum_);
	});
});
