// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;
pragma abicoder v2;

import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGameConstants } from "./Constants.sol";
import { CosmicGameErrors } from "./Errors.sol";
import { CosmicGame } from "./CosmicGame.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { RaffleWallet } from "./RaffleWallet.sol";
import { StakingWalletCST } from "./StakingWalletCST.sol";
import { StakingWalletRWalk } from "./StakingWalletRWalk.sol";
import { MarketingWallet } from "./MarketingWallet.sol";

// todo-1 Idea. The logic should result in a big jack-pot prize once in a while.
// todo-1 But this will not necessarily work well, given that we aren't going to have that many bidding rounds,
// todo-1 like 100 over 10 years.
// todo-1 One other problem is that our random numbers are not perfectly random,
// todo-1 so some block proposers would have an incentive to invest in exploiting it.
// todo-1 Or it's not really that easy to exploit it?
//
// todo-1 After a round ends, we should remove data related to the ended round.
// todo-1 So we need to refactor the data by turning mappings into scalars.
// todo-1 This will simplify the logic and reduce gas fees.
// todo-1 Some variables, such as `bidPrice`, are already scalars.
// todo-1 But some data related to past rounds must be preserved. For example, donated NFTs.
// todo-1 We also need to save past round winners to let them claim those NFTs.
// todo-1 But after a timeout, maybe after 2 more rounds complete late,
// todo-1 we should forget past winners them and let anybody claim the NFTs.
//
// todo-1 Rememer to refactor the front-end in sync with any refactorings here.
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
	mapping(uint256 => mapping(uint256 => address)) public raffleParticipants;
	mapping(uint256 => uint256) public numRaffleParticipants;
	uint256 public lastCSTBidTime;
	uint256 public CSTAuctionLength;
	uint256 public RoundStartCSTAuctionLength;
	mapping(uint256 => mapping(address => CosmicGameConstants.BidderInfo)) public bidderInfo; // roundNum => bidder => BidderInfo
	address public stellarSpender;
	uint256 public stellarSpenderAmount;
	address public enduranceChampion;
	uint256 public enduranceChampionDuration;
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
	uint256 public donateWithInfoNumRecords;
	mapping(uint256 => CosmicGameConstants.DonationInfoRecord) public donationInfoRecords;
	uint256 public activationTime;
	uint256 public tokenReward;
	uint256 public erc20RewardMultiplier;
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
	event DonationEvent(address indexed donor, uint256 amount, uint256 round);
	event DonationWithInfoEvent(address indexed donor, uint256 amount, uint256 recordId, uint256 round);
	event PrizeClaimEvent(uint256 indexed prizeNum, address indexed destination, uint256 amount);
	event RaffleETHWinnerEvent(address indexed winner, uint256 indexed round, uint256 winnerIndex, uint256 amount);
	event RaffleNFTWinnerEvent(
		address indexed winner,
		uint256 indexed round,
		uint256 indexed tokenId,
		uint256 winnerIndex,
		bool isStaker,
		bool isRWalk
	);
	event EnduranceChampionWinnerEvent(
		address indexed winner,
		uint256 indexed round,
		uint256 indexed erc721TokenId,
		uint256 erc20TokenAmount,
		uint256 winnerIndex
	);
	event StellarSpenderWinnerEvent(
		address indexed winner,
		uint256 indexed round,
		uint256 indexed erc721TokenId,
		uint256 erc20TokenAmount,
		uint256 totalSpent,
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
	event SystemModeChanged(uint256 newSystemMode);

	struct BidParams {
		string message;
		int256 randomWalkNFTId;
	}

	constructor() {}
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
		uint256 offset = numParticipants - _positionFromEnd - 1;
		address bidderAddr = raffleParticipants[_round][offset];
		return bidderAddr;
	}
	// todo-1 Make most `public` methods `external`.
	// todo-1 But we do call `bid` internally as well.
	// todo-1 But it would become a problem if we implement the locking.
	// todo-1 So we will need an internal `bid` method to be called after we have gone through the locker.
	function bid(bytes memory _param_data) public payable {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);
		BidParams memory params = abi.decode(_param_data, (BidParams));
		// todo-1 Make sense to move this variable to the storage? But can I eliminate it?
		// todo-1 I've seen variables like this in multiple places.
		// todo-1 But maybe this logic is more gas efficient than to read a storage variable.
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
				// todo-1 It's good practice to use `_msgSender` over using `msg.sender` directly, right?
				// todo-1 Make sure we always call `_msgSender`.
				// todo-1 The same applies to all `Context` methods.
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

		// todo-1 This makes an external call, right? That's expensive.
		// todo-1 So make copies of `getBidPrice()` and maybe some others in `BusinessLogic`.
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

		// Update Stellar Spender
		bidderInfo[roundNum][msg.sender].totalSpent += paidBidPrice;
		if (bidderInfo[roundNum][msg.sender].totalSpent > stellarSpenderAmount) {
			stellarSpenderAmount = bidderInfo[roundNum][msg.sender].totalSpent;
			stellarSpender = msg.sender;
		}

		bidPrice = newBidPrice;

		_bidCommon(params.message, bidType);

		if (msg.value > paidBidPrice) {
			// Return the extra money to the bidder.
			uint256 amountToSend = msg.value - paidBidPrice;
			// todo-1 Any external call can result in a reentrancy.
			// todo-1 But in this case we are probably not vulnerable.
			(bool success, ) = lastBidder.call{ value: amountToSend }("");
			require(success, CosmicGameErrors.FundTransferFailed("Refund transfer failed.", amountToSend, lastBidder));
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
		// todo-1 Remove this validation becuase `bid` will do it anyway.
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);
		// todo: consider adding reentracy protection.
		bid(_param_data);
		_donateNFT(nftAddress, tokenId);
	}

	/// @notice Resets storage variables after a bidding round ends.
	function _roundEndResets() internal {
		lastCSTBidTime = block.timestamp;
		lastBidType = CosmicGameConstants.BidType.ETH;
		// The auction should last 12 hours longer than the amount of time we add after every bid.
		// Initially this is 12 hours, but will grow slowly over time.
		// todo-1 Make sense to move the above comment to near `CosmicGame.CSTAuctionLength`?
		CSTAuctionLength = (12 * nanoSecondsExtra) / 1_000_000_000;
		// todo-1 This assignment is redundant, right?
		// todo-1 But it will not be after we make this variable a scalar.
		numRaffleParticipants[roundNum + 1] = 0;
		// [ToDo-202408061-1]
		// What if a crazy zillionaire bids up the price to such a level that this would result in a zillion dollars initial bid price?
		// Maybe if nobody bids in a round we should divide the initial bid price by a magic number of 10.
		// Remember to make sure it can't become zero.
		// ToDo-202408062-1 relates and/or applies.
		// [/ToDo-202408061-1]
		bidPrice = address(this).balance / initialBidAmountFraction;
		// note: we aren't resetting 'lastBidder' here because of reentrancy issues
		// todo-1 Actually there is a todo out there to move that resetting to arounf here.

		stellarSpender = address(0);
		stellarSpenderAmount = 0;
		enduranceChampion = address(0);
		enduranceChampionDuration = 0;

		if (systemMode == CosmicGameConstants.MODE_PREPARE_MAINTENANCE) {
			systemMode = CosmicGameConstants.MODE_MAINTENANCE;
			emit SystemModeChanged(systemMode);
		}
	}

