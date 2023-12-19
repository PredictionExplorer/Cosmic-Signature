// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.19;

import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { CosmicGameConstants } from "./Constants.sol";
import { CosmicGame } from "./CosmicGame.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { MarketingWallet } from "./MarketingWallet.sol";

contract BidBusinessLogic is Context {
    enum BidType {
        ETH,
        RandomWalk,
        CST
    }

	// BEGINNING OF		shared variables between business logic contracts and main contract
	// Note: these variables are mirrored from CosmicGame contact. Because internally Solidity
	// accesses state variables via slot number (this number is the position of the variable within the
	// file) the following list must be an identical copy of the main contract so DELEGATECALL instruction
	// will access the correct variable and be able to change it
    BidType public lastBidType;
    mapping(uint256 => bool) public usedRandomWalkNFTs;
    RandomWalkNFT public randomWalk;
    uint256 public bidPrice;
    uint256 public numETHBids;
    address public lastBidder;
    uint256 public roundNum;
    uint256 public prizeTime;
    uint256 public activationTime;
    uint256 public initialSecondsUntilPrize;
    mapping(uint256 => address) public raffleParticipants;
    uint256 public numRaffleParticipants;
    CosmicToken public token;
    MarketingWallet public marketingWallet;
    uint256 public startingBidPriceCST;
    uint256 public lastCSTBidTime;
    uint256 public numCSTBids;
    uint256 public ETHToCSTBidRatio;
    uint256 public CSTAuctionLength;
    uint256 public nanoSecondsExtra;
    uint256 public timeIncrease;
	// END OF		shared variables between business logic contracts and main contract

	// variables for this contract only
	CosmicGame game;
	// end of variables of this contract only

    event BidEvent(address indexed lastBidder, uint256 indexed round, int256 bidPrice, int256 randomWalkNFTId, int256 numCSTTokens, uint256 prizeTime, string message);

	struct BidParams {
		string message;
	   	int256 randomWalkNFTId;
	}

    constructor(CosmicGame _game) {
        game = _game;
    }
    function bid(BidParams calldata params) public payable {

        if (params.randomWalkNFTId != -1) {
            require(!usedRandomWalkNFTs[uint256(params.randomWalkNFTId)], "This RandomWalkNFT has already been used for bidding.");
            require(game.randomWalk().ownerOf(uint256(params.randomWalkNFTId)) == _msgSender(),"You must be the owner of the RandomWalkNFT.");
            usedRandomWalkNFTs[uint256(params.randomWalkNFTId)] = true;
        }

        uint256 newBidPrice = game.getBidPrice();

        require(
            msg.value >= newBidPrice,
            "The value submitted with this transaction is too low."
        );

        bidPrice = newBidPrice;

        BidType bidType = params.randomWalkNFTId == -1 ? BidType.ETH : BidType.RandomWalk;
		if (bidType == BidType.ETH) {
	        numETHBids += 1;
		}
        _bidCommon(params.message, bidType);

        if (msg.value > bidPrice) {
            // Return the extra money to the bidder.
            (bool success, ) = lastBidder.call{value: msg.value - bidPrice}("");
            require(success, "Refund transfer failed.");
        }
        emit BidEvent(lastBidder, roundNum, int256(bidPrice), params.randomWalkNFTId, -1, prizeTime, params.message);
    }
    function _bidCommon(string memory message, BidType bidType) internal {
        require(
            block.timestamp >= activationTime,
            "Not active yet."
        );
        require(bytes(message).length <= CosmicGameConstants.MAX_MESSAGE_LENGTH, "Message is too long.");

        if (lastBidder == address(0)) {
            // someone just claimed a prize and we are starting from scratch
            prizeTime = block.timestamp + initialSecondsUntilPrize;
        }

        lastBidder = _msgSender();
		lastBidType = bidType;

        raffleParticipants[numRaffleParticipants] = lastBidder;
        numRaffleParticipants += 1;

        (bool mintSuccess, ) =
            address(token).call(abi.encodeWithSelector(CosmicToken.mint.selector, lastBidder, CosmicGameConstants.TOKEN_REWARD));
		require(mintSuccess, "CosmicToken mint() failed to mint reward tokens.");

        (mintSuccess, ) =
            address(token).call(abi.encodeWithSelector(CosmicToken.mint.selector, marketingWallet, CosmicGameConstants.MARKETING_REWARD));
		require(mintSuccess, "CosmicToken mint() failed to mint reward tokens.");

        _pushBackPrizeTime();
    }
    function bidWithCST(string memory message) external {
        uint256 price = currentCSTPrice();
        startingBidPriceCST = Math.max(100e18, price) * 2;
        lastCSTBidTime = block.timestamp;
        numCSTBids += 1;
        // We want to there to be mainly ETH bids, not CST bids.
        // In order to achieve this, we will adjust the auction length depending on the ratio.
        if (numETHBids < ETHToCSTBidRatio * numCSTBids) {
            // We are adding 3600 seconds in case the length somehow became zero.
            CSTAuctionLength = CSTAuctionLength * 2 + 3600;
        } else {
            CSTAuctionLength /= 2;
        }
        token.burn(msg.sender, price);
        _bidCommon(message, BidType.CST);
        emit BidEvent(lastBidder, roundNum, -1, -1, int256(price), prizeTime, message);
    }
    function _pushBackPrizeTime() internal {
        uint256 secondsAdded = nanoSecondsExtra / 1_000_000_000;
        prizeTime = Math.max(prizeTime, block.timestamp) + secondsAdded;
        nanoSecondsExtra = (nanoSecondsExtra * timeIncrease) / CosmicGameConstants.MILLION;
    }
    // We are doing a dutch auction that lasts 24 hours.
    function currentCSTPrice() public view returns (uint256) {
        uint256 secondsElapsed = block.timestamp - lastCSTBidTime;
        uint256 auction_duration = (nanoSecondsExtra * CSTAuctionLength) / 1e9;
        if (secondsElapsed >= auction_duration) {
            return 0;
        }
        uint256 fraction = 1e6 - ((1e6 * secondsElapsed) / auction_duration);
        return (fraction * startingBidPriceCST) / 1e6;
    }
}
