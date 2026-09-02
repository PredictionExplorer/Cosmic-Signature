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
import { IBidding1V2 } from "./interfaces/IBidding1V2.sol";
import { BiddingV2Base } from "./BiddingV2Base.sol";
import { IBiddingV2 } from "./interfaces/IBiddingV2.sol";

// #endregion
// #region

abstract contract BiddingV2 is
	BiddingV2Base,
	IBiddingV2 {
	// #region `_bidWithEth`

	function _bidWithEth(int256 randomWalkNftId_, string memory message_, uint256 bidCstRewardAmountMinLimit_) internal override /* virtual */ /* nonReentrant() */ /* _onlyRoundIsActive() */ {
		// #region //

		// BidType bidType_;

		// #endregion
		// #region

		// This can be zero.
		uint256 bidCstRewardAmount_ = getBidCstRewardAmountAdvanced(int256(0));

		// Comment-202412045 applies.
		if ( ! (bidCstRewardAmount_ >= bidCstRewardAmountMinLimit_) ) {
			revert CosmicSignatureErrors.BidCstRewardAmountMinLimitNotReached(bidCstRewardAmount_, bidCstRewardAmountMinLimit_);
		}

		// #endregion
		// #region

		// Comment-202503162 relates and/or applies.
		uint256 ethBidPrice_ = getNextEthBidPriceAdvanced(int256(0));
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
		if (lastBidderAddress == address(0)) {
			ethDutchAuctionBeginningBidPrice = ethBidPrice_ * CosmicSignatureConstants.ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;
		}

		// Comment-202501061 applies.
		nextEthBidPrice = CosmicSignatureHelpers.tryIncreaseValueExponentially(ethBidPrice_, ethBidPriceIncreaseDivisor) + 1;

		uint256 newCstDutchAuctionDuration_ = CosmicSignatureHelpers.tryReduceValueExponentially(cstDutchAuctionDuration, cstDutchAuctionDurationChangeDivisor);
		cstDutchAuctionDuration = newCstDutchAuctionDuration_;
		_mintBidCstRewardAmountIfNeeded(_msgSender(), bidCstRewardAmount_);
		_bidCommon(/*bidType_,*/ message_);
		emit BidPlaced(
			roundNum,
			_msgSender(),
			int256(paidEthPrice_),
			-1,
			randomWalkNftId_,
			message_,
			bidCstRewardAmount_,
			newCstDutchAuctionDuration_,
			mainPrizeTime
		);

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
	// #region `_bidWithCst`

	function _bidWithCst(uint256 priceMaxLimit_, string memory message_, uint256 bidCstRewardAmountMinLimit_) internal override /* virtual */ /* nonReentrant() */ /* _onlyRoundIsActive() */ {
		// Comment-202412251 applies.
		// #enable_asserts assert(_msgSender() != marketingWallet);

		// Comment-202501045 applies.

		// This can be zero.
		uint256 bidCstRewardAmount_ = getBidCstRewardAmountAdvanced(int256(0));

		// Comment-202412045 applies.
		if ( ! (bidCstRewardAmount_ >= bidCstRewardAmountMinLimit_) ) {
			revert CosmicSignatureErrors.BidCstRewardAmountMinLimitNotReached(bidCstRewardAmount_, bidCstRewardAmountMinLimit_);
		}

		// Comment-202503162 relates and/or applies.
		uint256 paidPrice_ = getNextCstBidPriceAdvanced(int256(0));

		// Comment-202412045 applies.
		if ( ! (paidPrice_ <= priceMaxLimit_) ) {
			revert CosmicSignatureErrors.InsufficientReceivedBidAmount("The current CST bid price is greater than the maximum you allowed.", paidPrice_, priceMaxLimit_);
		}

		_burnCstBidPriceAndMintBidCstRewardAmountIfNeeded(_msgSender(), paidPrice_, bidCstRewardAmount_);
		biddersInfo[roundNum][_msgSender()].totalSpentCstAmount += paidPrice_;
		cstDutchAuctionBeginningTimeStamp = block.timestamp;
		uint256 newCstDutchAuctionBeginningBidPrice_ =
			Math.max(paidPrice_ * CosmicSignatureConstants.CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER, cstDutchAuctionBeginningBidPriceMinLimit);
		cstDutchAuctionBeginningBidPrice = newCstDutchAuctionBeginningBidPrice_;
		if (lastCstBidderAddress == address(0)) {
			// Comment-202501045 applies.

			// Comment-202504212 applies.
			nextRoundFirstCstDutchAuctionBeginningBidPrice = newCstDutchAuctionBeginningBidPrice_;
		}
		lastCstBidderAddress = _msgSender();
		uint256 newCstDutchAuctionDuration_ = CosmicSignatureHelpers.tryIncreaseValueExponentially(cstDutchAuctionDuration, cstDutchAuctionDurationChangeDivisor);
		cstDutchAuctionDuration = newCstDutchAuctionDuration_;
		_bidCommon(/*BidType.CST,*/ message_);
		emit BidPlaced(
			roundNum,
			_msgSender(),
			-1,
			int256(paidPrice_),
			-1,
			message_,
			bidCstRewardAmount_,
			newCstDutchAuctionDuration_,
			mainPrizeTime
		);
	}

	// #endregion
	// #region `getNextCstBidPriceAdvanced`

	function getNextCstBidPriceAdvanced(int256 currentTimeOffset_) public view override (IBidding1V2, BiddingV2Base) virtual returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// Comment-202608054 applies.
			// Comment-202608052 applies.
			int256 cstDutchAuctionRemainingDuration_ = _getCstDutchAuctionRemainingDuration() - currentTimeOffset_;

			if (cstDutchAuctionRemainingDuration_ <= int256(0)) {
				return 0;
			}

			// Comment-202501307 relates and/or applies.
			uint256 cstDutchAuctionBeginningBidPrice_ =
				(lastCstBidderAddress == address(0)) ? nextRoundFirstCstDutchAuctionBeginningBidPrice : cstDutchAuctionBeginningBidPrice;

			uint256 nextCstBidPrice_ = cstDutchAuctionBeginningBidPrice_ * uint256(cstDutchAuctionRemainingDuration_) / cstDutchAuctionDuration;
			return nextCstBidPrice_;
		}
	}

	// #endregion
	// #region `getCstDutchAuctionDurations`

	function getCstDutchAuctionDurations() external view override /* virtual */ returns (uint256, uint256) {
		// // #enable_smtchecker /*
		// unchecked
		// // #enable_smtchecker */

		uint256 cstDutchAuctionElapsedDuration_ = _getCstDutchAuctionElapsedDuration();
		return (cstDutchAuctionDuration, cstDutchAuctionElapsedDuration_);
	}

	// #endregion
	// #region `_getCstDutchAuctionRemainingDuration`

	function _getCstDutchAuctionRemainingDuration() private view returns (int256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 cstDutchAuctionElapsedDuration_ = _getCstDutchAuctionElapsedDuration();
			int256 cstDutchAuctionRemainingDuration_ = int256(cstDutchAuctionDuration) - int256(cstDutchAuctionElapsedDuration_);
			return cstDutchAuctionRemainingDuration_;
		}
	}

	// #endregion
	// #region `getBidCstRewardAmountAdvanced`

	function getBidCstRewardAmountAdvanced(int256 currentTimeOffset_) public view override (IBidding1V2, BiddingV2Base) virtual returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 lastBidTimeStampCopy_ =
				(lastBidderAddress == address(0)) ?
				roundActivationTime :
				biddersInfo[roundNum][lastBidderAddress].lastBidTimeStamp;
			int256 elapsedDuration_ = int256(block.timestamp) + currentTimeOffset_ - int256(lastBidTimeStampCopy_);
			uint256 bidCstRewardAmount_ = 0;
			if (elapsedDuration_ > int256(0)) {
				// [Comment-202607167]
				// The numerator is expected to have tendency to be proportional to the denominator.
				// As a result, this formula is neither inflationary nor deflationary for CST.
				// [/Comment-202607167]
				uint256 radicand_ = uint256(elapsedDuration_) * bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds;

				bidCstRewardAmount_ = Math.sqrt(radicand_);
			}
			return bidCstRewardAmount_;
		}
	}

	// #endregion
}

// #endregion
