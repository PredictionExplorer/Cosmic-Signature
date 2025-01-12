// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #endregion
// #region

// #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
// import { CosmicSignatureToken } from "./CosmicSignatureToken.sol";
// import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { SystemManagement } from "./SystemManagement.sol";
import { BidStatistics } from "./BidStatistics.sol";
import { IBidding } from "./interfaces/IBidding.sol";

// #endregion
// #region

abstract contract Bidding is
	ReentrancyGuardTransientUpgradeable,
	CosmicSignatureGameStorage,
	SystemManagement,
	BidStatistics,
	IBidding {
	// #region // Data Types

	// /// @title Parameters needed to place a bid.
	// /// @dev
	// /// [Comment-202411111]
	// /// Similar structures exist in multiple places.
	// /// [/Comment-202411111]
	// struct BidParams {
	// 	/// @notice The bidder's message associated with the bid.
	// 	/// May be empty.
	// 	/// Can be used to store additional information or comments from the bidder.
	// 	string message;
	//
	// 	/// @notice The ID of the RandomWalk NFT to be used for bidding.
	// 	/// Set to -1 if no RandomWalk NFT is to be used.
	// 	/// Comment-202412036 applies.
	// 	int256 randomWalkNftId;
	// }

	// #endregion
	// #region `bidAndDonateToken`

	function bidAndDonateToken(int256 randomWalkNftId_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external payable override /*nonReentrant*/ /*onlyActive*/ {
		_bid(randomWalkNftId_, message_);
		prizesWallet.donateToken(roundNum, msg.sender, tokenAddress_, amount_);
	}

	// #endregion
	// #region `bidAndDonateNft`

	function bidAndDonateNft(int256 randomWalkNftId_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external payable override /*nonReentrant*/ /*onlyActive*/ {
		_bid(randomWalkNftId_, message_);
		// _donateNft(nftAddress_, nftId_);
		prizesWallet.donateNft(roundNum, msg.sender, nftAddress_, nftId_);
	}

	// #endregion
	// #region `bid`

	function bid(/*bytes memory data_*/ int256 randomWalkNftId_, string memory message_) external payable override /*nonReentrant*/ /*onlyActive*/ {
		_bid(/*data_*/ randomWalkNftId_, message_);
	}

	// #endregion
	// #region `_bid`

	/// todo-1 Do we really need `nonReentrant` here?
	/// todo-1 Keep in mind that this method can be called together with a donation method.
	function _bid(/*bytes memory data_*/ int256 randomWalkNftId_, string memory message_) internal nonReentrant /*onlyActive*/ {
		// #region

		// BidParams memory params = abi.decode(data_, (BidParams));
		// CosmicSignatureConstants.BidType bidType;
		uint256 ethBidPrice_ = getNextEthBidPrice(int256(0));
		uint256 paidEthBidPrice_ =
			(/*params.randomWalkNftId*/ randomWalkNftId_ < int256(0)) ?
			ethBidPrice_ :
			getEthPlusRandomWalkNftBidPrice(ethBidPrice_);
		int256 overpaidEthBidPrice_ = int256(msg.value) - int256(paidEthBidPrice_);

		// [Comment-202412045]
		// Performing this validatin as early as possible to minimize gas fee in case the validation fails.
		// [/Comment-202412045]
		require(
			overpaidEthBidPrice_ >= int256(0),
			CosmicSignatureErrors.BidPrice("The value submitted for this transaction is too low.", paidEthBidPrice_, msg.value)
		);

		// #endregion
		// #region

		if (/*params.randomWalkNftId*/ randomWalkNftId_ < int256(0)) {
			// // #enable_asserts assert(bidType == CosmicSignatureConstants.BidType.ETH);
		} else {
			require(
				usedRandomWalkNfts[uint256(/*params.randomWalkNftId*/ randomWalkNftId_)] == 0,
				CosmicSignatureErrors.UsedRandomWalkNft(
					// todo-1 Nick wrote about reducing contract bytecode size:
					// todo-1 also, there is another space - reserve , require() strings. We can remove the strings and leave only error codes.
					// todo-1 It is not going to be very friendly with the user, but if removing strings it fits just under 24K
					// todo-1 I think we should go for it
					"This RandomWalk NFT has already been used for bidding.",
					uint256(/*params.randomWalkNftId*/ randomWalkNftId_)
				)
			);
			require(
				// todo-1 Here and in some other places, check something like `randomWalkNft.isAuthorized`?
				// todo-1 But in OpenZeppelin 4.x the method doesn't exist. A similar method existed, named `_isApprovedOrOwner`.
				msg.sender == randomWalkNft.ownerOf(uint256(/*params.randomWalkNftId*/ randomWalkNftId_)),
				CosmicSignatureErrors.IncorrectERC721TokenOwner(
					"You are not the owner of the RandomWalk NFT.",
					address(randomWalkNft),
					uint256(/*params.randomWalkNftId*/ randomWalkNftId_),
					msg.sender
				)
			);
			usedRandomWalkNfts[uint256(/*params.randomWalkNftId*/ randomWalkNftId_)] = 1;
			// bidType = CosmicSignatureConstants.BidType.RandomWalk;
		}

		// #endregion
		// #region

		if (lastBidderAddress == address(0)) {
			ethDutchAuctionBeginningBidPrice = ethBidPrice_ * CosmicSignatureConstants.CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;
		}

		// [Comment-202501061]
		// This formula ensures that the result increases.
		// [/Comment-202501061]
		nextEthBidPrice = ethBidPrice_ + ethBidPrice_ / nextEthBidPriceIncreaseDivisor + 1;

		// Updating bidding statistics.
		bidderInfo[roundNum][msg.sender].totalSpentEth += paidEthBidPrice_;

		// #endregion
		// #region

		_bidCommon(/*params.message*/ message_ /* , bidType */);

		// #endregion
		// #region

		emit BidEvent(
			/*lastBidderAddress*/ msg.sender,
			roundNum,
			int256(paidEthBidPrice_),
			/*params.randomWalkNftId*/ randomWalkNftId_,
			-1,
			mainPrizeTime,
			/*params.message*/ message_
		);

		// #endregion
		// #region

		if (overpaidEthBidPrice_ > int256(0)) {
			// Refunding excess ETH if the bidder sent more than required.
			// todo-1 Issue. During the initial Dutch auction, we will likely refund a very small amount that would not justify the gas fees.
			// todo-1 At least comment.
			// todo-1 Maybe if the bid price a half a minute or a minute (make it a constant in `CosmicSignatureConstants`) ago
			// todo-1 was >= `msg.value`, don't refund.
			// uint256 amountToSend = msg.value - paidEthBidPrice_;
			// todo-1 No reentrancy vulnerability?
			(bool isSuccess_, ) = msg.sender.call{value: /*amountToSend*/ uint256(overpaidEthBidPrice_)}("");
			require(
				isSuccess_,
				CosmicSignatureErrors.FundTransferFailed("Refund transfer failed.", msg.sender, /*amountToSend*/ uint256(overpaidEthBidPrice_))
			);
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
					int256 ethDutchAuctionElapsedDuration_ = getDurationElapsedSinceActivation() + currentTimeOffset_;
					if (ethDutchAuctionElapsedDuration_ > int256(0)) {
						// If this assertion fails, further assertions will not necessarily succeed and the behavior will not necessarily be correct.
						// #enable_asserts assert(ethDutchAuctionEndingBidPriceDivisor > 1);

						// Adding 1 to ensure that the result is a nonzero.
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
			int256 ethDutchAuctionElapsedDuration_ = getDurationElapsedSinceActivation();
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

	function bidWithCstAndDonateToken(uint256 priceMaxLimit_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external override /*nonReentrant*/ /*onlyActive*/ {
		_bidWithCst(priceMaxLimit_, message_);
		prizesWallet.donateToken(roundNum, msg.sender, tokenAddress_, amount_);
	}

	// #endregion
	// #region `bidWithCstAndDonateNft`

	function bidWithCstAndDonateNft(uint256 priceMaxLimit_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external override /*nonReentrant*/ /*onlyActive*/ {
		_bidWithCst(priceMaxLimit_, message_);
		// _donateNft(nftAddress_, nftId_);
		prizesWallet.donateNft(roundNum, msg.sender, nftAddress_, nftId_);
	}

	// #endregion
	// #region `bidWithCst`

	function bidWithCst(uint256 priceMaxLimit_, string memory message_) external override /*nonReentrant*/ /*onlyActive*/ {
		_bidWithCst(priceMaxLimit_, message_);
	}

	// #endregion
	// #region `_bidWithCst`

	function _bidWithCst(uint256 priceMaxLimit_, string memory message_) internal nonReentrant /*onlyActive*/ {
		// [Comment-202501045]
		// We are going to `require` that the first bid in a bidding round is ETH near Comment-202501044.
		// [/Comment-202501045]

		// [Comment-202409179]
		// This can be zero.
		// When this is zero, we will burn zero CST tokens near Comment-202409177, so someone can bid with zero CST tokens.
		// We are OK with that.
		// todo-1 +++ Confirm with them again that this is OK.
		// todo-1 ---Maybe require at least 1 Wei bid.
		// todo-1 ---An alternative would be to enforce `cstDutchAuctionBeginningBidPriceMinLimit`.
		// todo-1 ---Or better add another smaller min limit.
		// todo-1 That said, given that we mint 100 CSTs for each bid, it's almost impossible that the bid price will fall below that.
		// todo-1 So maybe leave this logic and comment that it minimizes transaction fees.
		// todo-1 Cros-ref with where we mint 100 CSTs for each bidder.
		// [/Comment-202409179]
		uint256 price = getNextCstBidPrice(int256(0));

		// Comment-202412045 applies.
		require(
			price <= priceMaxLimit_,
			CosmicSignatureErrors.BidPrice("The current CST bid price is greater than the maximum you allowed.", price, priceMaxLimit_)
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
		// 	userBalance >= price,
		// 	CosmicSignatureErrors.InsufficientCSTBalance(
		// 		"Insufficient CST token balance to make a bid with CST.",
		// 		price,
		// 		userBalance
		// 	)
		// );

		// [Comment-202409177]
		// Transferring to marketing wallet or burning the CST amount used for bidding.
		// todo-1 We just burn here now. Revisit this comment.
		// ToDo-202411182-1 relates and/or applies.
		// todo-1 ??? What about calling `ERC20Burnable.burn` or `ERC20Burnable.burnFrom` here?
		// todo-1 ??? It would be a safer option.
		// [/Comment-202409177]
		token.burn(msg.sender, price);
		// token.transferToMarketingWalletOrBurn(msg.sender, price);

		bidderInfo[roundNum][msg.sender].totalSpentCst += price;
		// if (bidderInfo[roundNum][msg.sender].totalSpentCst > stellarSpenderTotalSpentCst) {
		// 	stellarSpenderTotalSpentCst = bidderInfo[roundNum][msg.sender].totalSpentCst;
		// 	stellarSpender = msg.sender;
		// }

		// [Comment-202409163]
		// Increasing the starting CST price for the next CST bid, while enforcing a minimum.
		// [/Comment-202409163]
		uint256 newCstDutchAuctionBeginningBidPrice_ =
			Math.max(price * CosmicSignatureConstants.CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER, cstDutchAuctionBeginningBidPriceMinLimit);
		cstDutchAuctionBeginningBidPrice = newCstDutchAuctionBeginningBidPrice_;

		if (lastCstBidderAddress == address(0)) {
			nextRoundCstDutchAuctionBeginningBidPrice = newCstDutchAuctionBeginningBidPrice_;
		}
		lastCstBidderAddress = msg.sender;
		cstDutchAuctionBeginningTimeStamp = block.timestamp;
		_bidCommon(message_ /* , CosmicSignatureConstants.BidType.CST */);
		// todo-1 When raising this event, maybe in some cases pass zero instead of -1.
		emit BidEvent(/*lastBidderAddress*/ msg.sender, roundNum, -1, -1, int256(price), mainPrizeTime, message_);
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
			uint256 nextCstBidPrice_ = cstDutchAuctionBeginningBidPrice * uint256(cstDutchAuctionRemainingDuration_) / cstDutchAuctionDuration_;
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
	function _bidCommon(string memory message /* , CosmicSignatureConstants.BidType bidType */) internal /*nonReentrant*/ onlyActive {
		require(
			bytes(message).length <= maxMessageLength,
			CosmicSignatureErrors.BidMessageLengthOverflow("Message is too long.", bytes(message).length)
		);

		// First bid of the round?
		if (lastBidderAddress == address(0)) {

			// [Comment-202501044]
			// It's probably more efficient to validate this here than to validate `lastBidderAddress` near Comment-202501045.
			// todo-1 Cross-ref with where we ensure that ETH bid price cannot be zero, even with a RandomWalk NFT.
			// todo-1 Mke sure it's correct to make this validation at this point, rather than sooner.
			// todo-1 Write a comment explaining things.
			// [/Comment-202501044]
			require(msg.value > 0, CosmicSignatureErrors.WrongBidType("The first bid in a bidding round shall be ETH."));

			mainPrizeTime = block.timestamp + getInitialDurationUntilMainPrize();
			// // #enable_asserts // #disable_smtchecker console.log(block.timestamp, mainPrizeTime, mainPrizeTime - block.timestamp);
			cstDutchAuctionBeginningTimeStamp = block.timestamp;
			emit FirstBidPlacedInRound(roundNum, block.timestamp);
		} else {
			_updateChampionsIfNeeded();
			_extendMainPrizeTime();
		}

		lastBidderAddress = msg.sender;
		// lastBidType = bidType;
		bidderInfo[roundNum][msg.sender].lastBidTimeStamp = block.timestamp;
		uint256 numRaffleParticipants_ = numRaffleParticipants[roundNum];
		raffleParticipants[roundNum][numRaffleParticipants_] = /*lastBidderAddress*/ msg.sender;
		++ numRaffleParticipants_;
		numRaffleParticipants[roundNum] = numRaffleParticipants_;

		// Distribute token rewards
		// try
		// [ToDo-202409245-1]
		// Can this, realistically, fail?
		// This can't, realistically, overflow, right?
		// [/ToDo-202409245-1]
		token.mint(/*lastBidderAddress*/ msg.sender, tokenReward);
		// {
		// } catch {
		// 	revert
		// 		CosmicSignatureErrors.ERC20Mint(
		// 			"CosmicSignatureToken.mint failed to mint reward tokens for the bidder.",
		// 			/*lastBidderAddress*/ msg.sender,
		// 			tokenReward
		// 		);
		// }

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
	// #region `_extendMainPrizeTime`

	/// @notice Extends `mainPrizeTime`.
	/// This method is called on each bid.
	function _extendMainPrizeTime() internal {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 mainPrizeTimeIncrement_ = getMainPrizeTimeIncrement();
			mainPrizeTime = Math.max(mainPrizeTime, block.timestamp) + mainPrizeTimeIncrement_;
			// // #enable_asserts // #disable_smtchecker console.log(block.timestamp, mainPrizeTime, mainPrizeTime - block.timestamp, mainPrizeTimeIncrementInMicroSeconds);
		}
	}

	// #endregion
	// #region `getMainPrizeTimeIncrement`

	function getMainPrizeTimeIncrement() public view returns(uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 mainPrizeTimeIncrement_ = mainPrizeTimeIncrementInMicroSeconds / CosmicSignatureConstants.MICROSECONDS_PER_SECOND;
			// #enable_asserts assert(mainPrizeTimeIncrement_ > 0);
			return mainPrizeTimeIncrement_;
		}
	}

	// #endregion
	// #region `getDurationUntilActivation`

	function getDurationUntilActivation() public view override returns(int256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			int256 durationUntilActivation_ = ( - getDurationElapsedSinceActivation() );
			return durationUntilActivation_;
		}
	}

	// #endregion
	// #region `getDurationElapsedSinceActivation`

	function getDurationElapsedSinceActivation() public view override returns(int256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			int256 durationElapsedSinceActivation_ = int256(block.timestamp) - int256(activationTime);
			return durationElapsedSinceActivation_;
		}
	}

	// #endregion
	// #region `getInitialDurationUntilMainPrize`

	function getInitialDurationUntilMainPrize() public view override returns(uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 initialDurationUntilMainPrize_ = mainPrizeTimeIncrementInMicroSeconds / initialDurationUntilMainPrizeDivisor;
			return initialDurationUntilMainPrize_;
		}
	}

	// #endregion
	// #region `getTotalBids`

	function getTotalBids() external view override returns(uint256) {
		return numRaffleParticipants[roundNum];
	}

	// #endregion
	// #region `getBidderAddressAtPosition`

	function getBidderAddressAtPosition(uint256 position) external view override returns(address) {
		require(position < numRaffleParticipants[roundNum], "Position out of bounds");
		return raffleParticipants[roundNum][position];
	}

	// #endregion
	// #region `bidderAddress`

	function bidderAddress(uint256 roundNum_, uint256 _positionFromEnd) external view override returns(address) {
		require(
			roundNum_ <= roundNum,
			CosmicSignatureErrors.InvalidBidderQueryRoundNum(
				"The provided bidding round number is greater than the current one's.",
				roundNum_,
				roundNum
			)
		);
		uint256 numRaffleParticipants_ = numRaffleParticipants[roundNum_];
		// todo-1 Is this validation redundant?
		// todo-1 Maybe skip all validations and check them only if the bidder address is zero.
		// todo-1 The same applies to `getBidderAddressAtPosition`.
		// todo-1 Speking of which, would it make sense to call it from here?
		// todo-1 Remember to make the same changes in `BiddingOpenBid`.
		require(
			numRaffleParticipants_ > 0,
			CosmicSignatureErrors.BidderQueryNoBidsYet("No bids have been made in this round yet.", roundNum_)
		);
		require(
			_positionFromEnd < numRaffleParticipants_,
			CosmicSignatureErrors.InvalidBidderQueryOffset(
				"Provided index is larger than array length.",
				roundNum_,
				_positionFromEnd,
				numRaffleParticipants_
			)
		);
		uint256 offset = numRaffleParticipants_ - _positionFromEnd - 1;
		address bidderAddress_ = raffleParticipants[roundNum_][offset];
		return bidderAddress_;
	}

	// #endregion
	// #region `getTotalSpentByBidder`

	function getTotalSpentByBidder(address bidderAddress_) external view override returns(uint256, uint256) {
		return (bidderInfo[roundNum][bidderAddress_].totalSpentEth, bidderInfo[roundNum][bidderAddress_].totalSpentCst);
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
