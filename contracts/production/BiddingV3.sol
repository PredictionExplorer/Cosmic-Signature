// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

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
import { IBiddingV3 } from "./interfaces/IBiddingV3.sol";

// #endregion
// #region

abstract contract BiddingV3 is
	ReentrancyGuardTransientUpgradeable,
	OwnableUpgradeableWithReservedStorageGaps,
	CosmicSignatureGameStorageV2,
	BiddingBaseV2,
	MainPrizeBaseV2,
	BidStatisticsV2,
	IBiddingV3 {
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
		// #enable_asserts assert(newEthDutchAuctionDurationDivisor_ > 0);

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
		uint256 bidCstRewardAmount_ = getBidCstRewardAmountAdvanced(int256(0));

		// Comment-202412045 applies.
		if ( ! (bidCstRewardAmount_ >= bidCstRewardAmountMinLimit_) ) {
			revert CosmicSignatureErrors.BidCstRewardAmountMinLimitNotReached(bidCstRewardAmount_, bidCstRewardAmountMinLimit_);
		}

		// Comment-202503162 relates and/or applies.
		uint256 baseEthBidPrice_ = _getBaseNextEthBidPriceAdvanced(int256(0));
		uint256 paidEthPrice_ =
			(randomWalkNftId_ < int256(0)) ?
			_applyLateRoundBidPriceIncrease(baseEthBidPrice_, int256(0)) :
			_applyLateRoundBidPriceIncrease(getEthPlusRandomWalkNftBidPrice(baseEthBidPrice_), int256(0));

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

		if (randomWalkNftId_ < int256(0)) {
			// // #enable_asserts assert(bidType_ == BidType.ETH);
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
			// bidType_ = BidType.RandomWalk;
		}

		biddersInfo[roundNum][_msgSender()].totalSpentEthAmount += paidEthPrice_;
		if (lastBidderAddress == address(0)) {
			ethDutchAuctionBeginningBidPrice = baseEthBidPrice_ * CosmicSignatureConstants.ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;
		}

		// Comment-202501061 applies.
		nextEthBidPrice = baseEthBidPrice_ + baseEthBidPrice_ / ethBidPriceIncreaseDivisor + 1;

		// Comment-202606059 applies.
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
	}

	// #endregion
	// #region `getNextEthBidPrice`

	function getNextEthBidPrice() external view override returns (uint256) {
		return getNextEthBidPriceAdvanced(int256(0));
	}

	// #endregion
	// #region `getNextEthBidPriceAdvanced`

	function getNextEthBidPriceAdvanced(int256 currentTimeOffset_) public view override returns (uint256) {
		uint256 baseEthBidPrice_ = _getBaseNextEthBidPriceAdvanced(currentTimeOffset_);
		return _applyLateRoundBidPriceIncrease(baseEthBidPrice_, currentTimeOffset_);
	}

	// #endregion
	// #region `_getBaseNextEthBidPriceAdvanced`

	function _getBaseNextEthBidPriceAdvanced(int256 currentTimeOffset_) private view returns (uint256) {
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
	// #region `getNextEthPlusRandomWalkNftBidPrice`

	function getNextEthPlusRandomWalkNftBidPrice() external view override returns (uint256) {
		return getNextEthPlusRandomWalkNftBidPriceAdvanced(int256(0));
	}

	// #endregion
	// #region `getNextEthPlusRandomWalkNftBidPriceAdvanced`

	function getNextEthPlusRandomWalkNftBidPriceAdvanced(int256 currentTimeOffset_) public view override returns (uint256) {
		uint256 baseEthBidPrice_ = _getBaseNextEthBidPriceAdvanced(currentTimeOffset_);
		uint256 baseEthPlusRandomWalkNftBidPrice_ = getEthPlusRandomWalkNftBidPrice(baseEthBidPrice_);
		return _applyLateRoundBidPriceIncrease(baseEthPlusRandomWalkNftBidPrice_, currentTimeOffset_);
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

			// Comment-202606074 relates and/or applies.
			mintAndBurnSpecs_[0].value = ( - int256(paidPrice_) );

			mintAndBurnSpecs_[1].account = _msgSender();
			mintAndBurnSpecs_[1].value = int256(bidCstRewardAmount_);
			token.mintAndBurnMany(mintAndBurnSpecs_);
		} else {
			// This does not have the Comment-202606074 issue.
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
		uint256 baseCstBidPrice_ = _getBaseNextCstBidPriceAdvanced(currentTimeOffset_);
		if (baseCstBidPrice_ == 0) {
			return 0;
		}
		return _applyLateRoundBidPriceIncrease(baseCstBidPrice_, currentTimeOffset_);
	}

	// #endregion
	// #region `_getBaseNextCstBidPriceAdvanced`

	function _getBaseNextCstBidPriceAdvanced(int256 currentTimeOffset_) private view returns (uint256) {
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
	// #region `_applyLateRoundBidPriceIncrease`

	function _applyLateRoundBidPriceIncrease(uint256 bidPrice_, int256 currentTimeOffset_) private view returns (uint256) {
		if (bidPrice_ == 0 || lastBidderAddress == address(0)) {
			return bidPrice_;
		}

		uint256 lateRoundBidPriceIncreaseDuration_ = CosmicSignatureConstants.LATE_ROUND_BID_PRICE_INCREASE_DURATION;
		uint256 elapsedDuration_;
		{
			int256 durationUntilMainPrize_ = int256(mainPrizeTime) - (int256(block.timestamp) + currentTimeOffset_);
			if (durationUntilMainPrize_ >= int256(lateRoundBidPriceIncreaseDuration_)) {
				return bidPrice_;
			}
			elapsedDuration_ =
				(durationUntilMainPrize_ <= int256(0)) ?
				lateRoundBidPriceIncreaseDuration_ :
				(lateRoundBidPriceIncreaseDuration_ - uint256(durationUntilMainPrize_));
		}

		uint256 elapsedDurationSquared_ = elapsedDuration_ * elapsedDuration_;
		uint256 elapsedDurationTo4thPower_ = elapsedDurationSquared_ * elapsedDurationSquared_;
		uint256 elapsedDurationTo8thPower_ = elapsedDurationTo4thPower_ * elapsedDurationTo4thPower_;
		uint256 premiumNumerator_ =
			CosmicSignatureConstants.LATE_ROUND_BID_PRICE_INCREASE_PREMIUM_MULTIPLIER *
			elapsedDurationTo8thPower_;
		uint256 bidPriceIncreaseAmount_ = Math.mulDiv(
			bidPrice_,
			premiumNumerator_,
			CosmicSignatureConstants.LATE_ROUND_BID_PRICE_INCREASE_DENOMINATOR
		);
		return bidPrice_ + bidPriceIncreaseAmount_;
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

			// Comment-202605295 applies.
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
