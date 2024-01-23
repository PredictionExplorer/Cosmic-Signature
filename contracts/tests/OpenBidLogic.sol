// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.19;
pragma abicoder v2;

import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGameConstants } from "../Constants.sol";
import { CosmicGame } from "../CosmicGame.sol";
import { CosmicSignature } from "../CosmicSignature.sol";
import { CosmicToken } from "../CosmicToken.sol";
import { RandomWalkNFT } from "../RandomWalkNFT.sol";
import { RaffleWallet } from "../RaffleWallet.sol";
import { StakingWallet } from "../StakingWallet.sol";
import { MarketingWallet } from "../MarketingWallet.sol";

contract OpenBusinessLogic is Context, Ownable {
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
	mapping(uint256 => CosmicGameConstants.DonatedNFT) public donatedNFTs;
	uint256 public numDonatedNFTs;
	CosmicSignature public nft;
	OpenBusinessLogic public bLogic;
	mapping(uint256 => uint256) public extraStorage;
	uint256 timesBidPrice; // multiples of bid price that open bid has to be

	event BidEvent(
		address indexed lastBidder,
		uint256 indexed round,
		int256 bidPrice,
		int256 randomWalkNFTId,
		int256 numCSTTokens,
		uint256 prizeTime,
		string message
	);
	event DonationEvent(address indexed donor, uint256 amount);
	event PrizeClaimEvent(uint256 indexed prizeNum, address indexed destination, uint256 amount);
	event RaffleNFTWinnerEvent(
		address indexed winner,
		uint256 indexed round,
		uint256 indexed tokenId,
		uint256 winnerIndex
	);
	event NFTDonationEvent(
		address indexed donor,
		IERC721 indexed nftAddress,
		uint256 indexed round,
		uint256 tokenId,
		uint256 index
	);
	event DonatedNFTClaimedEvent(
		uint256 indexed round,
		uint256 index,
		address winner,
		address nftAddressdonatedNFTs,
		uint256 tokenId
	);
	event TimesBidPriceChangedEvent(uint256 newTimesBidPrice);

	struct BidParams {
		string message;
		int256 randomWalkNFTId;
		bool openBid;		// true if the value sent with the TX is the amount of bid
	}

	constructor() {}

	function bid(bytes memory _param_data) public payable {
		BidParams memory params = abi.decode(_param_data,(BidParams));
		CosmicGame game = CosmicGame(payable(address(this)));
		if (params.randomWalkNFTId != -1) {
			require(
				!usedRandomWalkNFTs[uint256(params.randomWalkNFTId)],
				"This RandomWalkNFT has already been used for bidding."
			);
			require(
				game.randomWalk().ownerOf(uint256(params.randomWalkNFTId)) == _msgSender(),
				"You must be the owner of the RandomWalkNFT."
			);
			usedRandomWalkNFTs[uint256(params.randomWalkNFTId)] = true;
		}

		CosmicGameConstants.BidType bidType = params.randomWalkNFTId == -1
			? CosmicGameConstants.BidType.ETH
			: CosmicGameConstants.BidType.RandomWalk;
		if (bidType == CosmicGameConstants.BidType.ETH) {
			numETHBids += 1;
		}

		uint256 newBidPrice = game.getBidPrice();
		uint256 rwalkBidPrice = newBidPrice / 2;
		uint256 paidBidPrice;

		if (bidType == CosmicGameConstants.BidType.RandomWalk) {
			require(msg.value >= rwalkBidPrice, "The value submitted for this transaction with RandomWalk is too low.");
			paidBidPrice = rwalkBidPrice;
		} else {
			if (params.openBid) {
				uint256 minPriceOpenBid = timesBidPrice * newBidPrice;
				require(msg.value >= minPriceOpenBid,"The value submitted for open bid is too low.");
				paidBidPrice = msg.value;
			} else {
				require(msg.value >= newBidPrice, "The value submitted for this transaction is too low.");
				paidBidPrice = newBidPrice;
			}
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
			if (msg.value > paidBidPrice) {
				// Return the extra money to the bidder.
				(bool success, ) = lastBidder.call{ value: msg.value - paidBidPrice }("");
				require(success, "Refund transfer failed.");
			}
		}
		emit BidEvent(lastBidder, roundNum, int256(paidBidPrice), params.randomWalkNFTId, -1, prizeTime, params.message);
	}
	function bidAndDonateNFT(
		bytes calldata _param_data,
		IERC721 nftAddress,
		uint256 tokenId
	) external payable {

		bid(_param_data);
		_donateNFT(nftAddress, tokenId);
	}
	function _bidCommon(string memory message, CosmicGameConstants.BidType bidType) internal {
		require(block.timestamp >= activationTime, "Not active yet.");
		require(bytes(message).length <= CosmicGameConstants.MAX_MESSAGE_LENGTH, "Message is too long.");

		if (lastBidder == address(0)) {
			// someone just claimed a prize and we are starting from scratch
			prizeTime = block.timestamp + initialSecondsUntilPrize;
		}

		lastBidder = _msgSender();
		lastBidType = bidType;

		raffleParticipants[numRaffleParticipants] = lastBidder;
		numRaffleParticipants += 1;

		(bool mintSuccess, ) = address(token).call(
			abi.encodeWithSelector(CosmicToken.mint.selector, lastBidder, CosmicGameConstants.TOKEN_REWARD)
		);
		require(mintSuccess, "CosmicToken mint() failed to mint reward tokens.");

		(mintSuccess, ) = address(token).call(
			abi.encodeWithSelector(CosmicToken.mint.selector, marketingWallet, CosmicGameConstants.MARKETING_REWARD)
		);
		require(mintSuccess, "CosmicToken mint() failed to mint reward tokens.");

		_pushBackPrizeTime();
	}
	function bidWithCST(string memory message) external {
		uint256 price = abi.decode(currentCSTPrice(),(uint256));
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
	function claimPrize() external {
		// In this function we give:
		// - 10 Cosmic NFTs:
		//     - 1 to the game winner
		//     - 5 to raffle winners
		//     - 2 to RandomWalkNFT holders
		//     - 2 to Cosmic NFT holders
		// - 55% of the ETH in the contract
		//     - 25% to the game winner
		//     - 10% to the charity
		//     - 15% to the raffle winner

		CosmicGame game = CosmicGame(payable(address(this)));
		require(prizeTime <= block.timestamp, "Not enough time has elapsed.");
		require(lastBidder != address(0), "There is no last bidder.");
		if (block.timestamp - prizeTime < timeoutClaimPrize) {
			// The winner has [timeoutClaimPrize] to claim the prize.
			// After the this interval have elapsed, then *anyone* is able to claim the prize!
			// This prevents a DOS attack, where somebody keeps bidding, but never claims the prize
			// which would stop the creation of new Cosmic Signature NFTs.
			require(_msgSender() == lastBidder, "Only the last bidder can claim the prize during the first 24 hours.");
		}

		lastBidder = address(0);
		address winner = _msgSender();
		winners[roundNum] = winner;

		uint256 rwalkSupply = randomWalk.totalSupply();
		uint256 cosmicSupply = nft.totalSupply();

		uint256 prizeAmount_ = game.prizeAmount();
		uint256 charityAmount_ = game.charityAmount();
		uint256 raffleAmount_ = game.raffleAmount();
		uint256 stakingAmount_ = game.stakingAmount();

		bool success;
		if (cosmicSupply > 0) {
			(success, ) = address(stakingWallet).call{ value: stakingAmount_ }(
				abi.encodeWithSelector(StakingWallet.deposit.selector, block.timestamp)
			);
			require(success, "Staking deposit failed.");
		}

		// Give the NFT to the winner.
		(bool mintSuccess, ) = address(nft).call(
			abi.encodeWithSelector(CosmicSignature.mint.selector, winner, roundNum)
		);
		require(mintSuccess, "CosmicSignature mint() failed to mint NFT.");

		// Winner index is used to emit the correct event.
		uint256 winnerIndex = 0;
		// Give NFTs to the NFT raffle winners.
		for (uint256 i = 0; i < numRaffleNFTWinnersPerRound; i++) {
			_updateEntropy();
			address raffleWinner_ = raffleParticipants[uint256(raffleEntropy) % numRaffleParticipants];
			(, bytes memory data) = address(nft).call(
				abi.encodeWithSelector(CosmicSignature.mint.selector, address(raffleWinner_), roundNum)
			);
			uint256 tokenId = abi.decode(data, (uint256));
			emit RaffleNFTWinnerEvent(raffleWinner_, roundNum, tokenId, winnerIndex);
			winnerIndex += 1;
		}

		// Give some Cosmic NFTs to random RandomWalkNFT and Cosmic NFT holders.
		// The winnerIndex variable is just here in order to emit a correct event.
		for (uint256 i = 0; i < numHolderNFTWinnersPerRound; i++) {
			// Give some Cosmic NFTs to some random RandomWalkNFT holders.
			if (rwalkSupply > 0) {
				_updateEntropy();
				uint256 rwalkWinnerNFTnum = uint256(raffleEntropy) % rwalkSupply;
				address rwalkWinner = randomWalk.ownerOf(rwalkWinnerNFTnum);
				(, bytes memory data) = address(nft).call(
					abi.encodeWithSelector(CosmicSignature.mint.selector, rwalkWinner, roundNum)
				);
				uint256 tokenId = abi.decode(data, (uint256));
				emit RaffleNFTWinnerEvent(rwalkWinner, roundNum, tokenId, winnerIndex);
				winnerIndex += 1;
			}

			// Give some Cosmic NFTs to random Cosmic NFT holders.
			if (cosmicSupply > 0) {
				_updateEntropy();
				uint256 cosmicNFTnum = uint256(raffleEntropy) % cosmicSupply;
				address cosmicWinner = nft.ownerOf(cosmicNFTnum);
				(, bytes memory data) = address(nft).call(
					abi.encodeWithSelector(CosmicSignature.mint.selector, address(cosmicWinner), roundNum)
				);
				uint256 tokenId = abi.decode(data, (uint256));
				emit RaffleNFTWinnerEvent(cosmicWinner, roundNum, tokenId, winnerIndex);
				winnerIndex += 1;
			}
		}

		// Give ETH to the winner.
		(success, ) = winner.call{ value: prizeAmount_ }("");
		require(success, "Transfer to the winner failed.");

		// Give ETH to the charity.
		(success, ) = charity.call{ value: charityAmount_ }("");
		require(success, "Transfer to charity contract failed.");

		// Give ETH to the ETH raffle winners.
		for (uint256 i = 0; i < numRaffleWinnersPerRound; i++) {
			_updateEntropy();
			address raffleWinner_ = raffleParticipants[uint256(raffleEntropy) % numRaffleParticipants];
			(success, ) = address(raffleWallet).call{ value: raffleAmount_ }(
				abi.encodeWithSelector(RaffleWallet.deposit.selector, raffleWinner_)
			);
			require(success, "Raffle deposit failed.");
		}

		// Initialize the next round
		numRaffleParticipants = 0;
		bidPrice = address(this).balance / initialBidAmountFraction;

		emit PrizeClaimEvent(roundNum, winner, prizeAmount_);
		roundNum += 1;
	}
	function _updateEntropy() internal {
		raffleEntropy = keccak256(abi.encode(raffleEntropy, block.timestamp, blockhash(block.number - 1)));
	}
	// We are doing a dutch auction that lasts 24 hours.
	function currentCSTPrice() public view returns (bytes memory) {
		//Note: we return bytes instead of uint256 because delegatecall doesn't support other types than bytes
		uint256 secondsElapsed = block.timestamp - lastCSTBidTime;
		uint256 auction_duration = (nanoSecondsExtra * CSTAuctionLength) / 1e9;
		if (secondsElapsed >= auction_duration) {
			uint256 zero = 0;
			return abi.encode(zero);
		}
		uint256 fraction = 1e6 - ((1e6 * secondsElapsed) / auction_duration);
		uint256 output = (fraction * startingBidPriceCST) / 1e6;
		return abi.encode(output);

	}
	function _donateNFT(IERC721 _nftAddress, uint256 _tokenId) internal {
		// If you are a creator you can donate some NFT to the winner of the
		// current round (which might get you featured on the front page of the website).
		_nftAddress.safeTransferFrom(_msgSender(), address(this), _tokenId);
		donatedNFTs[numDonatedNFTs] = CosmicGameConstants.DonatedNFT({
			nftAddress: _nftAddress,
			tokenId: _tokenId,
			round: roundNum,
			claimed: false
		});
		numDonatedNFTs += 1;
		emit NFTDonationEvent(_msgSender(), _nftAddress, roundNum, _tokenId, numDonatedNFTs - 1);
	}
	// Claiming donated NFTs
	function claimDonatedNFT(uint256 num) public {
		require(num < numDonatedNFTs, "The donated NFT does not exist.");
		address winner = winners[donatedNFTs[num].round];
		require(winner != address(0), "Non-existent winner for the round.");
		require(!donatedNFTs[num].claimed, "The NFT has already been claimed.");
		donatedNFTs[num].claimed = true;
		donatedNFTs[num].nftAddress.safeTransferFrom(address(this), winner, donatedNFTs[num].tokenId);
		emit DonatedNFTClaimedEvent(
			donatedNFTs[num].round,
			num,
			winner,
			address(donatedNFTs[num].nftAddress),
			donatedNFTs[num].tokenId
		);
	}

	function claimManyDonatedNFTs(uint256[] memory tokens) external {
		for (uint256 i = 0; i < tokens.length; i++) {
			claimDonatedNFT(tokens[i]);
		}
	}
	function receiveEther() external payable {
		BidParams memory defaultParams;
		defaultParams.message = "";
		defaultParams.randomWalkNFTId = -1;
		bytes memory param_data;
		param_data = abi.encode(defaultParams);
		bid(param_data);
	}
	function donate() external payable {
		require(msg.value > 0, "Donation amount must be greater than 0.");
		if (block.timestamp < activationTime) {
			// Set the initial bid prize only if the game has not started yet.
			bidPrice = address(this).balance / initialBidAmountFraction;
		}
		emit DonationEvent(_msgSender(), msg.value);
	}
	function setTimesBidPrice(bytes calldata _param_data) external onlyOwner { //cbe6b0e8
		uint256 newTimesBidPrice = abi.decode(_param_data,(uint256));
		timesBidPrice = newTimesBidPrice;
		emit TimesBidPriceChangedEvent(newTimesBidPrice);
	}
	function getTimesBidPrice() external view returns (uint256) { //2e629c7a
		return timesBidPrice;
	}
}
