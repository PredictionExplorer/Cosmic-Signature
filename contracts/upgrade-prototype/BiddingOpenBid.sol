// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #endregion
// #region

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "../production/OwnableUpgradeableWithReservedStorageGaps.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { CosmicSignatureConstants } from "../production/libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "../production/libraries/CosmicSignatureErrors.sol";
import { ICosmicSignatureToken } from "../production/interfaces/ICosmicSignatureToken.sol";
// import { RandomWalkNFT } from "../production//RandomWalkNFT.sol";
import { CosmicSignatureGameStorage } from "../production/CosmicSignatureGameStorage.sol";
import { BiddingBase } from "../production/BiddingBase.sol";
import { MainPrizeBase } from "../production/MainPrizeBase.sol";
import { BidStatistics } from "../production/BidStatistics.sol";
import { IBidding } from "../production/interfaces/IBidding.sol";

// #endregion
// #region

abstract contract BiddingOpenBid is
	ReentrancyGuardTransientUpgradeable,
	OwnableUpgradeableWithReservedStorageGaps,
	CosmicSignatureGameStorage,
	BiddingBase,
	MainPrizeBase,
	BidStatistics,
	IBidding {
	// #region // Data Types

	// /// @title Parameters needed to place a bid.
	// struct BidParams {
	// 	string message;
	// 	int256 randomWalkNftId;
	// 	bool isOpenBid;
	// }

	// #endregion
	// #region State

	/// @notice Multiples of bid price that open bid has to be.
	/// @dev This really belongs to a new version of `CosmicSignatureGameStorage`, but keeping it simple.
	uint256 public timesEthBidPrice;

	// #endregion
	// #region Events

	/// @dev Issue. This should be moved to an interface.
	event TimesEthBidPriceChangedEvent(uint256 newValue);

	// #endregion
	// #region `setTimesEthBidPrice`

	/// @dev ToDo-202412164-2 applies.
	function setTimesEthBidPrice(uint256 newValue_) external onlyOwner {
		timesEthBidPrice = newValue_;
		emit TimesEthBidPriceChangedEvent(newValue_);
	}

	// #endregion
	// #region `receive`

	receive() external payable override /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		// Bidding with default parameters.
		// BidParams memory defaultParams;
		// // defaultParams.message = "";
		// defaultParams.randomWalkNftId = -1;
		// // defaultParams.isOpenBid =
		// bytes memory param_data = abi.encode(defaultParams);
		// bidWithEth(param_data);
		_bidWithEth((-1), false, "");
	}

	// #endregion
	// #region `bidWithEthAndDonateToken`

	function bidWithEthAndDonateToken(int256 randomWalkNftId_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external payable override /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		revert("This method is not implemented.");
	}

	// #endregion
	// #region `bidWithEthAndDonateToken`

	/// @dev Comment-202502051 applies.
	/// ToDo-202412164-2 applies.
	function bidWithEthAndDonateToken(int256 randomWalkNftId_, bool isOpenBid_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external payable nonReentrant /*_onlyRoundIsActive*/ {
		_bidWithEth(randomWalkNftId_, isOpenBid_, message_);
		prizesWallet.donateToken(roundNum, _msgSender(), tokenAddress_, amount_);
	}

	// #endregion
	// #region `bidWithEthAndDonateNft`

	function bidWithEthAndDonateNft(int256 randomWalkNftId_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external payable override /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		revert("This method is not implemented.");
	}

	// #endregion
	// #region `bidWithEthAndDonateNft`

	/// @dev Comment-202502051 applies.
	/// ToDo-202412164-2 applies.
	function bidWithEthAndDonateNft(int256 randomWalkNftId_, bool isOpenBid_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external payable nonReentrant /*_onlyRoundIsActive*/ {
		_bidWithEth(randomWalkNftId_, isOpenBid_, message_);
		// _donateNft(nftAddress_, nftId_);
		prizesWallet.donateNft(roundNum, _msgSender(), nftAddress_, nftId_);
	}

	// #endregion
	// #region `bidWithEth`

	function bidWithEth(/*bytes memory data_*/ int256 randomWalkNftId_, string memory message_) external payable override /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		revert("This method is not implemented.");
	}

	// #endregion
	// #region `bidWithEth`

	/// @dev Comment-202502051 applies.
	/// ToDo-202412164-2 applies.
	function bidWithEth(/*bytes memory data_*/ int256 randomWalkNftId_, bool isOpenBid_, string memory message_) external payable /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		_bidWithEth(/*data_*/ randomWalkNftId_, isOpenBid_, message_);
	}

	// #endregion
	// #region `_bidWithEth`

	/// @param isOpenBid_ Set this to `true` to specify that the bid price is "open", meaning any price the user wants.
	/// `nextEthBidPrice` will be calculated based on `msg.value`.
	function _bidWithEth(/*bytes memory data_*/ int256 randomWalkNftId_, bool isOpenBid_, string memory message_) internal /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		// #region
		
		// BidParams memory params = abi.decode(data_, (BidParams));
		// BidType bidType_;
		uint256 ethBidPrice_ = getNextEthBidPrice(int256(0));
		uint256 paidEthBidPrice_;
		int256 overpaidEthBidPrice_ = int256(0);

		// #endregion
		// #region

		if (/*params.randomWalkNftId*/ randomWalkNftId_ < int256(0)) {
			// #region

			if (/*params.isOpenBid*/ isOpenBid_) {
				uint256 ethOpenBidPriceMinLimit_ = ethBidPrice_ * timesEthBidPrice;

				// Comment-202412045 applies.
				require(
					msg.value >= ethOpenBidPriceMinLimit_,
					CosmicSignatureErrors.InsufficientReceivedBidAmount("The ETH value you transferred for open bid is insufficient.", ethOpenBidPriceMinLimit_, msg.value)
				);

				paidEthBidPrice_ = msg.value;
				// #enable_asserts assert(overpaidEthBidPrice_ == int256(0));
			} else {
				paidEthBidPrice_ = ethBidPrice_;
				overpaidEthBidPrice_ = int256(msg.value) - int256(paidEthBidPrice_);

				// Comment-202412045 applies.
				require(
					overpaidEthBidPrice_ >= int256(0),
					CosmicSignatureErrors.InsufficientReceivedBidAmount("The current ETH bid price is greater than the value you transferred.", paidEthBidPrice_, msg.value)
				);
			}

			// #endregion
			// #region

			if (lastBidderAddress == address(0)) {
				ethDutchAuctionBeginningBidPrice = paidEthBidPrice_ * CosmicSignatureConstants.ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;
			}

			// Comment-202501061 applies.
			nextEthBidPrice = paidEthBidPrice_ + paidEthBidPrice_ / nextEthBidPriceIncreaseDivisor + 1;

			// // #enable_asserts assert(bidType_ == BidType.ETH);

			// #endregion
		} else {
			// #region

			// Issue. Somewhere around here, we probably should evaluate `isOpenBid_` and act differently if it's `true`.

			paidEthBidPrice_ = getEthPlusRandomWalkNftBidPrice(ethBidPrice_);
			overpaidEthBidPrice_ = int256(msg.value) - int256(paidEthBidPrice_);

			// Comment-202412045 applies.
			require(
				overpaidEthBidPrice_ >= int256(0),
				CosmicSignatureErrors.InsufficientReceivedBidAmount("The current ETH bid price is greater than the value you transferred.", paidEthBidPrice_, msg.value)
			);

			if (lastBidderAddress == address(0)) {
				ethDutchAuctionBeginningBidPrice = ethBidPrice_ * CosmicSignatureConstants.ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;
			}

			// Comment-202501061 applies.
			nextEthBidPrice = ethBidPrice_ + ethBidPrice_ / nextEthBidPriceIncreaseDivisor + 1;
			
			// #endregion
			// #region

			require(
				usedRandomWalkNfts[uint256(/*params.randomWalkNftId*/ randomWalkNftId_)] == 0,
				CosmicSignatureErrors.UsedRandomWalkNft(
					"This RandomWalk NFT has already been used for bidding.",
					uint256(/*params.randomWalkNftId*/ randomWalkNftId_)
				)
			);
			require(
				// Comment-202502091 applies.
				_msgSender() == randomWalkNft.ownerOf(uint256(/*params.randomWalkNftId*/ randomWalkNftId_)),

				CosmicSignatureErrors.CallerIsNotNftOwner(
					"You are not the owner of the RandomWalk NFT.",
					address(randomWalkNft),
					uint256(/*params.randomWalkNftId*/ randomWalkNftId_),
					_msgSender()
				)
			);
			usedRandomWalkNfts[uint256(/*params.randomWalkNftId*/ randomWalkNftId_)] = 1;
			// bidType_ = BidType.RandomWalk;
			
			// #endregion
		}

		// #endregion
		// #region

		// Updating bidding statistics.
		biddersInfo[roundNum][_msgSender()].totalSpentEthAmount += paidEthBidPrice_;

		// Comment-202501125 applies.
		token.mint(_msgSender(), cstRewardAmountForBidding);

		// #endregion
		// #region

		_bidCommon(/*params.message*/ message_ /* , bidType_ */);

		// #endregion
		// #region

		emit BidPlaced(
			roundNum,
			_msgSender(),
			int256(paidEthBidPrice_),
			-1,
			/*params.randomWalkNftId*/ randomWalkNftId_,
			/*params.message*/ message_,
			mainPrizeTime
		);

		// #endregion
		// #region

		if (overpaidEthBidPrice_ > int256(0)) {
			// Refunding excess ETH if the bidder sent more than required.
			// But first checking if the refund is big enough to justify the refund transfer transaction fee.
			// Comment-202502052 relates and/or applies.
			// Comment-202502054 relates and/or applies.
			uint256 ethBidRefundAmountMinLimit_ = ethBidRefundAmountInGasMinLimit * block.basefee;
			if (uint256(overpaidEthBidPrice_) >= ethBidRefundAmountMinLimit_) {
				// A reentry can happen here.
				// Comment-202502051 relates.
				// Comment-202502043 applies.
				(bool isSuccess_, ) = _msgSender().call{value: uint256(overpaidEthBidPrice_)}("");

				if ( ! isSuccess_ ) {
					revert CosmicSignatureErrors.FundTransferFailed("ETH refund transfer failed.", _msgSender(), uint256(overpaidEthBidPrice_));
				}
			}
		}

		// #endregion
	}

	// #endregion
	// #region `getNextEthBidPrice`

	function getNextEthBidPrice(int256 currentTimeOffset_) public view override returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 nextEthBidPrice_;
			if (lastBidderAddress == address(0)) {
				nextEthBidPrice_ = ethDutchAuctionBeginningBidPrice;
				// #enable_asserts assert((nextEthBidPrice_ == 0) == (roundNum == 0));
				if (nextEthBidPrice_ == 0) {
					nextEthBidPrice_ = CosmicSignatureConstants.FIRST_ROUND_INITIAL_ETH_BID_PRICE;
				} else {
					int256 ethDutchAuctionElapsedDuration_ = getDurationElapsedSinceRoundActivation() + currentTimeOffset_;
					if (ethDutchAuctionElapsedDuration_ > int256(0)) {
						// If this assertion fails, further assertions will not necessarily succeed and the behavior will not necessarily be correct.
						// #enable_asserts assert(ethDutchAuctionEndingBidPriceDivisor > 1);

						// Comment-202501301 applies.
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
			// #enable_asserts assert(ethBidPrice_ > 0 && ethBidPrice_ <= type(uint256).max - (CosmicSignatureConstants.RANDOMWALK_NFT_BID_PRICE_DIVISOR - 1));

			// Comment-202501303 applies.
			uint256 ethPlusRandomWalkNftBidPrice_ =
				(ethBidPrice_ + (CosmicSignatureConstants.RANDOMWALK_NFT_BID_PRICE_DIVISOR - 1)) /
				CosmicSignatureConstants.RANDOMWALK_NFT_BID_PRICE_DIVISOR;

			// #enable_asserts assert(ethPlusRandomWalkNftBidPrice_ > 0 && ethPlusRandomWalkNftBidPrice_ <= ethBidPrice_);
			return ethPlusRandomWalkNftBidPrice_;
		}
	}

	// #endregion
	// #region `getEthDutchAuctionDurations`

	function getEthDutchAuctionDurations() external view override returns (uint256, int256) {
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

	function _getEthDutchAuctionDuration() internal view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 ethDutchAuctionDuration_ = mainPrizeTimeIncrementInMicroSeconds / ethDutchAuctionDurationDivisor;
			return ethDutchAuctionDuration_;
		}
	}

	// #endregion
	// #region `bidWithCstAndDonateToken`

	function bidWithCstAndDonateToken(uint256 priceMaxLimit_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external override /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		_bidWithCst(priceMaxLimit_, message_);
		prizesWallet.donateToken(roundNum, _msgSender(), tokenAddress_, amount_);
	}

	// #endregion
	// #region `bidWithCstAndDonateNft`

	function bidWithCstAndDonateNft(uint256 priceMaxLimit_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external override /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		_bidWithCst(priceMaxLimit_, message_);
		// _donateNft(nftAddress_, nftId_);
		prizesWallet.donateNft(roundNum, _msgSender(), nftAddress_, nftId_);
	}

	// #endregion
	// #region `bidWithCst`

	function bidWithCst(uint256 priceMaxLimit_, string memory message_) external override /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		_bidWithCst(priceMaxLimit_, message_);
	}

	// #endregion
	// #region `_bidWithCst`

	function _bidWithCst(uint256 priceMaxLimit_, string memory message_) internal /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		// Comment-202501045 applies.

		// Comment-202409179 applies.
		uint256 paidPrice_ = getNextCstBidPrice(int256(0));

		// Comment-202412045 applies.
		require(
			paidPrice_ <= priceMaxLimit_,
			CosmicSignatureErrors.InsufficientReceivedBidAmount("The current CST bid price is greater than the maximum you allowed.", paidPrice_, priceMaxLimit_)
		);

		// Comment-202412251 applies.
		// #enable_asserts assert(_msgSender() != marketingWallet);

		// uint256 userBalance = token.balanceOf(_msgSender());

		// // Comment-202409181 applies.
		// require(
		// 	userBalance >= paidPrice_,
		// 	CosmicSignatureErrors.InsufficientCSTBalance(
		// 		"Insufficient CST token balance to make a bid with CST.",
		// 		paidPrice_,
		// 		userBalance
		// 	)
		// );

		// Comment-202409177 applies.
		// Comment-202501125 applies.
		// token.burn(_msgSender(), paidPrice_);
		// token.transferToMarketingWalletOrBurn(_msgSender(), paidPrice_);
		{
			ICosmicSignatureToken.MintOrBurnSpec[] memory mintAndBurnSpecs_ = new ICosmicSignatureToken.MintOrBurnSpec[](2);
			mintAndBurnSpecs_[0].account = _msgSender();
			mintAndBurnSpecs_[0].value = ( - int256(paidPrice_) );
			mintAndBurnSpecs_[1].account = _msgSender();
			mintAndBurnSpecs_[1].value = int256(cstRewardAmountForBidding);
			token.mintAndBurnMany(mintAndBurnSpecs_);
		}

		biddersInfo[roundNum][_msgSender()].totalSpentCstAmount += paidPrice_;

		// Comment-202409163 applies.
		uint256 newCstDutchAuctionBeginningBidPrice_ =
			Math.max(paidPrice_ * CosmicSignatureConstants.CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER, cstDutchAuctionBeginningBidPriceMinLimit);
		cstDutchAuctionBeginningBidPrice = newCstDutchAuctionBeginningBidPrice_;

		if (lastCstBidderAddress == address(0)) {
			nextRoundFirstCstDutchAuctionBeginningBidPrice = newCstDutchAuctionBeginningBidPrice_;
		}
		lastCstBidderAddress = _msgSender();
		cstDutchAuctionBeginningTimeStamp = block.timestamp;
		_bidCommon(message_ /* , BidType.CST */);
		emit BidPlaced(roundNum, _msgSender(), -1, int256(paidPrice_), -1, message_, mainPrizeTime);
	}

	// #endregion
	// #region `getNextCstBidPrice`

	function getNextCstBidPrice(int256 currentTimeOffset_) public view override returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			(uint256 cstDutchAuctionDuration_, int256 cstDutchAuctionRemainingDuration_) = _getCstDutchAuctionTotalAndRemainingDurations();
			cstDutchAuctionRemainingDuration_ -= currentTimeOffset_;
			if (cstDutchAuctionRemainingDuration_ <= int256(0)) {
				return 0;
			}

			// Comment-202501307 relates and/or applies.
			uint256 cstDutchAuctionBeginningBidPrice_ =
				(lastCstBidderAddress == address(0)) ? nextRoundFirstCstDutchAuctionBeginningBidPrice : cstDutchAuctionBeginningBidPrice;
				
			uint256 nextCstBidPrice_ = cstDutchAuctionBeginningBidPrice_ * uint256(cstDutchAuctionRemainingDuration_) / cstDutchAuctionDuration_;
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
			uint256 cstDutchAuctionDuration_ = _getCstDutchAuctionDuration();
			int256 cstDutchAuctionElapsedDuration_ = _getCstDutchAuctionElapsedDuration();
			return (cstDutchAuctionDuration_, cstDutchAuctionElapsedDuration_);
		}
	}

	// #endregion
	// #region `_getCstDutchAuctionDuration`

	function _getCstDutchAuctionDuration() internal view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 cstDutchAuctionDuration_ = mainPrizeTimeIncrementInMicroSeconds / cstDutchAuctionDurationDivisor;
			return cstDutchAuctionDuration_;
		}
	}

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
	// #region `_getCstDutchAuctionTotalAndRemainingDurations`

	function _getCstDutchAuctionTotalAndRemainingDurations() internal view returns (uint256, int256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 cstDutchAuctionDuration_ = _getCstDutchAuctionDuration();
			int256 cstDutchAuctionElapsedDuration_ = _getCstDutchAuctionElapsedDuration();
			int256 cstDutchAuctionRemainingDuration_ = int256(cstDutchAuctionDuration_) - cstDutchAuctionElapsedDuration_;
			return (cstDutchAuctionDuration_, cstDutchAuctionRemainingDuration_);
		}
	}

	// #endregion
	// #region `_bidCommon`

	/// @notice Internal function to handle common bid logic.
	/// @dev This function updates game state and distributes rewards.
	/// @param message_ The bidder's message.
	/// --- param bidType_ Bid type code.
	function _bidCommon(string memory message_ /* , BidType bidType_ */) internal /*nonReentrant*/ _onlyRoundIsActive {
		require(
			bytes(message_).length <= bidMessageLengthMaxLimit,
			CosmicSignatureErrors.TooLongBidMessage("Message is too long.", bytes(message_).length)
		);

		// First bid of the round?
		if (lastBidderAddress == address(0)) {

			// Comment-202501044 applies.
			require(msg.value > 0, CosmicSignatureErrors.WrongBidType("The first bid in a bidding round shall be ETH."));

			mainPrizeTime = block.timestamp + getInitialDurationUntilMainPrize();
			cstDutchAuctionBeginningTimeStamp = block.timestamp;
			emit FirstBidPlacedInRound(roundNum, block.timestamp);
		} else {
			_updateChampionsIfNeeded();
			_extendMainPrizeTime();
		}

		// lastBidType = bidType_;
		lastBidderAddress = _msgSender();
		BidderAddresses storage bidderAddressesReference_ = bidderAddresses[roundNum];
		uint256 numBids_ = bidderAddressesReference_.numItems;
		bidderAddressesReference_.items[numBids_] = _msgSender();
		++ numBids_;
		bidderAddressesReference_.numItems = numBids_;
		biddersInfo[roundNum][_msgSender()].lastBidTimeStamp = block.timestamp;
	}

	// #endregion
}

// #endregion
