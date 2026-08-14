"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { ENABLE_ASSERTS, waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	getLatestBlockTimestamp,
	activateCurrentRound,
	deployV1CompleteRoundZeroAndUpgradeToV2,
} = require("../src/V2UpgradeTestHelpers.js");
const {
	assertDefaultV3Initialization,
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
	upgradeToV3,
} = require("../src/V3UpgradeTestHelpers.js");

const UINT256_MODULUS = 1n << 256n;
const UINT256_MAX = UINT256_MODULUS - 1n;
const ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_RESOLUTION_EXPONENT = 13n;

function asUint256(value_) {
	return BigInt.asUintN(256, value_);
}

function powMod256(base_, exponent_) {
	let result_ = 1n;
	let factor_ = asUint256(base_);
	for (let exponentCopy_ = exponent_; exponentCopy_ > 0n; exponentCopy_ >>= 1n) {
		if ((exponentCopy_ & 1n) != 0n) {
			result_ = asUint256(result_ * factor_);
		}
		factor_ = asUint256(factor_ * factor_);
	}
	return result_;
}

// Mirrors the production `unchecked` arithmetic in
// `BiddingV3._addRoundLateBidPricePremiumAmountIfNeeded` at `mainPrizeTime`.
function getWrappedLateBidPrice(
	bidPrice_,
	roundLateBidDuration_,
	mainPrizeTimeIncrementInMicroSeconds_,
	baseMultiplier_,
	exponent_
) {
	const scaledBase_ =
		asUint256(roundLateBidDuration_ * baseMultiplier_) /
		mainPrizeTimeIncrementInMicroSeconds_;
	const poweredBase_ = powMod256(scaledBase_, exponent_);
	const numerator_ = asUint256(poweredBase_ * bidPrice_);
	const shiftAmount_ =
		asUint256(exponent_ * ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_RESOLUTION_EXPONENT);
	const premiumAmount_ = (shiftAmount_ >= 256n) ? 0n : (numerator_ >> shiftAmount_);
	return asUint256(bidPrice_ + premiumAmount_);
}

async function deployHostileBidder(game_, deployerSigner_) {
	const hostileBidderFactory_ = await hre.ethers.getContractFactory("HostileBidder", deployerSigner_);
	const hostileBidder_ = await hostileBidderFactory_.deploy(await game_.getAddress());
	await hostileBidder_.waitForDeployment();
	return hostileBidder_;
}

async function bidWithEthAt(game_, bidder_, timeStamp_, message_ = "") {
	const latestTimeStamp_ = await getLatestBlockTimestamp();
	const bidPrice_ = await game_.getNextEthBidPriceAdvanced(timeStamp_ - latestTimeStamp_);
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);
	return waitForTransactionReceipt(
		game_.connect(bidder_).bidWithEth(-1n, message_, 0n, {value: bidPrice_,})
	);
}

async function expectReinitializeUnavailable(game_, signer_) {
	const expectation_ = expect(game_.connect(signer_).reinitialize());
	if (ENABLE_ASSERTS) {
		// `_onlyIfPrevVersionWasInitialized` executes before `reinitializer(3)`.
		// On a replay, the initialized version is 3 rather than the expected 2,
		// so an assert-enabled build reaches the assertion first.
		await expectation_.revertedWithPanic(0x01n);
	} else {
		await expectation_.revertedWithCustomError(game_, "InvalidInitialization");
	}
}

