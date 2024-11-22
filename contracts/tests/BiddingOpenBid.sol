// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
// import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
// import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { CosmicGameConstants } from "../production/libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "../production/libraries/CosmicGameErrors.sol";
// import { CosmicToken } from "../production/CosmicToken.sol";
// import { RandomWalkNFT } from "../production//RandomWalkNFT.sol";
import { CosmicSignatureGameStorage } from "../production/CosmicSignatureGameStorage.sol";
import { SystemManagement } from "../production/SystemManagement.sol";
import { BidStatistics } from "../production/BidStatistics.sol";
import { IBidding } from "../production/interfaces/IBidding.sol";

abstract contract BiddingOpenBid is ReentrancyGuardUpgradeable, CosmicSignatureGameStorage, SystemManagement, BidStatistics, IBidding {
	// #region Data Types

	/// @title Parameters needed to place a bid.
	/// @dev Comment-202411111 applies.
	struct BidParams {
		/// @notice The message associated with the bid
		/// Can be used to store additional information or comments from the bidder
		string message;

		/// @notice The ID of the RandomWalk NFT to be used for bidding.
		/// Set to -1 if no RandomWalk NFT is to be used.
		/// Comment-202412036 applies.
		int256 randomWalkNFTId;

		/// @notice The flag used to mark a bid as "bid with open price" (any price user wants).
		/// `bidPrice` will be updated to `msg.value` and stay at that level.
		/// Set to `true` to send this type of bid.
		bool openBid;
	}

	// #endregion
	// #region State

	/// @notice multiples of bid price that open bid has to be
	uint256 public timesBidPrice;

	// #endregion
	// #region Events

	event TimesBidPriceChangedEvent(uint256 newValue);

	// #endregion

	function setTimesBidPrice(uint256 newValue_) external onlyOwner {
		timesBidPrice = newValue_;
		emit TimesBidPriceChangedEvent(newValue_);
	}

	function bid(bytes memory _data) public payable override nonReentrant /*onlyActive*/ {
		_bid(_data);
	}

	function _bid(bytes memory _data) internal /*onlyActive*/ {
		BidParams memory params = abi.decode(_data, (BidParams));
		// CosmicGameConstants.BidType bidType;
		uint256 newBidPrice = getBidPrice();
		uint256 paidBidPrice;
		if (params.randomWalkNFTId == -1) {
			// // #enable_asserts assert(bidType == CosmicGameConstants.BidType.ETH);
			if (params.openBid) {
				uint256 minPriceOpenBid = timesBidPrice * newBidPrice;
				require(
					msg.value >= minPriceOpenBid,
					CosmicGameErrors.BidPrice("The value submitted for open bid too low.", minPriceOpenBid, msg.value)
				);

				// [Comment-202412035/]
				paidBidPrice = msg.value;
			} else {
				paidBidPrice = newBidPrice;
				require(
					msg.value >= paidBidPrice,
					CosmicGameErrors.BidPrice("The value submitted for this transaction is too low.", paidBidPrice, msg.value)
				);
			}
		} else {
			require(
				msg.sender == randomWalkNft.ownerOf(uint256(params.randomWalkNFTId)),
				CosmicGameErrors.IncorrectERC721TokenOwner(
					"You must be the owner of the RandomWalk NFT.",
					address(randomWalkNft),
					uint256(params.randomWalkNFTId),
					msg.sender
				)
			);
			require(
				// !usedRandomWalkNFTs[uint256(params.randomWalkNFTId)],
				usedRandomWalkNFTs[uint256(params.randomWalkNFTId)] == 0,
				CosmicGameErrors.UsedRandomWalkNFT(
					"This RandomWalk NFT has already been used for bidding.",
					uint256(params.randomWalkNFTId)
				)
			);
			// usedRandomWalkNFTs[uint256(params.randomWalkNFTId)] = true;
			usedRandomWalkNFTs[uint256(params.randomWalkNFTId)] = 1;
			// bidType = CosmicGameConstants.BidType.RandomWalk;

			// todo-3 Somewhere around here, we probably should evaluate `params.openBid`
			// todo-3 and act differently if it's `true`.

			paidBidPrice = newBidPrice / CosmicGameConstants.RANDOMWALK_NFT_BID_PRICE_DIVISOR;
			require(
				msg.value >= paidBidPrice,
				CosmicGameErrors.BidPrice("The value submitted for this transaction is too low.", paidBidPrice, msg.value)
			);
		}
		bidPrice = params.openBid ? msg.value : newBidPrice;

		// Updating bidding statistics.
		bidderInfo[roundNum][msg.sender].totalSpentEth += paidBidPrice;

		_bidCommon(params.message /* , bidType */);
		emit BidEvent(
			/*lastBidderAddress*/ msg.sender,
			roundNum,
			int256(paidBidPrice),
			params.randomWalkNFTId,
			-1,
			prizeTime,
			params.message
		);

		// This condition will be `false` if we assigned near Comment-202412035.
		if (msg.value > paidBidPrice) {

			// Refunding excess ETH if the bidder sent more than required.
			uint256 amountToSend = msg.value - paidBidPrice;
			// todo-1 No reentrancy vulnerability?
			(bool success, ) = msg.sender.call{ value: amountToSend }("");
			require(
				success,
				CosmicGameErrors.FundTransferFailed("Refund transfer failed.", msg.sender, amountToSend) 
			);
		}
	}

	function getBidPrice() public view override returns (uint256) {
		// todo-1 Add 1 to ensure that the result increases?
		return bidPrice * priceIncrease / CosmicGameConstants.MILLION;
	}

	function bidWithCst(string memory message_) external override nonReentrant /*onlyActive*/ {
		_bidWithCst(message_);
	}

	function _bidWithCst(string memory message_) internal /*onlyActive*/ {
		// Comment-202409179 applies.
		uint256 price = getCurrentBidPriceCST();

		// uint256 userBalance = token.balanceOf(msg.sender);

		// // Comment-202409181 applies.
		// require(
		// 	userBalance >= price,
		// 	CosmicGameErrors.InsufficientCSTBalance(
		// 		"Insufficient CST token balance to make a bid with CST.",
		// 		price,
		// 		userBalance
		// 	)
		// );

		// Comment-202409177 applies.
		token.burn(msg.sender, price);

		bidderInfo[roundNum][msg.sender].totalSpentCst += price;
		if (bidderInfo[roundNum][msg.sender].totalSpentCst > stellarSpenderTotalSpentCst) {
			stellarSpenderTotalSpentCst = bidderInfo[roundNum][msg.sender].totalSpentCst;
			stellarSpender = msg.sender;
		}

		// Comment-202409163 applies.
		uint256 newStartingBidPriceCst_ =
			Math.max(price * CosmicGameConstants.STARTING_BID_PRICE_CST_MULTIPLIER, startingBidPriceCSTMinLimit);
		startingBidPriceCST = newStartingBidPriceCst_;

		lastCstBidTimeStamp = block.timestamp;
		_bidCommon(message_ /* , CosmicGameConstants.BidType.CST */);
		emit BidEvent(/*lastBidderAddress*/ msg.sender, roundNum, -1, -1, int256(price), prizeTime, message_);
	}

	function getCurrentBidPriceCST() public view override returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			(uint256 elapsedDuration_, uint256 duration_) = getCstAuctionDuration();
			uint256 remainingDuration_ = uint256(int256(duration_) - int256(elapsedDuration_));
			if (int256(remainingDuration_) <= int256(0)) {
				return 0;
			}

			// uint256 fraction = CosmicGameConstants.MILLION - (CosmicGameConstants.MILLION * elapsedDuration_ / duration_);
			// return fraction * startingBidPriceCST / CosmicGameConstants.MILLION;

			return startingBidPriceCST * remainingDuration_ / duration_;
		}
	}

	function getCstAuctionDuration() public view override returns (uint256, uint256) {
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
	function _bidCommon(string memory message /* , CosmicGameConstants.BidType bidType */) internal onlyActive {
		require(
			bytes(message).length <= maxMessageLength,
			CosmicGameErrors.BidMessageLengthOverflow("Message is too long.", bytes(message).length)
		);

		// First bid of the round?
		if (lastBidderAddress == address(0)) {

			prizeTime = block.timestamp + initialSecondsUntilPrize;
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
		// 		CosmicGameErrors.ERC20Mint(
		// 			"CosmicToken.mint failed to mint reward tokens for the bidder.",
		// 			/*lastBidderAddress*/ msg.sender,
		// 			tokenReward
		// 		);
		// }
		// try
		// ToDo-202409245-0 applies.
		token.mint(marketingWallet, marketingReward);
		// {
		// } catch {
		// 	revert
		// 		CosmicGameErrors.ERC20Mint(
		// 			"CosmicToken.mint failed to mint reward tokens for MarketingWallet.",
		// 			marketingWallet,
		// 			marketingReward
		// 		);
		// }

		_pushBackPrizeTime();
	}

	/// @notice Extend the time until the prize can be claimed
	/// @dev This function increases the prize time and adjusts the time increase factor
	function _pushBackPrizeTime() internal {
		uint256 secondsToAdd_ = nanoSecondsExtra / CosmicGameConstants.NANOSECONDS_PER_SECOND;
		prizeTime = Math.max(prizeTime, block.timestamp) + secondsToAdd_;
		nanoSecondsExtra = nanoSecondsExtra * timeIncrease / CosmicGameConstants.MICROSECONDS_PER_SECOND;
	}

	function getTotalBids() public view override returns (uint256) {
		return numRaffleParticipants[roundNum];
	}

	function bidderAddress(uint256 roundNum_, uint256 _positionFromEnd) public view override returns (address) {
		require(
			roundNum_ <= roundNum,
			CosmicGameErrors.InvalidBidderQueryRoundNum(
				"The provided bidding round number is greater than the current one's.",
				roundNum_,
				roundNum
			)
		);
		uint256 numRaffleParticipants_ = numRaffleParticipants[roundNum_];
		require(
			numRaffleParticipants_ > 0,
			CosmicGameErrors.BidderQueryNoBidsYet("No bids have been made in this round yet.", roundNum_)
		);
		require(
			_positionFromEnd < numRaffleParticipants_,
			CosmicGameErrors.InvalidBidderQueryOffset(
				"Provided index is larger than array length",
				roundNum_,
				_positionFromEnd,
				numRaffleParticipants_
			)
		);
		uint256 offset = numRaffleParticipants_ - _positionFromEnd - 1;
		address bidderAddr = raffleParticipants[roundNum_][offset];
		return bidderAddr;
	}

	function getBidderAtPosition(uint256 position) public view override returns (address) {
		require(position < numRaffleParticipants[roundNum], "Position out of bounds");
		return raffleParticipants[roundNum][position];
	}

	function getTotalSpentByBidder(address bidderAddress_) public view override returns (uint256, uint256) {
		return (bidderInfo[roundNum][bidderAddress_].totalSpentEth, bidderInfo[roundNum][bidderAddress_].totalSpentCst);
	}

	// function wasRandomWalkNftUsed(uint256 nftId_) public view override returns (bool) {
	// 	// todo-9 This is now a `uint256`.
	// 	return usedRandomWalkNFTs[nftId_];
	// }
}
