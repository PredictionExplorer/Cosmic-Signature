// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

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

	function getNextCstBidPriceAdvanced(int256 currentTimeOffset_) public view override (IBiddingV2, BiddingV2) virtual returns (uint256) {
		// // #enable_smtchecker /*
		// unchecked
		// // #enable_smtchecker */

		return _addRoundLateBidPricePremiumAmountIfNeeded(super.getNextCstBidPriceAdvanced(currentTimeOffset_), currentTimeOffset_);
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
	// #region `getBidCstRewardAmountAdvanced`

	function getBidCstRewardAmountAdvanced(int256 currentTimeOffset_) public view override (IBiddingV2, BiddingV2) virtual returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// Comment-202501022 applies.
			// That's OK, because there is no bid CST reward for the first bid in a bidding round.
			// todo-0 Tell Nick to not show the reward until someone places the first bid.
			uint256 lastBidTimeStampCopy_ = biddersInfo[roundNum][lastBidderAddress].lastBidTimeStamp;

			// Comment-202605295 applies.
			int256 elapsedDuration_ = int256(block.timestamp) + currentTimeOffset_ - int256(lastBidTimeStampCopy_);

			uint256 bidCstRewardAmount_ = 0;
			if (elapsedDuration_ > int256(0)) {
				// Comment-202607167 applies.
				// Comment-202605295 applies.
				bidCstRewardAmount_ = uint256(elapsedDuration_) * bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds;
			}
			return bidCstRewardAmount_;
		}
	}

	// #endregion
	// #region `_mintBidCstRewardAmountIfNeeded`

	/// todo-0 Base method comment says that `bidCstRewardAmount_ may be zero.
	/// todo-0 But here it cannot be because we enforce at least 1 second since the previous bid and do not pay any reward to the first bidder.
	/// todo-0 Cross-ref with where we enforce that.
	function _mintBidCstRewardAmountIfNeeded(uint256 bidCstRewardAmount_) internal override virtual {
		// // #enable_smtchecker /*
		// unchecked
		// // #enable_smtchecker */

		// [Comment-202607263]
		// If this wasn't guaranteed it would make sense to check this before minting.
		// [/Comment-202607263]
		// #enable_asserts assert(bidCstRewardAmount_ > 0);

		// #enable_asserts assert(lastBidderAddress != address(0));

		// [Comment-202607163]
		// The bid CST reward is minted, rather than transferred. `CosmicSignatureToken` minting performs no call
		// into the recipient, so a hostile last bidder contract that reverts on any incoming call or token callback
		// cannot prevent this minting from succeeding, and therefore cannot block further bids.
		// todo-ai-0 A hostile actor can't block a CST transfer either, right?
		// todo-ai-0 So would it be better to rephrase this and any other related comments
		// todo-ai-0 to clarify that `CosmicSignatureToken` does not make any callbacks, period?
		// [/Comment-202607163]
		token.mint(lastBidderAddress, bidCstRewardAmount_);
	}

	// #endregion
	// #region `_burnCstBidPriceAndMintBidCstRewardAmountIfNeeded`

	function _burnCstBidPriceAndMintBidCstRewardAmountIfNeeded(uint256 cstBidPrice_, uint256 bidCstRewardAmount_) internal override virtual {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// Comment-202607263 applies.
			// #enable_asserts assert(bidCstRewardAmount_ > 0);

			ICosmicSignatureToken.MintOrBurnSpec[] memory mintAndBurnSpecs_ = new ICosmicSignatureToken.MintOrBurnSpec[](2);
			mintAndBurnSpecs_[0].account = _msgSender();

			// Comment-202409177 applies.
			// Comment-202606074 relates and/or applies.
			mintAndBurnSpecs_[0].value = ( - int256(cstBidPrice_) );

			// [Comment-202607164]
			// We can reach this point only on CST bid.
			// A CST bid is not allowed to be the first in a bidding round, which we are yet to validate near Comment-202501044.
			// Therefore it's not guaranteed that this is a nonzero.
			// If this is zero, we would revert with a different error than near Comment-202501044.
			// This behavior is kinda questionable, but keeping it simple.
			// [/Comment-202607164]
			// Comment-202607163 applies.
			mintAndBurnSpecs_[1].account = lastBidderAddress;

			mintAndBurnSpecs_[1].value = int256(bidCstRewardAmount_);
			token.mintAndBurnMany(mintAndBurnSpecs_);
		}
	}

	// #endregion
}

// #endregion
