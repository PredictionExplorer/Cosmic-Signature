// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { ICosmicSignatureToken } from "./interfaces/ICosmicSignatureToken.sol";
import { IBiddingV2, BiddingV2 } from "./BiddingV2.sol";
import { CosmicSignatureGameStorageV3Base } from "./CosmicSignatureGameStorageV3Base.sol";
import { IBiddingV3 } from "./interfaces/IBiddingV3.sol";

// #endregion
// #region

abstract contract BiddingV3 is
	BiddingV2,
	CosmicSignatureGameStorageV3Base,
	// BidStatisticsV3,
	IBiddingV3 {
	// #region `getNextEthBidPriceAdvanced`

	function getNextEthBidPriceAdvanced(int256 currentTimeOffset_) public view override (IBiddingV2, BiddingV2) virtual returns (uint256) {
		// // #enable_smtchecker /*
		// unchecked
		// // #enable_smtchecker */

		return _addRoundLateBidPricePremiumAmountIfNeeded(super.getNextEthBidPriceAdvanced(currentTimeOffset_), currentTimeOffset_);
	}

	// #endregion
	// #region `getNextCstBidPriceAdvanced`

	/// @notice
	/// [Comment-202607165]
	/// The CST time standard.
	/// In V3+, a single rate -- the bid CST reward accrual rate of
	/// `bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds` CST Wei per second, computed by `_getAccruedCstAmount` --
	/// governs both how the game mints CST and how it burns CST:
	/// the bid CST reward equals the amount accrued since the last bid,
	/// and the CST bid price equals `cstDutchAuctionBeginningBidPrice` minus the amount accrued
	/// since the CST Dutch auction beginning, clamped at zero.
	/// So between CST bids the price falls at exactly the rate at which the reward grows.
	/// On a CST bid, the auction restarts at `max(paidPrice * 2, minLimit)`,
	/// where the min limit is 3 main prize time increments' worth of reward accrual (Comment-202607166).
	/// The auction duration is not a parameter any more; it's emergent: the beginning bid price divided by the rate,
	/// capped at 12 increments (Comment-202607170; above the cap the price declines proportionally faster, like in V2).
	/// `cstDutchAuctionDuration`, `cstDutchAuctionDurationChangeDivisor`, and `cstDutchAuctionBeginningBidPriceMinLimit`
	/// remain in storage and their setters keep working, but V3+ pricing ignores them.
	/// This design guarantees that every bidding round ends, provided someone is willing to claim the main prize.
	/// The proof is in "docs/round-termination-proof.md".
	/// [/Comment-202607165]
	function getNextCstBidPriceAdvanced(int256 currentTimeOffset_) public view override (IBiddingV2, BiddingV2) virtual returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// Comment-202605295 applies.
			int256 cstDutchAuctionElapsedDuration_ = _getCstDutchAuctionElapsedDuration() + currentTimeOffset_;

			// Comment-202501307 relates and/or applies.
			uint256 cstDutchAuctionBeginningBidPrice_ =
				(lastCstBidderAddress == address(0)) ? nextRoundFirstCstDutchAuctionBeginningBidPrice : cstDutchAuctionBeginningBidPrice;

			uint256 cstDutchAuctionDurationMaxLimit_ = _getCstDutchAuctionDurationMaxLimit();
			uint256 nextCstBidPrice_;
			if (cstDutchAuctionBeginningBidPrice_ > _getAccruedCstAmount(cstDutchAuctionDurationMaxLimit_)) {
				// Comment-202607170 applies. The whole price line is scaled to fit into the duration max limit,
				// similarly to the V2 formula.
				int256 cstDutchAuctionRemainingDuration_ = int256(cstDutchAuctionDurationMaxLimit_) - cstDutchAuctionElapsedDuration_;
				nextCstBidPrice_ =
					(cstDutchAuctionRemainingDuration_ > int256(0)) ?
					(cstDutchAuctionBeginningBidPrice_ * uint256(cstDutchAuctionRemainingDuration_) / cstDutchAuctionDurationMaxLimit_) :
					0;
			} else if (cstDutchAuctionElapsedDuration_ <= int256(0)) {
				// Given a negative `currentTimeOffset_`, extrapolating the price line backwards, above the beginning bid price,
				// similarly to how the V2 formula behaves.
				nextCstBidPrice_ = cstDutchAuctionBeginningBidPrice_ + _getAccruedCstAmount(uint256( - cstDutchAuctionElapsedDuration_));
			} else {
				uint256 cstBidPriceDeclineAmount_ = _getAccruedCstAmount(uint256(cstDutchAuctionElapsedDuration_));
				nextCstBidPrice_ =
					(cstBidPriceDeclineAmount_ < cstDutchAuctionBeginningBidPrice_) ?
					(cstDutchAuctionBeginningBidPrice_ - cstBidPriceDeclineAmount_) :
					0;
			}
			return _addRoundLateBidPricePremiumAmountIfNeeded(nextCstBidPrice_, currentTimeOffset_);
		}
	}

	// #endregion
	// #region `_getCstDutchAuctionDurationMaxLimit`

	/// @notice Calculates and returns the CST Dutch auction emergent duration max limit, in seconds.
	/// Comment-202607170 applies.
	function _getCstDutchAuctionDurationMaxLimit() internal view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return
				CosmicSignatureConstants.CST_DUTCH_AUCTION_DURATION_INCREMENT_MAX_MULTIPLE *
				mainPrizeTimeIncrementInMicroSeconds /
				CosmicSignatureConstants.MICROSECONDS_PER_SECOND;
		}
	}

	// #endregion
	// #region `_getCstDutchAuctionDuration`

	/// @notice Calculates and returns the current CST Dutch auction emergent duration:
	/// the number of seconds from the auction beginning until the CST bid price declines to zero.
	/// Comment-202607165 applies.
	/// Comment-202607170 applies.
	/// @dev The result is exact: the price is nonzero 1 second before the auction end and zero at it.
	/// In the uncapped branch that's thanks to rounding the division up.
	function _getCstDutchAuctionDuration() internal view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// Comment-202501307 relates and/or applies.
			uint256 cstDutchAuctionBeginningBidPrice_ =
				(lastCstBidderAddress == address(0)) ? nextRoundFirstCstDutchAuctionBeginningBidPrice : cstDutchAuctionBeginningBidPrice;

			if (cstDutchAuctionBeginningBidPrice_ == 0) {
				return 0;
			}
			uint256 bidCstRewardAmountMultiplierCopy_ = bidCstRewardAmountMultiplier;
			uint256 cstDutchAuctionDurationMaxLimit_ = _getCstDutchAuctionDurationMaxLimit();
			if (bidCstRewardAmountMultiplierCopy_ == 0) {
				// The price declines over the duration max limit (the Comment-202607170 branch).
				return cstDutchAuctionDurationMaxLimit_;
			}
			uint256 cstDutchAuctionDuration_ =
				(cstDutchAuctionBeginningBidPrice_ * mainPrizeTimeIncrementInMicroSeconds + (bidCstRewardAmountMultiplierCopy_ - 1)) /
				bidCstRewardAmountMultiplierCopy_;
			return Math.min(cstDutchAuctionDuration_, cstDutchAuctionDurationMaxLimit_);
		}
	}

	// #endregion
	// #region `getCstDutchAuctionDurations`

	function getCstDutchAuctionDurations() public view override (IBiddingV2, BiddingV2) virtual returns (uint256, int256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			int256 cstDutchAuctionElapsedDuration_ = _getCstDutchAuctionElapsedDuration();
			return (_getCstDutchAuctionDuration(), cstDutchAuctionElapsedDuration_);
		}
	}

	// #endregion
	// #region `getCstDutchAuctionBeginningBidPriceMinLimit`

	function getCstDutchAuctionBeginningBidPriceMinLimit() external view override returns (uint256) {
		return _getCstDutchAuctionBeginningBidPriceMinLimit();
	}

	// #endregion
	// #region `_getCstDutchAuctionBeginningBidPriceMinLimit`

	/// @notice Comment-202607166 applies.
	function _getCstDutchAuctionBeginningBidPriceMinLimit() internal view override virtual returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return
				CosmicSignatureConstants.CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT_INCREMENT_REWARD_MULTIPLE *
				bidCstRewardAmountMultiplier /
				CosmicSignatureConstants.MICROSECONDS_PER_SECOND;
		}
	}

	// #endregion
	// #region `_updateCstDutchAuctionOnEthBid`

	/// @notice In V3+, an ETH bid does not change the CST Dutch auction state. Comment-202607165 applies.
	function _updateCstDutchAuctionOnEthBid() internal view override virtual returns (uint256) {
		return _getCstDutchAuctionDuration();
	}

	// #endregion
	// #region `_updateCstDutchAuctionOnCstBid`

	/// @notice In V3+, a CST bid restarts the CST Dutch auction, but the duration is emergent. Comment-202607165 applies.
	function _updateCstDutchAuctionOnCstBid() internal view override virtual returns (uint256) {
		return _getCstDutchAuctionDuration();
	}

	// #endregion
	// #region `_addRoundLateBidPricePremiumAmountIfNeeded`

	function _addRoundLateBidPricePremiumAmountIfNeeded(uint256 bidPrice_, int256 currentTimeOffset_) private view returns (uint256 adjustedBidPrice_) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			adjustedBidPrice_ = bidPrice_;
			if (lastBidderAddress != address(0)) {
				uint256 roundLateBidDuration_ = getRoundLateBidDuration();
				int256 durationUntilMainPrize_ = getDurationUntilMainPrizeRaw() - currentTimeOffset_;

				// It could be more correct to add 1 to this so that we reached bid price max premium 1 second before `mainPrizeTime`,
				// but it would make little difference.
				int256 roundLateBidElapsedDuration_ = int256(roundLateBidDuration_) - durationUntilMainPrize_;

				if (roundLateBidElapsedDuration_ > int256(0)) {
					if (durationUntilMainPrize_ < int256(0)) {
						// #enable_asserts assert(uint256(roundLateBidElapsedDuration_) > roundLateBidDuration_);
						roundLateBidElapsedDuration_ = int256(roundLateBidDuration_);
					} else {
						// #enable_asserts assert(uint256(roundLateBidElapsedDuration_) <= roundLateBidDuration_);
					}

					// [Comment-202607119]
					// Prototyping the formula in JavaScript.
					// These expressions are equivalent:
					// (2n ** 13n) ** 8n == 2n ** (13n * 8n) == 1n << (13n * 8n)
					// This is our max premium exponentiation base:
					// Math.trunc((20 * 60) * 3567993 * 2 ** 13 / (60 * 60 * 1e6)) == 9742
					// We multiply and then divide by `2 ** 13` to increase resolution of integer math.
					// Max premium multiplier to multiply bid price by:
					// 9742 ** 8 / 2 ** (13 * 8) == ~4
					// Let's say, our bid price is 1_000_000_000. Calculating max premium:
					// (9742n ** 8n * 1_000_000_000n) >> (13n * 8n) == 4_000_050_302n
					//
					// This cannot overflow.
					// Comment-202412033 relates.
					// This can be zero.
					// [/Comment-202607119]
					uint256 roundLateBidPricePremiumAmount_ =
						( (uint256(roundLateBidElapsedDuration_) * roundLateBidPricePremiumAmountBaseMultiplier / mainPrizeTimeIncrementInMicroSeconds) ** roundLateBidPricePremiumAmountExponent *
						  adjustedBidPrice_
						) >>
						(roundLateBidPricePremiumAmountExponent * CosmicSignatureConstants.ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_RESOLUTION_EXPONENT);

					adjustedBidPrice_ += roundLateBidPricePremiumAmount_;
				}
			}
		}
	}

	// #endregion
	// #region `getRoundLateBidDuration`

	function getRoundLateBidDuration() public view override returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 roundLateBidDuration_ = mainPrizeTimeIncrementInMicroSeconds / roundLateBidDurationDivisor;
			return roundLateBidDuration_;
		}
	}

	// #endregion
	// #region `_getAccruedCstAmount`

	/// @notice Calculates and returns the CST amount that accrues over the given duration
	/// at the rate of `bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds` CST Wei per second.
	/// This single formula governs both the bid CST reward and the CST bid price decline.
	/// Comment-202607165 applies.
	function _getAccruedCstAmount(uint256 elapsedDuration_) internal view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// Comment-202607167 applies.
			// Comment-202605295 applies.
			return elapsedDuration_ * bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds;
		}
	}

	// #endregion
	// #region `getBidCstRewardAmountPerMainPrizeTimeIncrement`

	function getBidCstRewardAmountPerMainPrizeTimeIncrement() external view override returns (uint256) {
		return _getAccruedCstAmount(getMainPrizeTimeIncrement());
	}

	// #endregion
	// #region `getBidCstRewardAmountAdvanced`

	function getBidCstRewardAmountAdvanced(int256 currentTimeOffset_) public view override (IBiddingV2, BiddingV2) virtual returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 lastBidTimeStampCopy_ =
				(lastBidderAddress == address(0)) ?
				roundActivationTime :
				biddersInfo[roundNum][lastBidderAddress].lastBidTimeStamp;

			// Comment-202605295 applies.
			int256 elapsedDuration_ = int256(block.timestamp) + currentTimeOffset_ - int256(lastBidTimeStampCopy_);

			uint256 bidCstRewardAmount_ = 0;
			if (elapsedDuration_ > int256(0)) {
				bidCstRewardAmount_ = _getAccruedCstAmount(uint256(elapsedDuration_));
			}
			return bidCstRewardAmount_;
		}
	}

	// #endregion
	// #region `_mintBidCstRewardAmountIfNeeded`

	function _mintBidCstRewardAmountIfNeeded(uint256 bidCstRewardAmount_) internal override virtual {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			if (bidCstRewardAmount_ > 0) {
				uint256 lastBidderBidCstRewardAmount_ = _getLastBidderBidCstRewardAmount(bidCstRewardAmount_);
				address lastBidderAddressCopy_ = lastBidderAddress;
				if (lastBidderAddressCopy_ == address(0)) {
					token.mint(_msgSender(), bidCstRewardAmount_ - lastBidderBidCstRewardAmount_);
				} else {
					ICosmicSignatureToken.MintSpec[] memory mintSpecs_ = new ICosmicSignatureToken.MintSpec[](2);
					mintSpecs_[0].account = _msgSender();
					mintSpecs_[0].value = bidCstRewardAmount_ - lastBidderBidCstRewardAmount_;

					// [Comment-202607163]
					// `CosmicSignatureToken` makes no callbacks into token holders, period -- neither on mints nor on transfers.
					// So a hostile last bidder contract that reverts on any incoming call
					// cannot prevent this minting from succeeding, and therefore cannot block further bids.
					// [/Comment-202607163]
					mintSpecs_[1].account = lastBidderAddressCopy_;

					mintSpecs_[1].value = lastBidderBidCstRewardAmount_;
					token.mintMany(mintSpecs_);
				}
			}
		}
	}

	// #endregion
	// #region `_burnCstBidPriceAndMintBidCstRewardAmountIfNeeded`

	function _burnCstBidPriceAndMintBidCstRewardAmountIfNeeded(uint256 cstBidPrice_, uint256 bidCstRewardAmount_) internal override virtual {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			if (bidCstRewardAmount_ > 0) {
				uint256 lastBidderBidCstRewardAmount_ = _getLastBidderBidCstRewardAmount(bidCstRewardAmount_);
				address lastBidderAddressCopy_ = lastBidderAddress;

				// [Comment-202607164]
				// We can reach this point only on CST bid.
				// A CST bid is not allowed to be the first in a bidding round, but we are yet to validate that near Comment-202501044,
				// so it's not guaranteed that `lastBidderAddress` is a nonzero.
				// If it's zero, we skip the last bidder mint spec (whose zero account would make `CosmicSignatureToken` revert
				// with a confusing error), let `_bidCommon` perform the validation, and revert there.
				// [/Comment-202607164]
				uint256 numMintAndBurnSpecs_ = (lastBidderAddressCopy_ == address(0)) ? 2 : 3;

				ICosmicSignatureToken.MintOrBurnSpec[] memory mintAndBurnSpecs_ = new ICosmicSignatureToken.MintOrBurnSpec[](numMintAndBurnSpecs_);
				mintAndBurnSpecs_[0].account = _msgSender();

				// Comment-202409177 applies.
				// Comment-202606074 relates and/or applies.
				mintAndBurnSpecs_[0].value = ( - int256(cstBidPrice_) );

				mintAndBurnSpecs_[1].account = _msgSender();
				mintAndBurnSpecs_[1].value = int256(bidCstRewardAmount_ - lastBidderBidCstRewardAmount_);

				if (numMintAndBurnSpecs_ > 2) {
					// Comment-202607163 applies.
					mintAndBurnSpecs_[2].account = lastBidderAddressCopy_;

					mintAndBurnSpecs_[2].value = int256(lastBidderBidCstRewardAmount_);
				}
				token.mintAndBurnMany(mintAndBurnSpecs_);
			} else {
				// Comment-202607168 applies.
				token.burn(_msgSender(), cstBidPrice_);
			}
		}
	}

	// #endregion
	// #region `_getLastBidderBidCstRewardAmount`

	/// @notice Calculates and returns the share of the given total bid CST reward amount that belongs to the current last bidder.
	/// This can potentially return zero when given a nonzero, but in practice this unlikely ever will.
	function _getLastBidderBidCstRewardAmount(uint256 bidCstRewardAmount_) private view returns (uint256 lastBidderBidCstRewardAmount_) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// Comment-202605295 applies.
			lastBidderBidCstRewardAmount_ = bidCstRewardAmount_ * lastBidderBidCstRewardAmountPercentage / 100;

			// #enable_asserts assert(lastBidderBidCstRewardAmount_ < bidCstRewardAmount_);
		}
	}

	// #endregion
}

// #endregion
