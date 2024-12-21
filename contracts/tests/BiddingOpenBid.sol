// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

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

abstract contract BiddingOpenBid is
	ReentrancyGuardTransientUpgradeable,
	CosmicSignatureGameStorage,
	SystemManagement,
	BidStatistics,
	IBidding {
	// #region Data Types

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
	// 	/// `bidPrice` will be updated to `msg.value` and stay at that level.
	// 	/// todo-2 The above description of this parameter doesn't appear to be perfectly accurate. To be revisited.
	// 	bool isOpenBid;
	// }

	// #endregion
	// #region State

	/// @notice Multiples of bid price that open bid has to be.
	/// @dev This really belongs to a new version of `CosmicSignatureGameStorage`, but keeping it simple.
	uint256 public timesBidPrice;

	// #endregion
	// #region Events

	/// @dev Issue. This should be moved to an interface.
	event TimesBidPriceChangedEvent(uint256 newValue);

	// #endregion

	/// @dev ToDo-202412164-2 applies.
	function setTimesBidPrice(uint256 newValue_) external onlyOwner {
		timesBidPrice = newValue_;
		emit TimesBidPriceChangedEvent(newValue_);
	}

	function bidAndDonateToken(int256 randomWalkNftId_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external payable override /*nonReentrant*/ /*onlyActive*/ {
		revert("This method is not implemented.");
	}

	/// @dev ToDo-202412164-2 applies.
	function bidAndDonateToken(int256 randomWalkNftId_, bool isOpenBid_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external payable /*nonReentrant*/ /*onlyActive*/ {
		_bid(randomWalkNftId_, isOpenBid_, message_);
		prizesWallet.donateToken(roundNum, msg.sender, tokenAddress_, amount_);
	}

	function bidAndDonateNft(int256 randomWalkNftId_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external payable override /*nonReentrant*/ /*onlyActive*/ {
		revert("This method is not implemented.");
	}

	/// @dev ToDo-202412164-2 applies.
	function bidAndDonateNft(int256 randomWalkNftId_, bool isOpenBid_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external payable /*nonReentrant*/ /*onlyActive*/ {
		_bid(randomWalkNftId_, isOpenBid_, message_);
		// _donateNft(nftAddress_, nftId_);
		prizesWallet.donateNft(roundNum, msg.sender, nftAddress_, nftId_);
	}

	function bid(/*bytes memory data_*/ int256 randomWalkNftId_, string memory message_) external payable override /*nonReentrant*/ /*onlyActive*/ {
		revert("This method is not implemented.");
	}

	/// @dev ToDo-202412164-2 applies.
	function bid(/*bytes memory data_*/ int256 randomWalkNftId_, bool isOpenBid_, string memory message_) external payable /*nonReentrant*/ /*onlyActive*/ {
		_bid(/*data_*/ randomWalkNftId_, isOpenBid_, message_);
	}

	function _bid(/*bytes memory data_*/ int256 randomWalkNftId_, bool isOpenBid_, string memory message_) internal nonReentrant /*onlyActive*/ {
		// BidParams memory params = abi.decode(data_, (BidParams));
		// CosmicSignatureConstants.BidType bidType;
		uint256 newBidPrice = getBidPrice();
		uint256 paidBidPrice;
		if (/*params.randomWalkNftId*/ randomWalkNftId_ == -1) {
			if (/*params.isOpenBid*/ isOpenBid_) {
				uint256 minPriceOpenBid = newBidPrice * timesBidPrice;

				// Comment-202412045 applies.
				require(
					msg.value >= minPriceOpenBid,
					CosmicSignatureErrors.BidPrice("The value submitted for open bid too low.", minPriceOpenBid, msg.value)
				);

				// [Comment-202412035/]
				paidBidPrice = msg.value;
			} else {
				// Comment-202412045 applies.
				require(
					msg.value >= newBidPrice,
					CosmicSignatureErrors.BidPrice("The value submitted for this transaction is too low.", newBidPrice, msg.value)
				);
				
				paidBidPrice = newBidPrice;
			}
			bidPrice = paidBidPrice;
			// // #enable_asserts assert(bidType == CosmicSignatureConstants.BidType.ETH);
		} else {
			// Issue. Somewhere around here, we probably should evaluate `/*params.isOpenBid*/ isOpenBid_` and act differently if it's `true`.

			paidBidPrice = newBidPrice / CosmicSignatureConstants.RANDOMWALK_NFT_BID_PRICE_DIVISOR;

			// Comment-202412045 applies.
			require(
				msg.value >= paidBidPrice,
				CosmicSignatureErrors.BidPrice("The value submitted for this transaction is too low.", paidBidPrice, msg.value)
			);

			bidPrice = newBidPrice;
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
					"You must be the owner of the RandomWalk NFT.",
					address(randomWalkNft),
					uint256(/*params.randomWalkNftId*/ randomWalkNftId_),
					msg.sender
				)
			);
			usedRandomWalkNfts[uint256(/*params.randomWalkNftId*/ randomWalkNftId_)] = 1;
			// bidType = CosmicSignatureConstants.BidType.RandomWalk;
		}

		// Updating bidding statistics.
		bidderInfo[roundNum][msg.sender].totalSpentEth += paidBidPrice;

		_bidCommon(/*params.message*/ message_ /* , bidType */);
		emit BidEvent(
			/*lastBidderAddress*/ msg.sender,
			roundNum,
			int256(paidBidPrice),
			/*params.randomWalkNftId*/ randomWalkNftId_,
			-1,
			mainPrizeTime,
			/*params.message*/ message_
		);

		// This condition will be `false` if we assigned near Comment-202412035.
		if (msg.value > paidBidPrice) {

			// Refunding excess ETH if the bidder sent more than required.
			uint256 amountToSend = msg.value - paidBidPrice;
			// todo-1 No reentrancy vulnerability?
			(bool isSuccess_, ) = msg.sender.call{ value: amountToSend }("");
			require(
				isSuccess_,
				CosmicSignatureErrors.FundTransferFailed("Refund transfer failed.", msg.sender, amountToSend) 
			);
		}
	}

	function getBidPrice() public view override returns(uint256) {
		// todo-1 Add 1 to ensure that the result increases?
		return bidPrice * priceIncrease / CosmicSignatureConstants.MILLION;
	}

	function bidWithCstAndDonateToken(uint256 priceMaxLimit_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external override /*nonReentrant*/ /*onlyActive*/ {
		_bidWithCst(priceMaxLimit_, message_);
		prizesWallet.donateToken(roundNum, msg.sender, tokenAddress_, amount_);
	}

	function bidWithCstAndDonateNft(uint256 priceMaxLimit_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external override /*nonReentrant*/ /*onlyActive*/ {
		_bidWithCst(priceMaxLimit_, message_);
		// _donateNft(nftAddress_, nftId_);
		prizesWallet.donateNft(roundNum, msg.sender, nftAddress_, nftId_);
	}

	function bidWithCst(uint256 priceMaxLimit_, string memory message_) external override /*nonReentrant*/ /*onlyActive*/ {
		_bidWithCst(priceMaxLimit_, message_);
	}

	function _bidWithCst(uint256 priceMaxLimit_, string memory message_) internal nonReentrant /*onlyActive*/ {
		// Comment-202409179 applies.
		uint256 price = getCurrentBidPriceCST();

		// Comment-202412045 applies.
		require(
			price <= priceMaxLimit_,
			CosmicSignatureErrors.BidPrice("The current CST bid price is greater than the maximum you allowed.", price, priceMaxLimit_)
		);

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
		// token.burn(msg.sender, price);
		token.transferToMarketingWalletOrBurn(msg.sender, price);

		bidderInfo[roundNum][msg.sender].totalSpentCst += price;
		// if (bidderInfo[roundNum][msg.sender].totalSpentCst > stellarSpenderTotalSpentCst) {
		// 	stellarSpenderTotalSpentCst = bidderInfo[roundNum][msg.sender].totalSpentCst;
		// 	stellarSpender = msg.sender;
		// }

		// Comment-202409163 applies.
		uint256 newStartingBidPriceCst_ =
			Math.max(price * CosmicSignatureConstants.STARTING_BID_PRICE_CST_MULTIPLIER, startingBidPriceCSTMinLimit);
		startingBidPriceCST = newStartingBidPriceCst_;

		lastCstBidTimeStamp = block.timestamp;
		lastCstBidderAddress = msg.sender;
		_bidCommon(message_ /* , CosmicSignatureConstants.BidType.CST */);
		emit BidEvent(/*lastBidderAddress*/ msg.sender, roundNum, -1, -1, int256(price), mainPrizeTime, message_);
	}

	function getCurrentBidPriceCST() public view override returns(uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			(uint256 elapsedDuration_, uint256 duration_) = getCstAuctionDuration();
			uint256 remainingDuration_ = uint256(int256(duration_) - int256(elapsedDuration_));
			if (int256(remainingDuration_) <= int256(0)) {
				return 0;
			}

			// uint256 fraction = CosmicSignatureConstants.MILLION - (CosmicSignatureConstants.MILLION * elapsedDuration_ / duration_);
			// return fraction * startingBidPriceCST / CosmicSignatureConstants.MILLION;

			return startingBidPriceCST * remainingDuration_ / duration_;
		}
	}

	function getCstAuctionDuration() public view override returns(uint256, uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 elapsedDuration_ = uint256(int256(block.timestamp) - int256(lastCstBidTimeStamp));
			if (int256(elapsedDuration_) < int256(0)) {
				elapsedDuration_ = 0;
			}
			return (elapsedDuration_, cstAuctionLength);
		}
	}

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

			mainPrizeTime = block.timestamp + initialSecondsUntilPrize;
			emit FirstBidPlacedInRound(roundNum, block.timestamp);
		} else {
			_updateChampionsIfNeeded();
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
		// ToDo-202409245-0 applies.
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
		// // ToDo-202409245-0 applies.
		// token.mint(marketingWallet, marketingReward);
		// // {
		// // } catch {
		// // 	revert
		// // 		CosmicSignatureErrors.ERC20Mint(
		// // 			"CosmicSignatureToken.mint failed to mint reward tokens for MarketingWallet.",
		// // 			marketingWallet,
		// // 			marketingReward
		// // 		);
		// // }

		_extendMainPrizeTime();
	}

	/// @notice Extend the time until the prize can be claimed
	/// @dev This function increases the prize time and adjusts the time increase factor
	function _extendMainPrizeTime() internal {
		uint256 secondsToAdd_ = nanoSecondsExtra / CosmicSignatureConstants.NANOSECONDS_PER_SECOND;
		mainPrizeTime = Math.max(mainPrizeTime, block.timestamp) + secondsToAdd_;
		nanoSecondsExtra = nanoSecondsExtra * timeIncrease / CosmicSignatureConstants.MICROSECONDS_PER_SECOND;
	}

	function getTotalBids() external view override returns(uint256) {
		return numRaffleParticipants[roundNum];
	}

	function getBidderAddressAtPosition(uint256 position) external view override returns(address) {
		require(position < numRaffleParticipants[roundNum], "Position out of bounds");
		return raffleParticipants[roundNum][position];
	}

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
				"Provided index is larger than array length",
				roundNum_,
				_positionFromEnd,
				numRaffleParticipants_
			)
		);
		uint256 offset = numRaffleParticipants_ - _positionFromEnd - 1;
		address bidderAddress_ = raffleParticipants[roundNum_][offset];
		return bidderAddress_;
	}

	function getTotalSpentByBidder(address bidderAddress_) external view override returns(uint256, uint256) {
		return (bidderInfo[roundNum][bidderAddress_].totalSpentEth, bidderInfo[roundNum][bidderAddress_].totalSpentCst);
	}

	// function wasRandomWalkNftUsed(uint256 nftId_) external view override returns(bool) {
	// 	// todo-9 This is now a `uint256`.
	// 	return usedRandomWalkNfts[nftId_];
	// }
}
