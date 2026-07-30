// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureGameStorageV2Base } from "./CosmicSignatureGameStorageV2Base.sol";
import { BiddingCommonV2 } from "./BiddingCommonV2.sol";
import { MainPrizeCommonV2 } from "./MainPrizeCommonV2.sol";
import { BidStatisticsV2 } from "./BidStatisticsV2.sol";
import { IBidding1V2 } from "./interfaces/IBidding1V2.sol";

// #endregion
// #region

abstract contract BiddingV2Base is
	ReentrancyGuardTransientUpgradeable,
	OwnableUpgradeableWithReservedStorageGaps,
	CosmicSignatureGameStorageV2Base,
	BiddingCommonV2,
	MainPrizeCommonV2,
	BidStatisticsV2,
	IBidding1V2 {
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

	function _bidWithEth(int256 randomWalkNftId_, string memory message_, uint256 bidCstRewardAmountMinLimit_) internal virtual;

	// #endregion
	// #region `getNextEthBidPrice`

	function getNextEthBidPrice() external view override returns (uint256) {
		return getNextEthBidPriceAdvanced(int256(0));
	}

	// #endregion
	// #region `getNextEthBidPriceAdvanced`

	function getNextEthBidPriceAdvanced(int256 currentTimeOffset_) public view override virtual returns (uint256) {
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
		// // #enable_smtchecker /*
		// unchecked
		// // #enable_smtchecker */

		uint256 ethDutchAuctionDuration_ = _getEthDutchAuctionDuration();
		int256 ethDutchAuctionElapsedDuration_ = getDurationElapsedSinceRoundActivation();
		return (ethDutchAuctionDuration_, ethDutchAuctionElapsedDuration_);
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

	function _bidWithCst(uint256 priceMaxLimit_, string memory message_, uint256 bidCstRewardAmountMinLimit_) internal virtual;

	// #endregion
	// #region `getNextCstBidPrice`

	function getNextCstBidPrice() external view override returns (uint256) {
		return getNextCstBidPriceAdvanced(int256(0));
	}

	// #endregion
	// #region `getNextCstBidPriceAdvanced`

	function getNextCstBidPriceAdvanced(int256 currentTimeOffset_) public view virtual returns (uint256);

	// #endregion
	// #region `_getCstDutchAuctionElapsedDuration`

	function _getCstDutchAuctionElapsedDuration() internal view returns (int256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			int256 cstDutchAuctionElapsedDuration_ = int256(block.timestamp) - int256(cstDutchAuctionBeginningTimeStamp);
			return cstDutchAuctionElapsedDuration_;
		}
	}

	// #endregion
	// #region `getBidCstRewardAmount`

	function getBidCstRewardAmount() external view override returns (uint256) {
		return getBidCstRewardAmountAdvanced(int256(0));
	}

	// #endregion
	// #region `getBidCstRewardAmountAdvanced`

	function getBidCstRewardAmountAdvanced(int256 currentTimeOffset_) public view virtual returns (uint256);

	// #endregion
	// #region `_bidCommon`

	/// @notice Comment-202605291 applies.
	/// @param message_ Comment-202503155 applies.
	/// @dev Comment-202411169 relates and/or applies.
	function _bidCommon(/*BidType bidType_,*/ string memory message_) internal /*nonReentrant*/ /*_onlyRoundIsActive*/ {
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
}

// #endregion
