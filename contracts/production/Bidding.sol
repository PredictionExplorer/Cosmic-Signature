// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { CosmicGameStorage } from "./CosmicGameStorage.sol";
import { BidStatistics } from "./BidStatistics.sol";
import { IBidding } from "./interfaces/IBidding.sol";
import { SystemManagement } from "./SystemManagement.sol";

abstract contract Bidding is ReentrancyGuardUpgradeable, CosmicGameStorage, SystemManagement, BidStatistics, IBidding {
	// #region Data Types

	/// @title Bid Parameters
	/// @dev Struct to encapsulate parameters for placing a bid in the Cosmic Game
	/// todo-0 I am not sure if we still need this.
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

	function bid(bytes memory _data) public payable override nonReentrant {
		_bid(_data);
	}

	function _bid(bytes memory _data) internal onlyRuntime {

		BidParams memory params = abi.decode(_data, (BidParams));

		if (params.randomWalkNFTId != -1) {
			require(
				!usedRandomWalkNFTs[uint256(params.randomWalkNFTId)],
				CosmicGameErrors.UsedRandomWalkNFT(
					"This RandomWalkNFT has already been used for bidding.",
					uint256(params.randomWalkNFTId)
				)
			);
			require(
				RandomWalkNFT(randomWalk).ownerOf(uint256(params.randomWalkNFTId)) == msg.sender,
				CosmicGameErrors.IncorrectERC721TokenOwner(
					"You must be the owner of the RandomWalkNFT.",
					randomWalk,
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

		// Update Stellar Spender
		bidderInfo[roundNum][msg.sender].totalSpent = bidderInfo[roundNum][msg.sender].totalSpent + paidBidPrice;
		if (bidderInfo[roundNum][msg.sender].totalSpent > stellarSpenderAmount) {
			stellarSpenderAmount = bidderInfo[roundNum][msg.sender].totalSpent;
			stellarSpender = msg.sender;
		}

		bidPrice = newBidPrice;

		_bidCommon(params.message, bidType);

		// Refund excess ETH if the bidder sent more than required
		if (msg.value > paidBidPrice) {
			uint256 amountToSend = msg.value - paidBidPrice;
			(bool success, ) = msg.sender.call{ value: amountToSend }("");
			require(
				success,
				CosmicGameErrors.FundTransferFailed("Refund transfer failed.", amountToSend,msg.sender) 
			);
		}

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
	function _bidCommon(string memory message, CosmicGameConstants.BidType bidType) internal {
		require(
			block.timestamp >= activationTime,
			CosmicGameErrors.ActivationTime("Not active yet.", activationTime, block.timestamp)
		);
		require(
			bytes(message).length <= maxMessageLength,
			CosmicGameErrors.BidMessageLengthOverflow("Message is too long.", bytes(message).length)
		);

		if (lastBidder == address(0)) {
			// First bid of the round
			prizeTime = block.timestamp + initialSecondsUntilPrize;
		}

		_updateEnduranceChampion();
		lastBidder = msg.sender;
		lastBidType = bidType;

		bidderInfo[roundNum][msg.sender].lastBidTime = block.timestamp;

		uint256 numParticipants = numRaffleParticipants[roundNum];
		raffleParticipants[roundNum][numParticipants] = lastBidder;
		numRaffleParticipants[roundNum] = numParticipants + 1;

		// Distribute token rewards
		try token.mint(lastBidder, tokenReward) {
		} catch {
			revert
				CosmicGameErrors.ERC20Mint(
					"CosmicToken mint() failed to mint reward tokens for the bidder.",
					lastBidder,
					tokenReward
				);
		}
		try token.mint(marketingWallet, marketingReward) {
		} catch {
			revert
				CosmicGameErrors.ERC20Mint(
					"CosmicToken mint() failed to mint reward tokens for MarketingWallet.",
					address(marketingWallet),
					marketingReward
				);
		}

		_pushBackPrizeTime();
	}

	function getBidPrice() public view override returns (uint256) {
		return bidPrice * priceIncrease / CosmicGameConstants.MILLION;
	}

	/// @notice Extend the time until the prize can be claimed
	/// @dev This function increases the prize time and adjusts the time increase factor
	function _pushBackPrizeTime() internal {
		uint256 secondsAdded = nanoSecondsExtra / CosmicGameConstants.NANOSECONDS_PER_SECOND;
		prizeTime = Math.max(prizeTime, block.timestamp) + secondsAdded;
		nanoSecondsExtra = nanoSecondsExtra * timeIncrease / CosmicGameConstants.MILLION;
	}

	function bidderAddress(uint256 _round, uint256 _positionFromEnd) public view override returns (address) {
		uint256 numParticipants = numRaffleParticipants[_round];
		require(
			_round <= roundNum,
			CosmicGameErrors.InvalidBidderQueryRound(
				"Provided round number is larger than total number of rounds",
				_round,
				roundNum
			)
		);
		require(
			numParticipants > 0,
			CosmicGameErrors.BidderQueryNoBidsYet("No bids have been made in this round yet", _round)
		);
		require(
			_positionFromEnd < numParticipants,
			CosmicGameErrors.InvalidBidderQueryOffset(
				"Provided index is larger than array length",
				_round,
				_positionFromEnd,
				numParticipants
			)
		);
		uint256 offset = numParticipants - _positionFromEnd - 1;
		address bidderAddr = raffleParticipants[_round][offset];
		return bidderAddr;
	}

	function bidWithCST(string memory message) external override nonReentrant onlyRuntime {
		uint256 userBalance = token.balanceOf(msg.sender);
		// todo-0 This can be zero, right? Is it a problem? At least comment.
		uint256 price = calculateCurrentBidPriceCST();
		// todo-1 Do we really need to validate this, given that `token.burn` would probably fail anyway if this condition is not met?
		// todo-1 Regardless, write a comment and cross-ref with where we call `token.burn`.
		require(
			userBalance >= price,
			CosmicGameErrors.InsufficientCSTBalance(
				"Insufficient CST token balance to make a bid with CST",
				price,
				userBalance
			)
		);

		// Doubling the starting CST price for the next auction, while enforcing a minimum
		// todo-1 The above comment appears to be inaccurate because the calculated value can be used within the current auction (bidding round) too, right?
		// todo-0 I added `unchecked`, but is it safe? Do we need a max limit, at least to avoid the possibility of an overflow?
		unchecked {
			startingBidPriceCST = Math.max(startingBidPriceCSTMinLimit, price * CosmicGameConstants.STARTING_BID_PRICE_CST_MULTIPLIER);
		}

		lastCSTBidTime = block.timestamp;

		// Burn the CST tokens used for bidding
		token.burn(msg.sender, price);

		_bidCommon(message, CosmicGameConstants.BidType.CST);
		emit BidEvent(lastBidder, roundNum, -1, -1, int256(price), prizeTime, message);
	}

	function calculateCurrentBidPriceCST() public view override returns (uint256) {
		(uint256 secondsElapsed, uint256 duration) = auctionDuration();
		if (secondsElapsed >= duration) {
			return 0;
		}
		uint256 fraction = CosmicGameConstants.MILLION - (CosmicGameConstants.MILLION * secondsElapsed / duration);
		return fraction * startingBidPriceCST / CosmicGameConstants.MILLION;
	}

	function auctionDuration() public view override returns (uint256, uint256) {
		uint256 secondsElapsed = block.timestamp - lastCSTBidTime;
		return (secondsElapsed, CSTAuctionLength);
	}

	function getTotalBids() public view override returns (uint256) {
		return numRaffleParticipants[roundNum];
	}

	function getBidderAtPosition(uint256 position) public view override returns (address) {
		require(position < numRaffleParticipants[roundNum], "Position out of bounds");
		return raffleParticipants[roundNum][position];
	}

	function getTotalSpentByBidder(address bidder) public view override returns (uint256) {
		return bidderInfo[roundNum][bidder].totalSpent;
	}

	function isRandomWalkNFTUsed(uint256 tokenId) public view override returns (bool) {
		return usedRandomWalkNFTs[tokenId];
	}
}
