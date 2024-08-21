// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "./CosmicGameStorage.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { CosmicGameErrors } from "./CosmicGameErrors.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { BidStatistics } from "./BidStatistics.sol";

abstract contract Bidding is ReentrancyGuardUpgradeable,CosmicGameStorage, BidStatistics {
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
	/// @notice Emitted when a bid is placed
	/// @param lastBidder The address of the bidder
	/// @param round The current round number
	/// @param bidPrice The price of the bid
	/// @param randomWalkNFTId The ID of the RandomWalk NFT used (if any)
	/// @param numCSTTokens The number of CST tokens used (if any)
	/// @param prizeTime The time when the prize can be claimed
	/// @param message An optional message from the bidder
	event BidEvent(
		address indexed lastBidder,
		uint256 indexed round,
		int256 bidPrice,
		int256 randomWalkNFTId,
		int256 numCSTTokens,
		uint256 prizeTime,
		string message
	);
	
	/// @notice Place a bid in the current round 
	/// @dev This function handles ETH bids and RandomWalk NFT bids
	/// @param _data Encoded bid parameters including message and RandomWalk NFT ID
	function bid(bytes calldata _data) external payable nonReentrant {
		_bid(_data);
	}

	function _bid(bytes calldata _data) internal {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);

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
		// [ToDo-202408116-0]
		// This fails to compile, apparently because I have commented out the piece of code near ToDo-202408115-0.
		// Is the safe math needed for overflow checks? That's the default behavior since Solidity 8.0.0.
		// So I have rewritten this to use the `+` or `-` operator.
		// [/ToDo-202408116-0]
		bidderInfo[roundNum][msg.sender].totalSpent = bidderInfo[roundNum][msg.sender].totalSpent + (paidBidPrice);
		if (bidderInfo[roundNum][msg.sender].totalSpent > stellarSpenderAmount) {
			stellarSpenderAmount = bidderInfo[roundNum][msg.sender].totalSpent;
			stellarSpender = msg.sender;
		}

		bidPrice = newBidPrice;

		_bidCommon(params.message, bidType);

		// Refund excess ETH if the bidder sent more than required
		if (msg.value > paidBidPrice) {
			// ToDo-202408116-0 applies.
			uint256 amountToSend = msg.value - (paidBidPrice);
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
			// ToDo-202408116-0 applies.
			prizeTime = block.timestamp + (initialSecondsUntilPrize);
		}

		_updateEnduranceChampion();
		lastBidder = msg.sender;
		lastBidType = bidType;

		bidderInfo[roundNum][msg.sender].lastBidTime = block.timestamp;

		uint256 numParticipants = numRaffleParticipants[roundNum];
		raffleParticipants[roundNum][numParticipants] = lastBidder;
		// ToDo-202408116-0 applies.
		numRaffleParticipants[roundNum] = numParticipants + (1);

		// Distribute token rewards
		(bool mintSuccess, ) = address(token).call(
			abi.encodeWithSelector(CosmicToken.mint.selector, lastBidder, tokenReward)
		);
		require(
			mintSuccess,
			CosmicGameErrors.ERC20Mint(
				"CosmicToken mint() failed to mint reward tokens for the bidder.",
				lastBidder,
				tokenReward
			)
		);
		(mintSuccess, ) = address(token).call(
			abi.encodeWithSelector(CosmicToken.mint.selector, marketingWallet, marketingReward)
		);
		require(
			mintSuccess,
			CosmicGameErrors.ERC20Mint(
				"CosmicToken mint() failed to mint reward tokens for MarketingWallet.",
				address(marketingWallet),
				marketingReward
			)
		);

		_pushBackPrizeTime();
	}
	/// @notice Get the current bid price
	/// @return The current bid price in wei
	function getBidPrice() public view returns (uint256) {
		// ToDo-202408116-0 applies.
		return bidPrice * (priceIncrease) / (CosmicGameConstants.MILLION);
	}

	/// @notice Extend the time until the prize can be claimed
	/// @dev This function increases the prize time and adjusts the time increase factor
	function _pushBackPrizeTime() internal {
		// ToDo-202408116-0 applies.
		uint256 secondsAdded = nanoSecondsExtra / (1_000_000_000);
		// ToDo-202408116-0 applies.
		prizeTime = Math.max(prizeTime, block.timestamp) + (secondsAdded);
		// ToDo-202408116-0 applies.
		nanoSecondsExtra = nanoSecondsExtra * (timeIncrease) / (CosmicGameConstants.MILLION);
	}
	/// @notice Get the address of a bidder at a specific position from the end in a given round
	/// @param _round The round number
	/// @param _positionFromEnd The position from the end of the bidders list
	/// @return The address of the bidder
	function bidderAddress(uint256 _round, uint256 _positionFromEnd) public view returns (address) {
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
		// ToDo-202408116-0 applies.
		uint256 offset = numParticipants - (_positionFromEnd) - (1);
		address bidderAddr = raffleParticipants[_round][offset];
		return bidderAddr;
	}
	/// @notice Place a bid using CST tokens
	/// @dev This function allows bidding with CST tokens, adjusting the CST price dynamically
	/// @param message The bidder's message
	function bidWithCST(string memory message) external nonReentrant {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);
		// uint256 userBalance = IERC20Upgradeable(token).balanceOf(_msgSender());
		uint256 userBalance = IERC20(token).balanceOf(msg.sender);
		uint256 price = currentCSTPrice();
		require(
			userBalance >= price,
			CosmicGameErrors.InsufficientCSTBalance(
				"Insufficient CST token balance to make a bid with CST",
				price,
				userBalance
			)
		);

		// Double the starting CST price for the next auction, with a minimum of 100 CST
		// ToDo-202408116-0 applies.
		startingBidPriceCST = Math.max(100e18, price) * (2);
		lastCSTBidTime = block.timestamp;

		// Burn the CST tokens used for bidding
		SafeERC20.safeTransferFrom(IERC20(token),msg.sender, address(this), price);
		ERC20Burnable(token).burn(price);

		_bidCommon(message, CosmicGameConstants.BidType.CST);
		emit BidEvent(lastBidder, roundNum, -1, -1, int256(price), prizeTime, message);
	}
	/// @notice Calculate the current CST token price for bidding
	/// @dev The price decreases linearly over the auction duration
	/// @return The current CST token price
	function currentCSTPrice() public view returns (uint256) {
		(uint256 secondsElapsed, uint256 duration) = auctionDuration();
		if (secondsElapsed >= duration) {
			return 0;
		}
		// ToDo-202408116-0 applies.
		uint256 fraction = uint256(1e6) - ((uint256(1e6) * (secondsElapsed)) / (duration));
		// ToDo-202408116-0 applies.
		return (fraction * (startingBidPriceCST)) / (1e6);
	}
	/// @notice Get the current auction duration and elapsed time
	/// @dev This function is used to calculate the CST price
	/// @return A tuple containing the seconds elapsed and total duration of the current auction
	function auctionDuration() public view returns (uint256, uint256) {
		// ToDo-202408116-0 applies.
		uint256 secondsElapsed = block.timestamp - (lastCSTBidTime);
		return (secondsElapsed, CSTAuctionLength);
	}
	/// @notice Get the total number of bids in the current round
	/// @return The total number of bids in the current round
	function getTotalBids() public view returns (uint256) {
		return numRaffleParticipants[roundNum];
	}

	/// @notice Get the address of a bidder at a specific position in the current round
	/// @param position The position of the bidder (0-indexed)
	/// @return The address of the bidder at the specified position
	function getBidderAtPosition(uint256 position) public view returns (address) {
		require(position < numRaffleParticipants[roundNum], "Position out of bounds");
		return raffleParticipants[roundNum][position];
	}

	/// @notice Get the total amount spent by a bidder in the current round
	/// @param bidder The address of the bidder
	/// @return The total amount spent by the bidder in wei
	function getTotalSpentByBidder(address bidder) public view returns (uint256) {
		return bidderInfo[roundNum][bidder].totalSpent;
	}

	/// @notice Check if a RandomWalk NFT has been used for bidding
	/// @param tokenId The ID of the RandomWalk NFT
	/// @return True if the NFT has been used, false otherwise
	function isRandomWalkNFTUsed(uint256 tokenId) public view returns (bool) {
		return usedRandomWalkNFTs[tokenId];
	}
}