// todo-1 If a particular bidder makes multiple bids in a row
// todo-1 we should use their combined timespan between consequitive bids made by the same bidder
// todo-1 to see if they are the endurance champion.
function _updateEnduranceChampion() internal {
		// todo-1 Make sure this condition really can be true.
		// todo-1 It's true when we get here for the 1st time after a rounds begins, right?
		// todo-1 Write a comment?
		if (lastBidder == address(0)) return;

		uint256 lastBidDuration = block.timestamp - bidderInfo[roundNum][lastBidder].lastBidTime;
		if (lastBidDuration > enduranceChampionDuration) {
			enduranceChampionDuration = lastBidDuration;
			enduranceChampion = lastBidder;
		}
	}

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
			// someone has just claimed a prize and we are starting from scratch
			prizeTime = block.timestamp + initialSecondsUntilPrize;
		}

		_updateEnduranceChampion();
		lastBidder = _msgSender();
		lastBidType = bidType;

		bidderInfo[roundNum][msg.sender].lastBidTime = block.timestamp;
		// todo-1 We have already made this assignment a few lines above.
		// todo-1 Besides, we shold always use `_msgSender`.
		lastBidder = msg.sender;

		// todo: Not clear named, maybe rename to numBids? Think about this code more in general
		uint256 numParticipants = numRaffleParticipants[roundNum];
		// todo-1 Rename to `bidders`. Comment that this contains a bidder address per bid and therefore can contain duplicate addresses.
		// todo-1 Do we need a `struct` for all parameters related to a particular bid?
		// todo-1 Then refactor this to a map of bid index to bid info struct.
		raffleParticipants[roundNum][numParticipants] = lastBidder;
		numParticipants += 1;
		numRaffleParticipants[roundNum] = numParticipants;

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
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
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
		// We want there to be mainly ETH bids, not CST bids.
		// In order to achieve this, we will adjust the auction length depending on the ratio.
		token.burn(msg.sender, price);

		_bidCommon(message, CosmicGameConstants.BidType.CST);
		emit BidEvent(lastBidder, roundNum, -1, -1, int256(price), prizeTime, message);
	}

	// todo-1 Rename this to `_extendPrizeTime`?
	// todo-1 Or `_increaseRoundDuration`?
	// todo-1 Maybe also rename `prizeTime` to `roundEndScheduledTime`.
	// todo-1 Remember that bidding is still allowed afterwards. So perhaps something like `prizeEarliestTime` would be more appropriate.
	function _pushBackPrizeTime() internal {
		// TODO: Explain what this function does and why it works this way. It's not intuitive.
		// todo-1 Move this comment to near `CosmicGame.nanoSecondsExtra`.
		// nanosecondsExtra is an additional coefficient to make the time interval larger over months of playing the game
		uint256 secondsAdded = nanoSecondsExtra / 1_000_000_000;

		// We allow bidding after `prizeTime`, so this logic expects that `block.timestamp` is after `prizeTime`.
		prizeTime = Math.max(prizeTime, block.timestamp) + secondsAdded;

		// Increasing this by a small fraction, such as by 0.003%, which is exponential.
		nanoSecondsExtra = (nanoSecondsExtra * timeIncrease) / CosmicGameConstants.MILLION;
	}

	/// @notice This function will distribute rewards according to the current configuration.
	//
	// [ToDo-202408062-1]
	// Make sure this works correct if nobody bid during a round.
	// In that case we need to lower next round initial bid price, but make sure it doesn't become zero.
	// We need to do it without spending gas, with a `view` method. The front-end will call it to get the bid price for the next round.
	// ToDo-202408061-1 relates and/or applies.
	// [/ToDo-202408062-1]
	//
	// todo-1 We should make a single ETH and/or a single CST send to each address.
	// todo-1 It's a lousy design when we can make multiple sends of the same currency to a particular address.
	// todo-1 Perhaps we can use a transient array and/or `mapping` to gather ETH and CST rewards to be sent to each recipiend
	// todo-1 and then make all the sends in a loop.
	// todo-1 Then if an ETH send fails and the address to send to happens to be the winner: revert the whole transaction.
	function claimPrize() external {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);
		CosmicGame game = CosmicGame(payable(address(this)));
		require(
			prizeTime <= block.timestamp,
			CosmicGameErrors.EarlyClaim("Not enough time has elapsed.", prizeTime, block.timestamp)
		);
		require(lastBidder != address(0), CosmicGameErrors.NoLastBidder("There is no last bidder."));
		address winner;
		if (block.timestamp - prizeTime < timeoutClaimPrize) {
			// todo-1 Move this comment to near `CosmicGame.timeoutClaimPrize`?
			// The winner has [timeoutClaimPrize] to claim the prize.
			// After the this interval have elapsed, then *anyone* is able to claim the prize!
			// This prevents a DOS attack, where somebody keeps bidding, but never claims the prize
			// which would stop the creation of new Cosmic Signature NFTs.
			// todo-1 Is this situation similar to nobody bidding during a round.
			// todo-1 Can we use similar logic to recover from both situations?
			// todo-1 See ToDo-202408062-1.
			uint256 timeToWait = 0;
			if (prizeTime > block.timestamp) {
				timeToWait = prizeTime - block.timestamp;
			}
			require(
				_msgSender() == lastBidder,
				CosmicGameErrors.LastBidderOnly(
					"Only the last bidder can claim the prize during the first 24 hours.",
					lastBidder,
					_msgSender(),
					timeToWait
				)
			);
			// todo-1 At this point, `lastBidder` equals '_msgSender()', right?
			// todo-1 So it appears that we can unconditionally assign `winner = _msgSender();`
			// todo-1 Or just eliminate the `winner` variable and instead call `_msgSender`, asuming the call will be inlined.
			// todo-1 Is it more gas efficient to call `_msgSender()` than to read a state variable?
			winner = lastBidder;
		} else {
			winner = _msgSender();
		}
		_updateEnduranceChampion();
		
		// This prevents reentracy attack. todo: think about this more and make a better comment
		// todo-1 But maybe implement locking of all `public` and `external` methods using a transient storage variable.
		// todo-1 Then consider making this resetting at the very end in `_roundEndResets`.
		lastBidder = address(0);

		winners[roundNum] = winner;

		uint256 cosmicSupply = nft.totalSupply();

		uint256 prizeAmount_ = game.prizeAmount();
		uint256 charityAmount_ = game.charityAmount();
		uint256 raffleAmount_ = game.raffleAmount();
		uint256 stakingAmount_ = game.stakingAmount();

		bool success;
		// If the project just launched, we do not send anything to the staking wallet because
		// nothing could be staked at this point.
		// todo-1 Cross-reference the above comment with Comment-202408074?
		if (cosmicSupply > 0) {
			(
				address(stakingWalletCST).call{ value: stakingAmount_ }(
					abi.encodeWithSelector(StakingWalletCST.deposit.selector)
				)
			);
		}

		// Give the NFT to the winner.
		(address(nft).call(abi.encodeWithSelector(CosmicSignature.mint.selector, winner, roundNum)));

		// Winner index is used to emit the correct event.
		uint256 winnerIndex = 0;

		{
			// Endurance Champion Prize
			(, bytes memory data) = address(nft).call(
				abi.encodeWithSelector(CosmicSignature.mint.selector, enduranceChampion, roundNum)
			);
			uint256 tokenId = abi.decode(data, (uint256));
			uint256 erc20TokenReward = erc20RewardMultiplier * numRaffleParticipants[roundNum];
			(
				address(token).call(
					abi.encodeWithSelector(CosmicToken.mint.selector, enduranceChampion, erc20TokenReward)
				)
			);
			emit EnduranceChampionWinnerEvent(enduranceChampion, roundNum, tokenId, erc20TokenReward, winnerIndex);
			winnerIndex += 1;
		}
		{
			// Stellar Spender Prize
			(, bytes memory data) = address(nft).call(
				abi.encodeWithSelector(CosmicSignature.mint.selector, stellarSpender, roundNum)
			);
			uint256 tokenId = abi.decode(data, (uint256));
			uint256 erc20TokenReward = erc20RewardMultiplier * numRaffleParticipants[roundNum];
			(address(token).call(abi.encodeWithSelector(CosmicToken.mint.selector, stellarSpender, erc20TokenReward)));
			emit StellarSpenderWinnerEvent(
				stellarSpender,
				roundNum,
				tokenId,
				erc20TokenReward,
				stellarSpenderAmount,
				winnerIndex
			);
			winnerIndex += 1;
		}

		// Summary of rewards for those who didn't win the main prize:
		//	- Group deposit (equal to stakingPercentage) for all Stakers of CST tokens
		//	- [numRaffleEthWinnersForBidding] ETH deposits for random bidder
		//	- [numRaffleNFTWinnersForBidding] NFT mints for random bidder
		//	- [numRaffleNFTWinnersForStakingRWalk] NFT mints for random staker or RandomWalk token
		// todo-1 Also Endurance Champion and Stellar Spender?

		uint256 numParticipants = numRaffleParticipants[roundNum];
		// Mint reffle NFTs to bidders
		for (uint256 i = 0; i < numRaffleNFTWinnersBidding; i++) {
			_updateEntropy();
			address raffleWinner_ = raffleParticipants[roundNum][uint256(raffleEntropy) % numParticipants];
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

		// Give ETH to the last winner.
		(success, ) = winner.call{ value: prizeAmount_ }("");
		// This is the only require() that we have when it comes to giving prizes,
		// checks on external calls are omitted to ensure the winner gets main prize no matter what
		require(success, CosmicGameErrors.FundTransferFailed("Transfer to the winner failed.", prizeAmount_, winner));

		// Give ETH to the charity.
		(charity.call{ value: charityAmount_ }(""));

		// Give ETH to the ETH raffle winners.
		uint256 perWinnerAmount_ = raffleAmount_ / numRaffleETHWinnersBidding;
		for (uint256 i = 0; i < numRaffleETHWinnersBidding; i++) {
			_updateEntropy();
			address raffleWinner_ = raffleParticipants[roundNum][uint256(raffleEntropy) % numParticipants];
			(
				address(raffleWallet).call{ value: perWinnerAmount_ }(
					abi.encodeWithSelector(RaffleWallet.deposit.selector, raffleWinner_)
				)
			);
			emit RaffleETHWinnerEvent(raffleWinner_, roundNum, winnerIndex, perWinnerAmount_);
			winnerIndex += 1;
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
		// todo-1 Why do we need the "safe" method call?
		// todo-1 The "safe" means that it will check if our own contract is able to receive NFT, right?
		// todo-1 That check is unnecessary, right?
		// todo: Think if this can be attacked some how. What if Someone makes some hacked
		//       nft and we are going to call that function. Is there any danger??
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

	/// @notice
	/// [Comment-202408065]
	/// The bidding round winner (who has successfully executed the `claimPrize` method) is allowed (but not required)
	/// to claim NFTs someone donated to us during the round.
	/// todo-1 Make sure that the donated NFT can ONLY be claimed by the winner of the given round.
	/// todo-1 But what if the winner forgot to claim the prize and someone else did so?
	/// todo-1 Will it be a problem if someone donates us a zillion NFTs?
	/// todo-1 Limit the number of NFTs we allow to donate to us per round?
	/// todo-1 If the last winner forgets to claim some NFTs within a timeout, we should let anyone claim them.
	/// todo-1 What if someone donates an NFT which claim attempt will always fail.
	/// todo-1 Should we forget (remove from our storage) unclaimed donated NFTs after like max(1 year, 12 rounds)?
	/// todo: potentially dangerous because we are calling some unkown external contract
	/// [/Comment-202408065]
	function claimDonatedNFT(uint256 num) public {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);
		require(num < numDonatedNFTs, CosmicGameErrors.NonExistentDonatedNFT("The donated NFT does not exist.", num));
		address winner = winners[donatedNFTs[num].round];
		require(winner != address(0), CosmicGameErrors.NonExistentWinner("Non-existent winner for the round.", num));
		require(
			!donatedNFTs[num].claimed,
			CosmicGameErrors.NFTAlreadyClaimed("The NFT has already been claimed.", num)
		);
		donatedNFTs[num].claimed = true;
		// todo-1 As I wrote in a todo in Comment-202408065, someone can DoS us by making this call always fail.
		donatedNFTs[num].nftAddress.safeTransferFrom(address(this), winner, donatedNFTs[num].tokenId);
		emit DonatedNFTClaimedEvent(
			donatedNFTs[num].round,
			num,
			winner,
			address(donatedNFTs[num].nftAddress),
			donatedNFTs[num].tokenId
		);
	}

	/// @notice Comment-202408065 applies.
	function claimManyDonatedNFTs(uint256[] memory tokens) external {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);
		// todo-1 This should not be an all-or-nothing transaction. Sucessful claims should not be reverted, even if some others fail.
		// todo-1 One reason for that is because someone can DoS us by donating a bad NFT which claim will always fail.
		// todo-1 Should we generate an event for each failed claim? Will they help the front-end?
		for (uint256 i = 0; i < tokens.length; i++) {
			claimDonatedNFT(tokens[i]);
		}
	}
	function receiveEther() external payable {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
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
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);
		require(msg.value > 0, CosmicGameErrors.NonZeroValueRequired("Donation amount must be greater than 0."));
		emit DonationEvent(_msgSender(), msg.value, roundNum);
	}

	function donateWithInfo(string calldata _data) external payable {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);
		require(msg.value > 0, CosmicGameErrors.NonZeroValueRequired("Donation amount must be greater than 0."));
		uint256 recordId = donateWithInfoNumRecords;
		donateWithInfoNumRecords += 1;
		donationInfoRecords[recordId] = CosmicGameConstants.DonationInfoRecord({
			donor: msg.sender,
			amount: msg.value,
			data: _data
		});
		emit DonationWithInfoEvent(_msgSender(), msg.value, recordId, roundNum);
	}
}
