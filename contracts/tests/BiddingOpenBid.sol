// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
// import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
// import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { CosmicGameConstants } from "../production/libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "../production/libraries/CosmicGameErrors.sol";
// import { CosmicToken } from "../production/CosmicToken.sol";
// import { RandomWalkNFT } from "../production//RandomWalkNFT.sol";
import { CosmicSignatureGameStorage } from "../production/CosmicSignatureGameStorage.sol";
import { SystemManagement } from "../production/SystemManagement.sol";
import { BidStatistics } from "../production/BidStatistics.sol";
import { IBidding } from "../production/interfaces/IBidding.sol";

abstract contract BiddingOpenBid is ReentrancyGuardUpgradeable, CosmicSignatureGameStorage, SystemManagement, BidStatistics, IBidding {
	uint256 public timesBidPrice; // multiples of bid price that open bid has to be

	/// @dev Comment-202411111 applies.
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

	function _bid(bytes memory _data) internal /*onlyActive*/ {
		BidParams memory params = abi.decode(_data, (BidParams));
		CosmicGameConstants.BidType bidType;

		if (params.randomWalkNFTId != -1) {
			require(
				// !usedRandomWalkNFTs[uint256(params.randomWalkNFTId)],
				usedRandomWalkNFTs[uint256(params.randomWalkNFTId)] == 0,
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
			// usedRandomWalkNFTs[uint256(params.randomWalkNFTId)] = true;
			usedRandomWalkNFTs[uint256(params.randomWalkNFTId)] = 1;
			bidType = CosmicGameConstants.BidType.RandomWalk;
		} else {
			bidType = CosmicGameConstants.BidType.ETH;
		}

		uint256 newBidPrice = getBidPrice();
		uint256 paidBidPrice;

		if (bidType == CosmicGameConstants.BidType.RandomWalk) {
			// RandomWalk NFT bids get a 50% discount on the bid price.
			uint256 rwalkBidPrice = newBidPrice / 2;

			require(
				msg.value >= rwalkBidPrice,
				CosmicGameErrors.BidPrice(
					"The value submitted for this transaction with RandomWalk NFT is too low.",
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

		bidderInfo[roundNum][msg.sender].totalSpentEth = bidderInfo[roundNum][msg.sender].totalSpentEth + paidBidPrice;

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

		// todo-1 Emit this before sending refund.
		emit BidEvent(
			lastBidderAddress,
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
		if (lastBidderAddress == address(0)) {

			prizeTime = block.timestamp + initialSecondsUntilPrize;
		} else {
			_updateChampionsIfNeeded();
		}

		lastBidderAddress = msg.sender;
		lastBidType = bidType;
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

	function getBidPrice() public view override returns (uint256) {
		// todo-1 Add 1 to ensure that the result increases?
		return bidPrice * priceIncrease / CosmicGameConstants.MILLION;
	}

	/// @notice Extend the time until the prize can be claimed
	/// @dev This function increases the prize time and adjusts the time increase factor
	function _pushBackPrizeTime() internal {
		uint256 secondsToAdd_ = nanoSecondsExtra / CosmicGameConstants.NANOSECONDS_PER_SECOND;
		prizeTime = Math.max(prizeTime, block.timestamp) + secondsToAdd_;
		nanoSecondsExtra = nanoSecondsExtra * timeIncrease / CosmicGameConstants.MICROSECONDS_PER_SECOND;
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

	function bidWithCst(string memory message_) external override nonReentrant /*onlyActive*/ {
		_bidWithCst(message_);
	}

	function _bidWithCst(string memory message_) internal /*onlyActive*/ {
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

		if (bidderInfo[roundNum][msg.sender].totalSpentCst > stellarSpenderTotalSpentCst) {
			stellarSpenderTotalSpentCst = bidderInfo[roundNum][msg.sender].totalSpentCst;
			stellarSpender = msg.sender;
		}
		// Comment-202409163 applies.
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
		_bidCommon(message_, CosmicGameConstants.BidType.CST);

		// Comment-202409182 applies.
		emit BidEvent(lastBidderAddress, roundNum, -1, -1, int256(price), prizeTime, message_);
	}

	function getCurrentBidPriceCST() public view override returns (uint256) {
		(uint256 numSecondsElapsed_, uint256 duration_) = getCstAuctionDuration();
		if (numSecondsElapsed_ >= duration_) {
			return 0;
		}
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 fraction = CosmicGameConstants.MILLION - (CosmicGameConstants.MILLION * numSecondsElapsed_ / duration_);

			// Comment-202409162 applies.
			return fraction * startingBidPriceCST / CosmicGameConstants.MILLION;
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

	function getTotalSpentByBidder(address bidderAddress_) public view override returns (uint256, uint256) {
		return (bidderInfo[roundNum][bidderAddress_].totalSpentEth, bidderInfo[roundNum][bidderAddress_].totalSpentCst);
	}

	// function isRandomWalkNFTUsed(uint256 nftId) public view override returns (bool) {
	// 	// todo-9 This is now a `uint256`.
	// 	return usedRandomWalkNFTs[nftId];
	// }

	function setTimesBidPrice(uint256 _value) external onlyOwner {
		timesBidPrice = _value;
		emit TimesBidPriceChangedEvent(_value);
	}
}