describe("CosmicSignatureGameV3-Security", function () {
	it("the atomic V3 upgrade leaves reinitialize unavailable to both owner and non-owner", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;

		await expectReinitializeUnavailable(game_, contracts_.signers[9]);
		await expectReinitializeUnavailable(game_, contracts_.ownerSigner);
	});

	it("documents that a deliberately bare V3 upgrade leaves one permissionless reinitialize call", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(2n);

		// This deliberately omits the `upgradeToAndCall(..., reinitialize())` payload used by
		// the production upgrade task. It characterizes the medium-severity audit finding.
		await upgradeToV3(contracts_, {call: undefined,});
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		expect(await game_.mainPrizeNumCosmicSignatureNfts()).equal(0n);

		const nonOwner_ = contracts_.signers[9];
		await waitForTransactionReceipt(game_.connect(nonOwner_).reinitialize());
		await assertDefaultV3Initialization(game_);

		// `reinitializer(3)` still makes the call one-shot, regardless of who won the race.
		await expectReinitializeUnavailable(game_, contracts_.ownerSigner);
	});

	it("a V3 main-prize beneficiary cannot reenter claimMainPrize during the ETH transfer", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);

		const hostileBidder_ = await deployHostileBidder(game_, contracts_.signers[10]);
		const hostileBidderAddress_ = await hostileBidder_.getAddress();
		const hostileController_ = contracts_.signers[10];

		await bidWithEthAt(game_, contracts_.signers[1], (await getLatestBlockTimestamp()) + 10n);
		{
			const bidTimeStamp_ = (await getLatestBlockTimestamp()) + 10n;
			const bidPrice_ = await game_.getNextEthBidPriceAdvanced(10n);
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
			await waitForTransactionReceipt(
				hostileBidder_.connect(hostileController_).doBidWithEth(-1n, "", 0n, {value: bidPrice_,})
			);
		}
		expect(await game_.lastBidderAddress()).equal(hostileBidderAddress_);

		const roundNum_ = await game_.roundNum();
		await waitForTransactionReceipt(hostileBidder_.setHostilityModeCode(5n));
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime()),]);

		// The inner claim hits the shared transient reentrancy guard. That rejects the
		// main-prize ETH transfer, so the outer claim fails atomically.
		await expect(hostileBidder_.connect(hostileController_).doClaimMainPrize())
			.revertedWithCustomError(game_, "FundTransferFailed");
		expect(await game_.roundNum()).equal(roundNum_);
		expect(await game_.lastBidderAddress()).equal(hostileBidderAddress_);

		// Removing the hostile receive behavior makes the same beneficiary able to claim normally.
		await waitForTransactionReceipt(hostileBidder_.setHostilityModeCode(0n));
		await waitForTransactionReceipt(hostileBidder_.connect(hostileController_).doClaimMainPrize());
		expect(await game_.roundNum()).equal(roundNum_ + 1n);
	});

	it("a charity that reenters the game cannot block main-prize claiming", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const hostileCharity_ = await deployHostileBidder(game_, contracts_.signers[10]);
		const hostileCharityAddress_ = await hostileCharity_.getAddress();

		// Mode 4 reenters `bidWithEth` whenever the charity receives ETH.
		await waitForTransactionReceipt(hostileCharity_.setHostilityModeCode(4n));
		await waitForTransactionReceipt(
			game_.connect(contracts_.ownerSigner).setCharityAddress(hostileCharityAddress_)
		);
		await activateCurrentRound(game_, contracts_.ownerSigner);

		const bidder_ = contracts_.signers[1];
		await bidWithEthAt(game_, bidder_, (await getLatestBlockTimestamp()) + 10n);
		const roundNum_ = await game_.roundNum();
		const charityAmount_ = await game_.getCharityEthDonationAmount();
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime()),]);

		// Charity payout is best-effort: the reentry makes the low-level transfer fail,
		// the game emits FundTransferFailed, and the main-prize claim still completes.
		await expect(game_.connect(bidder_).claimMainPrize())
			.emit(game_, "FundTransferFailed")
			.withArgs("ETH transfer to charity failed.", hostileCharityAddress_, charityAmount_);
		expect(await game_.roundNum()).equal(roundNum_ + 1n);
	});

	it("the same-second throttle also covers the receive() ETH-bid entrypoint", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];
		const bidPrice_ = await game_.getNextEthBidPriceAdvanced(100n);

		try {
			await hre.ethers.provider.send("evm_setAutomine", [false,]);
			const bidTransaction_ =
				await game_.connect(bidder1_).bidWithEth(-1n, "", 0n, {value: bidPrice_ * 2n, gasLimit: 2_000_000n,});
			const receiveTransaction_ =
				await bidder2_.sendTransaction({
					to: await game_.getAddress(),
					value: bidPrice_ * 3n,
					gasLimit: 2_000_000n,
				});
			await hre.ethers.provider.send("evm_setAutomine", [true,]);
			await hre.ethers.provider.send("evm_mine");

			const bidReceipt_ = await bidTransaction_.wait();
			const receiveReceipt_ =
				await hre.ethers.provider.getTransactionReceipt(receiveTransaction_.hash);
			expect(bidReceipt_.blockNumber).equal(receiveReceipt_.blockNumber);
			expect(bidReceipt_.status).equal(1);
			expect(receiveReceipt_.status).equal(0);
			expect(await game_.lastBidderAddress()).equal(bidder1_.address);

			await expect(
				hre.ethers.provider.call({
					from: bidder2_.address,
					to: await game_.getAddress(),
					value: bidPrice_ * 3n,
				})
			).revertedWithCustomError(game_, "BidPlacedWithinCurrentSecond");
		} finally {
			await hre.ethers.provider.send("evm_setAutomine", [true,]);
		}
	});

	it("extreme premium parameters follow explicit uint256 wrapping without panicking", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const gameForOwner_ = game_.connect(contracts_.ownerSigner);

		// These are owner-controlled footgun values. The production formula intentionally
		// runs unchecked; this test locks in its exact modulo-2^256 behavior.
		const baseMultiplier_ = UINT256_MAX;
		const exponent_ = 2n;
		await waitForTransactionReceipt(
			gameForOwner_.setRoundLateBidPricePremiumAmountBaseMultiplier(baseMultiplier_)
		);
		await waitForTransactionReceipt(
			gameForOwner_.setRoundLateBidPricePremiumAmountExponent(exponent_)
		);
		await waitForTransactionReceipt(gameForOwner_.setCstBidPriceDeclineMultiplier(1n));
		await activateCurrentRound(game_, contracts_.ownerSigner);

		await bidWithEthAt(game_, contracts_.signers[1], (await getLatestBlockTimestamp()) + 10n);
		const latestTimeStamp_ = await getLatestBlockTimestamp();
		const mainPrizeTime_ = await game_.mainPrizeTime();
		const currentTimeOffset_ = mainPrizeTime_ - latestTimeStamp_;
		const roundLateBidDuration_ = await game_.getRoundLateBidDuration();
		const mainPrizeTimeIncrement_ = await game_.mainPrizeTimeIncrementInMicroSeconds();

		// Prove that this actually exercises the overflow path, rather than only large safe arithmetic.
		expect(roundLateBidDuration_ * baseMultiplier_).greaterThan(UINT256_MAX);

		const ethBasePrice_ = await game_.nextEthBidPrice();
		const expectedEthPrice_ = getWrappedLateBidPrice(
			ethBasePrice_,
			roundLateBidDuration_,
			mainPrizeTimeIncrement_,
			baseMultiplier_,
			exponent_
		);
		expect(await game_.getNextEthBidPriceAdvanced(currentTimeOffset_)).equal(expectedEthPrice_);

		const cstBeginningPrice_ = await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice();
		const cstElapsedDuration_ =
			mainPrizeTime_ - await game_.cstDutchAuctionBeginningTimeStamp();
		const cstBasePrice_ =
			(cstBeginningPrice_ > cstElapsedDuration_) ?
			(cstBeginningPrice_ - cstElapsedDuration_) :
			0n;
		expect(cstBasePrice_).greaterThan(0n);
		const expectedCstPrice_ = getWrappedLateBidPrice(
			cstBasePrice_,
			roundLateBidDuration_,
			mainPrizeTimeIncrement_,
			baseMultiplier_,
			exponent_
		);
		expect(await game_.getNextCstBidPriceAdvanced(currentTimeOffset_)).equal(expectedCstPrice_);
	});

	it("reverting ERC-20/ERC-721 donations revert the whole bid atomically", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);

		const revertingTokenFactory_ =
			await hre.ethers.getContractFactory("RevertingToken", contracts_.signers[10]);
		const revertingToken_ = await revertingTokenFactory_.deploy(await contracts_.prizesWallet.getAddress());
		await revertingToken_.waitForDeployment();
		await waitForTransactionReceipt(revertingToken_.setModeCode(1n));
		const revertingTokenAddress_ = await revertingToken_.getAddress();
		const bidder_ = contracts_.signers[1];

		await expect(
			game_.connect(bidder_).bidWithEthAndDonateToken(
				-1n,
				"",
				0n,
				revertingTokenAddress_,
				1n,
				{value: 10n ** 18n,}
			)
		).revertedWith("RevertingToken rejects transferFrom.");
		expect(await game_.lastBidderAddress()).equal(hre.ethers.ZeroAddress);

		const donatedNftIndex_ = await contracts_.prizesWallet.nextDonatedNftIndex();
		await expect(
			game_.connect(bidder_).bidWithEthAndDonateNft(
				-1n,
				"",
				0n,
				revertingTokenAddress_,
				42n,
				{value: 10n ** 18n,}
			)
		).revertedWith("RevertingToken rejects transferFrom.");
		expect(await game_.lastBidderAddress()).equal(hre.ethers.ZeroAddress);
		expect(await contracts_.prizesWallet.nextDonatedNftIndex()).equal(donatedNftIndex_);
	});

	it("a donated NFT that rejects its claim blocks only itself and remains claimable later", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const bidder_ = contracts_.signers[1];

		const revertingTokenFactory_ =
			await hre.ethers.getContractFactory("RevertingToken", contracts_.signers[10]);
		const revertingToken_ = await revertingTokenFactory_.deploy(await contracts_.prizesWallet.getAddress());
		await revertingToken_.waitForDeployment();
		const revertingTokenAddress_ = await revertingToken_.getAddress();
		const nftId_ = 42n;
		await waitForTransactionReceipt(revertingToken_.mintNft(bidder_.address, nftId_));

		const donatedNftIndex_ = await contracts_.prizesWallet.nextDonatedNftIndex();
		await waitForTransactionReceipt(
			game_.connect(bidder_).bidWithEthAndDonateNft(
				-1n,
				"",
				0n,
				revertingTokenAddress_,
				nftId_,
				{value: 10n ** 18n,}
			)
		);
		expect(await revertingToken_.ownerOf(nftId_)).equal(await contracts_.prizesWallet.getAddress());

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime()),]);
		await waitForTransactionReceipt(game_.connect(bidder_).claimMainPrize());

		await waitForTransactionReceipt(revertingToken_.setModeCode(2n));
		await expect(
			contracts_.prizesWallet.connect(bidder_).claimDonatedNft(donatedNftIndex_)
		).revertedWith("RevertingToken rejects claim transfer.");

		// The failed transfer rolls the preceding record deletion back, so the NFT is not lost.
		const donatedNftAfterFailedClaim_ =
			await contracts_.prizesWallet.donatedNfts(donatedNftIndex_);
		expect(donatedNftAfterFailedClaim_.nftAddress).equal(revertingTokenAddress_);
		expect(await revertingToken_.ownerOf(nftId_)).equal(await contracts_.prizesWallet.getAddress());

		await waitForTransactionReceipt(revertingToken_.setModeCode(0n));
		await waitForTransactionReceipt(
			contracts_.prizesWallet.connect(bidder_).claimDonatedNft(donatedNftIndex_)
		);
		expect(await revertingToken_.ownerOf(nftId_)).equal(bidder_.address);
		expect((await contracts_.prizesWallet.donatedNfts(donatedNftIndex_)).nftAddress)
			.equal(hre.ethers.ZeroAddress);
	});
});
