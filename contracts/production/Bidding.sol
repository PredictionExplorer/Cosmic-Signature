// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

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
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { BiddingBase } from "./BiddingBase.sol";
import { MainPrizeBase } from "./MainPrizeBase.sol";
import { BidStatistics } from "./BidStatistics.sol";
import { IBidding } from "./interfaces/IBidding.sol";

// #endregion
// #region

/// @title Bidding
/// @author Cosmic Signature Team
/// @notice Handles ETH and CST bidding logic for the Cosmic Signature game.
/// @dev This contract implements:
/// - ETH bidding with Dutch auction pricing for the first bid of each round.
/// - CST (Cosmic Signature Token) bidding with its own Dutch auction.
/// - Random Walk NFT integration for discounted ETH bids.
/// - Donation capabilities (tokens and NFTs can be donated alongside bids).
/// - Bid price calculations and refund logic for overpayments.
abstract contract Bidding is
	ReentrancyGuardTransientUpgradeable,
	OwnableUpgradeableWithReservedStorageGaps,
	CosmicSignatureGameStorage,
	BiddingBase,
	MainPrizeBase,
	BidStatistics,
	IBidding {
	// #region `receive`

	/// @notice Fallback function that allows direct ETH transfers to be treated as bids.
	/// @dev Calls `_bidWithEth` with no Random Walk NFT and an empty message.
	receive() external payable override nonReentrant /*_onlyRoundIsActive*/ {
		_bidWithEth((-1), "");
	}

	// #endregion
	// #region `halveEthDutchAuctionEndingBidPrice`

	/// @notice Halves the ETH Dutch auction ending bid price when the auction has stalled.
	/// @dev This emergency function allows the owner to restart a stalled Dutch auction by:
	/// 1. Doubling `ethDutchAuctionEndingBidPriceDivisor` (halving the ending price).
	/// 2. Adjusting `ethDutchAuctionDurationDivisor` to maintain price continuity.
	///
	/// Can only be called after the ETH Dutch auction has fully elapsed and before any bid is placed.
	/// The owner must restore these parameters after the round ends.
	///
	/// [Comment-202508184]
	/// Observable universe entities accessed here:
	///    `onlyOwner`.
	///    // `CosmicSignatureErrors.EthDutchAuctionEndingBidPriceHalvingError`.
	///    `CosmicSignatureErrors.InvalidOperationInCurrentState`.
	///    // `roundActivationTime`.
	///    // `ethDutchAuctionDurationDivisor`.
	///    `ethDutchAuctionBeginningBidPrice`.
	///    `ethDutchAuctionEndingBidPriceDivisor`.
	///    `mainPrizeTimeIncrementInMicroSeconds`.
	///    `_onlyNonFirstRound`.
	///       [Comment-202508134]
	///       Given Comment-202508094, this logic can't work on the very first bidding round.
	///       [/Comment-202508134]
	///    `_onlyBeforeBidPlacedInRound`.
	///    `_setEthDutchAuctionDurationDivisor`.
	///    `_setEthDutchAuctionEndingBidPriceDivisor`.
	///    `getEthDutchAuctionDurations`.
	/// [/Comment-202508184]
	function halveEthDutchAuctionEndingBidPrice() external override onlyOwner() _onlyNonFirstRound() /*_onlyRoundIsInactive()*/ _onlyBeforeBidPlacedInRound() {
		// Check out comments near this method declaration in `IBidding`.
		// It's possible to implement this logic in an external script, but it's more robust in a method.
		//
		// [Comment-202508102]
		// This method changes `ethDutchAuctionDurationDivisor` and `ethDutchAuctionEndingBidPriceDivisor`.
		// After the current bidding round ends, the contract owner must restore those parameters by calling respective setters.
		// [/Comment-202508102]
		//
		// [Comment-202508105]
		// In some way, this method resembles other contract parameter setters, however contrary to Comment-202411236,
		// it would be incorrect for the caller to set `roundActivationTime` to a point in the future before calling this method
		// because this method uses `roundActivationTime`. In fact, the validation near Comment-202508096 would fail
		// if `roundActivationTime` is in the future.
		// [/Comment-202508105]

		(uint256 ethDutchAuctionDuration_, int256 ethDutchAuctionElapsedDuration_) = getEthDutchAuctionDurations();
		// // #enable_asserts // #disable_smtchecker console.log("202508107", ethDutchAuctionDuration_, uint256(ethDutchAuctionElapsedDuration_));

		// [Comment-202508096]
		// Validating that the ETH Dutch auction has ended some duration ago.
		// The most correct requirement would be that the ETH bid price returned by `getNextEthBidPrice`
		// has reached its minimum in a past block.
		// This condition isn't necessarily a perfet substiturte for that in case a block spans multiple seconds, and that's OK.
		// [/Comment-202508096]
		if ( ! (ethDutchAuctionElapsedDuration_ > int256(ethDutchAuctionDuration_)) ) {
			revert CosmicSignatureErrors.InvalidOperationInCurrentState("Too early.");
		}

		uint256 newEthDutchAuctionEndingBidPriceDivisor_ = ethDutchAuctionEndingBidPriceDivisor;

		// [Comment-202508187]
		// This is what `getNextEthBidPriceAdvanced` returns when `ethDutchAuctionElapsedDuration_ >= ethDutchAuctionDuration_`.
		// We have validated a tighter condition near Comment-202508096.
		// [/Comment-202508187]
		// Comment-202501301 applies.
		// Comment-202508103 applies.
		uint256 currentEthBidPrice_ = ethDutchAuctionBeginningBidPrice / newEthDutchAuctionEndingBidPriceDivisor_ + 1;

		// [Comment-202508192]
		// Doubling this.
		// This can potentially overflow.
		// [/Comment-202508192]
		newEthDutchAuctionEndingBidPriceDivisor_ *= 2;

		// [Comment-202508189]
		// The new ETH Dutch auction ending bid price, which is approximately a half of `currentEthBidPrice_`.
		// [/Comment-202508189]
		// Comment-202501301 applies.
		// Comment-202508103 applies.
		uint256 ethDutchAuctionEndingBidPrice_ = ethDutchAuctionBeginningBidPrice / newEthDutchAuctionEndingBidPriceDivisor_ + 1;

		// [Comment-202508191]
		// We need a formula to adjust `ethDutchAuctionDurationDivisor` so that
		// the value returned by `getNextEthBidPrice` leapped as little as possible.
		//
		// This is how `getNextEthBidPriceAdvanced` calculates the current ETH bid price.
		// It needs to remain being approximately equal `currentEthBidPrice_`.
		//
		// ethDutchAuctionBeginningBidPrice -
		// (ethDutchAuctionBeginningBidPrice - ethDutchAuctionEndingBidPrice_) * ethDutchAuctionElapsedDuration_ / ethDutchAuctionDuration_
		//
		// `ethDutchAuctionDuration_` will now increase due to `ethDutchAuctionDurationDivisor` declining.
		// As seen near Comment-202508099:
		// ethDutchAuctionDuration_ == mainPrizeTimeIncrementInMicroSeconds / newEthDutchAuctionDurationDivisor_
		//
		// Let's transform the equation to calculate `newEthDutchAuctionDurationDivisor_`.
		//
		// currentEthBidPrice_ ==
		// ethDutchAuctionBeginningBidPrice -
		// (ethDutchAuctionBeginningBidPrice - ethDutchAuctionEndingBidPrice_) * ethDutchAuctionElapsedDuration_ / (mainPrizeTimeIncrementInMicroSeconds / newEthDutchAuctionDurationDivisor_)
		//
		// ethDutchAuctionBeginningBidPrice - currentEthBidPrice_ ==
		// (ethDutchAuctionBeginningBidPrice - ethDutchAuctionEndingBidPrice_) * ethDutchAuctionElapsedDuration_ * newEthDutchAuctionDurationDivisor_ / mainPrizeTimeIncrementInMicroSeconds
		//
		// newEthDutchAuctionDurationDivisor_ ==
		// (ethDutchAuctionBeginningBidPrice - currentEthBidPrice_) *
		// mainPrizeTimeIncrementInMicroSeconds /
		// ((ethDutchAuctionBeginningBidPrice - ethDutchAuctionEndingBidPrice_) * ethDutchAuctionElapsedDuration_)
		// [/Comment-202508191]
		uint256 newEthDutchAuctionDurationDivisor_;
		{
			uint256 numerator_ = (ethDutchAuctionBeginningBidPrice - currentEthBidPrice_) * mainPrizeTimeIncrementInMicroSeconds;
			uint256 denominator_ = (ethDutchAuctionBeginningBidPrice - ethDutchAuctionEndingBidPrice_) * uint256(ethDutchAuctionElapsedDuration_);

			// [Comment-202508142]
			// Provided our configuration is correct, neither numerator nor denominator can be zero,
			// while their quotient can potentially be.
			// Not adding a half of the denominator to the numerator.
			// Adding 1 to the quotient, and therefore the result cannot be zero.
			// Another alternative would be to not add 1.
			// The current formula is better because the alternatives sometimes result in a temporary increase of the ETH bid price,
			// while our goal is to reduce it.
			// [/Comment-202508142]
			newEthDutchAuctionDurationDivisor_ = (numerator_ /* + denominator_ / 2 */) / denominator_ + 1;
		}
		// if ( ! (newEthDutchAuctionDurationDivisor_ > 0) ) {
		// 	revert CosmicSignatureErrors.EthDutchAuctionEndingBidPriceHalvingError("newEthDutchAuctionDurationDivisor_ == 0");
		// }
		// #enable_asserts assert(newEthDutchAuctionDurationDivisor_ > 0);

		/*
		{
			// [Comment-202508135]
			// This asserion doesn't appear to fail, but is it guaranteed not to?
			// It appears to be OK if somehow it fails.
			// [Comment-202508139]
			// Under normal production conditions, this assertion will succeed.
			// [/Comment-202508139]
			// [/Comment-202508135]
			assert(newEthDutchAuctionDurationDivisor_ <= ethDutchAuctionDurationDivisor);

			// Comment-202508099 applies.
			uint256 newEthDutchAuctionDuration_ = mainPrizeTimeIncrementInMicroSeconds / newEthDutchAuctionDurationDivisor_;

			// Comment-202508135 applies.
			assert(newEthDutchAuctionDuration_ >= ethDutchAuctionDuration_);

			// [Comment-202508157]
			// This assertion can fail.
			// If it fails it means that despite of us changing contract parameters, the ETH Dutch auction has already ended,
			// so the ETH bid price would instantly halve, which is undesirable.
			// But it happens only when the ETH bid price is already very small, so it makes little difference.
			// This assertion would not necessarily have a chance to fail if we didn't add 1 near Comment-202508142,
			// but it would come at the cost of having a different issue described in that comment.
			// Comment-202508139 applies.
			// [/Comment-202508157]
			assert(newEthDutchAuctionDuration_ > uint256(ethDutchAuctionElapsedDuration_));
		}
		*/

		_setEthDutchAuctionDurationDivisor(newEthDutchAuctionDurationDivisor_);
		_setEthDutchAuctionEndingBidPriceDivisor(newEthDutchAuctionEndingBidPriceDivisor_);
	}

	// #endregion
	// #region `bidWithEthAndDonateToken`

	/// @inheritdoc IBidding
	function bidWithEthAndDonateToken(int256 randomWalkNftId_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external payable override nonReentrant /*_onlyRoundIsActive*/ {
		_bidWithEth(randomWalkNftId_, message_);
		prizesWallet.donateToken(roundNum, _msgSender(), tokenAddress_, amount_);
	}

	// #endregion
	// #region `bidWithEthAndDonateNft`

	/// @inheritdoc IBidding
	function bidWithEthAndDonateNft(int256 randomWalkNftId_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external payable override nonReentrant /*_onlyRoundIsActive*/ {
		_bidWithEth(randomWalkNftId_, message_);
		prizesWallet.donateNft(roundNum, _msgSender(), nftAddress_, nftId_);
	}

	// #endregion
	// #region `bidWithEth`

	/// @inheritdoc IBidding
	function bidWithEth(int256 randomWalkNftId_, string memory message_) external payable override nonReentrant /*_onlyRoundIsActive*/ {
		_bidWithEth(randomWalkNftId_, message_);
	}

	// #endregion
	// #region `_bidWithEth`

	/// @notice Internal implementation of ETH bidding logic.
	/// @param randomWalkNftId_ The Random Walk NFT ID to use for a discounted bid, or -1 for a regular bid.
	/// @param message_ Optional message to include with the bid.
	/// @dev Handles:
	/// - Bid price calculation (regular or discounted with Random Walk NFT).
	/// - Overpayment refunds (if above the configurable threshold).
	/// - Random Walk NFT usage validation and marking.
	/// - ETH Dutch auction price updates.
	/// - CST reward minting for bidders.
	function _bidWithEth(int256 randomWalkNftId_, string memory message_) private /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		// #region Calculate bid price

		// Comment-202503162 relates and/or applies.
		uint256 ethBidPrice_ = getNextEthBidPriceAdvanced(int256(0));
		uint256 paidEthPrice_ =
			(randomWalkNftId_ < int256(0)) ?
			ethBidPrice_ :
			getEthPlusRandomWalkNftBidPrice(ethBidPrice_);

		// #endregion
		// #region Handle overpayment and underpayment

		int256 overpaidEthPrice_ = int256(msg.value) - int256(paidEthPrice_);
		if (overpaidEthPrice_ == int256(0)) {
			// Exact payment - most common case. No action needed.
		} else if(overpaidEthPrice_ > int256(0)) {
			// Overpayment handling: if the excess is small (below gas cost threshold),
			// treat the entire payment as the bid price to save gas on refunds.
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
			// [Comment-202412045]
			// Performing this validation sooner -- to minimize transaction fee in case the validation fails.
			// [/Comment-202412045]
			revert CosmicSignatureErrors.InsufficientReceivedBidAmount("The current ETH bid price is greater than the amount you transferred.", paidEthPrice_, msg.value);
		}

		// #endregion
		// #region Validate and mark Random Walk NFT if used

		if (randomWalkNftId_ < int256(0)) {
			// Regular ETH bid without Random Walk NFT discount.
		} else {
			// Discounted bid using Random Walk NFT - validate ownership and usage.
			require(
				usedRandomWalkNfts[uint256(randomWalkNftId_)] == 0,
				CosmicSignatureErrors.UsedRandomWalkNft(
					"This Random Walk NFT has already been used for bidding.",
					uint256(randomWalkNftId_)
				)
			);
			require(
				// [Comment-202502091]
				// It would probably be a bad idea to evaluate something like
				// `randomWalkNft._isAuthorized` or `randomWalkNft._isApprovedOrOwner`
				// Comment-202502063 relates.
				// [/Comment-202502091]
				_msgSender() == randomWalkNft.ownerOf(uint256(randomWalkNftId_)),

				CosmicSignatureErrors.CallerIsNotNftOwner(
					"You are not the owner of this Random Walk NFT.",
					randomWalkNft,
					uint256(randomWalkNftId_),
					_msgSender()
				)
			);
			// Mark this Random Walk NFT as used to prevent reuse.
			usedRandomWalkNfts[uint256(randomWalkNftId_)] = 1;
		}

		// #endregion
		// #region Update state and process bid

		// Track ETH spent by this bidder.
		biddersInfo[roundNum][_msgSender()].totalSpentEthAmount += paidEthPrice_;

		// Set the Dutch auction beginning price on the first bid of the round.
		if (lastBidderAddress == address(0)) {
			ethDutchAuctionBeginningBidPrice = ethBidPrice_ * CosmicSignatureConstants.ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;
		}

		// [Comment-202501061]
		// This formula ensures that the result increases.
		// [/Comment-202501061]
		// Calculate the next ETH bid price with guaranteed increase.
		nextEthBidPrice = ethBidPrice_ + ethBidPrice_ / ethBidPriceIncreaseDivisor + 1;

		// Comment-202501125 applies.
		// Mint CST reward for placing a bid.
		token.mint(_msgSender(), cstRewardAmountForBidding);

		_bidCommon(/*bidType_,*/ message_);
		emit BidPlaced(
			roundNum,
			_msgSender(),
			int256(paidEthPrice_),
			-1,
			randomWalkNftId_,
			message_,
			mainPrizeTime
		);

		// #endregion
		// #region Refund excess ETH if applicable

		// [Comment-202505096]
		// Refunding excess ETH if the bidder sent significantly more than required.
		// Comment-202502052 relates.
		// [/Comment-202505096]
		if (overpaidEthPrice_ > int256(0)) {
			// // #enable_asserts // #disable_smtchecker uint256 gasUsed1_ = gasleft();
			// // #enable_asserts // #disable_smtchecker uint256 gasUsed2_ = gasleft();

			// [Comment-202506219/]
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

	/// @inheritdoc IBidding
	function getNextEthBidPrice() external view override returns (uint256) {
		return getNextEthBidPriceAdvanced(int256(0));
	}

	// #endregion
	// #region `getNextEthBidPriceAdvanced`

	/// @inheritdoc IBidding
	/// @dev The ETH bid price follows a Dutch auction pattern for the first bid of each round,
	/// then increases incrementally for subsequent bids.
	function getNextEthBidPriceAdvanced(int256 currentTimeOffset_) public view override returns (uint256) {
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
					if (ethDutchAuctionElapsedDuration_ <= int256(0)) {
						// Doing nothing.
					} else {
						// If this assertion fails, further assertions will not necessarily succeed and the behavior will not necessarily be correct.
						// #enable_asserts assert(ethDutchAuctionEndingBidPriceDivisor > 1);

						// [Comment-202501301]
						// Adding 1 to ensure that the result is a nonzero.
						// Comment-202503162 relates and/or applies.
						// [/Comment-202501301]
						// [Comment-202508103]
						// Similar formulas exist in multiple places.
						// [/Comment-202508103]
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

	/// @inheritdoc IBidding
	/// @dev Calculates the discounted price when using a Random Walk NFT for bidding.
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

	/// @inheritdoc IBidding
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

	/// @dev Calculates the ETH Dutch auction duration based on `mainPrizeTimeIncrementInMicroSeconds`.
	function _getEthDutchAuctionDuration() private view returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// [Comment-202508099]
			// Similar formulas exist in multiple places.
			// [/Comment-202508099]
			uint256 ethDutchAuctionDuration_ = mainPrizeTimeIncrementInMicroSeconds / ethDutchAuctionDurationDivisor;

			return ethDutchAuctionDuration_;
		}
	}

	// #endregion
	// #region `bidWithCstAndDonateToken`

	/// @inheritdoc IBidding
	function bidWithCstAndDonateToken(uint256 priceMaxLimit_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external override nonReentrant /*_onlyRoundIsActive*/ {
		_bidWithCst(priceMaxLimit_, message_);
		prizesWallet.donateToken(roundNum, _msgSender(), tokenAddress_, amount_);
	}

	// #endregion
	// #region `bidWithCstAndDonateNft`

	/// @inheritdoc IBidding
	function bidWithCstAndDonateNft(uint256 priceMaxLimit_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external override nonReentrant /*_onlyRoundIsActive*/ {
		_bidWithCst(priceMaxLimit_, message_);
		prizesWallet.donateNft(roundNum, _msgSender(), nftAddress_, nftId_);
	}

	// #endregion
	// #region `bidWithCst`

	/// @inheritdoc IBidding
	function bidWithCst(uint256 priceMaxLimit_, string memory message_) external override nonReentrant /*_onlyRoundIsActive*/ {
		_bidWithCst(priceMaxLimit_, message_);
	}

	// #endregion
	// #region `_bidWithCst`

	/// @notice Internal implementation of CST bidding logic.
	/// @param priceMaxLimit_ The maximum CST price the bidder is willing to pay.
	/// @param message_ Optional message to include with the bid.
	/// @dev The CST Dutch auction starts from a high price and decreases over time.
	/// CST used for bidding is burned, and the bidder still receives a CST reward.
	function _bidWithCst(uint256 priceMaxLimit_, string memory message_) private /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		// [Comment-202501045]
		// Somewhere around here, one might want to validate that the first bid in a bidding round is ETH.
		// But we are going to validate that near Comment-202501044.
		// [/Comment-202501045]

		// Comment-202503162 relates and/or applies.
		uint256 paidPrice_ = getNextCstBidPriceAdvanced(int256(0));

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
		// That said, the marketing wallet is a contract that is not capable of bidding. So this assertion is guaranteed to succeed.
		// [/Comment-202412251]
		// #enable_asserts assert(_msgSender() != marketingWallet);

		// [Comment-202409177]
		// Burning the CST amount used for bidding.
		// Doing it before subsequent minting, which requires the bidder to have the given amount.
		// It probably makes little sense to call `ERC20Burnable.burn` or `ERC20Burnable.burnFrom` instead.
		// [/Comment-202409177]
		// [Comment-202501125]
		// Minting a CST reward to the bidder for placing this bid.
		// [/Comment-202501125]
		{
			ICosmicSignatureToken.MintOrBurnSpec[] memory mintAndBurnSpecs_ = new ICosmicSignatureToken.MintOrBurnSpec[](2);
			mintAndBurnSpecs_[0].account = _msgSender();
			mintAndBurnSpecs_[0].value = ( - int256(paidPrice_) );
			mintAndBurnSpecs_[1].account = _msgSender();
			mintAndBurnSpecs_[1].value = int256(cstRewardAmountForBidding);
			token.mintAndBurnMany(mintAndBurnSpecs_);
		}

		biddersInfo[roundNum][_msgSender()].totalSpentCstAmount += paidPrice_;
		cstDutchAuctionBeginningTimeStamp = block.timestamp;

		// [Comment-202409163]
		// Increasing the starting CST price for the next CST bid, while enforcing a minimum.
		// [/Comment-202409163]
		uint256 newCstDutchAuctionBeginningBidPrice_ =
			Math.max(paidPrice_ * CosmicSignatureConstants.CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER, cstDutchAuctionBeginningBidPriceMinLimit);
		cstDutchAuctionBeginningBidPrice = newCstDutchAuctionBeginningBidPrice_;

		if (lastCstBidderAddress == address(0)) {
			// Comment-202501045 applies.

			// [Comment-202504212]
			// Issue. If the admin increases `cstDutchAuctionBeginningBidPriceMinLimit` for the next round,
			// it's possible that this value will not respect that setting.
			// [/Comment-202504212]
			nextRoundFirstCstDutchAuctionBeginningBidPrice = newCstDutchAuctionBeginningBidPrice_;
		}
		lastCstBidderAddress = _msgSender();
		_bidCommon(/*BidType.CST,*/ message_);
		emit BidPlaced(roundNum, _msgSender(), -1, int256(paidPrice_), -1, message_, mainPrizeTime);
	}

	// #endregion
	// #region `getNextCstBidPrice`

	/// @inheritdoc IBidding
	function getNextCstBidPrice() external view override returns (uint256) {
		return getNextCstBidPriceAdvanced(int256(0));
	}

	// #endregion
	// #region `getNextCstBidPriceAdvanced`

	/// @inheritdoc IBidding
	/// @dev The CST bid price decreases linearly from the beginning price to zero over the auction duration.
	function getNextCstBidPriceAdvanced(int256 currentTimeOffset_) public view override returns (uint256) {
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

	/// @inheritdoc IBidding
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

	/// @dev Calculates the CST Dutch auction duration based on `mainPrizeTimeIncrementInMicroSeconds`.
	function _getCstDutchAuctionDuration() private view returns (uint256) {
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

	/// @dev Calculates how long the current CST Dutch auction has been running.
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
	// #region `_getCstDutchAuctionTotalAndRemainingDurations`

	/// @dev Returns both the total and remaining duration for the CST Dutch auction.
	function _getCstDutchAuctionTotalAndRemainingDurations() private view returns (uint256, int256) {
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

	/// @notice Handles common bid logic.
	/// --- param bidType_ Bid type code.
	/// @param message_ Comment-202503155 applies.
	/// @dev Comment-202411169 relates and/or applies.
	function _bidCommon(/*BidType bidType_,*/ string memory message_) private /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		require(
			bytes(message_).length <= bidMessageLengthMaxLimit,
			CosmicSignatureErrors.TooLongBidMessage("Message is too long.", bytes(message_).length)
		);

		// The first bid of the current bidding round?
		if (lastBidderAddress == address(0)) {

			// [Comment-202501044]
			// It's probably more efficient to validate this here than to validate `lastBidderAddress` near Comment-202501045.
			// This logic assumes that ETH bid price is guaranteed to be a nonzero, as specified in Comment-202503162.
			// [/Comment-202501044]
			require(msg.value > 0, CosmicSignatureErrors.WrongBidType("The first bid in a bidding round shall be ETH."));

			// Comment-202411169 relates.
			_checkRoundIsActive();

			cstDutchAuctionBeginningTimeStamp = block.timestamp;
			mainPrizeTime = block.timestamp + getInitialDurationUntilMainPrize();
			emit FirstBidPlacedInRound(roundNum, block.timestamp);
		} else {
			// [Comment-202411169]
			// It's unnecessary to call `_onlyRoundIsActive` or `_checkRoundIsActive`.
			// Given that `lastBidderAddress` is a nonzero, we know that the current bidding round is active.
			// [/Comment-202411169]
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
