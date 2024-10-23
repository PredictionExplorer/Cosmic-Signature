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
import { SystemManagement } from "../production/SystemManagement.sol";
import { BidStatistics } from "../production/BidStatistics.sol";
import { IBidding } from "../production/interfaces/IBidding.sol";

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
				randomWalkNft.ownerOf(uint256(params.randomWalkNFTId)) == msg.sender,
				CosmicGameErrors.IncorrectERC721TokenOwner(
					"You must be the owner of the RandomWalkNFT.",
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

		bidderInfo[roundNum][msg.sender].totalSpentETH = bidderInfo[roundNum][msg.sender].totalSpentETH + paidBidPrice;

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
					CosmicGameErrors.FundTransferFailed("Refund transfer failed.", msg.sender, amountToSend) 
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
			prizeTime = block.timestamp + initialSecondsUntilPrize;
		} else {
			_updateEnduranceChampion();
		}

		lastBidder = msg.sender;
		lastBidType = bidType;

		bidderInfo[roundNum][msg.sender].lastBidTime = block.timestamp;

		uint256 numRaffleParticipants_ = numRaffleParticipants[roundNum];
		raffleParticipants[roundNum][numRaffleParticipants_] = /*lastBidder*/ msg.sender;
		numRaffleParticipants[roundNum] = numRaffleParticipants_ + 1;

		// Distribute token rewards
		// try
		// ToDo-202409245-0 applies.
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
		uint256 secondsAdded = nanoSecondsExtra / CosmicGameConstants.NANOSECONDS_PER_SECOND;
		prizeTime = Math.max(prizeTime, block.timestamp) + secondsAdded;
		nanoSecondsExtra = nanoSecondsExtra * timeIncrease / CosmicGameConstants.MICROSECONDS_PER_SECOND;
	}

	function bidderAddress(uint256 _round, uint256 _positionFromEnd) public view override returns (address) {
		require(
			_round <= roundNum,
			CosmicGameErrors.InvalidBidderQueryRound(
				"Provided round number is larger than total number of rounds",
				_round,
				roundNum
			)
		);
		uint256 numRaffleParticipants_ = numRaffleParticipants[_round];
		require(
			numRaffleParticipants_ > 0,
			CosmicGameErrors.BidderQueryNoBidsYet("No bids have been made in this round yet", _round)
		);
		require(
			_positionFromEnd < numRaffleParticipants_,
			CosmicGameErrors.InvalidBidderQueryOffset(
				"Provided index is larger than array length",
				_round,
				_positionFromEnd,
				numRaffleParticipants_
			)
		);
		uint256 offset = numRaffleParticipants_ - _positionFromEnd - 1;
		address bidderAddr = raffleParticipants[_round][offset];
		return bidderAddr;
	}

	function bidWithCST(string memory message) external override nonReentrant onlyRuntime {
		// uint256 userBalance = token.balanceOf(msg.sender);

		// Comment-202409179 applies.
		uint256 price = getCurrentBidPriceCST();

		// // Comment-202409181 applies.
		// require(
		// 	userBalance >= price,
		// 	CosmicGameErrors.InsufficientCSTBalance(
		// 		"Insufficient CST token balance to make a bid with CST",
		// 		price,
		// 		userBalance
		// 	)
		// );

		// Comment-202409177 applies.
		token.burn(msg.sender, price);

		if (bidderInfo[roundNum][msg.sender].totalSpentCST > stellarSpenderAmount) {
			stellarSpenderAmount = bidderInfo[roundNum][msg.sender].totalSpentCST;
			stellarSpender = msg.sender;
		}
		// Comment-202409163 applies.
		uint256 newStartingBidPriceCST;
		if (price >= type(uint256).max / CosmicGameConstants.MILLION / CosmicGameConstants.STARTING_BID_PRICE_CST_MULTIPLIER) {
			newStartingBidPriceCST = type(uint256).max / CosmicGameConstants.MILLION;
		}
		else {
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

		// Comment-202409182 applies.
		emit BidEvent(lastBidder, roundNum, -1, -1, int256(price), prizeTime, message);
	}

	function getCurrentBidPriceCST() public view override returns (uint256) {
		(uint256 secondsElapsed_, uint256 duration_) = getCstAuctionDuration();
		if (secondsElapsed_ >= duration_) {
			return 0;
		}
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 fraction = CosmicGameConstants.MILLION - (CosmicGameConstants.MILLION * secondsElapsed_ / duration_);

			// Comment-202409162 applies.
			return fraction * startingBidPriceCST / CosmicGameConstants.MILLION;
		}
	}

	function getCstAuctionDuration() public view override returns (uint256, uint256) {
		uint256 secondsElapsed_ = block.timestamp - lastCstBidTimeStamp;
		return (secondsElapsed_, cstAuctionLength);
	}

	function getTotalBids() public view override returns (uint256) {
		return numRaffleParticipants[roundNum];
	}

	function getBidderAtPosition(uint256 position) public view override returns (address) {
		require(position < numRaffleParticipants[roundNum], "Position out of bounds");
		return raffleParticipants[roundNum][position];
	}

	function getTotalSpentByBidder(address bidder) public view override returns (uint256,uint256) {
		return (bidderInfo[roundNum][bidder].totalSpentETH,bidderInfo[roundNum][bidder].totalSpentCST);
	}

	function isRandomWalkNFTUsed(uint256 nftId) public view override returns (bool) {
		return usedRandomWalkNFTs[nftId];
	}

	function setTimesBidPrice(uint256 _value) external onlyOwner {
		timesBidPrice = _value;
		emit TimesBidPriceChangedEvent(_value);
	}
}
