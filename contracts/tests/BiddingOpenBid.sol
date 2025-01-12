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
import { CosmicSignatureConstants } from "../production/libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "../production/libraries/CosmicSignatureErrors.sol";
// import { CosmicSignatureToken } from "../production/CosmicSignatureToken.sol";
// import { RandomWalkNFT } from "../production//RandomWalkNFT.sol";
import { CosmicSignatureGameStorage } from "../production/CosmicSignatureGameStorage.sol";
import { SystemManagement } from "../production/SystemManagement.sol";
import { BidStatistics } from "../production/BidStatistics.sol";
import { IBidding } from "../production/interfaces/IBidding.sol";

// #endregion
// #region

abstract contract BiddingOpenBid is
	ReentrancyGuardTransientUpgradeable,
	CosmicSignatureGameStorage,
	SystemManagement,
	BidStatistics,
	IBidding {
	// #region // Data Types

	// /// @title Parameters needed to place a bid.
	// /// @dev Comment-202411111 applies.
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
	//
	// 	/// @notice Set this to `true` to specify that the bid price is "open", meaning any price the user wants.
	// 	/// `nextEthBidPrice` will be updated to `msg.value` and stay at that level.
	// 	/// todo-2 The above description of this parameter doesn't appear to be perfectly accurate. To be revisited.
	// 	/// todo-2 Or is it now accurate?
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
	// #region `bidAndDonateToken`

	function bidAndDonateToken(int256 randomWalkNftId_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external payable override /*nonReentrant*/ /*onlyActive*/ {
		revert("This method is not implemented.");
	}

	// #endregion
	// #region `bidAndDonateToken`

	/// @dev ToDo-202412164-2 applies.
	function bidAndDonateToken(int256 randomWalkNftId_, bool isOpenBid_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external payable /*nonReentrant*/ /*onlyActive*/ {
		_bid(randomWalkNftId_, isOpenBid_, message_);
		prizesWallet.donateToken(roundNum, msg.sender, tokenAddress_, amount_);
	}

	// #endregion
	// #region `bidAndDonateNft`

	function bidAndDonateNft(int256 randomWalkNftId_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external payable override /*nonReentrant*/ /*onlyActive*/ {
		revert("This method is not implemented.");
	}

	// #endregion
	// #region `bidAndDonateNft`

	/// @dev ToDo-202412164-2 applies.
	function bidAndDonateNft(int256 randomWalkNftId_, bool isOpenBid_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external payable /*nonReentrant*/ /*onlyActive*/ {
		_bid(randomWalkNftId_, isOpenBid_, message_);
		// _donateNft(nftAddress_, nftId_);
		prizesWallet.donateNft(roundNum, msg.sender, nftAddress_, nftId_);
	}

	// #endregion
	// #region `bid`

	function bid(/*bytes memory data_*/ int256 randomWalkNftId_, string memory message_) external payable override /*nonReentrant*/ /*onlyActive*/ {
		revert("This method is not implemented.");
	}

	// #endregion
	// #region `bid`

	/// @dev ToDo-202412164-2 applies.
	function bid(/*bytes memory data_*/ int256 randomWalkNftId_, bool isOpenBid_, string memory message_) external payable /*nonReentrant*/ /*onlyActive*/ {
		_bid(/*data_*/ randomWalkNftId_, isOpenBid_, message_);
	}

	// #endregion
	// #region `_bid`

	function _bid(/*bytes memory data_*/ int256 randomWalkNftId_, bool isOpenBid_, string memory message_) internal nonReentrant /*onlyActive*/ {
		// #region
		
		// BidParams memory params = abi.decode(data_, (BidParams));
		// CosmicSignatureConstants.BidType bidType;
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
					CosmicSignatureErrors.BidPrice("The value submitted for open bid is too low.", ethOpenBidPriceMinLimit_, msg.value)
				);

				paidEthBidPrice_ = msg.value;
				// #enable_asserts assert(overpaidEthBidPrice_ == int256(0));
			} else {
				paidEthBidPrice_ = ethBidPrice_;
				overpaidEthBidPrice_ = int256(msg.value) - int256(paidEthBidPrice_);

				// Comment-202412045 applies.
				require(
					overpaidEthBidPrice_ >= int256(0),
					CosmicSignatureErrors.BidPrice("The value submitted for this transaction is too low.", paidEthBidPrice_, msg.value)
				);
			}

			// #endregion
			// #region

			if (lastBidderAddress == address(0)) {
				ethDutchAuctionBeginningBidPrice = paidEthBidPrice_ * CosmicSignatureConstants.CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;
			}

			// Comment-202501061 applies.
			nextEthBidPrice = paidEthBidPrice_ + paidEthBidPrice_ / nextEthBidPriceIncreaseDivisor + 1;

			// // #enable_asserts assert(bidType == CosmicSignatureConstants.BidType.ETH);

			// #endregion
		} else {
			// #region

			// Issue. Somewhere around here, we probably should evaluate `isOpenBid_` and act differently if it's `true`.

			paidEthBidPrice_ = getEthPlusRandomWalkNftBidPrice(ethBidPrice_);
			overpaidEthBidPrice_ = int256(msg.value) - int256(paidEthBidPrice_);

			// Comment-202412045 applies.
			require(
				overpaidEthBidPrice_ >= int256(0),
				CosmicSignatureErrors.BidPrice("The value submitted for this transaction is too low.", paidEthBidPrice_, msg.value)
			);

			if (lastBidderAddress == address(0)) {
				ethDutchAuctionBeginningBidPrice = ethBidPrice_ * CosmicSignatureConstants.CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;
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
			
			// #endregion
		}

		// #endregion
		// #region

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
			// todo-1 No reentrancy vulnerability?
			(bool isSuccess_, ) = msg.sender.call{value: uint256(overpaidEthBidPrice_)}("");
			require(
				isSuccess_,
				CosmicSignatureErrors.FundTransferFailed("Refund transfer failed.", msg.sender, uint256(overpaidEthBidPrice_))
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
		// Comment-202501045 applies.

		// Comment-202409179 applies.
		uint256 price = getNextCstBidPrice(int256(0));

		// Comment-202412045 applies.
		require(
			price <= priceMaxLimit_,
			CosmicSignatureErrors.BidPrice("The current CST bid price is greater than the maximum you allowed.", price, priceMaxLimit_)
		);

		// Comment-202412251 applies.
		// #enable_asserts assert(msg.sender != marketingWallet);

		// uint256 userBalance = token.balanceOf(msg.sender);

		// // Comment-202409181 applies.
		// require(
		// 	userBalance >= price,
		// 	CosmicSignatureErrors.InsufficientCSTBalance(
		// 		"Insufficient CST token balance to make a bid with CST.",
		// 		price,
		// 		userBalance
		// 	)
		// );

		// Comment-202409177 applies.
		token.burn(msg.sender, price);
		// token.transferToMarketingWalletOrBurn(msg.sender, price);

		bidderInfo[roundNum][msg.sender].totalSpentCst += price;
		// if (bidderInfo[roundNum][msg.sender].totalSpentCst > stellarSpenderTotalSpentCst) {
		// 	stellarSpenderTotalSpentCst = bidderInfo[roundNum][msg.sender].totalSpentCst;
		// 	stellarSpender = msg.sender;
		// }

		// Comment-202409163 applies.
		uint256 newCstDutchAuctionBeginningBidPrice_ =
			Math.max(price * CosmicSignatureConstants.CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER, cstDutchAuctionBeginningBidPriceMinLimit);
		cstDutchAuctionBeginningBidPrice = newCstDutchAuctionBeginningBidPrice_;

		if (lastCstBidderAddress == address(0)) {
			nextRoundCstDutchAuctionBeginningBidPrice = newCstDutchAuctionBeginningBidPrice_;
		}
		lastCstBidderAddress = msg.sender;
		cstDutchAuctionBeginningTimeStamp = block.timestamp;
		_bidCommon(message_ /* , CosmicSignatureConstants.BidType.CST */);
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

			// Comment-202501044 applies.
			require(msg.value > 0, CosmicSignatureErrors.WrongBidType("The first bid in a bidding round shall be ETH."));

			mainPrizeTime = block.timestamp + getInitialDurationUntilMainPrize();
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

		// Comment-202501125 applies.
		// try
		// ToDo-202409245-1 applies.
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
