// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.34;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { ICosmicSignatureToken } from "./interfaces/ICosmicSignatureToken.sol";
import { CosmicSignatureGameStorageV2 } from "./CosmicSignatureGameStorageV2.sol";
import { BiddingBaseV2 } from "./BiddingBaseV2.sol";
import { MainPrizeBaseV2 } from "./MainPrizeBaseV2.sol";
import { BidStatisticsV2 } from "./BidStatisticsV2.sol";
import { IBiddingV2 } from "./interfaces/IBiddingV2.sol";

// #endregion
// #region

abstract contract BiddingV2 is
	ReentrancyGuardTransientUpgradeable,
	OwnableUpgradeableWithReservedStorageGaps,
	CosmicSignatureGameStorageV2,
	BiddingBaseV2,
	MainPrizeBaseV2,
	BidStatisticsV2,
	IBiddingV2 {
	// #region `receive`

	receive() external payable override nonReentrant /*_onlyRoundIsActive*/ {
		_bidWithEth((-1), "", 0);
	}

	// #endregion
	// #region `halveEthDutchAuctionEndingBidPrice`
	
	/// @dev Comment-202508184 applies.
	function halveEthDutchAuctionEndingBidPrice() external override onlyOwner() _onlyNonFirstRound() /*_onlyRoundIsInactive()*/ _onlyBeforeBidPlacedInRound() {
		// Comment-202605285 applies.
		// Comment-202508102 applies.
		// Comment-202508105 applies.

		(uint256 ethDutchAuctionDuration_, int256 ethDutchAuctionElapsedDuration_) = getEthDutchAuctionDurations();
		// // #enable_asserts // #disable_smtchecker console.log("202508107", ethDutchAuctionDuration_, uint256(ethDutchAuctionElapsedDuration_));

		// Comment-202508096 applies.
		if ( ! (ethDutchAuctionElapsedDuration_ > int256(ethDutchAuctionDuration_)) ) {
			revert CosmicSignatureErrors.InvalidOperationInCurrentState("Too early.");
		}

		uint256 newEthDutchAuctionEndingBidPriceDivisor_ = ethDutchAuctionEndingBidPriceDivisor;

		// Comment-202508187 applies.
		// Comment-202501301 applies.
		// Comment-202508103 applies.
		uint256 currentEthBidPrice_ = ethDutchAuctionBeginningBidPrice / newEthDutchAuctionEndingBidPriceDivisor_ + 1;

		// Comment-202508192 applies.
		newEthDutchAuctionEndingBidPriceDivisor_ *= 2;

		// Comment-202508189 applies.
		// Comment-202501301 applies.
		// Comment-202508103 applies.
		uint256 ethDutchAuctionEndingBidPrice_ = ethDutchAuctionBeginningBidPrice / newEthDutchAuctionEndingBidPriceDivisor_ + 1;

		// Comment-202508191 applies.
		uint256 newEthDutchAuctionDurationDivisor_;
		{
			uint256 numerator_ = (ethDutchAuctionBeginningBidPrice - currentEthBidPrice_) * mainPrizeTimeIncrementInMicroSeconds;
			uint256 denominator_ = (ethDutchAuctionBeginningBidPrice - ethDutchAuctionEndingBidPrice_) * uint256(ethDutchAuctionElapsedDuration_);

			// Comment-202508142 applies.
			newEthDutchAuctionDurationDivisor_ = (numerator_ /* + denominator_ / 2 */) / denominator_ + 1;
		}
		// if ( ! (newEthDutchAuctionDurationDivisor_ > 0) ) {
		// 	revert CosmicSignatureErrors.EthDutchAuctionEndingBidPriceHalvingError("newEthDutchAuctionDurationDivisor_ == 0");
		// }
		// #enable_asserts assert(newEthDutchAuctionDurationDivisor_ > 0);

		/*
		{
			// Comment-202508135 applies.
			assert(newEthDutchAuctionDurationDivisor_ <= ethDutchAuctionDurationDivisor);

			// Comment-202508099 applies.
			uint256 newEthDutchAuctionDuration_ = mainPrizeTimeIncrementInMicroSeconds / newEthDutchAuctionDurationDivisor_;

			// Comment-202508135 applies.
			assert(newEthDutchAuctionDuration_ >= ethDutchAuctionDuration_);

			// Comment-202508157 applies.
			assert(newEthDutchAuctionDuration_ > uint256(ethDutchAuctionElapsedDuration_));
		}
		*/

		_setEthDutchAuctionDurationDivisor(newEthDutchAuctionDurationDivisor_);
		_setEthDutchAuctionEndingBidPriceDivisor(newEthDutchAuctionEndingBidPriceDivisor_);
	}

	// #endregion
	// #region `bidWithEthAndDonateToken`

	function bidWithEthAndDonateToken(
		int256 randomWalkNftId_,
		string memory message_,
		uint256 bidCstRewardAmountMinLimit_,
		IERC20 tokenAddress_,
		uint256 amount_
	) external payable override nonReentrant /*_onlyRoundIsActive*/ {
		_bidWithEth(randomWalkNftId_, message_, bidCstRewardAmountMinLimit_);
		prizesWallet.donateToken(roundNum, _msgSender(), tokenAddress_, amount_);
	}

	// #endregion
	// #region `bidWithEthAndDonateNft`

	function bidWithEthAndDonateNft(
		int256 randomWalkNftId_,
		string memory message_,
		uint256 bidCstRewardAmountMinLimit_,
		IERC721 nftAddress_,
		uint256 nftId_
	) external payable override nonReentrant /*_onlyRoundIsActive*/ {
		_bidWithEth(randomWalkNftId_, message_, bidCstRewardAmountMinLimit_);
		prizesWallet.donateNft(roundNum, _msgSender(), nftAddress_, nftId_);
	}

	// #endregion
	// #region `bidWithEth`

	function bidWithEth(int256 randomWalkNftId_, string memory message_, uint256 bidCstRewardAmountMinLimit_) external payable override nonReentrant /*_onlyRoundIsActive*/ {
		_bidWithEth(randomWalkNftId_, message_, bidCstRewardAmountMinLimit_);
	}

	// #endregion
	// #region `_bidWithEth`

	function _bidWithEth(int256 randomWalkNftId_, string memory message_, uint256 bidCstRewardAmountMinLimit_) private /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		// #region //

		// BidType bidType_;

		// #endregion
		// #region

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
			// Comment-202502052 relates and/or applies.
			{
				// #enable_asserts assert(tx.gasprice > 0);
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
		nextEthBidPrice = ethBidPrice_ + ethBidPrice_ / ethBidPriceIncreaseDivisor + 1;

		// [Comment-202606059]
		// Given a variable `var` and a divisor `div`. Both are treated as unsigned integers.
		// Assuming `div > 0 && var >= div`.
		// `var` increase formula: `var += var / div`
		// `var` reduction formula: `var = (var + 1) * div / (div + 1)`
		// The formulas are lossless, meaning multiple increases followed by the same number of reductions
		// or the same in the opposite order will produce the original value.
		// The reduction formula can reach the minimum of `var == div`. Further reduction attempts will not change `var`.
		// In other words, the losslessness breaks at that point.
		// Obviously, the formulas can overflow. The reduction formula is more susceptible to overflow.
		// [/Comment-202606059]
		// Comment-202605295 applies.
		uint256 newCstDutchAuctionDuration_ = (cstDutchAuctionDuration + 1) * cstDutchAuctionDurationChangeDivisor / (cstDutchAuctionDurationChangeDivisor + 1);

		cstDutchAuctionDuration = newCstDutchAuctionDuration_;
		if (bidCstRewardAmount_ > 0) {
			// Comment-202501125 applies.
			token.mint(_msgSender(), bidCstRewardAmount_);
		}
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
	// #region `getNextEthBidPrice`

	function getNextEthBidPrice() external view override returns (uint256) {
		return getNextEthBidPriceAdvanced(int256(0));
	}

	// #endregion
	// #region `getNextEthBidPriceAdvanced`

	function getNextEthBidPriceAdvanced(int256 currentTimeOffset_) public view override returns (uint256) {
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

	function getEthPlusRandomWalkNftBidPrice(uint256 ethBidPrice_) public pure override returns (uint256) {
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
	// #region `getEthDutchAuctionDurations`

	function getEthDutchAuctionDurations() public view override returns (uint256, int256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 ethDutchAuctionDuration_ = _getEthDutchAuctionDuration();
			int256 ethDutchAuctionElapsedDuration_ = getDurationElapsedSinceRoundActivation();
			return (ethDutchAuctionDuration_, ethDutchAuctionElapsedDuration_);
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
	// #region `bidWithCstAndDonateToken`

	function bidWithCstAndDonateToken(
		uint256 priceMaxLimit_,
		string memory message_,
		uint256 bidCstRewardAmountMinLimit_,
		IERC20 tokenAddress_,
		uint256 amount_
	) external override nonReentrant /*_onlyRoundIsActive*/ {
		_bidWithCst(priceMaxLimit_, message_, bidCstRewardAmountMinLimit_);
		prizesWallet.donateToken(roundNum, _msgSender(), tokenAddress_, amount_);
	}

	// #endregion
	// #region `bidWithCstAndDonateNft`

	function bidWithCstAndDonateNft(
		uint256 priceMaxLimit_,
		string memory message_,
		uint256 bidCstRewardAmountMinLimit_,
		IERC721 nftAddress_,
		uint256 nftId_
	) external override nonReentrant /*_onlyRoundIsActive*/ {
		_bidWithCst(priceMaxLimit_, message_, bidCstRewardAmountMinLimit_);
		prizesWallet.donateNft(roundNum, _msgSender(), nftAddress_, nftId_);
	}

	// #endregion
	// #region `bidWithCst`

	function bidWithCst(uint256 priceMaxLimit_, string memory message_, uint256 bidCstRewardAmountMinLimit_) external override nonReentrant /*_onlyRoundIsActive*/ {
		_bidWithCst(priceMaxLimit_, message_, bidCstRewardAmountMinLimit_);
	}

	// #endregion
	// #region `_bidWithCst`

	function _bidWithCst(uint256 priceMaxLimit_, string memory message_, uint256 bidCstRewardAmountMinLimit_) private /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		// Comment-202412251 applies.
		// #enable_asserts assert(_msgSender() != marketingWallet);

		// Comment-202501045 applies.

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

		// Comment-202409177 applies.
		// Comment-202501125 applies.
		if (bidCstRewardAmount_ > 0) {
			ICosmicSignatureToken.MintOrBurnSpec[] memory mintAndBurnSpecs_ = new ICosmicSignatureToken.MintOrBurnSpec[](2);
			mintAndBurnSpecs_[0].account = _msgSender();

			// Comment-202606074 applies.
			mintAndBurnSpecs_[0].value = ( - int256(paidPrice_) );

			mintAndBurnSpecs_[1].account = _msgSender();
			mintAndBurnSpecs_[1].value = int256(bidCstRewardAmount_);
			token.mintAndBurnMany(mintAndBurnSpecs_);
		} else {
			// Unlike near Comment-202606074, this is an unconditional burning.
			token.burn(_msgSender(), paidPrice_);
		}

		biddersInfo[roundNum][_msgSender()].totalSpentCstAmount += paidPrice_;
		cstDutchAuctionBeginningTimeStamp = block.timestamp;

		// Comment-202409163 applies.
		uint256 newCstDutchAuctionBeginningBidPrice_ =
			Math.max(paidPrice_ * CosmicSignatureConstants.CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER, cstDutchAuctionBeginningBidPriceMinLimit);
		cstDutchAuctionBeginningBidPrice = newCstDutchAuctionBeginningBidPrice_;

		if (lastCstBidderAddress == address(0)) {
			// Comment-202501045 applies.

			// Comment-202504212 applies.
			nextRoundFirstCstDutchAuctionBeginningBidPrice = newCstDutchAuctionBeginningBidPrice_;
		}
		lastCstBidderAddress = _msgSender();

		// Comment-202606059 applies.
		// Comment-202605295 applies.
		uint256 newCstDutchAuctionDuration_ = cstDutchAuctionDuration;
		newCstDutchAuctionDuration_ += newCstDutchAuctionDuration_ / cstDutchAuctionDurationChangeDivisor;

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
	// #region `getNextCstBidPrice`

	function getNextCstBidPrice() external view override returns (uint256) {
		return getNextCstBidPriceAdvanced(int256(0));
	}

	// #endregion
	// #region `getNextCstBidPriceAdvanced`

	function getNextCstBidPriceAdvanced(int256 currentTimeOffset_) public view override returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			int256 cstDutchAuctionRemainingDuration_ = _getCstDutchAuctionRemainingDuration();
			cstDutchAuctionRemainingDuration_ -= currentTimeOffset_;
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

	function getCstDutchAuctionDurations() external view override returns (uint256, int256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			int256 cstDutchAuctionElapsedDuration_ = _getCstDutchAuctionElapsedDuration();
			return (cstDutchAuctionDuration, cstDutchAuctionElapsedDuration_);
		}
	}

	// #endregion
	// #region `_getCstDutchAuctionElapsedDuration`

	function _getCstDutchAuctionElapsedDuration() private view returns (int256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			int256 cstDutchAuctionElapsedDuration_ = int256(block.timestamp) - int256(cstDutchAuctionBeginningTimeStamp);
			return cstDutchAuctionElapsedDuration_;
		}
	}

	// #endregion
	// #region `_getCstDutchAuctionRemainingDuration`

	function _getCstDutchAuctionRemainingDuration() private view returns (int256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			int256 cstDutchAuctionElapsedDuration_ = _getCstDutchAuctionElapsedDuration();
			int256 cstDutchAuctionRemainingDuration_ = int256(cstDutchAuctionDuration) - cstDutchAuctionElapsedDuration_;
			return cstDutchAuctionRemainingDuration_;
		}
	}

	// #endregion
	// #region `_bidCommon`

	/// @notice Comment-202605291 applies.
	/// @param message_ Comment-202503155 applies.
	/// @dev Comment-202411169 relates and/or applies.
	function _bidCommon(/*BidType bidType_,*/ string memory message_) private /*nonReentrant*/ /*_onlyRoundIsActive*/ {
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
			emit FirstBidPlacedInRound(roundNum, block.timestamp);
		} else {
			// Comment-202411169 applies.
			// #enable_asserts assert(block.timestamp >= roundActivationTime);

			_updateChampionsIfNeeded();
			_extendMainPrizeTime();
		}
		// lastBidType = bidType_;
		lastBidderAddress = _msgSender();
		BidderAddresses storage bidderAddressesReference_ = bidderAddresses[roundNum];
		uint256 totalNumBids_ = bidderAddressesReference_.numItems;
		bidderAddressesReference_.items[totalNumBids_] = _msgSender();
		++ totalNumBids_;
		bidderAddressesReference_.numItems = totalNumBids_;
		biddersInfo[roundNum][_msgSender()].lastBidTimeStamp = block.timestamp;
	}

	// #endregion
	// #region `getBidCstRewardAmount`

	function getBidCstRewardAmount() external view override returns (uint256) {
		return getBidCstRewardAmountAdvanced(int256(0));
	}

	// #endregion
	// #region `getBidCstRewardAmountAdvanced`

	function getBidCstRewardAmountAdvanced(int256 currentTimeOffset_) public view override returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 lastBidTimeStampCopy_ =
				(lastBidderAddress == address(0)) ?
				roundActivationTime :
				biddersInfo[roundNum][lastBidderAddress].lastBidTimeStamp;

			// [Comment-202605295]
			// It's safe to assume that this is far below the point of overflow, provided `currentTimeOffset_` is relatively small,
			// positive, negative, or zero.
			// [/Comment-202605295]
			int256 elapsedDuration_ = int256(block.timestamp) + currentTimeOffset_ - int256(lastBidTimeStampCopy_);

			uint256 bidCstRewardAmount_ = 0;
			if (elapsedDuration_ > int256(0)) {
				// The numerator is expected to have tendency to be proportional to the denominator.
				// As a result, this formula is neither inflationary nor deflationary for CST.
				// Comment-202605295 applies.
				uint256 radicand_ = uint256(elapsedDuration_) * bidCstRewardAmountMultiplier / mainPrizeTimeIncrementInMicroSeconds;

				bidCstRewardAmount_ = Math.sqrt(radicand_);
			}
			return bidCstRewardAmount_;
		}
	}

	// #endregion
}

// #endregion
