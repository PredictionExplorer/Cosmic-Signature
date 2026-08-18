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
import { RaffleWeightHelpers } from "./libraries/RaffleWeightHelpers.sol";
import { ICosmicSignatureToken } from "./interfaces/ICosmicSignatureToken.sol";
import { IBidding1V2 } from "./interfaces/IBidding1V2.sol";
import { BiddingV2Base } from "./BiddingV2Base.sol";
import { CosmicSignatureGameStorageV3Base } from "./CosmicSignatureGameStorageV3Base.sol";
import { IBiddingV3 } from "./interfaces/IBiddingV3.sol";

// #endregion
// #region

abstract contract BiddingV3 is
	BiddingV2Base,
	CosmicSignatureGameStorageV3Base,
	// BidStatisticsV3,
	IBiddingV3 {
	// #region `_bidWithEth`

	/// @dev Comment-202412045 applies to `_onlyIfNoBidPlacedWithinCurrentSecond`.
	function _bidWithEth(int256 randomWalkNftId_, string memory message_, uint256 bidCstRewardAmountMinLimit_) internal override /* virtual */ /* nonReentrant() */ /* _onlyRoundIsActive() */ _onlyIfNoBidPlacedWithinCurrentSecond() {
		// #region //

		// BidType bidType_;

		// #endregion
		// #region

		// [Comment-202608166]
		// The bid CST reward is minted only if there is a previous bidder, that is only if
		// at least 1 bid has already been placed in the current bidding round.
		// [/Comment-202608166]
		uint256 bidCstRewardAmount_ = 0;
		if (lastBidderAddress != address(0)) {
			// [Comment-202608022]
			// `_onlyIfNoBidPlacedWithinCurrentSecond` guarantees that at least 1 second has elapsed since the last bid,
			// so under a sane configuration this is a nonzero.
			// But if the contract owner configures `bidCstRewardAmountMultiplier` to a zero
			// or to a nonzero lesser than `mainPrizeTimeIncrementInMicroSeconds`, this can floor to zero.
			// Comment-202608177 relates.
			// [/Comment-202608022]
			bidCstRewardAmount_ = getBidCstRewardAmountAdvanced(int256(0));

			// Comment-202412045 applies.
			// Comment-202608124 applies.
			_checkBidCstRewardAmountMinLimit(bidCstRewardAmount_, bidCstRewardAmountMinLimit_);
		}

		// #endregion
		// #region

		// Comment-202503162 relates and/or applies.
		// Comment-202608271 applies.
		// The premium-free base price is the V2 price: the same `super` call that `getNextEthBidPriceAdvanced` wraps.
		uint256 ethBidPriceBase_ = super.getNextEthBidPriceAdvanced(int256(0));
		uint256 ethBidPrice_ = _addRoundLateBidPricePremiumAmountIfNeeded(ethBidPriceBase_, int256(0));
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
			revert CosmicSignatureErrors.InsufficientReceivedBidAmount("The current ETH bid price is greater than the amount you transferred.", paidEthPrice_, msg.value);
		}

		// #endregion
		// #region

		if (randomWalkNftId_ < int256(0)) {
			// #region //

			// // #enable_asserts assert(bidType_ == BidType.ETH);

			// #endregion
		} else {
			// #region

			require(
				usedRandomWalkNfts[uint256(randomWalkNftId_)] == 0,
				CosmicSignatureErrors.UsedRandomWalkNft(
					"This Random Walk NFT has already been used for bidding.",
					uint256(randomWalkNftId_)
				)
			);
			require(
				// Comment-202502091 applies.
				_msgSender() == randomWalkNft.ownerOf(uint256(randomWalkNftId_)),

				CosmicSignatureErrors.CallerIsNotNftOwner(
					"You are not the owner of this Random Walk NFT.",
					randomWalkNft,
					uint256(randomWalkNftId_),
					_msgSender()
				)
			);
			usedRandomWalkNfts[uint256(randomWalkNftId_)] = 1;
			// bidType_ = BidType.RandomWalk;

			// #endregion
		}

		// #endregion
		// #region

		biddersInfo[roundNum][_msgSender()].totalSpentEthAmount += paidEthPrice_;

		// [Comment-202608177]
		// This branch is keyed on `lastBidderAddress`, not on `bidCstRewardAmount_ == 0`.
		// Given Comment-202608022, under a sane configuration the two conditions are equivalent.
		// But if the contract owner configures `bidCstRewardAmountMultiplier` to a zero
		// or to a nonzero lesser than `mainPrizeTimeIncrementInMicroSeconds`,
		// `bidCstRewardAmount_` can floor to zero on a non-first bid as well.
		// Keying on `bidCstRewardAmount_` would then overwrite `ethDutchAuctionBeginningBidPrice` mid-round,
		// corrupting the next bidding round's ETH Dutch auction beginning bid price.
		// [/Comment-202608177]
		if (lastBidderAddress == address(0)) {
			// Comment-202608022 relates.
			// #enable_asserts assert(bidCstRewardAmount_ == 0);

			// Comment-202608271 applies.
			ethDutchAuctionBeginningBidPrice = ethBidPriceBase_ * CosmicSignatureConstants.ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;
		} else if (bidCstRewardAmount_ > 0) {
			_mintBidCstRewardAmount(bidCstRewardAmount_);
		}

		// Comment-202501061 applies.
		// Comment-202608271 applies.
		nextEthBidPrice = CosmicSignatureHelpers.tryIncreaseValueExponentially(ethBidPriceBase_, ethBidPriceIncreaseDivisor) + 1;

		uint256 newCstBidPriceDeclineMultiplier_ = _tryIncreaseCstBidPriceDeclineMultiplier();
		_bidCommon(/*bidType_,*/ message_);

		// Comment-202608262 applies.
		_appendBidRaffleWeight(ethBidPriceBase_);

		// Comment-202608122 applies.
		_emitBidPlaced(int256(paidEthPrice_), -1, randomWalkNftId_, message_, bidCstRewardAmount_, newCstBidPriceDeclineMultiplier_);

		// #endregion
		// #region

		// Comment-202505096 applies.
		if (overpaidEthPrice_ > int256(0)) {
			// // #enable_asserts // #disable_smtchecker uint256 gasUsed1_ = gasleft();
			// // #enable_asserts // #disable_smtchecker uint256 gasUsed2_ = gasleft();

			// Comment-202506219 applies.
			{
				// Comment-202502043 applies.
				(bool isSuccess_, ) = _msgSender().call{value: uint256(overpaidEthPrice_)}("");

				if ( ! isSuccess_ ) {
					revert CosmicSignatureErrors.FundTransferFailed("ETH refund transfer failed.", _msgSender(), uint256(overpaidEthPrice_));
				}
			}

			// // #enable_asserts // #disable_smtchecker gasUsed2_ -= gasleft();
			// // #enable_asserts // #disable_smtchecker gasUsed1_ -= gasleft();
			// // #enable_asserts // #disable_smtchecker uint256 accurateGasUsed_ = gasUsed2_ - (gasUsed1_ - gasUsed2_);
			// // #enable_asserts // #disable_smtchecker console.log("Gas Used =", gasUsed1_, gasUsed2_, accurateGasUsed_);
		}

		// #endregion
	}

	// #endregion
	// #region `getNextEthBidPriceAdvanced`

	function getNextEthBidPriceAdvanced(int256 currentTimeOffset_) public view override (IBidding1V2, BiddingV2Base) virtual returns (uint256) {
		// // #enable_smtchecker /*
		// unchecked
		// // #enable_smtchecker */

		return _addRoundLateBidPricePremiumAmountIfNeeded(super.getNextEthBidPriceAdvanced(currentTimeOffset_), currentTimeOffset_);
	}

	// #endregion
	// #region `_bidWithCst`

	/// @dev Comment-202412045 applies to `_onlyIfNoBidPlacedWithinCurrentSecond`.
	function _bidWithCst(uint256 priceMaxLimit_, string memory message_, uint256 bidCstRewardAmountMinLimit_) internal override /* virtual */ /* nonReentrant() */ /* _onlyRoundIsActive() */ _onlyIfNoBidPlacedWithinCurrentSecond() {
		// Comment-202412251 applies.
		// #enable_asserts assert(_msgSender() != marketingWallet);

		// [Comment-202608167]
		// Comment-202501045 relates.
		// Comment-202501044 relates.
		// In V3+, we fully validate here, rather than relying on the equivalent validation in `_bidCommon`,
		// which executes near the end of this method.
		// That's because in V3+ the bid CST reward is minted to `lastBidderAddress`.
		// If no bids have been placed in the current bidding round yet, that address is zero,
		// so without this validation `_burnCstBidPriceAndMintBidCstRewardAmount` would revert
		// with an unhelpful `ERC20InvalidReceiver` error.
		// The validation order matches the one in `_bidCommon`, so this transaction reverts with the same error
		// with which it would revert in V2-.
		// [/Comment-202608167]
		if (lastBidderAddress == address(0)) {
			// Comment-202411169 relates.
			_checkRoundIsActive();

			// Comment-202501044 relates and/or applies.
			revert CosmicSignatureErrors.WrongBidType("The first bid in a bidding round shall be ETH.");
		}

		// Comment-202608022 applies.
		uint256 bidCstRewardAmount_ = getBidCstRewardAmountAdvanced(int256(0));

		// Comment-202412045 applies.
		// Comment-202608124 applies.
		_checkBidCstRewardAmountMinLimit(bidCstRewardAmount_, bidCstRewardAmountMinLimit_);

		// Comment-202503162 relates and/or applies.
		// Comment-202608271 applies.
		uint256 cstBidPriceBase_ = _getNextCstBidPriceBase(int256(0));
		uint256 paidPrice_ = _addRoundLateBidPricePremiumAmountIfNeeded(cstBidPriceBase_, int256(0));

		// Comment-202412045 applies.
		if ( ! (paidPrice_ <= priceMaxLimit_) ) {
			revert CosmicSignatureErrors.InsufficientReceivedBidAmount("The current CST bid price is greater than the maximum you allowed.", paidPrice_, priceMaxLimit_);
		}

		_burnCstBidPriceAndMintBidCstRewardAmount(paidPrice_, bidCstRewardAmount_);
		biddersInfo[roundNum][_msgSender()].totalSpentCstAmount += paidPrice_;
		cstDutchAuctionBeginningTimeStamp = block.timestamp;

		// // todo-0 The following is actually nonsense because someone else gets bid CST reward.
		// // todo-0 But not if the same bidder bids again.
		// // todo-0 Think again and maybe discuss.
		// //
		// // Doubling the effective paid CST price.
		// //
		// // todo-0 Is this a good idea?
		// // todo-0 Bid CST reward will begin increasing from zero after this bid.
		// // todo-0 Problem is that the logic kinda gets disrupted by ETH bids, because they also reset bid CST reward.
		// // todo-0 So when ETH bid price becomes high enough to discourage ETH bids, CST bids immediately become more appealing,
		// // todo-0 because ETH bids no longer reset CST bid rewards,
		// // todo-0 which results in lots of consequitive CST bids towards the end of the round.
		// // todo-0 One might want to maintain separate CST rewards for ETH and CST bids,
		// // todo-0 so that the bids didn't reset each other's rewards. I am not sure if that's a good idea.
		// // todo-0 
		// // todo-0 V2 simply doubles `paidPrice_` here.
		// // todo-0 That is in some way better because if bid CST reward gets reset by an ETH bid, on next CST bid `paidPrice_` is lower,
		// // todo-0 so CST bids get an instant priority boost, which, in turn, goes away as soon as people stop bidding with ETH.
		// // todo-0 
		// // todo-0 Try to write a better comment.
		// uint256 newCstDutchAuctionBeginningBidPrice_ =
		// 	uint256(
		// 		CosmicSignatureHelpers.max(
		// 			(int256(paidPrice_) - int256(bidCstRewardAmount_)) * int256(CosmicSignatureConstants.CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER),
		// 			int256(cstDutchAuctionBeginningBidPriceMinLimit)
		// 		)
		// 	);

		// Comment-202608271 applies.
		uint256 newCstDutchAuctionBeginningBidPrice_ =
			Math.max(cstBidPriceBase_ * CosmicSignatureConstants.CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER, cstDutchAuctionBeginningBidPriceMinLimit);
		cstDutchAuctionBeginningBidPrice = newCstDutchAuctionBeginningBidPrice_;
		if (lastCstBidderAddress == address(0)) {
			// Comment-202501045 applies.

			// Comment-202504212 applies.
			nextRoundFirstCstDutchAuctionBeginningBidPrice = newCstDutchAuctionBeginningBidPrice_;
		}
		lastCstBidderAddress = _msgSender();
		uint256 newCstBidPriceDeclineMultiplier_ = _tryReduceCstBidPriceDeclineMultiplier();

		// Comment-202608262 applies.
		// The premium-free base is the V2 price: the same `super` call that `getNextEthBidPriceAdvanced` wraps.
		uint256 bidRaffleWeight_ = super.getNextEthBidPriceAdvanced(int256(0));

		_bidCommon(/*BidType.CST,*/ message_);
		_appendBidRaffleWeight(bidRaffleWeight_);

		// Comment-202608122 applies.
		_emitBidPlaced(-1, int256(paidPrice_), -1, message_, bidCstRewardAmount_, newCstBidPriceDeclineMultiplier_);
	}

	// #endregion
	// #region `_checkBidCstRewardAmountMinLimit`

	/// @dev
	/// [Comment-202608124]
	/// This method validates the given bid CST reward amount against the given min limit
	/// on behalf of both `_bidWithEth` and `_bidWithCst`.
	/// Comment-202608122 applies.
	/// [/Comment-202608124]
	function _checkBidCstRewardAmountMinLimit(uint256 bidCstRewardAmount_, uint256 bidCstRewardAmountMinLimit_) private pure {
		if ( ! (bidCstRewardAmount_ >= bidCstRewardAmountMinLimit_) ) {
			revert CosmicSignatureErrors.BidCstRewardAmountMinLimitNotReached(bidCstRewardAmount_, bidCstRewardAmountMinLimit_);
		}
	}

	// #endregion
	// #region `_emitBidPlaced`

	/// @dev
	/// [Comment-202608122]
	/// This method emits the `BidPlaced` event on behalf of both `_bidWithEth` and `_bidWithCst`.
	/// Emitting it in a shared method, rather than in each of them, reduces contract bytecode size,
	/// which is at a premium, given that it's close to exceeding the max limit.
	/// [/Comment-202608122]
	function _emitBidPlaced(
		int256 paidEthPrice_,
		int256 paidCstPrice_,
		int256 randomWalkNftId_,
		string memory message_,
		uint256 bidCstRewardAmount_,
		uint256 newCstBidPriceDeclineMultiplier_
	) private {
		emit BidPlaced(
			roundNum,
			_msgSender(),
			paidEthPrice_,
			paidCstPrice_,
			randomWalkNftId_,
			message_,
			bidCstRewardAmount_,
			newCstBidPriceDeclineMultiplier_,
			mainPrizeTime
		);
	}

	// #endregion
	// #region `getNextCstBidPriceAdvanced`

	/// @dev This adds the V3 late bid price premium on top of the premium-free `_getNextCstBidPriceBase`.
	/// A zero base stays a zero (Comment-202607119), like it did before the split.
	function getNextCstBidPriceAdvanced(int256 currentTimeOffset_) public view override (IBidding1V2, BiddingV2Base) virtual returns (uint256) {
		return _addRoundLateBidPricePremiumAmountIfNeeded(_getNextCstBidPriceBase(currentTimeOffset_), currentTimeOffset_);
	}

	// #endregion
	// #region `_getNextCstBidPriceBase`

	/// @notice Calculates the premium-free CST bid price: the V3 linear price decline
	/// without the V3 late bid price premium.
	/// Comment-202608271 applies: this is what every stored price update consumes.
	function _getNextCstBidPriceBase(int256 currentTimeOffset_) private view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// This can be negative.
			// Comment-202608052 applies.
			int256 cstDutchAuctionElapsedDuration_ = int256(_getCstDutchAuctionElapsedDuration()) + currentTimeOffset_;

			// Comment-202501307 relates and/or applies.
			uint256 cstDutchAuctionBeginningBidPrice_ =
				(lastCstBidderAddress == address(0)) ? nextRoundFirstCstDutchAuctionBeginningBidPrice : cstDutchAuctionBeginningBidPrice;

			int256 nextCstBidPrice_ = int256(cstDutchAuctionBeginningBidPrice_) - cstDutchAuctionElapsedDuration_ * int256(cstBidPriceDeclineMultiplier);
			if (nextCstBidPrice_ <= int256(0)) {
				return 0;
			}
			return uint256(nextCstBidPrice_);
		}
	}

	// #endregion
	// #region `_appendBidRaffleWeight`

	/// @notice Appends the given bid raffle weight for the bid that `_bidCommon` has just recorded.
	/// Comment-202608261 applies.
	/// Comment-202608262 applies.
	function _appendBidRaffleWeight(uint256 bidRaffleWeight_) private {
		// Comment-202608262 applies.
		// #enable_asserts assert(bidRaffleWeight_ > 0);

		RaffleWeightHelpers.appendWeight(bidRaffleCumulativeWeights[roundNum], bidderAddresses[roundNum].numItems - 1, bidRaffleWeight_);
	}

	// #endregion
	// #region `_onlyIfNoBidPlacedWithinCurrentSecond`

	modifier _onlyIfNoBidPlacedWithinCurrentSecond() {
		_checkIfNoBidPlacedWithinCurrentSecond();
		_;
	}

	// #endregion
	// #region `_checkIfNoBidPlacedWithinCurrentSecond`

	/// @notice This restriction makes life of bots a little more difficult, while manual bidders rarely run into it.
	/// @dev
	/// [Comment-202608265]
	/// This is `internal virtual`, rather than `private`, only to serve as a test seam:
	/// the test-only `SpecialCosmicSignatureGameV3` overrides it with a no-op to prove that
	/// the weighted bidder raffle (Comment-202608261) keeps working unchanged with multiple bids
	/// placed within a single second. Production behavior is unchanged.
	/// [/Comment-202608265]
	function _checkIfNoBidPlacedWithinCurrentSecond() internal view virtual {
		// It's OK if `lastBidderAddress` is zero.
		uint256 lastBidTimeStampCopy_ = biddersInfo[roundNum][lastBidderAddress].lastBidTimeStamp;

		if ( ! (block.timestamp != lastBidTimeStampCopy_) ) {
			revert CosmicSignatureErrors.BidPlacedWithinCurrentSecond();
		}
	}

	// #endregion
	// #region `_tryIncreaseCstBidPriceDeclineMultiplier`

	function _tryIncreaseCstBidPriceDeclineMultiplier() private returns (uint256) {
		// // #enable_smtchecker /*
		// unchecked
		// // #enable_smtchecker */
		{
			// // todo-0 Test what this equals.
			// uint256 bidCstRewardAmountPerSecond_ = bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds;
			// uint256 cstBidPriceDeclineEffectiveMultiplier_ = cstBidPriceDeclineMultiplier + bidCstRewardAmountPerSecond_;
			// cstBidPriceDeclineEffectiveMultiplier_ = CosmicSignatureHelpers.tryIncreaseValueExponentially(cstBidPriceDeclineEffectiveMultiplier_, cstBidPriceDeclineMultiplierChangeDivisor);
			// int256 newCstBidPriceDeclineMultiplier_ = int256(cstBidPriceDeclineEffectiveMultiplier_) - int256(bidCstRewardAmountPerSecond_);
			// // #enable_asserts assert(newCstBidPriceDeclineMultiplier_ > int256(0));
			// cstBidPriceDeclineMultiplier = uint256(newCstBidPriceDeclineMultiplier_);

			uint256 newCstBidPriceDeclineMultiplier_ =
				CosmicSignatureHelpers.tryIncreaseValueExponentially(cstBidPriceDeclineMultiplier, cstBidPriceDeclineMultiplierChangeDivisor);
			cstBidPriceDeclineMultiplier = newCstBidPriceDeclineMultiplier_;
			return newCstBidPriceDeclineMultiplier_;
		}
	}

	// #endregion
	// #region `_tryReduceCstBidPriceDeclineMultiplier`

	function _tryReduceCstBidPriceDeclineMultiplier() private returns (uint256) {
		// // #enable_smtchecker /*
		// unchecked
		// // #enable_smtchecker */
		{
			// // todo-0 Test what this equals.
			// uint256 bidCstRewardAmountPerSecond_ = bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds;
			// uint256 cstBidPriceDeclineEffectiveMultiplier_ = cstBidPriceDeclineMultiplier + bidCstRewardAmountPerSecond_;
			// cstBidPriceDeclineEffectiveMultiplier_ = CosmicSignatureHelpers.tryReduceValueExponentially(cstBidPriceDeclineEffectiveMultiplier_, cstBidPriceDeclineMultiplierChangeDivisor);
			// int256 newCstBidPriceDeclineMultiplier_ = int256(cstBidPriceDeclineEffectiveMultiplier_) - int256(bidCstRewardAmountPerSecond_);
			// if (newCstBidPriceDeclineMultiplier_ <= int256(0)) {
			// 	newCstBidPriceDeclineMultiplier_ = int256(1);
			// }
			// cstBidPriceDeclineMultiplier = uint256(newCstBidPriceDeclineMultiplier_);

			uint256 newCstBidPriceDeclineMultiplier_ =
				CosmicSignatureHelpers.tryReduceValueExponentially(cstBidPriceDeclineMultiplier, cstBidPriceDeclineMultiplierChangeDivisor);
			cstBidPriceDeclineMultiplier = newCstBidPriceDeclineMultiplier_;
			return newCstBidPriceDeclineMultiplier_;
		}
	}

	// #endregion
	// #region `getCstDutchAuctionDurations`

	function getCstDutchAuctionDurations() external view override /* virtual */ returns (uint256, uint256) {
		// // #enable_smtchecker /*
		// unchecked
		// // #enable_smtchecker */

		uint256 cstDutchAuctionDuration_ = _getCstDutchAuctionDuration();
		uint256 cstDutchAuctionElapsedDuration_ = _getCstDutchAuctionElapsedDuration();
		return (cstDutchAuctionDuration_, cstDutchAuctionElapsedDuration_);
	}

	// #endregion
	// #region `_getCstDutchAuctionDuration`

	/// @notice Comment-202607293 relates.
	function _getCstDutchAuctionDuration() private view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// Comment-202501307 relates and/or applies.
			uint256 cstDutchAuctionBeginningBidPrice_ =
				(lastCstBidderAddress == address(0)) ? nextRoundFirstCstDutchAuctionBeginningBidPrice : cstDutchAuctionBeginningBidPrice;

			uint256 cstDutchAuctionDuration_ = (cstDutchAuctionBeginningBidPrice_ + (cstBidPriceDeclineMultiplier - 1)) / cstBidPriceDeclineMultiplier;
			return cstDutchAuctionDuration_;
		}
	}

	// #endregion
	// #region `_addRoundLateBidPricePremiumAmountIfNeeded`

	/// @param bidPrice_ As mentioned in Comment-202607119, if it's zero the result will be zero as well.
	/// @dev Comment-202608271 applies: the premium is a one-time toll on the bid that pays it;
	/// stored price state always updates from the premium-free base price.
	/// todo-0 Test this. Really, all new code needs testing.
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
					// todo-0 Test the actual multiplier and its exponential growth.
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

	function getBidCstRewardAmountAdvanced(int256 currentTimeOffset_) public view override (IBidding1V2, BiddingV2Base) virtual returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// [Comment-202608176]
			// In V3+, there is no bid CST reward for the first bid in a bidding round,
			// because the reward is minted to the previous bidder, and there is no previous bidder to reward.
			// So this method returns zero until someone places the first bid in the current bidding round.
			// [/Comment-202608176]
			if (lastBidderAddress == address(0)) {
				return 0;
			}

			uint256 lastBidTimeStampCopy_ = biddersInfo[roundNum][lastBidderAddress].lastBidTimeStamp;

			int256 elapsedDuration_ = int256(block.timestamp) + currentTimeOffset_ - int256(lastBidTimeStampCopy_);
			uint256 bidCstRewardAmount_ = 0;
			if (elapsedDuration_ > int256(0)) {
				// Comment-202607167 applies.
				// todo-0 Test what this equals.
				bidCstRewardAmount_ = uint256(elapsedDuration_) * bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds;
			}
			return bidCstRewardAmount_;
		}
	}

	// #endregion
	// #region `_mintBidCstRewardAmount`

	/// @notice Mints the given bid CST reward amount to the previous bidder.
	/// @param bidCstRewardAmount_ The CST amount to mint.
	/// The caller is required to ensure that it's a nonzero.
	function _mintBidCstRewardAmount(uint256 bidCstRewardAmount_) private {
		// // #enable_smtchecker /*
		// unchecked
		// // #enable_smtchecker */

		// [Comment-202607263]
		// The caller, `_bidWithEth`, calls this method only with a nonzero amount, near Comment-202608166.
		// If this wasn't guaranteed it would make sense to check this before minting.
		// [/Comment-202607263]
		// #enable_asserts assert(bidCstRewardAmount_ > 0);

		// `_bidWithEth` calls this method only when there is a previous bidder, near Comment-202608166.
		// #enable_asserts assert(lastBidderAddress != address(0));

		// [Comment-202607163]
		// `CosmicSignatureToken` performs no call into the token recipient, neither on a minting nor on a transfer,
		// so a hostile last bidder contract that reverts on any incoming call or token callback
		// cannot prevent this minting from succeeding, and therefore cannot block further bids.
		// [/Comment-202607163]
		token.mint(lastBidderAddress, bidCstRewardAmount_);
	}

	// #endregion
	// #region `_burnCstBidPriceAndMintBidCstRewardAmount`

	/// @notice Burns the given CST bid price from the caller and mints the given bid CST reward amount
	/// to the previous bidder.
	/// @param cstBidPrice_ The CST amount to burn. May be zero, but unlikely is.
	/// @param bidCstRewardAmount_ The CST amount to mint.
	/// Comment-202608022 applies.
	function _burnCstBidPriceAndMintBidCstRewardAmount(uint256 cstBidPrice_, uint256 bidCstRewardAmount_) private {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			ICosmicSignatureToken.MintOrBurnSpec[] memory mintAndBurnSpecs_ = new ICosmicSignatureToken.MintOrBurnSpec[](2);
			mintAndBurnSpecs_[0].account = _msgSender();

			// Comment-202409177 applies.
			// Comment-202606074 relates and/or applies.
			mintAndBurnSpecs_[0].value = ( - int256(cstBidPrice_) );

			// [Comment-202607164]
			// This is guaranteed to be a nonzero, thanks to the validation near Comment-202608167.
			// [/Comment-202607164]
			// Comment-202607163 applies.
			mintAndBurnSpecs_[1].account = lastBidderAddress;
			// #enable_asserts assert(lastBidderAddress != address(0));

			mintAndBurnSpecs_[1].value = int256(bidCstRewardAmount_);
			token.mintAndBurnMany(mintAndBurnSpecs_);
		}
	}

	// #endregion
}

// #endregion
