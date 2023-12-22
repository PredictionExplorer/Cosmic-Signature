// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.19;

import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { CosmicGameConstants } from "./Constants.sol";
import { CosmicGame } from "./CosmicGame.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { RaffleWallet } from "./RaffleWallet.sol";
import { StakingWallet } from "./StakingWallet.sol";
import { MarketingWallet } from "./MarketingWallet.sol";

contract BidBusinessLogic is Context {
	// COPY OF main contract variables
    CosmicGameConstants.BidType public lastBidType;
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
    uint256 public priceIncrease;
	uint256 public timeoutClaimPrize;	
    address public charity;
    uint256 public initialBidAmountFraction;
    uint256 public prizePercentage;
    uint256 public rwalkPrizePercentage;
    uint256 public charityPercentage;
    uint256 public rafflePercentage;
    uint256 public stakingPercentage;
    uint256 public numRaffleWinnersPerRound;
    uint256 public numRaffleNFTWinnersPerRound;
    uint256 public numHolderNFTWinnersPerRound;
    mapping(uint256 => address) public winners;
    bytes32 public raffleEntropy;
    RaffleWallet public raffleWallet;
    StakingWallet public stakingWallet;
    mapping (uint256 => CosmicGameConstants.DonatedNFT) public donatedNFTs;
    uint256 public numDonatedNFTs;
    CosmicSignature public nft;
	BidBusinessLogic public bidLogic;
    mapping (uint256 => uint256) public bidLogicStorage;

    event BidEvent(address indexed lastBidder, uint256 indexed round, int256 bidPrice, int256 randomWalkNFTId, int256 numCSTTokens, uint256 prizeTime, string message);

	struct BidParams {
		string message;
	   	int256 randomWalkNFTId;
	}

    constructor() {
    }
    function bid(BidParams calldata params) public payable {
		CosmicGame game = CosmicGame(payable(address(this)));
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

        CosmicGameConstants.BidType bidType = params.randomWalkNFTId == -1 ? CosmicGameConstants.BidType.ETH : CosmicGameConstants.BidType.RandomWalk;
		if (bidType == CosmicGameConstants.BidType.ETH) {
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
    function _bidCommon(string memory message, CosmicGameConstants.BidType bidType) internal {
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
		CosmicGame game = CosmicGame(payable(address(this)));
        uint256 price = game.currentCSTPrice();
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
        _bidCommon(message, CosmicGameConstants.BidType.CST);
        emit BidEvent(lastBidder, roundNum, -1, -1, int256(price), prizeTime, message);
    }
    function _pushBackPrizeTime() internal {
        uint256 secondsAdded = nanoSecondsExtra / 1_000_000_000;
        prizeTime = Math.max(prizeTime, block.timestamp) + secondsAdded;
        nanoSecondsExtra = (nanoSecondsExtra * timeIncrease) / CosmicGameConstants.MILLION;
    }
}
