// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureHelpers } from "./libraries/CosmicSignatureHelpers.sol";
import { BidRaffleWeightHelpers } from "./libraries/BidRaffleWeightHelpers.sol";
import { IBidding1V2 } from "./interfaces/IBidding1V2.sol";
import { BiddingV2Base } from "./BiddingV2Base.sol";
import { CosmicSignatureGameStorageV3Base } from "./CosmicSignatureGameStorageV3Base.sol";
import { IBiddingV3 } from "./interfaces/IBiddingV3.sol";

// #endregion
// #region

/// @notice
/// [Comment-202611022]
/// In V3+, the CST side of the game is measured in a single unit: the bid CST reward that the last bidder earns
/// while holding that position. See `docs/cosmic-signature-game-cst-bid-pricing.md` for the full rationale.
/// The rules are:
/// 1. The CST bid price declines at exactly the bid CST reward rate, starting at the CST Dutch auction beginning bid price.
///    Comment-202611023 applies.
/// 2. After a CST bid, the next auction begins at twice the price paid plus one main prize time increment of reward,
///    but never above the reward of the initial duration until main prize. Comment-202611024 and Comment-202611025 apply.
/// 3. The late-bid premium of a CST bid is calculated from at least one main prize time increment of reward.
///    Comment-202611026 applies.
/// 4. The raffle weight of a CST bid is proportional to the fraction of the asking price that the bid paid.
///    Comment-202611027 applies.
/// [/Comment-202611022]
abstract contract BiddingV3 is
	BiddingV2Base,
	CosmicSignatureGameStorageV3Base,
	// BidStatisticsV3,
	IBiddingV3 {
	// #region `_bidWithEth`

	function _bidWithEth(int256 randomWalkNftId_, string memory message_, uint256 bidCstRewardAmountMinLimit_) internal override /* virtual */ /* nonReentrant() */ /* _onlyRoundIsActive() */ {
		// #region

		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// #region //

			// BidType bidType_;

			// #endregion
			// #region

			uint256 bidCstRewardAmount_ = 0;
			if (lastBidderAddress != address(0)) {
				// This can be zero.
				bidCstRewardAmount_ = getBidCstRewardAmountAdvanced(int256(0));

				// Comment-202412045 applies.
				if ( ! (bidCstRewardAmount_ >= bidCstRewardAmountMinLimit_) ) {
					revert CosmicSignatureErrors.BidCstRewardAmountMinLimitNotReached(bidCstRewardAmount_, bidCstRewardAmountMinLimit_);
				}
			}

			// #endregion
			// #region

			// Comment-202503162 relates and/or applies.
			uint256 ethBidPriceBase_ = super.getNextEthBidPriceAdvanced(int256(0));
			uint256 ethBidPrice_ = ethBidPriceBase_ + _getRoundLateBidPricePremiumAmountIfNeeded(ethBidPriceBase_, int256(0));
			uint256 paidEthPrice_ =
				(randomWalkNftId_ < int256(0)) ?
				ethBidPrice_ :
				getEthPlusRandomWalkNftBidPrice(ethBidPrice_);

			// #endregion
			// #region

			int256 overpaidEthPrice_ = int256(msg.value) - int256(paidEthPrice_);
			if (overpaidEthPrice_ == int256(0)) {
				// Comment-202605286 applies.
			} else if (overpaidEthPrice_ > int256(0)) {
				// Comment-202605288 applies.
				{
					// Comment-202606216 applies.
					// // #enable_asserts assert(tx.gasprice > 0);

					// // Comment-202607014 applies.
					// uint256 txGasPrice_ = tx.gasprice;
					// uint256 ethBidRefundAmountToSwallowMaxLimit_ =
					// 	(txGasPrice_ > 0) ?
					// 	(ethBidRefundAmountInGasToSwallowMaxLimit * txGasPrice_) :
					// 	type(uint256).max;

					uint256 ethBidRefundAmountToSwallowMaxLimit_ = ethBidRefundAmountInGasToSwallowMaxLimit * tx.gasprice;
					if (uint256(overpaidEthPrice_) <= ethBidRefundAmountToSwallowMaxLimit_) {
						overpaidEthPrice_ = int256(0);
						paidEthPrice_ = msg.value;
					}
				}
			} else {
				// Comment-202412045 applies.
				revert CosmicSignatureErrors.InsufficientReceivedBidAmount(/* "The current ETH bid price is greater than the amount you transferred.", */ paidEthPrice_, msg.value);
			}

			// #endregion
			// #region

			if (randomWalkNftId_ < int256(0)) {
				// #region //

				// // #enable_asserts assert(bidType_ == BidType.ETH);

				// #endregion
			} else {
				// #region

				if ( ! (usedRandomWalkNfts[uint256(randomWalkNftId_)] == 0) ) {
					revert CosmicSignatureErrors.UsedRandomWalkNft(
						// "This Random Walk NFT has already been used for bidding.",
						uint256(randomWalkNftId_)
					);
				}

				// Comment-202502091 applies.
				if ( ! (_msgSender() == randomWalkNft.ownerOf(uint256(randomWalkNftId_))) ) {

					revert CosmicSignatureErrors.CallerIsNotNftOwner(
						// "You are not the owner of this Random Walk NFT.",
						randomWalkNft,
						uint256(randomWalkNftId_),
						_msgSender()
					);
				}

				usedRandomWalkNfts[uint256(randomWalkNftId_)] = 1;
				// bidType_ = BidType.RandomWalk;

				// #endregion
			}

			// #endregion
			// #region

			{
				RoundStats storage roundStatsReference_ = roundStats[roundNum];

				// Comment-202609098 applies.
				BidRaffleWeightHelpers.saveForNextBid(roundStatsReference_, ethBidPriceBase_);

				roundStatsReference_.totalSpentEthAmount += paidEthPrice_;
				if (paidEthPrice_ > roundStatsReference_.maxEthBidPrice) {
					roundStatsReference_.maxEthBidPrice = paidEthPrice_;
				}
			}
			biddersInfo[roundNum][_msgSender()].totalSpentEthAmount += paidEthPrice_;
			if (lastBidderAddress == address(0)) {
				ethDutchAuctionBeginningBidPrice = ethBidPriceBase_ * CosmicSignatureConstants.ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;
			} else {
				_mintBidCstRewardAmountIfNeeded(lastBidderAddress, bidCstRewardAmount_);
			}

			// Comment-202501061 applies.
			nextEthBidPrice = CosmicSignatureHelpers.tryIncreaseValueExponentially(ethBidPriceBase_, ethBidPriceIncreaseDivisor) + 1;

			_bidCommon(/*bidType_,*/ message_);
			emit BidPlaced(
				roundNum,
				_msgSender(),
				int256(paidEthPrice_),
				-1,
				randomWalkNftId_,
				message_,
				bidCstRewardAmount_,

				// Comment-202611028 applies.
				// An ETH bid does not change this. But the first bid in a bidding round starts the CST Dutch auction,
				// and this is the price it starts at.
				_getCstDutchAuctionBeginningBidPrice(),

				mainPrizeTime
			);

			// #endregion
			// #region

			// Comment-202505096 applies.
			if (overpaidEthPrice_ > int256(0)) {
				// Comment-202506219 applies.
				CosmicSignatureHelpers.transferEthTo(payable(_msgSender()), uint256(overpaidEthPrice_));
			}

			// #endregion
		}

		// #endregion
	}

	// #endregion
	// #region `getNextEthBidPriceAdvanced`

	function getNextEthBidPriceAdvanced(int256 currentTimeOffset_) public view override (IBidding1V2, BiddingV2Base) virtual returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 ethBidPriceBase_ = super.getNextEthBidPriceAdvanced(currentTimeOffset_);
			return ethBidPriceBase_ + _getRoundLateBidPricePremiumAmountIfNeeded(ethBidPriceBase_, currentTimeOffset_);
		}
	}

	// #endregion
	// #region `_bidWithCst`

	function _bidWithCst(uint256 cstPriceMaxLimit_, string memory message_, uint256 bidCstRewardAmountMinLimit_) internal override /* virtual */ /* nonReentrant() */ /* _onlyRoundIsActive() */ {
		// Comment-202412251 applies.
		// #enable_asserts assert(_msgSender() != marketingWallet);

		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// Comment-202501045 applies.

			// This can be zero.
			uint256 bidCstRewardAmount_ = getBidCstRewardAmountAdvanced(int256(0));

			// Comment-202412045 applies.
			if ( ! (bidCstRewardAmount_ >= bidCstRewardAmountMinLimit_) ) {
				revert CosmicSignatureErrors.BidCstRewardAmountMinLimitNotReached(bidCstRewardAmount_, bidCstRewardAmountMinLimit_);
			}

			// Comment-202503162 relates and/or applies.
			uint256 cstBidPriceBase_ = _getNextCstBidPriceBaseAdvanced(int256(0));
			uint256 paidCstPrice_ = cstBidPriceBase_ + _getRoundLateBidPricePremiumAmountIfNeeded(_getCstBidPricePremiumBase(cstBidPriceBase_), int256(0));

			// Comment-202412045 applies.
			if ( ! (paidCstPrice_ <= cstPriceMaxLimit_) ) {
				revert CosmicSignatureErrors.InsufficientReceivedBidAmount(/* "The current CST bid price is greater than the maximum you allowed.", */ paidCstPrice_, cstPriceMaxLimit_);
			}

			// Comment-202609074 applies to `lastBidderAddress`.
			_burnCstBidPriceAndMintBidCstRewardAmountIfNeeded(lastBidderAddress, paidCstPrice_, bidCstRewardAmount_);

			{
				RoundStats storage roundStatsReference_ = roundStats[roundNum];
				uint256 ethBidPriceBase_ = super.getNextEthBidPriceAdvanced(int256(0));
				uint256 cstDutchAuctionBeginningBidPrice_ = _getCstDutchAuctionBeginningBidPrice();

				// Comment-202609098 applies.
				// [Comment-202611027]
				// The raffle weight of a CST bid is the concurrent ETH bid price base scaled by the fraction of
				// the CST Dutch auction beginning bid price that the bid pays, i.e., the fraction of the asking price paid.
				// So a CST bid placed when the CST bid price base has declined to zero gets a zero weight,
				// which makes waiting for a cheap CST bid cost raffle chances. Comment-202611029 applies.
				// The divisor can be zero only if the contract owner configures `bidCstRewardAmountMultiplier` so low that
				// the maximum CST Dutch auction beginning bid price or one main prize time increment of reward rounds to zero.
				// [/Comment-202611027]
				uint256 bidRaffleWeight_ =
					(cstDutchAuctionBeginningBidPrice_ > 0) ?
					(ethBidPriceBase_ * cstBidPriceBase_ / cstDutchAuctionBeginningBidPrice_) :
					0;

				BidRaffleWeightHelpers.saveForNextBid(roundStatsReference_, bidRaffleWeight_);
				++ roundStatsReference_.numCstBids;
				roundStatsReference_.totalSpentCstAmount += paidCstPrice_;
				if (paidCstPrice_ > roundStatsReference_.maxCstBidPrice) {
					roundStatsReference_.maxCstBidPrice = paidCstPrice_;
				}
			}
			biddersInfo[roundNum][_msgSender()].totalSpentCstAmount += paidCstPrice_;
			cstDutchAuctionBeginningTimeStamp = block.timestamp;

			// [Comment-202611024]
			// The next CST Dutch auction begins at twice the sum of the CST bid price base paid and one main prize time increment
			// of bid CST reward, but never above the maximum explained in Comment-202611025.
			// The additive increment of reward makes a CST bid placed at a zero price restart the auction at two increments of reward,
			// so a bidder waiting for free CST bids can place one at most every two main prize time increments,
			// gets no raffle weight for it (Comment-202611027), and lets the last bidder earn a full increment of reward meanwhile.
			// The doubling makes a sequence of prompt CST bids escalate geometrically, similarly to how ETH bids escalate.
			// [/Comment-202611024]
			uint256 newCstDutchAuctionBeginningBidPrice_ =
				Math.min(
					(cstBidPriceBase_ + _getBidCstRewardAmountPerMainPrizeTimeIncrement()) * CosmicSignatureConstants.CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER,
					_getCstDutchAuctionBeginningBidPriceMaxLimit()
				);

			cstDutchAuctionBeginningBidPrice = newCstDutchAuctionBeginningBidPrice_;
			lastCstBidderAddress = _msgSender();
			_bidCommon(/*BidType.CST,*/ message_);
			emit BidPlaced(
				roundNum,
				_msgSender(),
				-1,
				int256(paidCstPrice_),
				-1,
				message_,
				bidCstRewardAmount_,

				// Comment-202611028 applies.
				newCstDutchAuctionBeginningBidPrice_,

				mainPrizeTime
			);
		}
	}

	// #endregion
	// #region `getNextCstBidPriceAdvanced`

	function getNextCstBidPriceAdvanced(int256 currentTimeOffset_) public view override (IBidding1V2, BiddingV2Base) virtual returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 cstBidPriceBase_ = _getNextCstBidPriceBaseAdvanced(currentTimeOffset_);
			return cstBidPriceBase_ + _getRoundLateBidPricePremiumAmountIfNeeded(_getCstBidPricePremiumBase(cstBidPriceBase_), currentTimeOffset_);
		}
	}

	// #endregion
	// #region `getNextCstBidPriceBase`

	function getNextCstBidPriceBase() external view override returns (uint256) {
		return _getNextCstBidPriceBaseAdvanced(int256(0));
	}

	// #endregion
	// #region `getNextCstBidPriceBaseAdvanced`

	function getNextCstBidPriceBaseAdvanced(int256 currentTimeOffset_) external view override returns (uint256) {
		return _getNextCstBidPriceBaseAdvanced(currentTimeOffset_);
	}

	// #endregion
	// #region `_getNextCstBidPriceBaseAdvanced`

	/// @notice
	/// [Comment-202611023]
	/// The CST bid price declines by exactly the bid CST reward that the last bidder earns over the same time,
	/// i.e., by `bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds` per second.
	/// So the amount a CST bid burns plus all bid CST rewards minted since the CST Dutch auction began
	/// equals the CST Dutch auction beginning bid price, regardless of when the bid is placed.
	/// There is no separate decline rate parameter, so the CST side of the game scales with
	/// `bidCstRewardAmountMultiplier` and `mainPrizeTimeIncrementInMicroSeconds` and never drifts away from them.
	/// [/Comment-202611023]
	/// @param currentTimeOffset_ Comment-202501107 applies.
	/// @return The CST bid price without the late-bid premium.
	function _getNextCstBidPriceBaseAdvanced(int256 currentTimeOffset_) private view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// This can be negative.
			// Comment-202608052 applies.
			int256 cstDutchAuctionElapsedDuration_ = int256(_getCstDutchAuctionElapsedDuration()) + currentTimeOffset_;

			uint256 cstDutchAuctionBeginningBidPrice_ = _getCstDutchAuctionBeginningBidPrice();
			uint256 cstBidPriceDeclineAmount_ = _getBidCstRewardAmountForDuration(cstDutchAuctionElapsedDuration_);
			return (cstDutchAuctionBeginningBidPrice_ > cstBidPriceDeclineAmount_) ? (cstDutchAuctionBeginningBidPrice_ - cstBidPriceDeclineAmount_) : 0;
		}
	}

	// #endregion
	// #region `_getCstDutchAuctionBeginningBidPrice`

	/// @return The price the current CST Dutch auction began at.
	/// [Comment-202611025]
	/// Each bidding round's first CST Dutch auction begins at the reward of the initial duration until main prize,
	/// which is also the maximum any CST Dutch auction can begin at. So the CST bid price and the initial countdown
	/// to `mainPrizeTime` start together on the round's first bid and would reach zero together.
	/// The maximum bounds how long the CST side can stay expensive after a sequence of CST bids
	/// to one initial duration until main prize.
	/// V2- instead carried `nextRoundFirstCstDutchAuctionBeginningBidPrice` from round to round.
	/// V3+ neither reads nor writes it, nor `cstDutchAuctionBeginningBidPriceMinLimit`.
	/// [/Comment-202611025]
	function _getCstDutchAuctionBeginningBidPrice() private view returns (uint256) {
		// Comment-202605197 applies to `cstDutchAuctionBeginningBidPrice`.
		return (lastCstBidderAddress == address(0)) ? _getCstDutchAuctionBeginningBidPriceMaxLimit() : cstDutchAuctionBeginningBidPrice;
	}

	// #endregion
	// #region `_getCstDutchAuctionBeginningBidPriceMaxLimit`

	/// @return The bid CST reward for holding the last bidder position during the initial duration until main prize.
	/// Comment-202611025 applies.
	/// @dev This equals `_getBidCstRewardAmountForDuration(getInitialDurationUntilMainPrize())`, up to rounding.
	/// Comment-202611031 relates.
	function _getCstDutchAuctionBeginningBidPriceMaxLimit() private view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return bidCstRewardAmountMultiplier / initialDurationUntilMainPrizeDivisor;
		}
	}

	// #endregion
	// #region `_getBidCstRewardAmountPerMainPrizeTimeIncrement`

	/// @return The bid CST reward for holding the last bidder position during one main prize time increment.
	/// @dev This equals `_getBidCstRewardAmountForDuration(getMainPrizeTimeIncrement())`, up to rounding.
	function _getBidCstRewardAmountPerMainPrizeTimeIncrement() private view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return bidCstRewardAmountMultiplier / CosmicSignatureConstants.MICROSECONDS_PER_SECOND;
		}
	}

	// #endregion
	// #region `_getCstBidPricePremiumBase`

	/// @notice
	/// [Comment-202611026]
	/// The late-bid premium of an ETH bid is calculated from the ETH bid price base, which is never zero.
	/// The CST bid price base can be zero, and zero times any premium multiplier would still be zero,
	/// so the premium of a CST bid is calculated from at least one main prize time increment of reward.
	/// This way, a last-minute CST bid is never free, even if nobody placed a CST bid for a long time.
	/// [/Comment-202611026]
	/// @param cstBidPriceBase_ The CST bid price without the late-bid premium.
	/// @return The amount the late-bid premium of a CST bid is calculated from.
	function _getCstBidPricePremiumBase(uint256 cstBidPriceBase_) private view returns (uint256) {
		return Math.max(cstBidPriceBase_, _getBidCstRewardAmountPerMainPrizeTimeIncrement());
	}

	// #endregion
	// #region `getCstDutchAuctionDurations`

	function getCstDutchAuctionDurations() external view override /* virtual */ returns (uint256, uint256) {
		uint256 cstDutchAuctionDuration_ = _getCstDutchAuctionDuration();
		uint256 cstDutchAuctionElapsedDuration_ = _getCstDutchAuctionElapsedDuration();
		return (cstDutchAuctionDuration_, cstDutchAuctionElapsedDuration_);
	}

	// #endregion
	// #region `_getCstDutchAuctionDuration`

	/// @return The duration from the current CST Dutch auction beginning until the CST bid price base reaches zero.
	/// This is the beginning bid price divided by the per-second decline, rounded up. Comment-202611023 applies.
	function _getCstDutchAuctionDuration() private view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 bidCstRewardAmountMultiplierCopy_ = bidCstRewardAmountMultiplier;

			// Issue. If the contract owner sets `bidCstRewardAmountMultiplier` to zero, the CST bid price never declines,
			// so the duration is infinite. Returning the maximum value instead of panicking keeps this getter usable.
			if (bidCstRewardAmountMultiplierCopy_ == 0) {
				return type(uint256).max;
			}

			uint256 cstDutchAuctionBeginningBidPrice_ = _getCstDutchAuctionBeginningBidPrice();
			uint256 cstDutchAuctionDuration_ =
				(cstDutchAuctionBeginningBidPrice_ * mainPrizeTimeIncrementInMicroSeconds + (bidCstRewardAmountMultiplierCopy_ - 1)) /
				bidCstRewardAmountMultiplierCopy_;
			return cstDutchAuctionDuration_;
		}
	}

	// #endregion
	// #region `_getRoundLateBidPricePremiumAmountIfNeeded`

	/// @notice The premium affects prices bidders are required to pay and paid-amount stats only;
	/// price updates and raffle weights use the base price.
	/// @param roundLateBidPricePremiumBase_ The amount the premium is calculated from.
	/// As mentioned in Comment-202607119, if it's zero the result will be zero as well.
	/// @return roundLateBidPricePremiumAmount_ The premium amount to add to the bid price. This can be zero.
	function _getRoundLateBidPricePremiumAmountIfNeeded(uint256 roundLateBidPricePremiumBase_, int256 currentTimeOffset_) private view returns (uint256 roundLateBidPricePremiumAmount_) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			if (lastBidderAddress != address(0)) {
				uint256 roundLateBidDuration_ = getRoundLateBidDuration();
				int256 durationUntilMainPrize_ = getDurationUntilMainPrize() - currentTimeOffset_;

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
					// This cannot overflow with the default parameters.
					// Comment-202412033 relates.
					// This can be zero.
					// [/Comment-202607119]
					roundLateBidPricePremiumAmount_ =
						( (uint256(roundLateBidElapsedDuration_) * roundLateBidPricePremiumAmountBaseMultiplier / mainPrizeTimeIncrementInMicroSeconds) ** roundLateBidPricePremiumAmountExponent *
						  roundLateBidPricePremiumBase_
						) >>
						(roundLateBidPricePremiumAmountExponent * CosmicSignatureConstants.ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_RESOLUTION_EXPONENT);
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

	function getBidCstRewardAmountAdvanced(int256 currentTimeOffset_) public view override (IBidding1V2, BiddingV2Base) virtual returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// Comment-202501022 applies.
			// And that's OK, because no bid CST reward is minted on the first bid in a bidding round.
			uint256 lastBidTimeStampCopy_ = biddersInfo[roundNum][lastBidderAddress].lastBidTimeStamp;

			int256 elapsedDuration_ = int256(block.timestamp) + currentTimeOffset_ - int256(lastBidTimeStampCopy_);
			return _getBidCstRewardAmountForDuration(elapsedDuration_);
		}
	}

	// #endregion
	// #region `_getBidCstRewardAmountForDuration`

	/// @param duration_ The duration the last bidder position was held for, in seconds. This can be negative.
	/// @return The bid CST reward for holding the last bidder position for the given duration.
	/// Zero if the duration is not positive.
	function _getBidCstRewardAmountForDuration(int256 duration_) private view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 bidCstRewardAmount_ = 0;
			if (duration_ > int256(0)) {
				// Comment-202607167 applies.
				bidCstRewardAmount_ = uint256(duration_) * bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds;
			}
			return bidCstRewardAmount_;
		}
	}

	// #endregion
}

// #endregion
