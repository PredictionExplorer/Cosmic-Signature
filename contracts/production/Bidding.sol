// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

// #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { CosmicToken } from "./CosmicToken.sol";
// import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { SystemManagement } from "./SystemManagement.sol";
import { BidStatistics } from "./BidStatistics.sol";
import { IBidding } from "./interfaces/IBidding.sol";

abstract contract Bidding is ReentrancyGuardUpgradeable, CosmicSignatureGameStorage, SystemManagement, BidStatistics, IBidding {
	// #region Data Types

	/// @title Bid Parameters.
	/// @dev Encapsulates parameters for placing a bid in the Cosmic Game.
	/// [Comment-202411111]
	/// Similar structures exist in multiple places.
	/// [/Comment-202411111]
	struct BidParams {
		/// @notice The message associated with the bid
		/// @dev Can be used to store additional information or comments from the bidder
		string message;

		/// @notice The ID of the RandomWalk NFT used for bidding, if any
		/// @dev Set to -1 if no RandomWalk NFT is used, otherwise contains the NFT's ID
		/// @custom:note RandomWalk NFTs may provide special benefits or discounts when used for bidding
		int256 randomWalkNFTId;
	}

	// #endregion

	function bid(bytes memory _data) public payable override nonReentrant /*onlyActive*/ {
		_bid(_data);
	}

	function _bid(bytes memory _data) internal /*onlyActive*/ {
		BidParams memory params = abi.decode(_data, (BidParams));

		if (params.randomWalkNFTId != -1) {
			require(
				!usedRandomWalkNFTs[uint256(params.randomWalkNFTId)],
				CosmicGameErrors.UsedRandomWalkNFT(
					"This RandomWalk NFT has already been used for bidding.",
					uint256(params.randomWalkNFTId)
				)
			);
			require(
				randomWalkNft.ownerOf(uint256(params.randomWalkNFTId)) == msg.sender,
				CosmicGameErrors.IncorrectERC721TokenOwner(
					"You must be the owner of the RandomWalk NFT.",
					address(randomWalkNft),
					uint256(params.randomWalkNFTId),
					msg.sender
				)
			);
			usedRandomWalkNFTs[uint256(params.randomWalkNFTId)] = true;
		}

		CosmicGameConstants.BidType bidType = params.randomWalkNFTId == -1
			? CosmicGameConstants.BidType.ETH
			: CosmicGameConstants.BidType.RandomWalk;

		uint256 newBidPrice = getBidPrice();
		uint256 rwalkBidPrice = newBidPrice / 2;
		uint256 paidBidPrice;

		// RandomWalk NFT bids get a 50% discount on the bid price
		if (bidType == CosmicGameConstants.BidType.RandomWalk) {
			require(
				msg.value >= rwalkBidPrice,
				CosmicGameErrors.BidPrice(
					"The value submitted for this transaction with RandomWalk is too low.",
					rwalkBidPrice,
					msg.value
				)
			);
			paidBidPrice = rwalkBidPrice;
		} else {
			require(
				msg.value >= newBidPrice,
				CosmicGameErrors.BidPrice(
					"The value submitted for this transaction is too low.",
					newBidPrice,
					msg.value
				)
			);
			paidBidPrice = newBidPrice;
		}

		// Update bidding statistics 
		bidderInfo[roundNum][msg.sender].totalSpentEth = bidderInfo[roundNum][msg.sender].totalSpentEth + paidBidPrice;

		bidPrice = newBidPrice;
		_bidCommon(params.message, bidType);

		// Refund excess ETH if the bidder sent more than required
		if (msg.value > paidBidPrice) {
			uint256 amountToSend = msg.value - paidBidPrice;
			(bool success, ) = msg.sender.call{ value: amountToSend }("");
			require(
				success,
				CosmicGameErrors.FundTransferFailed("Refund transfer failed.", msg.sender, amountToSend) 
			);
		}

		// todo-1 Emit this before sending refund.
		emit BidEvent(
			lastBidder,
			roundNum,
			int256(paidBidPrice),
			params.randomWalkNFTId,
			-1,
			prizeTime,
			params.message
		);
	}

	/// @notice Internal function to handle common bid logic
	/// @dev This function updates game state and distributes rewards
	/// @param message The bidder's message
	/// @param bidType The type of bid (ETH or RandomWalk)
	function _bidCommon(string memory message, CosmicGameConstants.BidType bidType) internal onlyActive {
		require(
			bytes(message).length <= maxMessageLength,
			CosmicGameErrors.BidMessageLengthOverflow("Message is too long.", bytes(message).length)
		);

		// First bid of the round?
		if (lastBidder == address(0)) {
			// todo-0 Why did Nick add this `secondsToAdd_` thing? `_pushBackPrizeTime` is about to add it anyway.
			// uint256 secondsToAdd_ = nanoSecondsExtra / CosmicGameConstants.NANOSECONDS_PER_SECOND;
			prizeTime = block.timestamp + initialSecondsUntilPrize; // + secondsToAdd_;

			// // #enable_asserts // #disable_smtchecker console.log(block.timestamp, prizeTime, prizeTime - block.timestamp);
		} else {
			_updateChampionsIfNeeded();
		}

		lastBidder = msg.sender;
		lastBidType = bidType;
		bidderInfo[roundNum][msg.sender].lastBidTimeStamp = block.timestamp;
		uint256 numRaffleParticipants_ = numRaffleParticipants[roundNum];
		raffleParticipants[roundNum][numRaffleParticipants_] = /*lastBidder*/ msg.sender;
		++ numRaffleParticipants_;
		numRaffleParticipants[roundNum] = numRaffleParticipants_;

		// Distribute token rewards
		// try
		// [ToDo-202409245-0]
		// Can this, realistically, fail?
		// This can't, realistically, overflow, right?
		// [/ToDo-202409245-0]
		token.mint(/*lastBidder*/ msg.sender, tokenReward);
		// {
		// } catch {
		// 	revert
		// 		CosmicGameErrors.ERC20Mint(
		// 			"CosmicToken mint() failed to mint reward tokens for the bidder.",
		// 			/*lastBidder*/ msg.sender,
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
		// 			"CosmicToken mint() failed to mint reward tokens for MarketingWallet.",
		// 			address(marketingWallet),
		// 			marketingReward
		// 		);
		// }

		_pushBackPrizeTime();
	}

	function getBidPrice() public view override returns (uint256) {
		return bidPrice * priceIncrease / CosmicGameConstants.MILLION;
	}

	/// @notice Extend the time until the prize can be claimed
	/// @dev This function increases the prize time and adjusts the time increase factor
	function _pushBackPrizeTime() internal {
		uint256 secondsToAdd_ = nanoSecondsExtra / CosmicGameConstants.NANOSECONDS_PER_SECOND;
		prizeTime = Math.max(prizeTime, block.timestamp) + secondsToAdd_;
		// // #enable_asserts // #disable_smtchecker console.log(block.timestamp, prizeTime, prizeTime - block.timestamp, nanoSecondsExtra);
		nanoSecondsExtra = nanoSecondsExtra * timeIncrease / CosmicGameConstants.MICROSECONDS_PER_SECOND;
	}

	function bidderAddress(uint256 roundNum_, uint256 _positionFromEnd) public view override returns (address) {
		require(
			roundNum_ <= roundNum,
			CosmicGameErrors.InvalidBidderQueryRoundNum(
				"Provided round number is larger than total number of rounds",
				roundNum_,
				roundNum
			)
		);
		uint256 numRaffleParticipants_ = numRaffleParticipants[roundNum_];
		// todo-1 Is this validation redundant?
		// todo-1 Maybe skip all validations and check them only if the bidder address is zero.
		// todo-1 The same applies to `getBidderAtPosition`.
		// todo-1 Speking of which, would it make sense to call it from here?
		require(
			numRaffleParticipants_ > 0,
			CosmicGameErrors.BidderQueryNoBidsYet("No bids have been made in this round yet", roundNum_)
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

	function bidWithCST(string memory message) external override nonReentrant /*onlyActive*/ {
		// uint256 userBalance = token.balanceOf(msg.sender);

		// [Comment-202409179]
		// This can be zero.
		// When this is zero, we will burn zero CST tokens near Comment-202409177, so someone can bid with zero CST tokens.
		// We are OK with that.
		// [/Comment-202409179]
		uint256 price = getCurrentBidPriceCST();

		// // [Comment-202409181]
		// // This validation is unnecessary, given that `token.burn` called near Comment-202409177 is going to perform it too.
		// // [/Comment-202409181]
		// require(
		// 	userBalance >= price,
		// 	CosmicGameErrors.InsufficientCSTBalance(
		// 		"Insufficient CST token balance to make a bid with CST",
		// 		price,
		// 		userBalance
		// 	)
		// );

		// [Comment-202409177]
		// Burn the CST tokens used for bidding.
		// ToDo-202411182-1 relates and/or applies.
		// [/Comment-202409177]
		// todo-1 What about calling `ERC20Burnable.burn` or `ERC20Burnable.burnFrom` here?
		// todo-1 It would be a safer option.
		token.burn(msg.sender, price);

		bidderInfo[roundNum][msg.sender].totalSpentCst = bidderInfo[roundNum][msg.sender].totalSpentCst + price;
		if (bidderInfo[roundNum][msg.sender].totalSpentCst > stellarSpenderTotalSpentCst) {
			stellarSpenderTotalSpentCst = bidderInfo[roundNum][msg.sender].totalSpentCst;
			stellarSpender = msg.sender;
		}

		// [Comment-202409163]
		// Doubling the starting CST price for the next CST bid, while enforcing a minimum.
		// This logic avoids an overfow, both here and near Comment-202409162.
		// [/Comment-202409163]
		uint256 newStartingBidPriceCST;
		if (price >= type(uint256).max / CosmicGameConstants.MILLION / CosmicGameConstants.STARTING_BID_PRICE_CST_MULTIPLIER) {
			newStartingBidPriceCST = type(uint256).max / CosmicGameConstants.MILLION;
		} else {
			// #enable_smtchecker /*
			unchecked
			// #enable_smtchecker */
			{
				newStartingBidPriceCST = price * CosmicGameConstants.STARTING_BID_PRICE_CST_MULTIPLIER;
			}
			newStartingBidPriceCST = Math.max(newStartingBidPriceCST, startingBidPriceCSTMinLimit);
		}
		startingBidPriceCST = newStartingBidPriceCST;
		// #enable_asserts assert(startingBidPriceCST >= startingBidPriceCSTMinLimit);

		lastCstBidTimeStamp = block.timestamp;
		_bidCommon(message, CosmicGameConstants.BidType.CST);

		// [Comment-202409182]
		// The cast of `price` to a signed integer can't overflow, thanks to the logic near Comment-202409163.
		// [/Comment-202409182]
		emit BidEvent(lastBidder, roundNum, -1, -1, int256(price), prizeTime, message);
	}

	function getCurrentBidPriceCST() public view override returns (uint256) {
		(uint256 numSecondsElapsed_, uint256 duration_) = getCstAuctionDuration();
		// // #enable_asserts // #disable_smtchecker console.log(202411119, numSecondsElapsed_, duration_);
		if (numSecondsElapsed_ >= duration_) {
			return 0;
		}
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 fraction = CosmicGameConstants.MILLION - (CosmicGameConstants.MILLION * numSecondsElapsed_ / duration_);

			// [Comment-202409162/]
			return fraction * startingBidPriceCST / CosmicGameConstants.MILLION;

			// // todo-0 Nick, you might want to refactopr the above this way.
			// // todo-0 Remember to fix relevant code and comments.
			// // todo-0 Remember to make the same change in `BiddingOpenBid`.
			// int256 newFormulaIdea = startingBidPriceCST - (startingBidPriceCST * numSecondsElapsed_ / duration_);
		}
	}

	function getCstAuctionDuration() public view override returns (uint256, uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 numSecondsElapsed_ = uint256(int256(block.timestamp) - int256(lastCstBidTimeStamp));
			if(int256(numSecondsElapsed_) < int256(0))
			{
				numSecondsElapsed_ = 0;
			}
			return (numSecondsElapsed_, cstAuctionLength);
		}
	}

	function getTotalBids() public view override returns (uint256) {
		return numRaffleParticipants[roundNum];
	}

	function getBidderAtPosition(uint256 position) public view override returns (address) {
		require(position < numRaffleParticipants[roundNum], "Position out of bounds");
		return raffleParticipants[roundNum][position];
	}

	function getTotalSpentByBidder(address bidder) public view override returns (uint256, uint256) {
		return (bidderInfo[roundNum][bidder].totalSpentEth, bidderInfo[roundNum][bidder].totalSpentCst);
	}

	function isRandomWalkNFTUsed(uint256 nftId) public view override returns (bool) {
		return usedRandomWalkNFTs[nftId];
	}
}
