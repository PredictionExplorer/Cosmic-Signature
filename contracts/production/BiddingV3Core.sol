// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureHelpers } from "./libraries/CosmicSignatureHelpers.sol";
import { RaffleWeightHelpers } from "./libraries/RaffleWeightHelpers.sol";
import { ICosmicSignatureToken } from "./interfaces/ICosmicSignatureToken.sol";
import { IBidding1V2 } from "./interfaces/IBidding1V2.sol";
import { IBidding2V3 } from "./interfaces/IBidding2V3.sol";
import { CosmicSignatureGameStorageV3Core } from "./CosmicSignatureGameStorageV3Core.sol";
import { BiddingCommonV3Core } from "./BiddingCommonV3Core.sol";
import { MainPrizeCommonV3Core } from "./MainPrizeCommonV3Core.sol";
import { BidStatisticsV3Core } from "./BidStatisticsV3Core.sol";

// #endregion
// #region

/// @notice
/// [Comment-202608249]
/// This is the V3+ Game implementation contract fork of the bid placement logic: the entry points of
/// `BiddingV2Base` (`receive`, `bidWithEth`, `bidWithCst`) merged with the V3 bid bodies and formulas of `BiddingV3`,
/// re-parented onto the `internal`-visibility storage chassis (Comment-202608243). Comment-202608244 applies:
/// the bid-with-donation combinations, `halveEthDutchAuctionEndingBidPrice`, and every external view
/// live in the delegatecall modules via the original mixins; the retained logic is byte-for-byte the original.
/// The `virtual`/`override` plumbing between `BiddingV2Base` and `BiddingV3` is gone because there is
/// no other version in this inheritance branch.
/// [/Comment-202608249]
abstract contract BiddingV3Core is
	ReentrancyGuardTransientUpgradeable,
	OwnableUpgradeableWithReservedStorageGaps,
	CosmicSignatureGameStorageV3Core,
	BiddingCommonV3Core,
	MainPrizeCommonV3Core,
	BidStatisticsV3Core {
	// #region `receive`

	receive() external payable nonReentrant /*_onlyRoundIsActive*/ {
		_bidWithEth((-1), "", 0);
	}

	// #endregion
	// #region `bidWithEth`

	function bidWithEth(int256 randomWalkNftId_, string memory message_, uint256 bidCstRewardAmountMinLimit_) external payable nonReentrant /*_onlyRoundIsActive*/ {
		_bidWithEth(randomWalkNftId_, message_, bidCstRewardAmountMinLimit_);
	}

	// #endregion
	// #region `_bidWithEth`

	/// @dev Comment-202412045 applies to `_onlyIfNoBidPlacedWithinCurrentSecond`.
	function _bidWithEth(int256 randomWalkNftId_, string memory message_, uint256 bidCstRewardAmountMinLimit_) internal /* nonReentrant() */ /* _onlyRoundIsActive() */ _onlyIfNoBidPlacedWithinCurrentSecond() {
		// #region

		// Comment-202608166 applies.
		uint256 bidCstRewardAmount_ = 0;
		if (lastBidderAddress != address(0)) {
			// Comment-202608022 applies.
			bidCstRewardAmount_ = getBidCstRewardAmountAdvanced(int256(0));

			// Comment-202412045 applies.
			// Comment-202608124 applies.
			_checkBidCstRewardAmountMinLimit(bidCstRewardAmount_, bidCstRewardAmountMinLimit_);
		}

		// #endregion
		// #region

		// Comment-202503162 relates and/or applies.
		// Comment-202608271 applies.
		uint256 ethBidPriceBase_ = _getNextEthBidPriceBase(int256(0));
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
			// Doing nothing.
		} else {
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
		}

		// #endregion
		// #region

		biddersInfo[roundNum][_msgSender()].totalSpentEthAmount += paidEthPrice_;

		// Comment-202608177 applies.
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
		_bidCommon(message_);

		// Comment-202608262 applies.
		_appendBidRaffleWeight(ethBidPriceBase_);

		// Comment-202608122 applies.
		_emitBidPlaced(int256(paidEthPrice_), -1, randomWalkNftId_, message_, bidCstRewardAmount_, newCstBidPriceDeclineMultiplier_);

		// #endregion
		// #region

		// Comment-202505096 applies.
		if (overpaidEthPrice_ > int256(0)) {
			// Comment-202506219 applies.
			{
				// Comment-202502043 applies.
				(bool isSuccess_, ) = _msgSender().call{value: uint256(overpaidEthPrice_)}("");

				if ( ! isSuccess_ ) {
					revert CosmicSignatureErrors.FundTransferFailed("ETH refund transfer failed.", _msgSender(), uint256(overpaidEthPrice_));
				}
			}
		}

		// #endregion
	}

	// #endregion
	// #region `getNextEthBidPriceAdvanced`

	/// @dev In the original `BiddingV2Base`/`BiddingV3`, this is `public`; the external version lives in
	/// `CosmicSignatureGameViewsModuleV3`. Comment-202608249 applies.
	/// This adds the V3 late bid price premium on top of the premium-free `_getNextEthBidPriceBase`.
	function getNextEthBidPriceAdvanced(int256 currentTimeOffset_) internal view returns (uint256) {
		return _addRoundLateBidPricePremiumAmountIfNeeded(_getNextEthBidPriceBase(currentTimeOffset_), currentTimeOffset_);
	}

	// #endregion
	// #region `_getNextEthBidPriceBase`

	/// @notice Calculates the premium-free ETH bid price: the `BiddingV2Base.getNextEthBidPriceAdvanced` logic
	/// without the V3 late bid price premium.
	/// Comment-202608271 applies: this is what every stored price update consumes.
	function _getNextEthBidPriceBase(int256 currentTimeOffset_) internal view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 nextEthBidPrice_;
			if (lastBidderAddress == address(0)) {
				nextEthBidPrice_ = ethDutchAuctionBeginningBidPrice;

				// Comment-202605294 applies.
				// #enable_asserts assert(nextEthBidPrice_ > 0);
				// #enable_asserts assert(roundNum > 0);

				int256 ethDutchAuctionElapsedDuration_ = getDurationElapsedSinceRoundActivation() + currentTimeOffset_;
				if (ethDutchAuctionElapsedDuration_ <= int256(0)) {
					// Doing nothing.
				} else {
					// Comment-202605289 applies.
					// #enable_asserts assert(ethDutchAuctionEndingBidPriceDivisor > 1);

					// Comment-202501301 applies.
					// Comment-202508103 applies.
					uint256 ethDutchAuctionEndingBidPrice_ = nextEthBidPrice_ / ethDutchAuctionEndingBidPriceDivisor + 1;
					// #enable_asserts assert(ethDutchAuctionEndingBidPrice_ > 0 && ethDutchAuctionEndingBidPrice_ <= nextEthBidPrice_);

					uint256 ethDutchAuctionDuration_ = _getEthDutchAuctionDuration();
					if (uint256(ethDutchAuctionElapsedDuration_) < ethDutchAuctionDuration_) {
						uint256 ethDutchAuctionBidPriceDifference_ = nextEthBidPrice_ - ethDutchAuctionEndingBidPrice_;
						nextEthBidPrice_ -= ethDutchAuctionBidPriceDifference_ * uint256(ethDutchAuctionElapsedDuration_) / ethDutchAuctionDuration_;
					} else {
						nextEthBidPrice_ = ethDutchAuctionEndingBidPrice_;
					}
				}
			} else {
				nextEthBidPrice_ = nextEthBidPrice;
			}
			// #enable_asserts assert(nextEthBidPrice_ > 0);
			return nextEthBidPrice_;
		}
	}

	// #endregion
	// #region `getEthPlusRandomWalkNftBidPrice`

	/// @dev In the original `BiddingV2Base`, this is `public`. Comment-202608249 applies.
	function getEthPlusRandomWalkNftBidPrice(uint256 ethBidPrice_) internal pure returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 ethPlusRandomWalkNftBidPrice_ =
				(ethBidPrice_ + (CosmicSignatureConstants.RANDOMWALK_NFT_BID_PRICE_DIVISOR - 1)) /
				CosmicSignatureConstants.RANDOMWALK_NFT_BID_PRICE_DIVISOR;
			// #enable_asserts assert(
			// #enable_asserts 	( ! ( ethBidPrice_ > 0 &&
			// #enable_asserts 	      ethBidPrice_ <= type(uint256).max - (CosmicSignatureConstants.RANDOMWALK_NFT_BID_PRICE_DIVISOR - 1)
			// #enable_asserts 	    )
			// #enable_asserts 	) ||
			// #enable_asserts 	ethPlusRandomWalkNftBidPrice_ > 0 &&
			// #enable_asserts 	ethPlusRandomWalkNftBidPrice_ <= ethBidPrice_
			// #enable_asserts );
			return ethPlusRandomWalkNftBidPrice_;
		}
	}

	// #endregion
	// #region `_getEthDutchAuctionDuration`

	function _getEthDutchAuctionDuration() private view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// Comment-202508099 applies.
			uint256 ethDutchAuctionDuration_ = mainPrizeTimeIncrementInMicroSeconds / ethDutchAuctionDurationDivisor;

			return ethDutchAuctionDuration_;
		}
	}

	// #endregion
	// #region `bidWithCst`

	function bidWithCst(uint256 priceMaxLimit_, string memory message_, uint256 bidCstRewardAmountMinLimit_) external nonReentrant /*_onlyRoundIsActive*/ {
		_bidWithCst(priceMaxLimit_, message_, bidCstRewardAmountMinLimit_);
	}

	// #endregion
	// #region `_bidWithCst`

	/// @dev Comment-202412045 applies to `_onlyIfNoBidPlacedWithinCurrentSecond`.
	function _bidWithCst(uint256 priceMaxLimit_, string memory message_, uint256 bidCstRewardAmountMinLimit_) internal /* nonReentrant() */ /* _onlyRoundIsActive() */ _onlyIfNoBidPlacedWithinCurrentSecond() {
		// Comment-202412251 applies.
		// #enable_asserts assert(_msgSender() != marketingWallet);

		// Comment-202608167 applies.
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

		// [Comment-202608262]
		// Every bid's raffle weight equals the premium-free ETH bid price base posted at the moment of the bid,
		// as returned by `_getNextEthBidPriceBase(0)`:
		//    * A plain ETH bid outside the late bid window weighs exactly what it pays.
		//    * Inside the late bid window, a bid still weighs only the premium-free base: the late bid
		//      price premium (Comment-202608271) is a pure penalty that buys no extra raffle odds,
		//      so a maximum-premium bid pays ~5x per unit of raffle weight.
		//    * An ETH + Random Walk NFT bid weighs the full undiscounted base: the 50% discount
		//      (Comment-202412036) applies to the price only, which keeps the raffle perk of the discount
		//      bounded at 2x odds per wei paid.
		//    * A CST bid weighs the concurrent premium-free ETH bid price base, which keeps CST bids
		//      raffle-eligible without needing a CST/ETH exchange rate.
		//    * A swallowed ETH bid overpayment (Comment-202502052) does not increase the weight.
		// The first bid in a bidding round is always ETH with a nonzero price (Comment-202501044,
		// Comment-202605294), and `_getNextEthBidPriceBase` never returns a zero afterwards either,
		// so every weight and therefore the round's total raffle weight is guaranteed to be a nonzero.
		// Comment-202608261 applies.
		// [/Comment-202608262]
		uint256 bidRaffleWeight_ = _getNextEthBidPriceBase(int256(0));

		_bidCommon(message_);
		_appendBidRaffleWeight(bidRaffleWeight_);

		// Comment-202608122 applies.
		_emitBidPlaced(-1, int256(paidPrice_), -1, message_, bidCstRewardAmount_, newCstBidPriceDeclineMultiplier_);
	}

	// #endregion
	// #region `_checkBidCstRewardAmountMinLimit`

	/// @dev Comment-202608124 applies.
	function _checkBidCstRewardAmountMinLimit(uint256 bidCstRewardAmount_, uint256 bidCstRewardAmountMinLimit_) private pure {
		if ( ! (bidCstRewardAmount_ >= bidCstRewardAmountMinLimit_) ) {
			revert CosmicSignatureErrors.BidCstRewardAmountMinLimitNotReached(bidCstRewardAmount_, bidCstRewardAmountMinLimit_);
		}
	}

	// #endregion
	// #region `_emitBidPlaced`

	/// @dev Comment-202608122 applies.
	function _emitBidPlaced(
		int256 paidEthPrice_,
		int256 paidCstPrice_,
		int256 randomWalkNftId_,
		string memory message_,
		uint256 bidCstRewardAmount_,
		uint256 newCstBidPriceDeclineMultiplier_
	) private {
		emit IBidding2V3.BidPlaced(
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

	/// @dev In the original `BiddingV3`, this is `public`. Comment-202608249 applies.
	/// This adds the V3 late bid price premium on top of the premium-free `_getNextCstBidPriceBase`.
	/// A zero base stays a zero (Comment-202607119), like it did before the split.
	function getNextCstBidPriceAdvanced(int256 currentTimeOffset_) internal view returns (uint256) {
		return _addRoundLateBidPricePremiumAmountIfNeeded(_getNextCstBidPriceBase(currentTimeOffset_), currentTimeOffset_);
	}

	// #endregion
	// #region `_getNextCstBidPriceBase`

	/// @notice Calculates the premium-free CST bid price: the V3 linear price decline
	/// without the V3 late bid price premium.
	/// Comment-202608271 applies: this is what every stored price update consumes.
	function _getNextCstBidPriceBase(int256 currentTimeOffset_) internal view returns (uint256) {
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
	// #region `_getCstDutchAuctionElapsedDuration`

	function _getCstDutchAuctionElapsedDuration() internal view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 cstDutchAuctionElapsedDuration_ = block.timestamp - cstDutchAuctionBeginningTimeStamp;
			// #enable_asserts assert(int256(cstDutchAuctionElapsedDuration_) >= int256(0));
			return cstDutchAuctionElapsedDuration_;
		}
	}

	// #endregion
	// #region `_appendBidRaffleWeight`

	/// @notice Appends the given bid raffle weight for the bid that `_bidCommon` has just recorded.
	/// Comment-202608261 applies.
	/// Comment-202608262 applies.
	/// @dev
	/// [Comment-202608263]
	/// This logic must stay identical in `BiddingV3Core` (the implementation contract hot path)
	/// and in `BiddingV3` (the module lineage that serves the bid-with-donation combinations).
	/// Both append to the same `bidRaffleCumulativeWeights` storage.
	/// [/Comment-202608263]
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
		uint256 newCstBidPriceDeclineMultiplier_ =
			CosmicSignatureHelpers.tryIncreaseValueExponentially(cstBidPriceDeclineMultiplier, cstBidPriceDeclineMultiplierChangeDivisor);
		cstBidPriceDeclineMultiplier = newCstBidPriceDeclineMultiplier_;
		return newCstBidPriceDeclineMultiplier_;
	}

	// #endregion
	// #region `_tryReduceCstBidPriceDeclineMultiplier`

	function _tryReduceCstBidPriceDeclineMultiplier() private returns (uint256) {
		uint256 newCstBidPriceDeclineMultiplier_ =
			CosmicSignatureHelpers.tryReduceValueExponentially(cstBidPriceDeclineMultiplier, cstBidPriceDeclineMultiplierChangeDivisor);
		cstBidPriceDeclineMultiplier = newCstBidPriceDeclineMultiplier_;
		return newCstBidPriceDeclineMultiplier_;
	}

	// #endregion
	// #region `_addRoundLateBidPricePremiumAmountIfNeeded`

	/// @param bidPrice_ As mentioned in Comment-202607119, if it's zero the result will be zero as well.
	/// @dev
	/// [Comment-202608271]
	/// The late bid price premium is a one-time toll on the bid that pays it. It never ratchets stored price state:
	/// every stored price update consumes the premium-free base price.
	///    * `nextEthBidPrice` grows exponentially from the premium-free ETH bid price
	///      returned by `_getNextEthBidPriceBase`.
	///    * `cstDutchAuctionBeginningBidPrice`, and therefore `nextRoundFirstCstDutchAuctionBeginningBidPrice`,
	///      doubles the premium-free CST bid price returned by `_getNextCstBidPriceBase`.
	///    * `ethDutchAuctionBeginningBidPrice` doubles the first bid price of the round,
	///      which never contains a premium anyway, because the premium requires a nonzero `lastBidderAddress`.
	/// So as soon as a bid extends `mainPrizeTime` (which pushes the premium window at least
	/// `mainPrizeTimeIncrement - roundLateBidDuration` into the future), all posted bid prices return to
	/// what they would have been if the premium logic did not exist: a bidder who pays a premium
	/// hurts only themselves, without raising the price ladder for further bids.
	/// The premium survives the bid nowhere: even the bid raffle weight (Comment-202608262) uses the
	/// premium-free base, so a late bid pays up to ~5x per unit of raffle odds. Only `BidPlaced`,
	/// the `biddersInfo` spent totals, and the actual payment/burn record the premium-inclusive price.
	/// [/Comment-202608271]
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

					// Comment-202607119 applies.
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

	/// @dev In the original `BiddingV3`, this is `public`. Comment-202608249 applies.
	function getRoundLateBidDuration() internal view returns (uint256) {
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

	/// @dev In the original `BiddingV3`, this is `public`. Comment-202608249 applies.
	function getBidCstRewardAmountAdvanced(int256 currentTimeOffset_) internal view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// Comment-202608176 applies.
			if (lastBidderAddress == address(0)) {
				return 0;
			}

			uint256 lastBidTimeStampCopy_ = biddersInfo[roundNum][lastBidderAddress].lastBidTimeStamp;

			int256 elapsedDuration_ = int256(block.timestamp) + currentTimeOffset_ - int256(lastBidTimeStampCopy_);
			uint256 bidCstRewardAmount_ = 0;
			if (elapsedDuration_ > int256(0)) {
				// Comment-202607167 applies.
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
		// Comment-202607263 applies.
		// #enable_asserts assert(bidCstRewardAmount_ > 0);

		// `_bidWithEth` calls this method only when there is a previous bidder, near Comment-202608166.
		// #enable_asserts assert(lastBidderAddress != address(0));

		// Comment-202607163 applies.
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

			// Comment-202607164 applies.
			// Comment-202607163 applies.
			mintAndBurnSpecs_[1].account = lastBidderAddress;
			// #enable_asserts assert(lastBidderAddress != address(0));

			mintAndBurnSpecs_[1].value = int256(bidCstRewardAmount_);
			token.mintAndBurnMany(mintAndBurnSpecs_);
		}
	}

	// #endregion
	// #region `_bidCommon`

	/// @notice Comment-202605291 applies.
	/// @param message_ Comment-202503155 applies.
	/// @dev Comment-202411169 relates and/or applies.
	/// This is the `BiddingV2Base._bidCommon` body. Comment-202608249 applies.
	function _bidCommon(string memory message_) internal /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		require(
			bytes(message_).length <= bidMessageLengthMaxLimit,
			CosmicSignatureErrors.TooLongBidMessage("Message is too long.", bytes(message_).length)
		);

		// Comment-202605292 applies.
		if (lastBidderAddress == address(0)) {

			// Comment-202411169 relates.
			_checkRoundIsActive();

			// Comment-202501044 applies.
			require(msg.value > 0, CosmicSignatureErrors.WrongBidType("The first bid in a bidding round shall be ETH."));

			cstDutchAuctionBeginningTimeStamp = block.timestamp;
			mainPrizeTime = block.timestamp + getInitialDurationUntilMainPrize();
			emit IBidding1V2.FirstBidPlacedInRound(roundNum, block.timestamp);
		} else {
			// Comment-202411169 applies.
			// #enable_asserts assert(block.timestamp >= roundActivationTime);

			_updateChampionsIfNeeded();
			_extendMainPrizeTime();
		}
		lastBidderAddress = _msgSender();
		BidderAddresses storage bidderAddressesReference_ = bidderAddresses[roundNum];
		uint256 totalNumBids_ = bidderAddressesReference_.numItems;
		bidderAddressesReference_.items[totalNumBids_] = _msgSender();
		++ totalNumBids_;
		bidderAddressesReference_.numItems = totalNumBids_;
		biddersInfo[roundNum][_msgSender()].lastBidTimeStamp = block.timestamp;
	}

	// #endregion
}

// #endregion
