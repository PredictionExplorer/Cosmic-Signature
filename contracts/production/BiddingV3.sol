// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { ICosmicSignatureToken } from "./interfaces/ICosmicSignatureToken.sol";
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
	// #region `getBidCstRewardAmountAdvanced`

	/// @notice In V3+, the bid CST reward is linearly proportional to the elapsed duration since the last bid.
	/// Comment-202607161 applies.
	/// @return The total bid CST reward amount, which is to be split between the current last bidder and the new bidder,
	/// as described in Comment-202607161.
	function getBidCstRewardAmountAdvanced(int256 currentTimeOffset_) public view override (IBiddingV2, BiddingV2) /* virtual */ returns (uint256) {
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
				// Comment-202607161 applies.
				// Comment-202605295 applies.
				bidCstRewardAmount_ = uint256(elapsedDuration_) * bidCstRewardAmountPerMinute / (1 minutes);
			}
			return bidCstRewardAmount_;
		}
	}

	// #endregion
	// #region `_getLastBidderBidCstRewardAmount`

	/// @notice Calculates the share of the given total bid CST reward amount that belongs to the current last bidder.
	/// Comment-202607161 applies.
	/// @dev The new bidder share is to be calculated as the difference between the total and the returned value,
	/// so no Wei is lost to rounding.
	function _getLastBidderBidCstRewardAmount(uint256 bidCstRewardAmount_) private pure returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// Comment-202605295 applies.
			return bidCstRewardAmount_ * CosmicSignatureConstants.BID_CST_REWARD_AMOUNT_LAST_BIDDER_PERCENTAGE / 100;
		}
	}

	// #endregion
	// #region `_mintBidCstReward`

	/// @notice Comment-202607161 applies.
	/// @dev Comment-202607162 applies.
	/// [Comment-202607163]
	/// The bid CST reward is minted, rather than transferred. `CosmicSignatureToken` minting performs no call
	/// into the recipient, so a hostile last bidder contract that reverts on any incoming call or token callback
	/// cannot prevent this minting from succeeding, and therefore cannot block further bids.
	/// [/Comment-202607163]
	function _mintBidCstReward(uint256 bidCstRewardAmount_) internal override /* virtual */ {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			if (bidCstRewardAmount_ > 0) {
				// Comment-202607162 applies.
				address lastBidderAddressCopy_ = lastBidderAddress;

				uint256 lastBidderBidCstRewardAmount_ = _getLastBidderBidCstRewardAmount(bidCstRewardAmount_);
				// #enable_asserts assert(lastBidderBidCstRewardAmount_ < bidCstRewardAmount_);
				if (lastBidderAddressCopy_ == address(0)) {
					// Comment-202607161 applies.
					token.mint(_msgSender(), bidCstRewardAmount_ - lastBidderBidCstRewardAmount_);
				} else {
					// Comment-202607163 applies.
					ICosmicSignatureToken.MintSpec[] memory mintSpecs_ = new ICosmicSignatureToken.MintSpec[](2);
					mintSpecs_[0].account = lastBidderAddressCopy_;
					mintSpecs_[0].value = lastBidderBidCstRewardAmount_;
					mintSpecs_[1].account = _msgSender();
					mintSpecs_[1].value = bidCstRewardAmount_ - lastBidderBidCstRewardAmount_;
					token.mintMany(mintSpecs_);
				}
			}
		}
	}

	// #endregion
	// #region `_mintBidCstRewardAndBurnBidPrice`

	/// @notice Comment-202607161 applies.
	/// @dev Comment-202607162 applies.
	/// Comment-202607163 applies.
	function _mintBidCstRewardAndBurnBidPrice(uint256 bidCstRewardAmount_, uint256 paidPrice_) internal override /* virtual */ {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			if (bidCstRewardAmount_ > 0) {
				// Comment-202607162 applies.
				address lastBidderAddressCopy_ = lastBidderAddress;

				uint256 lastBidderBidCstRewardAmount_ = _getLastBidderBidCstRewardAmount(bidCstRewardAmount_);
				// #enable_asserts assert(lastBidderBidCstRewardAmount_ < bidCstRewardAmount_);

				// [Comment-202607164]
				// A CST bid cannot be the first bid in a bidding round, which `_bidCommon` is going to validate
				// after this method returns. But this method must not attempt to mint to the zero address,
				// so that the transaction reverted with the intended `WrongBidType` error, rather than with an ERC-20 error.
				// [/Comment-202607164]
				uint256 numMintAndBurnSpecs_ = (lastBidderAddressCopy_ == address(0)) ? 2 : 3;

				ICosmicSignatureToken.MintOrBurnSpec[] memory mintAndBurnSpecs_ = new ICosmicSignatureToken.MintOrBurnSpec[](numMintAndBurnSpecs_);
				mintAndBurnSpecs_[0].account = _msgSender();

				// Comment-202606074 relates and/or applies.
				mintAndBurnSpecs_[0].value = ( - int256(paidPrice_) );

				mintAndBurnSpecs_[1].account = _msgSender();
				mintAndBurnSpecs_[1].value = int256(bidCstRewardAmount_ - lastBidderBidCstRewardAmount_);
				if (numMintAndBurnSpecs_ > 2) {
					// Comment-202607163 applies.
					mintAndBurnSpecs_[2].account = lastBidderAddressCopy_;
					mintAndBurnSpecs_[2].value = int256(lastBidderBidCstRewardAmount_);
				}
				token.mintAndBurnMany(mintAndBurnSpecs_);
			} else {
				// This does not have the Comment-202606074 issue.
				token.burn(_msgSender(), paidPrice_);
			}
		}
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
