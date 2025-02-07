// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #endregion
// #region

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
// import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { ICosmicSignatureToken } from "./interfaces/ICosmicSignatureToken.sol";
// import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { BiddingBase } from "./BiddingBase.sol";
import { MainPrizeBase } from "./MainPrizeBase.sol";
import { BidStatistics } from "./BidStatistics.sol";
import { IBidding } from "./interfaces/IBidding.sol";

// #endregion
// #region

abstract contract Bidding is
	// ReentrancyGuardTransientUpgradeable,
	CosmicSignatureGameStorage,
	BiddingBase,
	MainPrizeBase,
	BidStatistics,
	IBidding {
	// #region `receive`

	receive() external payable override /*nonReentrant*/ /*onlyRoundIsActive*/ {
		// Bidding with default parameters.
		_bidWithEth((-1), "");
	}

	// #endregion
	// #region `bidWithEthAndDonateToken`

	/// @dev Comment-202502051 relates.
	function bidWithEthAndDonateToken(int256 randomWalkNftId_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external payable override /*nonReentrant*/ /*onlyRoundIsActive*/ {
		_bidWithEth(randomWalkNftId_, message_);
		prizesWallet.donateToken(roundNum, msg.sender, tokenAddress_, amount_);
	}

	// #endregion
	// #region `bidWithEthAndDonateNft`

	/// @dev Comment-202502051 relates.
	function bidWithEthAndDonateNft(int256 randomWalkNftId_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external payable override /*nonReentrant*/ /*onlyRoundIsActive*/ {
		_bidWithEth(randomWalkNftId_, message_);
		// _donateNft(nftAddress_, nftId_);
		prizesWallet.donateNft(roundNum, msg.sender, nftAddress_, nftId_);
	}

	// #endregion
	// #region `bidWithEth`

	function bidWithEth(int256 randomWalkNftId_, string memory message_) external payable override /*nonReentrant*/ /*onlyRoundIsActive*/ {
		_bidWithEth(randomWalkNftId_, message_);
	}

	// #endregion
	// #region `_bidWithEth`

	/// @dev
	/// [Comment-202502051]
	/// I feel that we will get by without `nonReentrant` here.
	/// Keep in mind that this method can be called together with a donation method.
	/// In that case a reentry can skew the order of donation related event emits, but it's probably not too bad.
	/// [/Comment-202502051]
	function _bidWithEth(int256 randomWalkNftId_, string memory message_) internal /*nonReentrant*/ /*onlyRoundIsActive*/ {
		// #region

		// BidType bidType;
		uint256 ethBidPrice_ = getNextEthBidPrice(int256(0));
		uint256 paidEthBidPrice_ =
			(randomWalkNftId_ < int256(0)) ?
			ethBidPrice_ :
			getEthPlusRandomWalkNftBidPrice(ethBidPrice_);
		int256 overpaidEthBidPrice_ = int256(msg.value) - int256(paidEthBidPrice_);

		// [Comment-202412045]
		// Performing this validatin as early as possible to minimize gas fee in case the validation fails.
		// [/Comment-202412045]
		require(
			overpaidEthBidPrice_ >= int256(0),
			CosmicSignatureErrors.InsufficientReceivedBidAmount("The current ETH bid price is greater than the value you transferred.", paidEthBidPrice_, msg.value)
		);

		// #endregion
		// #region

		if (randomWalkNftId_ < int256(0)) {
			// // #enable_asserts assert(bidType == BidType.ETH);
		} else {
			require(
				usedRandomWalkNfts[uint256(randomWalkNftId_)] == 0,
				CosmicSignatureErrors.UsedRandomWalkNft(
					// todo-1 Nick wrote about reducing contract bytecode size:
					// todo-1 also, there is another space - reserve , require() strings. We can remove the strings and leave only error codes.
					// todo-1 It is not going to be very friendly with the user, but if removing strings it fits just under 24K
					// todo-1 I think we should go for it
					"This RandomWalk NFT has already been used for bidding.",
					uint256(randomWalkNftId_)
				)
			);
			require(
				// It would probably be a bad idea to evaluate something like
				// `randomWalkNft._isAuthorized` or `randomWalkNft._isApprovedOrOwner`
				// Comment-202502063 relates.
				msg.sender == randomWalkNft.ownerOf(uint256(randomWalkNftId_)),

				CosmicSignatureErrors.CallerIsNotNftOwner(
					"You are not the owner of the RandomWalk NFT.",
					address(randomWalkNft),
					uint256(randomWalkNftId_),
					msg.sender
				)
			);
			usedRandomWalkNfts[uint256(randomWalkNftId_)] = 1;
			// bidType = BidType.RandomWalk;
		}

		// #endregion
		// #region

		if (lastBidderAddress == address(0)) {
			ethDutchAuctionBeginningBidPrice = ethBidPrice_ * CosmicSignatureConstants.ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;
		}

		// [Comment-202501061]
		// This formula ensures that the result increases.
		// todo-1 Everywhere we use formulas that add 1, make sure the web site uses the same formulas.
		// todo-1 For example, it offers to increase bid price by 1% or 2%.
		// [/Comment-202501061]
		nextEthBidPrice = ethBidPrice_ + ethBidPrice_ / nextEthBidPriceIncreaseDivisor + 1;

		// Updating bidding statistics.
		biddersInfo[roundNum][msg.sender].totalSpentEthAmount += paidEthBidPrice_;

		// Comment-202501125 applies.
		// [ToDo-202409245-1]
		// todo-0
		// Can this, realistically, fail?
		// Comment-202412033 says that this can't overflow.
		// [/ToDo-202409245-1]
		token.mint(msg.sender, cstRewardAmountForBidding);

		// #endregion
		// #region

		_bidCommon(message_ /* , bidType */);

		// #endregion
		// #region

		emit BidPlaced(
			roundNum,
			msg.sender,
			int256(paidEthBidPrice_),
			-1,
			randomWalkNftId_,
			message_,
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
				(bool isSuccess_, ) = msg.sender.call{value: uint256(overpaidEthBidPrice_)}("");

				if ( ! isSuccess_ ) {
					revert CosmicSignatureErrors.FundTransferFailed("ETH refund transfer failed.", msg.sender, uint256(overpaidEthBidPrice_));
				}
			}
		}

		// #endregion
	}

	// #endregion
	// #region `getNextEthBidPrice`

	function getNextEthBidPrice(int256 currentTimeOffset_) public view override returns(uint256) {
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

						// [Comment-202501301]
						// Adding 1 to ensure that the result is a nonzero.
						// [/Comment-202501301]
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

	function getEthPlusRandomWalkNftBidPrice(uint256 ethBidPrice_) public pure override returns(uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// #enable_asserts assert(ethBidPrice_ > 0 && ethBidPrice_ <= type(uint256).max - (CosmicSignatureConstants.RANDOMWALK_NFT_BID_PRICE_DIVISOR - 1));

			// [Comment-202501303]
			// This formula is guaranteed to produce a nonzero result.
			// [/Comment-202501303]
			uint256 ethPlusRandomWalkNftBidPrice_ =
				(ethBidPrice_ + (CosmicSignatureConstants.RANDOMWALK_NFT_BID_PRICE_DIVISOR - 1)) /
				CosmicSignatureConstants.RANDOMWALK_NFT_BID_PRICE_DIVISOR;

			// #enable_asserts assert(ethPlusRandomWalkNftBidPrice_ > 0 && ethPlusRandomWalkNftBidPrice_ <= ethBidPrice_);
			return ethPlusRandomWalkNftBidPrice_;
		}
	}

	// #endregion
	// #region `getEthDutchAuctionDurations`

	function getEthDutchAuctionDurations() external view override returns(uint256, int256) {
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

	function _getEthDutchAuctionDuration() internal view returns(uint256) {
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

	function bidWithCstAndDonateToken(uint256 priceMaxLimit_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external override /*nonReentrant*/ /*onlyRoundIsActive*/ {
		_bidWithCst(priceMaxLimit_, message_);
		prizesWallet.donateToken(roundNum, msg.sender, tokenAddress_, amount_);
	}

	// #endregion
	// #region `bidWithCstAndDonateNft`

	function bidWithCstAndDonateNft(uint256 priceMaxLimit_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external override /*nonReentrant*/ /*onlyRoundIsActive*/ {
		_bidWithCst(priceMaxLimit_, message_);
		// _donateNft(nftAddress_, nftId_);
		prizesWallet.donateNft(roundNum, msg.sender, nftAddress_, nftId_);
	}

	// #endregion
	// #region `bidWithCst`

	function bidWithCst(uint256 priceMaxLimit_, string memory message_) external override /*nonReentrant*/ /*onlyRoundIsActive*/ {
		_bidWithCst(priceMaxLimit_, message_);
	}

	// #endregion
	// #region `_bidWithCst`

	/// todo-1 +++ Does this really have to be `nonReentrant`? No!
	function _bidWithCst(uint256 priceMaxLimit_, string memory message_) internal /*nonReentrant*/ /*onlyRoundIsActive*/ {
		// [Comment-202501045]
		// We are going to `require` that the first bid in a bidding round is ETH near Comment-202501044.
		// [/Comment-202501045]

		// [Comment-202409179]
		// This can be zero.
		// When this is zero, we will burn zero CST tokens near Comment-202409177, so someone can bid with zero CST tokens.
		// We are OK with that.
		// todo-1 +++ Confirm with them again that this is OK.
		// That said, given that we mint a nonzero CST amount for each bid, it's unlikely that the bid price will fall below that.
		// [/Comment-202409179]
		uint256 paidPrice_ = getNextCstBidPrice(int256(0));

		// Comment-202412045 applies.
		require(
			paidPrice_ <= priceMaxLimit_,
			CosmicSignatureErrors.InsufficientReceivedBidAmount("The current CST bid price is greater than the maximum you allowed.", paidPrice_, priceMaxLimit_)
		);

		// [Comment-202412251]
		// This is a common sense requirement.
		// The marketing wallet isn't supposed to bid with CST.
		// The behavior isn't necessarily going to be correct if this condition is not met,
		// but it appears that it's not going to be too bad,
		// so it's probably unnecessary to spend gas to `require` this.
		// That said, the marketing wallet is a contract. It can't possibly bid. So this assertion is guaranteed to succeed.
		// [/Comment-202412251]
		// #enable_asserts assert(msg.sender != marketingWallet);

		// uint256 userBalance = token.balanceOf(msg.sender);

		// // [Comment-202409181]
		// // This validation is unnecessary, given that the burning near Comment-202409177 is going to perform it too.
		// // [/Comment-202409181]
		// require(
		// 	userBalance >= paidPrice_,
		// 	CosmicSignatureErrors.InsufficientCSTBalance(
		// 		"Insufficient CST token balance to make a bid with CST.",
		// 		paidPrice_,
		// 		userBalance
		// 	)
		// );

		// [Comment-202409177]
		// Burning the CST amount used for bidding.
		// Doing it before subsequent minting, which requires the bidder to have the given amount.
		// It probably makes little sense to call `ERC20Burnable.burn` or `ERC20Burnable.burnFrom` instead.
		// [/Comment-202409177]
		// [Comment-202501125]
		// Minting a CST reward to the bidder.
		// [/Comment-202501125]
		// token.burn(msg.sender, paidPrice_);
		// token.transferToMarketingWalletOrBurn(msg.sender, paidPrice_);
		{
			ICosmicSignatureToken.MintOrBurnSpec[] memory mintAndBurnSpecs_ = new ICosmicSignatureToken.MintOrBurnSpec[](2);
			mintAndBurnSpecs_[0].account = msg.sender;
			mintAndBurnSpecs_[0].value = ( - int256(paidPrice_) );
			mintAndBurnSpecs_[1].account = msg.sender;
			mintAndBurnSpecs_[1].value = int256(cstRewardAmountForBidding);
			// ToDo-202409245-1 applies.
			token.mintAndBurnMany(mintAndBurnSpecs_);
		}

		biddersInfo[roundNum][msg.sender].totalSpentCstAmount += paidPrice_;

		// [Comment-202409163]
		// Increasing the starting CST price for the next CST bid, while enforcing a minimum.
		// [/Comment-202409163]
		uint256 newCstDutchAuctionBeginningBidPrice_ =
			Math.max(paidPrice_ * CosmicSignatureConstants.CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER, cstDutchAuctionBeginningBidPriceMinLimit);
		cstDutchAuctionBeginningBidPrice = newCstDutchAuctionBeginningBidPrice_;

		if (lastCstBidderAddress == address(0)) {
			nextRoundFirstCstDutchAuctionBeginningBidPrice = newCstDutchAuctionBeginningBidPrice_;
		}
		lastCstBidderAddress = msg.sender;
		cstDutchAuctionBeginningTimeStamp = block.timestamp;
		_bidCommon(message_ /* , BidType.CST */);
		emit BidPlaced(roundNum, msg.sender, -1, int256(paidPrice_), -1, message_, mainPrizeTime);
	}

	// #endregion
	// #region `getNextCstBidPrice`

	function getNextCstBidPrice(int256 currentTimeOffset_) public view override returns(uint256) {
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

	function getCstDutchAuctionDurations() external view override returns(uint256, int256) {
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

	function _getCstDutchAuctionDuration() internal view returns(uint256) {
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

	function _getCstDutchAuctionElapsedDuration() internal view returns(int256) {
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

	function _getCstDutchAuctionTotalAndRemainingDurations() internal view returns(uint256, int256) {
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

	/// @notice Internal function to handle common bid logic
	/// @dev This function updates game state and distributes rewards
	/// @param message The bidder's message
	/// ---param bidType Bid type code.
	function _bidCommon(string memory message /* , BidType bidType */) internal /*nonReentrant*/ onlyRoundIsActive {
		require(
			bytes(message).length <= bidMessageLengthMaxLimit,
			CosmicSignatureErrors.TooLongBidMessage("Message is too long.", bytes(message).length)
		);

		// First bid of the round?
		if (lastBidderAddress == address(0)) {

			// [Comment-202501044]
			// It's probably more efficient to validate this here than to validate `lastBidderAddress` near Comment-202501045.
			// This logic assumes that ETH bid price is a nonzero.
			// During an ETH Dutch auction, we ensure that near Comment-202501301 and Comment-202501303.
			// todo-1 Make sure it's correct to make this validation at this point, rather than sooner, like near Comment-202501045.
			// todo-1 Maybe write a comment explaining things.
			// [/Comment-202501044]
			require(msg.value > 0, CosmicSignatureErrors.WrongBidType("The first bid in a bidding round shall be ETH."));

			mainPrizeTime = block.timestamp + getInitialDurationUntilMainPrize();
			cstDutchAuctionBeginningTimeStamp = block.timestamp;
			emit FirstBidPlacedInRound(roundNum, block.timestamp);
		} else {
			_updateChampionsIfNeeded();
			_extendMainPrizeTime();
		}

		// lastBidType = bidType;
		lastBidderAddress = msg.sender;
		BidderAddresses storage bidderAddressesReference_ = bidderAddresses[roundNum];
		uint256 numBids_ = bidderAddressesReference_.numItems;
		bidderAddressesReference_.items[numBids_] = msg.sender;
		++ numBids_;
		bidderAddressesReference_.numItems = numBids_;
		biddersInfo[roundNum][msg.sender].lastBidTimeStamp = block.timestamp;

		// // Comment-202501125 applies.
		// // try
		// // ToDo-202409245-1 applies.
		// token.mint(/*lastBidderAddress*/ msg.sender, cstRewardAmountForBidding);
		// // {
		// // } catch {
		// // 	revert
		// // 		CosmicSignatureErrors.ERC20Mint(
		// // 			"CosmicSignatureToken.mint failed to mint reward tokens for the bidder.",
		// // 			/*lastBidderAddress*/ msg.sender,
		// // 			cstRewardAmountForBidding
		// // 		);
		// // }

		// // try
		// // ToDo-202409245-1 applies.
		// token.mint(marketingWallet, marketingWalletCstContributionAmount);
		// // token.mintToMarketingWallet(marketingWalletCstContributionAmount);
		// // {
		// // } catch {
		// // 	revert
		// // 		CosmicSignatureErrors.ERC20Mint(
		// // 			"CosmicSignatureToken.mint failed to mint reward tokens for MarketingWallet.",
		// // 			marketingWallet,
		// // 			marketingWalletCstContributionAmount
		// // 		);
		// // }

		// _extendMainPrizeTime();
	}

	// #endregion
	// #region // `wasRandomWalkNftUsed`

	// function wasRandomWalkNftUsed(uint256 nftId_) external view override returns(bool) {
	// 	// todo-9 This is now a `uint256`.
	// 	return usedRandomWalkNfts[nftId_];
	// }

	// #endregion
}

// #endregion
