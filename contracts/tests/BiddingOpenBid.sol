// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { CosmicGameConstants } from "../production/libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "../production/libraries/CosmicGameErrors.sol";
import { CosmicToken } from "../production/CosmicToken.sol";
import { RandomWalkNFT } from "../production//RandomWalkNFT.sol";
import { CosmicGameStorage } from "../production/CosmicGameStorage.sol";
import { BidStatistics } from "../production/BidStatistics.sol";
import { IBidding } from "../production/interfaces/IBidding.sol";
import { SystemManagement } from "../production/SystemManagement.sol";

abstract contract BiddingOpenBid is ReentrancyGuardUpgradeable, CosmicGameStorage, SystemManagement, BidStatistics, IBidding  {

	uint256 public timesBidPrice; // multiples of bid price that open bid has to be


	struct BidParams {
		/// @notice The message associated with the bid
		/// @dev Can be used to store additional information or comments from the bidder
		string message;
		/// @notice The ID of the RandomWalk NFT used for bidding, if any
		/// @dev Set to -1 if no RandomWalk NFT is used, otherwise contains the NFT's ID
		/// @custom:note RandomWalk NFTs may provide special benefits or discounts when used for bidding
		int256 randomWalkNFTId;
		/// @notice The flag used to mark a bid as 'bid with open price' (any price user wants) bidPrice will be updated to msg.value and stay at that level
		/// @dev Set to true to send this type of bid
		bool openBid;
	}
	event TimesBidPriceChangedEvent(uint256 newTimesBidPrice);

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
			if (params.openBid) {
				uint256 minPriceOpenBid = timesBidPrice * newBidPrice;
				// Note: we are not using custom errors (in require() statements) because this is a test contract
				require(msg.value >= minPriceOpenBid, "The value submitted for open bid is too low.");
				require(
					msg.value >= minPriceOpenBid,
					CosmicGameErrors.BidPrice("The value submitted for open bid too low.", minPriceOpenBid, msg.value)
				);
				paidBidPrice = msg.value;
			} else {
				require(msg.value >= newBidPrice, "The value submitted for this transaction is too low.");
				paidBidPrice = newBidPrice;
			}
		}

		bidderInfo[roundNum][msg.sender].totalSpent = bidderInfo[roundNum][msg.sender].totalSpent + (paidBidPrice);
		if (bidderInfo[roundNum][msg.sender].totalSpent > stellarSpenderAmount) {
			stellarSpenderAmount = bidderInfo[roundNum][msg.sender].totalSpent;
			stellarSpender = msg.sender;
		}

		if (params.openBid) {
			bidPrice = msg.value;
		} else {
			bidPrice = newBidPrice;
		}

		_bidCommon(params.message, bidType);

		if (params.openBid) {
			// on open bids full msg.value is consumed
		} else {
			// Refund excess ETH if the bidder sent more than required
			if (msg.value > paidBidPrice) {
				uint256 amountToSend = msg.value - paidBidPrice;
				(bool success, ) = msg.sender.call{ value: amountToSend }("");
				require(
					success,
					CosmicGameErrors.FundTransferFailed("Refund transfer failed.", amountToSend,msg.sender) 
				);
			}
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
		// ToDo-202408116-0 applies.
		uint256 offset = numParticipants - (_positionFromEnd) - (1);
		address bidderAddr = raffleParticipants[_round][offset];
		return bidderAddr;
	}

	function bidWithCST(string memory message) external override nonReentrant onlyRuntime {

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
		token.burn(msg.sender, price);

		_bidCommon(message, CosmicGameConstants.BidType.CST);
		emit BidEvent(lastBidder, roundNum, -1, -1, int256(price), prizeTime, message);
	}

	function currentCSTPrice() public view override returns (uint256) {
		(uint256 secondsElapsed, uint256 duration) = auctionDuration();
		if (secondsElapsed >= duration) {
			return 0;
		}
		// ToDo-202408116-0 applies.
		uint256 fraction = uint256(1e6) - ((uint256(1e6) * (secondsElapsed)) / (duration));
		// ToDo-202408116-0 applies.
		return (fraction * (startingBidPriceCST)) / (1e6);
	}

	function auctionDuration() public view override returns (uint256, uint256) {
		// ToDo-202408116-0 applies.
		uint256 secondsElapsed = block.timestamp - (lastCSTBidTime);
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

	function setTimesBidPrice(uint256 _value) external onlyOwner {
		timesBidPrice = _value;
		emit TimesBidPriceChangedEvent(_value);
	}

}