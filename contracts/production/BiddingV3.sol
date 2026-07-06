// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureGameStorageV3Base } from "./CosmicSignatureGameStorageV3Base.sol";
import { BiddingV2 } from "./BiddingV2.sol";
import { IBiddingV2 } from "./interfaces/IBiddingV2.sol";
import { IBiddingV3 } from "./interfaces/IBiddingV3.sol";

// #endregion
// #region

abstract contract BiddingV3 is
	CosmicSignatureGameStorageV3Base,
	BiddingV2,
	IBiddingV3 {
	// #region `getNextEthBidPriceAdvanced`

	function getNextEthBidPriceAdvanced(int256 currentTimeOffset_) public view override (IBiddingV2, BiddingV2) /* virtual */ returns (uint256) {
		// // #enable_smtchecker /*
		// unchecked
		// // #enable_smtchecker */

		return _addRoundLateBidPricePremiumAmountIfNeeded(super.getNextEthBidPriceAdvanced(currentTimeOffset_), currentTimeOffset_);
	}

	// #endregion
	// #region `getNextCstBidPriceAdvanced`

	function getNextCstBidPriceAdvanced(int256 currentTimeOffset_) public view override (IBiddingV2, BiddingV2) /* virtual */ returns (uint256) {
		// // #enable_smtchecker /*
		// unchecked
		// // #enable_smtchecker */

		return _addRoundLateBidPricePremiumAmountIfNeeded(super.getNextCstBidPriceAdvanced(currentTimeOffset_), currentTimeOffset_);
	}

	// #endregion
	// #region `_addRoundLateBidPricePremiumAmountIfNeeded`

	function _addRoundLateBidPricePremiumAmountIfNeeded(uint256 bidPrice_, int256 currentTimeOffset_) internal view returns (uint256 adjustedBidPrice_) {
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
}

// #endregion
