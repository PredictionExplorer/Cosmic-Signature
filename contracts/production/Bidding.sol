// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

// #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
// import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
// import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
// import { CosmicSignatureToken } from "./CosmicSignatureToken.sol";
// import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { SystemManagement } from "./SystemManagement.sol";
import { BidStatistics } from "./BidStatistics.sol";
import { IBidding } from "./interfaces/IBidding.sol";

abstract contract Bidding is
	// todo-1 Does this use transient storage?
	ReentrancyGuardUpgradeable,
	CosmicSignatureGameStorage,
	SystemManagement,
	BidStatistics,
	IBidding {
	// #region Data Types

	/// @title Parameters needed to place a bid.
	/// @dev
	/// [Comment-202411111]
	/// Similar structures exist in multiple places.
	/// [/Comment-202411111]
	struct BidParams {
		/// @notice The message associated with the bid
		/// Can be used to store additional information or comments from the bidder
		string message;

		/// @notice The ID of the RandomWalk NFT to be used for bidding.
		/// Set to -1 if no RandomWalk NFT is to be used.
		/// Comment-202412036 applies.
		int256 randomWalkNftId;
	}

	// #endregion

	function bid(bytes memory _data) public payable override nonReentrant /*onlyActive*/ {
		_bid(_data);
	}

	function _bid(bytes memory _data) internal /*onlyActive*/ {
		// todo-1 Why do we need this ugly data thing? Why can't we simply pass parameters to the method the normal way?
		// todo-1 But keep in mind that `BidParams` is different in `BiddingOpenBid`.
		BidParams memory params = abi.decode(_data, (BidParams));
		// CosmicSignatureConstants.BidType bidType;
		uint256 newBidPrice = getBidPrice();
		uint256 paidBidPrice =
			(params.randomWalkNftId == -1) ?
			newBidPrice :
			(newBidPrice / CosmicSignatureConstants.RANDOMWALK_NFT_BID_PRICE_DIVISOR);

		// [Comment-202412045]
		// Performing this validatin as early as possible to minimize gas fee in case the validation fails.
		// [/Comment-202412045]
		require(
			msg.value >= paidBidPrice,
			CosmicSignatureErrors.BidPrice("The value submitted for this transaction is too low.", paidBidPrice, msg.value)
		);

		if (params.randomWalkNftId == -1) {
			// // #enable_asserts assert(bidType == CosmicSignatureConstants.BidType.ETH);
		} else {
			require(
				// !usedRandomWalkNfts[uint256(params.randomWalkNftId)],
				usedRandomWalkNfts[uint256(params.randomWalkNftId)] == 0,
				CosmicSignatureErrors.UsedRandomWalkNft(
					// todo-1 Nick wrote about reducing contract bytecode size:
					// todo-1 also, there is another space - reserve , require() strings. We can remove the strings and leave only error codes.
					// todo-1 It is not going to be very friendly with the user, but if removing strings it fits just under 24K
					// todo-1 I think we should go for it
					"This RandomWalk NFT has already been used for bidding.",
					uint256(params.randomWalkNftId)
				)
			);
			require(
				msg.sender == randomWalkNft.ownerOf(uint256(params.randomWalkNftId)),
				CosmicSignatureErrors.IncorrectERC721TokenOwner(
					"You must be the owner of the RandomWalk NFT.",
					address(randomWalkNft),
					uint256(params.randomWalkNftId),
					msg.sender
				)
			);
			// usedRandomWalkNfts[uint256(params.randomWalkNftId)] = true;
			usedRandomWalkNfts[uint256(params.randomWalkNftId)] = 1;
			// bidType = CosmicSignatureConstants.BidType.RandomWalk;
		}
		bidPrice = newBidPrice;

		// Updating bidding statistics.
		bidderInfo[roundNum][msg.sender].totalSpentEth += paidBidPrice;

		_bidCommon(params.message /* , bidType */);
		emit BidEvent(
			/*lastBidderAddress*/ msg.sender,
			roundNum,
			int256(paidBidPrice),
			params.randomWalkNftId,
			-1,
			prizeTime,
			params.message
		);
		if (msg.value > paidBidPrice) {
			// Refunding excess ETH if the bidder sent more than required.
			uint256 amountToSend = msg.value - paidBidPrice;
			// todo-1 No reentrancy vulnerability?
			(bool isSuccess, ) = msg.sender.call{ value: amountToSend }("");
			require(
				isSuccess,
				CosmicSignatureErrors.FundTransferFailed("Refund transfer failed.", msg.sender, amountToSend) 
			);
		}
	}

	function getBidPrice() public view override returns (uint256) {
		// todo-1 Add 1 to ensure that the result increases?
		return bidPrice * priceIncrease / CosmicSignatureConstants.MILLION;
	}

	function bidWithCst(uint256 priceMaxLimit_, string memory message_) external override nonReentrant /*onlyActive*/ {
		_bidWithCst(priceMaxLimit_, message_);
	}

	function _bidWithCst(uint256 priceMaxLimit_, string memory message_) internal /*onlyActive*/ {
		// [Comment-202409179]
		// This can be zero.
		// When this is zero, we will burn zero CST tokens near Comment-202409177, so someone can bid with zero CST tokens.
		// We are OK with that.
		// todo-1 Confirm with them again that this is OK.
		// todo-1 Discussion: https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1729031458458109
		// todo-1 Maybe require at least 1 Wei bid.
		// todo-1 An alternative would be to enforce `startingBidPriceCSTMinLimit`.
		// todo-1 Or better add another smaller min limit.
		// [/Comment-202409179]
		uint256 price = getCurrentBidPriceCST();

		// Comment-202412045 applies.
		require(
			price <= priceMaxLimit_,
			CosmicSignatureErrors.BidPrice("The current CST bid price is greater than the maximum you allowed.", price, priceMaxLimit_)
		);

		// uint256 userBalance = token.balanceOf(msg.sender);

		// // [Comment-202409181]
		// // This validation is unnecessary, given that `token.burn` called near Comment-202409177 is going to perform it too.
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
		// Burn the CST tokens used for bidding.
		// ToDo-202411182-1 relates and/or applies.
		// todo-1 What about calling `ERC20Burnable.burn` or `ERC20Burnable.burnFrom` here?
		// todo-1 It would be a safer option.
		// [/Comment-202409177]
		token.burn(msg.sender, price);

		bidderInfo[roundNum][msg.sender].totalSpentCst += price;
		// if (bidderInfo[roundNum][msg.sender].totalSpentCst > stellarSpenderTotalSpentCst) {
		// 	stellarSpenderTotalSpentCst = bidderInfo[roundNum][msg.sender].totalSpentCst;
		// 	stellarSpender = msg.sender;
		// }

		// [Comment-202409163]
		// Increasing the starting CST price for the next CST bid, while enforcing a minimum.
		// [/Comment-202409163]
		uint256 newStartingBidPriceCst_ =
			Math.max(price * CosmicSignatureConstants.STARTING_BID_PRICE_CST_MULTIPLIER, startingBidPriceCSTMinLimit);
		startingBidPriceCST = newStartingBidPriceCst_;

		lastCstBidTimeStamp = block.timestamp;
		// todo-1 Should we not save this if `price` is zero?
		// todo-1 But better don't allow zero bids.
		lastCstBidderAddress = msg.sender;
		_bidCommon(message_ /* , CosmicSignatureConstants.BidType.CST */);
		emit BidEvent(/*lastBidderAddress*/ msg.sender, roundNum, -1, -1, int256(price), prizeTime, message_);
	}

	function getCurrentBidPriceCST() public view override returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			(uint256 elapsedDuration_, uint256 duration_) = getCstAuctionDuration();
			// // #enable_asserts // #disable_smtchecker console.log(202411119, elapsedDuration_, duration_);
			uint256 remainingDuration_ = uint256(int256(duration_) - int256(elapsedDuration_));
			if (int256(remainingDuration_) <= int256(0)) {
				return 0;
			}

			// uint256 fraction = CosmicSignatureConstants.MILLION - (CosmicSignatureConstants.MILLION * elapsedDuration_ / duration_);
			// return fraction * startingBidPriceCST / CosmicSignatureConstants.MILLION;

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
	function _bidCommon(string memory message /* , CosmicSignatureConstants.BidType bidType */) internal onlyActive {
		require(
			bytes(message).length <= maxMessageLength,
			CosmicSignatureErrors.BidMessageLengthOverflow("Message is too long.", bytes(message).length)
		);

		// First bid of the round?
		if (lastBidderAddress == address(0)) {
			
			// todo-1 Why did Nick add this `secondsToAdd_` thing? `_pushBackPrizeTime` is about to add it anyway.
			// uint256 secondsToAdd_ = nanoSecondsExtra / CosmicSignatureConstants.NANOSECONDS_PER_SECOND;
			prizeTime = block.timestamp + initialSecondsUntilPrize; // + secondsToAdd_;

			// // #enable_asserts // #disable_smtchecker console.log(block.timestamp, prizeTime, prizeTime - block.timestamp);
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
		// [ToDo-202409245-0]
		// Can this, realistically, fail?
		// This can't, realistically, overflow, right?
		// [/ToDo-202409245-0]
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
		// try
		// ToDo-202409245-0 applies.
		token.mint(marketingWallet, marketingReward);
		// {
		// } catch {
		// 	revert
		// 		CosmicSignatureErrors.ERC20Mint(
		// 			"CosmicSignatureToken.mint failed to mint reward tokens for MarketingWallet.",
		// 			marketingWallet,
		// 			marketingReward
		// 		);
		// }

		// todo-1 ??? Don't call this on first bid in a round?
		_pushBackPrizeTime();
	}

	/// @notice Extend the time until the prize can be claimed
	/// @dev This function increases the prize time and adjusts the time increase factor
	/// todo-1 Rename this similarly to how I am going to rename `prizeTime`.
	function _pushBackPrizeTime() internal {
		uint256 secondsToAdd_ = nanoSecondsExtra / CosmicSignatureConstants.NANOSECONDS_PER_SECOND;
		prizeTime = Math.max(prizeTime, block.timestamp) + secondsToAdd_;
		// // #enable_asserts // #disable_smtchecker console.log(block.timestamp, prizeTime, prizeTime - block.timestamp, nanoSecondsExtra);
		nanoSecondsExtra = nanoSecondsExtra * timeIncrease / CosmicSignatureConstants.MICROSECONDS_PER_SECOND;
	}

	function getTotalBids() public view override returns (uint256) {
		return numRaffleParticipants[roundNum];
	}

	function getBidderAddressAtPosition(uint256 position) public view override returns (address) {
		require(position < numRaffleParticipants[roundNum], "Position out of bounds");
		return raffleParticipants[roundNum][position];
	}

	function bidderAddress(uint256 roundNum_, uint256 _positionFromEnd) public view override returns (address) {
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

	function getTotalSpentByBidder(address bidderAddress_) public view override returns (uint256, uint256) {
		return (bidderInfo[roundNum][bidderAddress_].totalSpentEth, bidderInfo[roundNum][bidderAddress_].totalSpentCst);
	}

	// function wasRandomWalkNftUsed(uint256 nftId_) public view override returns (bool) {
	// 	// todo-9 This is now a `uint256`.
	// 	return usedRandomWalkNfts[nftId_];
	// }
}
