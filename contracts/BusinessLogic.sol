// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;
pragma abicoder v2;

import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGameConstants } from "./Constants.sol";
import { CosmicGameErrors} from "./Errors.sol";
import { CosmicGame } from "./CosmicGame.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { RaffleWallet } from "./RaffleWallet.sol";
import { StakingWalletCST } from "./StakingWalletCST.sol";
import { StakingWalletRWalk } from "./StakingWalletRWalk.sol";
import { MarketingWallet } from "./MarketingWallet.sol";

contract BusinessLogic is Context, Ownable {
	// COPY OF main contract variables
	RandomWalkNFT public randomWalk;
	CosmicSignature public nft;
	CosmicToken public token;
	BusinessLogic public bLogic;
	RaffleWallet public raffleWallet;
	StakingWalletCST public stakingWalletCST;
	StakingWalletRWalk public stakingWalletRWalk;
	MarketingWallet public marketingWallet;
	address public charity;
	uint256 public roundNum;
	uint256 public bidPrice;
	uint256 public startingBidPriceCST;
	uint256 public nanoSecondsExtra;
	uint256 public timeIncrease;
	uint256 public priceIncrease;
	uint256 public initialBidAmountFraction;
	address public lastBidder;
	CosmicGameConstants.BidType public lastBidType;
	mapping(uint256 => bool) public usedRandomWalkNFTs;
	uint256 public initialSecondsUntilPrize;
	uint256 public prizeTime;
	uint256 public timeoutClaimPrize;
	mapping(uint256 => address) public raffleParticipants;
	uint256 public numRaffleParticipants;
	uint256 public lastCSTBidTime;
	uint256 public CSTAuctionLength;
	uint256 public RoundStartCSTAuctionLength;
	uint256 public prizePercentage;
	uint256 public charityPercentage;
	uint256 public rafflePercentage;
	uint256 public stakingPercentage;
	mapping(uint256 => address) public winners; 
	uint256 public numRaffleETHWinnersBidding;
	uint256 public numRaffleNFTWinnersBidding;
	uint256 public numRaffleNFTWinnersStakingRWalk;
	bytes32 public raffleEntropy;
	mapping(uint256 => CosmicGameConstants.DonatedNFT) public donatedNFTs;
	uint256 public numDonatedNFTs;
	uint256 public activationTime;
	uint256 public tokenReward;
	uint256 public marketingReward;
	uint256 public maxMessageLength;
	uint256 public systemMode;
	mapping(uint256 => uint256) public extraStorage;
	// END OF copy of main contract variables

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
	event RaffleETHWinnerEvent(address indexed winner, uint256 indexed round, uint256 winnerIndex);
	event RaffleNFTWinnerEvent(
		address indexed winner,
		uint256 indexed round,
		uint256 indexed tokenId,
		uint256 winnerIndex,
		bool isStaker,
		bool isRWalk
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
	event SystemModeChanged(uint256 newSystemMode);

	struct BidParams {
		string message;
		int256 randomWalkNFTId;
	}

	constructor() {}
	function bid(bytes memory _param_data) public payable {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME,systemMode)
		);
		BidParams memory params = abi.decode(_param_data, (BidParams));
		CosmicGame game = CosmicGame(payable(address(this)));
		if (params.randomWalkNFTId != -1) {
			require(
				!usedRandomWalkNFTs[uint256(params.randomWalkNFTId)],
				CosmicGameErrors.UsedRandomWalkNFT(
					"This RandomWalkNFT has already been used for bidding.",
					uint256(params.randomWalkNFTId)
				)
			);
			require(
				game.randomWalk().ownerOf(uint256(params.randomWalkNFTId)) == _msgSender(),
				CosmicGameErrors.IncorrectERC721TokenOwner(
					"You must be the owner of the RandomWalkNFT.",
					address(game.randomWalk()),
					uint256(params.randomWalkNFTId),
					_msgSender()
				)
			);
			usedRandomWalkNFTs[uint256(params.randomWalkNFTId)] = true;
		}

		CosmicGameConstants.BidType bidType = params.randomWalkNFTId == -1
			? CosmicGameConstants.BidType.ETH
			: CosmicGameConstants.BidType.RandomWalk;

		uint256 newBidPrice = game.getBidPrice();
		uint256 rwalkBidPrice = newBidPrice / 2;
		uint256 paidBidPrice;

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

		bidPrice = newBidPrice;

		_bidCommon(params.message, bidType);

		if (msg.value > paidBidPrice) {
			// Return the extra money to the bidder.
			uint256 amountToSend = msg.value - paidBidPrice;
			(bool success, ) = lastBidder.call{ value: amountToSend}("");
			require(
				success, 
				CosmicGameErrors.FundTransferFailed(
					"Refund transfer failed.",
					amountToSend,
					lastBidder
				)
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
	function bidAndDonateNFT(bytes calldata _param_data, IERC721 nftAddress, uint256 tokenId) external payable {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME,systemMode)
		);
		bid(_param_data);
		_donateNFT(nftAddress, tokenId);
	}
	function _roundEndResets() internal {
		// everything that needs to be reset after round ends
		lastCSTBidTime = block.timestamp;
		lastBidType = CosmicGameConstants.BidType.ETH;
		CSTAuctionLength = RoundStartCSTAuctionLength;
		numRaffleParticipants = 0;
		bidPrice = address(this).balance / initialBidAmountFraction;
		// note: we aren't resetting 'lastBidder' here because of reentrancy issues

		if (systemMode == CosmicGameConstants.MODE_PREPARE_MAINTENANCE) {
			systemMode = CosmicGameConstants.MODE_MAINTENANCE;
			emit SystemModeChanged(systemMode);
		}
	}
	function _bidCommon(string memory message, CosmicGameConstants.BidType bidType) internal {
		require(
			block.timestamp >= activationTime,
			CosmicGameErrors.ActivationTime(
				"Not active yet.",
				activationTime,
				block.timestamp
			)
		);
		require(
			bytes(message).length <= maxMessageLength,
			CosmicGameErrors.BidMessageLengthOverflow(
			   	"Message is too long.",
				bytes(message).length
			)
		);

		if (lastBidder == address(0)) {
			// someone just claimed a prize and we are starting from scratch
			prizeTime = block.timestamp + initialSecondsUntilPrize;
		}

		lastBidder = _msgSender();
		lastBidType = bidType;

		raffleParticipants[numRaffleParticipants] = lastBidder;
		numRaffleParticipants += 1;

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
	function bidWithCST(string memory message) external {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME,systemMode)
		);
		uint256 userBalance = token.balanceOf(msg.sender);
		uint256 price = abi.decode(currentCSTPrice(), (uint256));
		require(
			userBalance >= price,
			CosmicGameErrors.InsufficientCSTBalance(
				"Insufficient CST token balance to make a bid with CST",
				price,
				userBalance
			)
		);
		startingBidPriceCST = Math.max(100e18, price) * 2;
		lastCSTBidTime = block.timestamp;
		// We want to there to be mainly ETH bids, not CST bids.
		// In order to achieve this, we will adjust the auction length depending on the ratio.
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
		// In this function will distribute rewards according to current configuration

		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME,systemMode)
		);
		CosmicGame game = CosmicGame(payable(address(this)));
		require(
			prizeTime <= block.timestamp,
			CosmicGameErrors.EarlyClaim(
			   	"Not enough time has elapsed.",
				prizeTime,
				block.timestamp
			)
		);
		require(
			lastBidder != address(0),
			CosmicGameErrors.NoLastBidder(
				"There is no last bidder."
			)
		);
		if (block.timestamp - prizeTime < timeoutClaimPrize) {
			// The winner has [timeoutClaimPrize] to claim the prize.
			// After the this interval have elapsed, then *anyone* is able to claim the prize!
			// This prevents a DOS attack, where somebody keeps bidding, but never claims the prize
			// which would stop the creation of new Cosmic Signature NFTs.
			require(
				_msgSender() == lastBidder,
				CosmicGameErrors.LastBidderOnly(
					"Only the last bidder can claim the prize during the first 24 hours.",
					lastBidder,
					_msgSender()
				 )
			);
		}

		lastBidder = address(0);
		address winner = _msgSender();
		winners[roundNum] = winner;

		uint256 cosmicSupply = nft.totalSupply();

		uint256 prizeAmount_ = game.prizeAmount();
		uint256 charityAmount_ = game.charityAmount();
		uint256 raffleAmount_ = game.raffleAmount();
		uint256 stakingAmount_ = game.stakingAmount();

		bool success;
		// If the project just launched, we do not send anything to the staking wallet because
		// nothing could be staked at this point.
		if (cosmicSupply > 0) {
			(success, ) = address(stakingWalletCST).call{ value: stakingAmount_ }(
				abi.encodeWithSelector(StakingWalletCST.deposit.selector)
			);
			require(
				success,
				CosmicGameErrors.FundTransferFailed(
			   		"Staking deposit failed.",
					stakingAmount_,
					address(stakingWalletCST)
				)
			);
		}

		// Give the NFT to the winner.
		(bool mintSuccess, ) = address(nft).call(
			abi.encodeWithSelector(CosmicSignature.mint.selector, winner, roundNum)
		);
		require(
			mintSuccess,
			CosmicGameErrors.ERC721Mint(
				"CosmicSignature mint() failed to mint NFT.",
				winner,
				roundNum
			)
		);

		// Winner index is used to emit the correct event.
		uint256 winnerIndex = 0;

		// List of rewards (summary) for those who didn't win the main prize:
		//	- Group deposit (equal to stakingPercentage) for all Stakers of CST tokens
		//	- [numRaffleEthWinnersForBidding] ETH deposits for random bidder
		//	- [numRaffleNFTWinnersForBidding] NFT mints for random bidder
		//	- [numRaffleNFTWinnersForStakingCST] NFT mints for random staker of CST token
		//	- [numRaffleNFTWinnersForStakingRWalk] NFT mints for random staker or RandomWalk token

		// Mint reffle NFTs to bidders
		for (uint256 i = 0; i < numRaffleNFTWinnersBidding; i++) {
			_updateEntropy();
			address raffleWinner_ = raffleParticipants[uint256(raffleEntropy) % numRaffleParticipants];
			(, bytes memory data) = address(nft).call(
				abi.encodeWithSelector(CosmicSignature.mint.selector, address(raffleWinner_), roundNum)
			);
			uint256 tokenId = abi.decode(data, (uint256));
			emit RaffleNFTWinnerEvent(raffleWinner_, roundNum, tokenId, winnerIndex, false, false);
			winnerIndex += 1;
		}

		// Mint NFTs to random RandomWalkNFT stakers
		uint numStakedTokensRWalk = stakingWalletRWalk.numTokensStaked();
		if (numStakedTokensRWalk > 0) {
			for (uint256 i = 0; i < numRaffleNFTWinnersStakingRWalk; i++) {
				_updateEntropy();
				address rwalkWinner = stakingWalletRWalk.pickRandomStaker(raffleEntropy);
				(, bytes memory data) = address(nft).call(
					abi.encodeWithSelector(CosmicSignature.mint.selector, rwalkWinner, roundNum)
				);
				uint256 tokenId = abi.decode(data, (uint256));
				emit RaffleNFTWinnerEvent(rwalkWinner, roundNum, tokenId, winnerIndex, true, true);
				winnerIndex += 1;
			}
		}

		// Give ETH to the winner.
		(success, ) = winner.call{ value: prizeAmount_ }("");
		require(
			success,
			CosmicGameErrors.FundTransferFailed(
				"Transfer to the winner failed.",
				prizeAmount_,
				winner
			)
		);

		// Give ETH to the charity.
		(success, ) = charity.call{ value: charityAmount_ }("");
		require(
			success,
			CosmicGameErrors.FundTransferFailed(
				"Transfer to charity contract failed.",
				charityAmount_,
				address(charity)
			)
		);

		// Give ETH to the ETH raffle winners.
		for (uint256 i = 0; i < numRaffleETHWinnersBidding; i++) {
			_updateEntropy();
			address raffleWinner_ = raffleParticipants[uint256(raffleEntropy) % numRaffleParticipants];
			(success, ) = address(raffleWallet).call{ value: raffleAmount_ }(
				abi.encodeWithSelector(RaffleWallet.deposit.selector, raffleWinner_)
			);
			require(
				success,
				CosmicGameErrors.FundTransferFailed(
					"Raffle deposit failed.",
					raffleAmount_,
					raffleWinner_
				)
			);
			emit RaffleETHWinnerEvent(raffleWinner_, roundNum, winnerIndex);
		}

		_roundEndResets();
		emit PrizeClaimEvent(roundNum, winner, prizeAmount_);
		roundNum += 1;
	}
	function _updateEntropy() internal {
		raffleEntropy = keccak256(abi.encode(raffleEntropy, block.timestamp, blockhash(block.number - 1)));
	}
	function auctionDuration() public view returns (bytes memory) {
		//Note: we are returning byte array instead of a tuple because delegatecall only supports byte arrays as return value type
		uint256 secondsElapsed = block.timestamp - lastCSTBidTime;
		return abi.encode(secondsElapsed, CSTAuctionLength);
	}
	// We are doing a dutch auction that lasts 24 hours.
	function currentCSTPrice() public view returns (bytes memory) {
		//Note: we return bytes instead of uint256 because delegatecall doesn't support other types than bytes
		(uint256 secondsElapsed, uint256 duration) = abi.decode(auctionDuration(), (uint256, uint256));
		if (secondsElapsed >= duration) {
			uint256 zero = 0;
			return abi.encode(zero);
		}
		uint256 fraction = 1e6 - ((1e6 * secondsElapsed) / duration);
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
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME,systemMode)
		);
		require(
			num < numDonatedNFTs,
			CosmicGameErrors.NonExistentDonatedNFT(
			    "The donated NFT does not exist.",
				num
			)
		);
		address winner = winners[donatedNFTs[num].round];
		require(
			winner != address(0),
			CosmicGameErrors.NonExistentWinner(
				"Non-existent winner for the round.",
				num
			)
		);
		require(
			!donatedNFTs[num].claimed,
			CosmicGameErrors.NFTAlreadyClaimed(
				"The NFT has already been claimed.",
				num
			)
		);
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
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME,systemMode)
		);
		for (uint256 i = 0; i < tokens.length; i++) {
			claimDonatedNFT(tokens[i]);
		}
	}
	function receiveEther() external payable {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME,systemMode)
		);
		BusinessLogic.BidParams memory defaultParams;
		defaultParams.message = "";
		defaultParams.randomWalkNFTId = -1;
		bytes memory param_data;
		param_data = abi.encode(defaultParams);
		bid(param_data);
	}
	function donate() external payable {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME,systemMode)
		);
		require(
			msg.value > 0, 
			CosmicGameErrors.NonZeroValueRequired(
				"Donation amount must be greater than 0."
			)
		);
		if (block.timestamp < activationTime) {
			// Set the initial bid prize only if the game has not started yet.
			bidPrice = address(this).balance / initialBidAmountFraction;
		}
		emit DonationEvent(_msgSender(), msg.value);
	}
}
