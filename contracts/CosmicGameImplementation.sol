// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

// #region Imports

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
// import "@openzeppelin/contracts-upgradeable/interfaces/IERC721Upgradeable.sol";

// [Comment-202408113]
// A file with this name exists in multiple folders.
// todo-0 Do we `import` the right file where this comment is referenced?
// [/Comment-202408113]
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
// import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
// ToDo-202408115-0 applies.
// import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
// import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
// import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import { CosmicGameConstants } from "./CosmicGameConstants.sol";
import { CosmicGameErrors } from "./CosmicGameErrors.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { RaffleWallet } from "./RaffleWallet.sol";
import { StakingWalletCST } from "./StakingWalletCST.sol";
import { StakingWalletRWalk } from "./StakingWalletRWalk.sol";
// import { MarketingWallet } from "./MarketingWallet.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import "./CosmicGameStorage.sol";

// #endregion

/// @title Cosmic Game Implementation
/// @author Cosmic Game Team
/// @notice This contract implements the main functionality of the Cosmic Game
/// @dev This contract inherits from various OpenZeppelin contracts and custom game logic
/// [ToDo-202408119-0]
/// Is `CosmicGameStorage` supposed to be the first base contract
/// in both `CosmicGameImplementation` and `CosmicGameProxy`?
/// [/ToDo-202408119-0]
contract CosmicGameImplementation is UUPSUpgradeable, ReentrancyGuardUpgradeable, CosmicGameStorage {
	// using SafeERC20Upgradeable for IERC20Upgradeable;
	using SafeERC20 for IERC20;
	// [ToDo-202408115-0]
	// Commented out to suppress a compile error.
	// [/ToDo-202408115-0]
	// using SafeMathUpgradeable for uint256;

	/// @notice Emitted when a prize is claimed
	/// @param prizeNum The number of the prize being claimed
	/// @param destination The address receiving the prize
	/// @param amount The amount of the prize
	event PrizeClaimEvent(uint256 indexed prizeNum, address indexed destination, uint256 amount);

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

	/// @notice Emitted when a donation is made
	/// @param donor The address of the donor
	/// @param amount The amount donated
	/// @param round The current round number
	event DonationEvent(address indexed donor, uint256 amount, uint256 round);

	/// @notice Emitted when a donation with additional info is made
	/// @param donor The address of the donor
	/// @param amount The amount donated
	/// @param recordId The ID of the donation record
	/// @param round The current round number
	event DonationWithInfoEvent(address indexed donor, uint256 amount, uint256 recordId, uint256 round);

	/// @notice Emitted when an NFT is donated
	/// @param donor The address of the donor
	/// @param nftAddress The address of the NFT contract
	/// @param round The current round number
	/// @param tokenId The ID of the donated NFT
	/// @param index The index of the donated NFT in the storage array
	event NFTDonationEvent(
		address indexed donor,
		IERC721 indexed nftAddress,
		uint256 indexed round,
		uint256 tokenId,
		uint256 index
	);

	/// @notice Emitted when an ETH raffle winner is selected
	/// @param winner The address of the winner
	/// @param round The round number
	/// @param winnerIndex The index of the winner
	/// @param amount The amount won
	event RaffleETHWinnerEvent(address indexed winner, uint256 indexed round, uint256 winnerIndex, uint256 amount);

	/// @notice Emitted when an NFT raffle winner is selected
	/// @param winner The address of the winner
	/// @param round The round number
	/// @param tokenId The ID of the NFT won
	/// @param winnerIndex The index of the winner
	/// @param isStaker Whether the winner is a staker
	/// @param isRWalk Whether the NFT is a RandomWalk NFT
	event RaffleNFTWinnerEvent(
		address indexed winner,
		uint256 indexed round,
		uint256 indexed tokenId,
		uint256 winnerIndex,
		bool isStaker,
		bool isRWalk
	);

	/// @notice Emitted when a donated NFT is claimed
	/// @param round The round number
	/// @param index The index of the donated NFT
	/// @param winner The address of the winner claiming the NFT
	/// @param nftAddressdonatedNFTs The address of the NFT contract
	/// @param tokenId The ID of the claimed NFT
	event DonatedNFTClaimedEvent(
		uint256 indexed round,
		uint256 index,
		address winner,
		address nftAddressdonatedNFTs,
		uint256 tokenId
	);

	/// @notice Emitted when the Endurance Champion winner is determined
	/// @param winner The address of the Endurance Champion
	/// @param round The round number
	/// @param erc721TokenId The ID of the ERC721 token awarded
	/// @param erc20TokenAmount The amount of ERC20 tokens awarded
	/// @param winnerIndex The index of the winner
	event EnduranceChampionWinnerEvent(
		address indexed winner,
		uint256 indexed round,
		uint256 indexed erc721TokenId,
		uint256 erc20TokenAmount,
		uint256 winnerIndex
	);

	/// @notice Emitted when the Stellar Spender winner is determined
	/// @param winner The address of the Stellar Spender
	/// @param round The round number
	/// @param erc721TokenId The ID of the ERC721 token awarded
	/// @param erc20TokenAmount The amount of ERC20 tokens awarded
	/// @param totalSpent The total amount spent by the winner
	/// @param winnerIndex The index of the winner
	event StellarSpenderWinnerEvent(
		address indexed winner,
		uint256 indexed round,
		uint256 indexed erc721TokenId,
		uint256 erc20TokenAmount,
		uint256 totalSpent,
		uint256 winnerIndex
	);

	/// @notice Emitted when the charity address is changed
	/// @param newCharity The new charity address
	event CharityAddressChanged(address newCharity);

	/// @notice Emitted when the RandomWalk address is changed
	/// @param newRandomWalk The new RandomWalk address
	event RandomWalkAddressChanged(address newRandomWalk);

	/// @notice Emitted when the raffle wallet address is changed
	/// @param newRaffleWallet The new raffle wallet address
	event RaffleWalletAddressChanged(address newRaffleWallet);

	/// @notice Emitted when the CST staking wallet address is changed
	/// @param newStakingWalletCST The new CST staking wallet address
	event StakingWalletCSTAddressChanged(address newStakingWalletCST);

	/// @notice Emitted when the RWalk staking wallet address is changed
	/// @param newStakingWalletRWalk The new RWalk staking wallet address
	event StakingWalletRWalkAddressChanged(address newStakingWalletRWalk);

	/// @notice Emitted when the marketing wallet address is changed
	/// @param newMarketingWallet The new marketing wallet address
	event MarketingWalletAddressChanged(address newMarketingWallet);

	/// @notice Emitted when the Cosmic Token address is changed
	/// @param newCosmicToken The new Cosmic Token address
	event CosmicTokenAddressChanged(address newCosmicToken);

	/// @notice Emitted when the Cosmic Signature address is changed
	/// @param newCosmicSignature The new Cosmic Signature address
	event CosmicSignatureAddressChanged(address newCosmicSignature);

	/// @notice Emitted when the number of ETH raffle winners for bidding is changed
	/// @param newNumRaffleETHWinnersBidding The new number of ETH raffle winners
	event NumRaffleETHWinnersBiddingChanged(uint256 newNumRaffleETHWinnersBidding);

	/// @notice Emitted when the number of NFT raffle winners for bidding is changed
	/// @param newNumRaffleNFTWinnersBidding The new number of NFT raffle winners
	event NumRaffleNFTWinnersBiddingChanged(uint256 newNumRaffleNFTWinnersBidding);

	/// @notice Emitted when the number of NFT raffle winners for RWalk staking is changed
	/// @param newNumRaffleNFTWinnersStakingRWalk The new number of NFT raffle winners for RWalk staking
	event NumRaffleNFTWinnersStakingRWalkChanged(uint256 newNumRaffleNFTWinnersStakingRWalk);

	/// @notice Emitted when the initial seconds until prize is changed
	/// @param newInitialSecondsUntilPrize The new initial seconds until prize
	event InitialSecondsUntilPrizeChanged(uint256 newInitialSecondsUntilPrize);

	/// @notice Emitted when the initial bid amount fraction is changed
	/// @param newInitialBidAmountFraction The new initial bid amount fraction
	event InitialBidAmountFractionChanged(uint256 newInitialBidAmountFraction);

	/// @notice Emitted when the time increase is changed
	/// @param newTimeIncrease The new time increase value
	event TimeIncreaseChanged(uint256 newTimeIncrease);

	/// @notice Emitted when the price increase is changed
	/// @param newPriceIncrease The new price increase value
	event PriceIncreaseChanged(uint256 newPriceIncrease);

	/// @notice Emitted when the nano seconds extra is changed
	/// @param newNanoSecondsExtra The new nano seconds extra value
	event NanoSecondsExtraChanged(uint256 newNanoSecondsExtra);

	/// @notice Emitted when the maximum message length is changed
	/// @param newMessageLength The new maximum message length
	event MaxMessageLengthChanged(uint256 newMessageLength);

	/// @notice Emitted when the timeout for claiming prize is changed
	/// @param newTimeout The new timeout value for claiming prize
	event TimeoutClaimPrizeChanged(uint256 newTimeout);

	/// @notice Emitted when the round start CST auction length is changed
	/// @param newAuctionLength The new round start CST auction length
	event RoundStartCSTAuctionLengthChanged(uint256 newAuctionLength);

	/// @notice Emitted when the token reward is changed
	/// @param newReward The new token reward value
	event TokenRewardChanged(uint256 newReward);

	/// @notice Emitted when the ERC20 reward multiplier is changed
	/// @param newMultiplier The new ERC20 reward multiplier
	event Erc20RewardMultiplierChanged(uint256 newMultiplier);

	/// @notice Emitted when the marketing reward is changed
	/// @param newReward The new marketing reward value
	event MarketingRewardChanged(uint256 newReward);

	/// @notice Emitted when the activation time is changed
	/// @param newActivationTime The new activation time
	event ActivationTimeChanged(uint256 newActivationTime);

	/// @notice Emitted when the system mode is changed
	/// @param newSystemMode The new system mode
	event SystemModeChanged(uint256 newSystemMode);

	/// @notice Emitted when the charity percentage is changed
	/// @param newCharityPercentage The new charity percentage
	event CharityPercentageChanged(uint256 newCharityPercentage);

	/// @notice Emitted when the prize percentage is changed
	/// @param newPrizePercentage The new prize percentage
	event PrizePercentageChanged(uint256 newPrizePercentage);

	/// @notice Emitted when the raffle percentage is changed
	/// @param newRafflePercentage The new raffle percentage
	event RafflePercentageChanged(uint256 newRafflePercentage);

	/// @notice Emitted when the staking percentage is changed
	/// @param newStakingPercentage The new staking percentage
	event StakingPercentageChanged(uint256 newStakingPercentage);

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

	/// @custom:oz-upgrades-unsafe-allow constructor
	/// @notice Contract constructor
	/// @dev This constructor is only used to disable initializers for the implementation contract
	constructor() {
		_disableInitializers();
	}

	// todo-0 Is this correct?
	// todo-0 See also: `CosmicGameProxy.initialize` and todos there.
	/// @notice Initializes the contract
	/// @dev This function should be called right after deployment. It sets up initial state variables and game parameters.
	function initialize() public override initializer {
		__UUPSUpgradeable_init();
		__ReentrancyGuard_init();
		// ToDo-202408114-1 applies.
		__Ownable_init(msg.sender);

		// Initialize state variables
		roundNum = 0;
		bidPrice = CosmicGameConstants.FIRST_ROUND_BID_PRICE;
		startingBidPriceCST = 100e18;
		nanoSecondsExtra = 3600 * 10 ** 9;
		timeIncrease = 1000030;
		priceIncrease = 1010000;
		initialBidAmountFraction = 4000;
		lastBidder = address(0);
		initialSecondsUntilPrize = 24 * 3600;
		timeoutClaimPrize = 24 * 3600;
		activationTime = 1702512000; // December 13 2023 19:00 New York Time
		lastCSTBidTime = activationTime;
		CSTAuctionLength = CosmicGameConstants.DEFAULT_AUCTION_LENGTH;
		RoundStartCSTAuctionLength = CosmicGameConstants.DEFAULT_AUCTION_LENGTH;
		tokenReward = CosmicGameConstants.TOKEN_REWARD;
		erc20RewardMultiplier = CosmicGameConstants.ERC20_REWARD_MULTIPLIER;
		marketingReward = CosmicGameConstants.MARKETING_REWARD;
		maxMessageLength = CosmicGameConstants.MAX_MESSAGE_LENGTH;
		systemMode = CosmicGameConstants.MODE_MAINTENANCE;

		// Initialize percentages
		prizePercentage = 25;
		charityPercentage = 10;
		rafflePercentage = 5;
		stakingPercentage = 10;

		// Initialize raffle winners
		numRaffleETHWinnersBidding = 3;
		numRaffleNFTWinnersBidding = 5;
		numRaffleNFTWinnersStakingRWalk = 4;

		raffleEntropy = keccak256(abi.encode("Cosmic Signature 2023", block.timestamp, blockhash(block.number - 1)));
	}

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
				RandomWalkNFT(randomWalk).ownerOf(uint256(params.randomWalkNFTId)) == _msgSender(),
				CosmicGameErrors.IncorrectERC721TokenOwner(
					"You must be the owner of the RandomWalkNFT.",
					randomWalk,
					uint256(params.randomWalkNFTId),
					_msgSender()
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
		bidderInfo[roundNum][_msgSender()].totalSpent = bidderInfo[roundNum][_msgSender()].totalSpent/*.add*/ + (paidBidPrice);
		if (bidderInfo[roundNum][_msgSender()].totalSpent > stellarSpenderAmount) {
			stellarSpenderAmount = bidderInfo[roundNum][_msgSender()].totalSpent;
			stellarSpender = _msgSender();
		}

		bidPrice = newBidPrice;

		_bidCommon(params.message, bidType);

		// Refund excess ETH if the bidder sent more than required
		if (msg.value > paidBidPrice) {
			// ToDo-202408116-0 applies.
			uint256 amountToSend = msg.value/*.sub*/ - (paidBidPrice);
			(bool success, ) = _msgSender().call{ value: amountToSend }("");
			require(
				success,
				CosmicGameErrors.FundTransferFailed("Refund transfer failed.", amountToSend, _msgSender())
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
			prizeTime = block.timestamp/*.add*/ + (initialSecondsUntilPrize);
		}

		_updateEnduranceChampion();
		lastBidder = _msgSender();
		lastBidType = bidType;

		bidderInfo[roundNum][_msgSender()].lastBidTime = block.timestamp;

		uint256 numParticipants = numRaffleParticipants[roundNum];
		raffleParticipants[roundNum][numParticipants] = lastBidder;
		// ToDo-202408116-0 applies.
		numRaffleParticipants[roundNum] = numParticipants/*.add*/ + (1);

		// Distribute token rewards
		// IERC20Upgradeable(token).safeTransferFrom(address(this), lastBidder, tokenReward);
		IERC20(token).safeTransferFrom(address(this), lastBidder, tokenReward);
		// IERC20Upgradeable(token).safeTransferFrom(address(this), marketingWallet, marketingReward);
		IERC20(token).safeTransferFrom(address(this), marketingWallet, marketingReward);

		_pushBackPrizeTime();
	}

	/// @notice Update the endurance champion based on the current bid
	/// @dev This function is called for each bid to potentially update the endurance champion
	function _updateEnduranceChampion() internal {
		if (lastBidder == address(0)) return;

		// ToDo-202408116-0 applies.
		uint256 lastBidDuration = block.timestamp/*.sub*/ - (bidderInfo[roundNum][lastBidder].lastBidTime);
		if (lastBidDuration > enduranceChampionDuration) {
			enduranceChampionDuration = lastBidDuration;
			enduranceChampion = lastBidder;
		}
	}

	/// @notice Extend the time until the prize can be claimed
	/// @dev This function increases the prize time and adjusts the time increase factor
	function _pushBackPrizeTime() internal {
		// ToDo-202408116-0 applies.
		uint256 secondsAdded = nanoSecondsExtra/*.div*/ / (1_000_000_000);
		// ToDo-202408116-0 applies.
		prizeTime = Math.max(prizeTime, block.timestamp)/*.add*/ + (secondsAdded);
		// ToDo-202408116-0 applies.
		nanoSecondsExtra = nanoSecondsExtra/*.mul*/ * (timeIncrease)/*.div*/ / (CosmicGameConstants.MILLION);
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
		uint256 userBalance = IERC20(token).balanceOf(_msgSender());
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
		startingBidPriceCST = Math.max(100e18, price)/*.mul*/ * (2);
		lastCSTBidTime = block.timestamp;

		// Burn the CST tokens used for bidding
		// IERC20Upgradeable(token).safeTransferFrom(_msgSender(), address(this), price);
		IERC20(token).safeTransferFrom(_msgSender(), address(this), price);
		// IERC20Upgradeable(token).burn(price);
		// IERC20(token).burn(price);
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
		uint256 fraction = uint256(1e6)/*.sub*/ - ((uint256(1e6)/*.mul*/ * (secondsElapsed))/*.div*/ / (duration));
		// ToDo-202408116-0 applies.
		return (fraction/*.mul*/ * (startingBidPriceCST))/*.div*/ / (1e6);
	}

	/// @notice Get the current auction duration and elapsed time
	/// @dev This function is used to calculate the CST price
	/// @return A tuple containing the seconds elapsed and total duration of the current auction
	function auctionDuration() public view returns (uint256, uint256) {
		// ToDo-202408116-0 applies.
		uint256 secondsElapsed = block.timestamp/*.sub*/ - (lastCSTBidTime);
		return (secondsElapsed, CSTAuctionLength);
	}

	/// @notice Reset various parameters at the end of a bidding round
	/// @dev This function is called after a prize is claimed to prepare for the next round
	function _roundEndResets() internal {
		lastCSTBidTime = block.timestamp;
		lastBidType = CosmicGameConstants.BidType.ETH;
		// The auction should last 12 hours longer than the amount of time we add after every bid
		// ToDo-202408116-0 applies.
		CSTAuctionLength = uint256(12)/*.mul*/ * (nanoSecondsExtra)/*.div*/ / (1_000_000_000);
		// ToDo-202408116-0 applies.
		bidPrice = address(this).balance/*.div*/ / (initialBidAmountFraction);
		stellarSpender = address(0);
		stellarSpenderAmount = 0;
		enduranceChampion = address(0);
		enduranceChampionDuration = 0;

		if (systemMode == CosmicGameConstants.MODE_PREPARE_MAINTENANCE) {
			systemMode = CosmicGameConstants.MODE_MAINTENANCE;
			emit SystemModeChanged(systemMode);
		}
	}

	/// @notice Claim the prize for the current round
	/// @dev This function distributes prizes, updates game state, and starts a new round
	function claimPrize() external nonReentrant {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);
		require(
			prizeTime <= block.timestamp,
			CosmicGameErrors.EarlyClaim("Not enough time has elapsed.", prizeTime, block.timestamp)
		);
		require(lastBidder != address(0), CosmicGameErrors.NoLastBidder("There is no last bidder."));

		address winner;
		// ToDo-202408116-0 applies.
		if (block.timestamp/*.sub*/ - (prizeTime) < timeoutClaimPrize) {
			// Only the last bidder can claim within the timeoutClaimPrize period
			require(
				_msgSender() == lastBidder,
				CosmicGameErrors.LastBidderOnly(
					"Only the last bidder can claim the prize during the first 24 hours.",
					lastBidder,
					_msgSender(),
					// ToDo-202408116-0 applies.
					timeoutClaimPrize/*.sub*/ - (block.timestamp/*.sub*/ - (prizeTime))
				)
			);
			winner = _msgSender();
		} else {
			// After the timeout, anyone can claim the prize
			winner = _msgSender();
		}

		_updateEnduranceChampion();

		// Prevent reentrancy
		lastBidder = address(0);
		winners[roundNum] = winner;

		uint256 prizeAmount_ = prizeAmount();
		uint256 charityAmount_ = charityAmount();
		uint256 raffleAmount_ = raffleAmount();
		uint256 stakingAmount_ = stakingAmount();

		// Distribute prizes
		_distributePrizes(winner, prizeAmount_, charityAmount_, raffleAmount_, stakingAmount_);

		_roundEndResets();
		emit PrizeClaimEvent(roundNum, winner, prizeAmount_);
		// ToDo-202408116-0 applies.
		roundNum = roundNum/*.add*/ + (1);
	}

	/// @notice Distribute prizes to various recipients
	/// @dev This function handles the distribution of ETH and NFT prizes
	/// @param winner Address of the round winner
	/// @param prizeAmount_ Amount of ETH for the main prize
	/// @param charityAmount_ Amount of ETH for charity
	/// @param raffleAmount_ Amount of ETH for raffle winners
	/// @param stakingAmount_ Amount of ETH for staking rewards
	function _distributePrizes(
		address winner,
		uint256 prizeAmount_,
		uint256 charityAmount_,
		uint256 raffleAmount_,
		uint256 stakingAmount_
	) internal {
		// Main prize
		(bool success, ) = winner.call{ value: prizeAmount_ }("");
		require(success, CosmicGameErrors.FundTransferFailed("Transfer to the winner failed.", prizeAmount_, winner));

		// Mint Cosmic Signature NFT for the winner.
		// todo-0 `winnerTokenId` is unused. Bug or feature?
		// uint256 winnerTokenId = IERC721Upgradeable(nft).safeMint(winner, roundNum);
		uint256 winnerTokenId = CosmicSignature(nft).mint(winner, roundNum);

		// Endurance Champion and Stellar Spender prizes
		_distributeSpecialPrizes();

		// Charity
		(success, ) = charity.call{ value: charityAmount_ }("");
		require(success, CosmicGameErrors.FundTransferFailed("Transfer to charity failed.", charityAmount_, charity));

		// Staking
		// if (IERC721Upgradeable(nft).totalSupply() > 0) {
		if (IERC721Enumerable(nft).totalSupply() > 0) {
			(success, ) = stakingWalletCST.call{ value: stakingAmount_ }(
				abi.encodeWithSelector(StakingWalletCST.deposit.selector)
			);
			require(
				success,
				CosmicGameErrors.FundTransferFailed(
					"Transfer to staking wallet failed.",
					stakingAmount_,
					stakingWalletCST
				)
			);
		}

		// Raffle
		_distributeRafflePrizes(raffleAmount_);
	}

	/// @notice Distribute special prizes to Endurance Champion and Stellar Spender
	/// @dev This function mints NFTs and distributes CST tokens to special winners
	function _distributeSpecialPrizes() internal {
		// Endurance Champion Prize
		if (enduranceChampion != address(0)) {
			uint256 tokenId = CosmicSignature(nft).mint(enduranceChampion, roundNum);
			// ToDo-202408116-0 applies.
			uint256 erc20TokenReward = erc20RewardMultiplier/*.mul*/ * (numRaffleParticipants[roundNum]);
			CosmicToken(token).transfer(enduranceChampion, erc20TokenReward);
			emit EnduranceChampionWinnerEvent(enduranceChampion, roundNum, tokenId, erc20TokenReward, 0);
		}

		// Stellar Spender Prize
		if (stellarSpender != address(0)) {
			uint256 tokenId = CosmicSignature(nft).mint(stellarSpender, roundNum);
			// ToDo-202408116-0 applies.
			uint256 erc20TokenReward = erc20RewardMultiplier/*.mul*/ * (numRaffleParticipants[roundNum]);
			CosmicToken(token).transfer(stellarSpender, erc20TokenReward);
			emit StellarSpenderWinnerEvent(
				stellarSpender,
				roundNum,
				tokenId,
				erc20TokenReward,
				stellarSpenderAmount,
				1
			);
		}
	}

	/// @notice Distribute raffle prizes including ETH and NFTs
	/// @dev This function selects random winners for both ETH and NFT prizes
	/// @param raffleAmount_ Total amount of ETH to distribute in the raffle
	function _distributeRafflePrizes(uint256 raffleAmount_) internal {
		// Distribute ETH prizes
		// ToDo-202408116-0 applies.
		uint256 perWinnerAmount = raffleAmount_/*.div*/ / (numRaffleETHWinnersBidding);
		for (uint256 i = 0; i < numRaffleETHWinnersBidding; i++) {
			_updateEntropy();
			address raffleWinner = raffleParticipants[roundNum][
				uint256(raffleEntropy) % numRaffleParticipants[roundNum]
			];

			RaffleWallet(raffleWallet).deposit{ value: perWinnerAmount }(raffleWinner);
			emit RaffleETHWinnerEvent(raffleWinner, roundNum, i, perWinnerAmount);
		}

		// Distribute NFT prizes to bidders
		for (uint256 i = 0; i < numRaffleNFTWinnersBidding; i++) {
			_updateEntropy();
			address raffleWinner = raffleParticipants[roundNum][
				uint256(raffleEntropy) % numRaffleParticipants[roundNum]
			];

			uint256 tokenId = CosmicSignature(nft).mint(raffleWinner, roundNum);
			emit RaffleNFTWinnerEvent(raffleWinner, roundNum, tokenId, i, false, false);
		}

		// Distribute NFTs to random RandomWalkNFT stakers
		uint256 numStakedTokensRWalk = StakingWalletRWalk(stakingWalletRWalk).numTokensStaked();
		if (numStakedTokensRWalk > 0) {
			for (uint256 i = 0; i < numRaffleNFTWinnersStakingRWalk; i++) {
				_updateEntropy();
				address rwalkWinner = StakingWalletRWalk(stakingWalletRWalk).pickRandomStaker(raffleEntropy);

				uint256 tokenId = CosmicSignature(nft).mint(rwalkWinner, roundNum);
				emit RaffleNFTWinnerEvent(rwalkWinner, roundNum, tokenId, i, true, true);
			}
		}
	}

	/// @notice Update the entropy used for random selection
	/// @dev This function updates the entropy using the current block information
	function _updateEntropy() internal {
		raffleEntropy = keccak256(abi.encode(raffleEntropy, block.timestamp, blockhash(block.number - 1)));
	}

	/// @notice Donate an NFT to the current round
	/// @dev This function allows users to donate NFTs that can be claimed by the round winner
	/// @param nftAddress The address of the NFT contract
	/// @param tokenId The ID of the NFT being donated
	function donateNFT(IERC721 nftAddress, uint256 tokenId) external nonReentrant {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);

		nftAddress.safeTransferFrom(_msgSender(), address(this), tokenId);

		donatedNFTs[numDonatedNFTs] = CosmicGameConstants.DonatedNFT({
			nftAddress: nftAddress,
			tokenId: tokenId,
			round: roundNum,
			claimed: false
		});

		numDonatedNFTs += 1;
		emit NFTDonationEvent(_msgSender(), nftAddress, roundNum, tokenId, numDonatedNFTs - 1);
	}

	/// @notice Claim a donated NFT
	/// @dev Only the winner of the round can claim the NFT within a certain timeframe
	/// todo-1 This was `external`, but that didn't compile, so I made it `public`. To be revisited.
	/// @param index The index of the donated NFT in the storage array
	function claimDonatedNFT(uint256 index) public nonReentrant {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);
		require(index < numDonatedNFTs, "Invalid donated NFT index");

		CosmicGameConstants.DonatedNFT storage nft = donatedNFTs[index];
		require(!nft.claimed, "NFT already claimed");
		require(winners[nft.round] == _msgSender(), "Only the round winner can claim this NFT");

		nft.claimed = true;
		nft.nftAddress.safeTransferFrom(address(this), _msgSender(), nft.tokenId);

		emit DonatedNFTClaimedEvent(nft.round, index, _msgSender(), address(nft.nftAddress), nft.tokenId);
	}

	/// @notice Claim multiple donated NFTs in a single transaction
	/// @dev This function allows claiming multiple NFTs at once to save gas
	/// @param indices An array of indices of the donated NFTs to claim
	function claimManyDonatedNFTs(uint256[] calldata indices) external nonReentrant {
		for (uint256 i = 0; i < indices.length; i++) {
			claimDonatedNFT(indices[i]);
		}
	}

	/// @notice Donate ETH to the game
	/// @dev This function allows users to donate ETH without placing a bid
	function donate() external payable nonReentrant {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);
		require(msg.value > 0, CosmicGameErrors.NonZeroValueRequired("Donation amount must be greater than 0."));
		emit DonationEvent(_msgSender(), msg.value, roundNum);
	}

	/// @notice Donate ETH with additional information
	/// @dev This function allows users to donate ETH and attach a message or data
	/// @param _data Additional information about the donation
	function donateWithInfo(string calldata _data) external payable nonReentrant {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);
		require(msg.value > 0, CosmicGameErrors.NonZeroValueRequired("Donation amount must be greater than 0."));
		uint256 recordId = donateWithInfoNumRecords;
		// ToDo-202408116-0 applies.
		donateWithInfoNumRecords = donateWithInfoNumRecords/*.add*/ + (1);
		donationInfoRecords[recordId] = CosmicGameConstants.DonationInfoRecord({
			donor: _msgSender(),
			amount: msg.value,
			data: _data
		});
		emit DonationWithInfoEvent(_msgSender(), msg.value, recordId, roundNum);
	}

	/// @notice Bid and donate an NFT in a single transaction
	/// @dev This function combines bidding and NFT donation
	/// @param _param_data Encoded bid parameters
	/// @param nftAddress Address of the NFT contract
	/// @param tokenId ID of the NFT to donate
	function bidAndDonateNFT(
		bytes calldata _param_data,
		IERC721 nftAddress,
		uint256 tokenId
	) external payable nonReentrant {
		// // This validation is unnecessary. `_bid` will make it.
		// require(
		// 	systemMode < CosmicGameConstants.MODE_MAINTENANCE,
		// 	CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		// );
		
		_bid(_param_data);
		_donateNFT(nftAddress, tokenId);
	}

	/// @notice Internal function to handle NFT donations
	/// @dev This function is called by donateNFT and bidAndDonateNFT
	/// @param _nftAddress Address of the NFT contract
	/// @param _tokenId ID of the NFT to donate
	function _donateNFT(IERC721 _nftAddress, uint256 _tokenId) internal {
		_nftAddress.safeTransferFrom(_msgSender(), address(this), _tokenId);
		donatedNFTs[numDonatedNFTs] = CosmicGameConstants.DonatedNFT({
			nftAddress: _nftAddress,
			tokenId: _tokenId,
			round: roundNum,
			claimed: false
		});
		// ToDo-202408116-0 applies.
		numDonatedNFTs = numDonatedNFTs/*.add*/ + (1);
		// ToDo-202408116-0 applies.
		emit NFTDonationEvent(_msgSender(), _nftAddress, roundNum, _tokenId, numDonatedNFTs/*.sub*/ - (1));
	}

	/// @notice Get the current endurance champion and their duration
	/// @return The address of the current endurance champion and their duration
	function currentEnduranceChampion() external view returns (address, uint256) {
		if (lastBidder == address(0)) {
			return (address(0), 0);
		}

		// ToDo-202408116-0 applies.
		uint256 lastBidTime = block.timestamp/*.sub*/ - (bidderInfo[roundNum][lastBidder].lastBidTime);
		if (lastBidTime > enduranceChampionDuration) {
			return (lastBidder, lastBidTime);
		}
		return (enduranceChampion, enduranceChampionDuration);
	}

	/// @notice Get the time until the game activates
	/// @return The number of seconds until activation, or 0 if already activated
	function timeUntilActivation() external view returns (uint256) {
		if (activationTime < block.timestamp) return 0;
		// ToDo-202408116-0 applies.
		return activationTime/*.sub*/ - (block.timestamp);
	}

	/// @notice Get the time until the next prize can be claimed
	/// @return The number of seconds until the prize can be claimed, or 0 if claimable now
	function timeUntilPrize() external view returns (uint256) {
		if (prizeTime < block.timestamp) return 0;
		// ToDo-202408116-0 applies.
		return prizeTime/*.sub*/ - (block.timestamp);
	}

	/// @notice Get the current bid price
	/// @return The current bid price in wei
	function getBidPrice() public view returns (uint256) {
		// ToDo-202408116-0 applies.
		return bidPrice/*.mul*/ * (priceIncrease)/*.div*/ / (CosmicGameConstants.MILLION);
	}

	/// @notice Get the current prize amount
	/// @return The current prize amount in wei
	function prizeAmount() public view returns (uint256) {
		// ToDo-202408116-0 applies.
		return address(this).balance/*.mul*/ * (prizePercentage)/*.div*/ / (100);
	}

	/// @notice Get the current charity amount
	/// @return The current charity amount in wei
	function charityAmount() public view returns (uint256) {
		// ToDo-202408116-0 applies.
		return address(this).balance/*.mul*/ * (charityPercentage)/*.div*/ / (100);
	}

	/// @notice Get the current raffle amount
	/// @return The current raffle amount in wei
	function raffleAmount() public view returns (uint256) {
		// ToDo-202408116-0 applies.
		return address(this).balance/*.mul*/ * (rafflePercentage)/*.div*/ / (100);
	}

	/// @notice Get the current staking amount
	/// @return The current staking amount in wei
	function stakingAmount() public view returns (uint256) {
		// ToDo-202408116-0 applies.
		return address(this).balance/*.mul*/ * (stakingPercentage)/*.div*/ / (100);
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

	/// @notice Get the current system mode
	/// @return The current system mode (0: Runtime, 1: Prepare Maintenance, 2: Maintenance)
	function getSystemMode() public view returns (uint256) {
		return systemMode;
	}

	/// @notice Get the details of a donated NFT
	/// @param index The index of the donated NFT
	/// @return A tuple containing the NFT address, token ID, round number, and claimed status
	function getDonatedNFTDetails(uint256 index) public view returns (address, uint256, uint256, bool) {
		require(index < numDonatedNFTs, "Invalid donated NFT index");
		CosmicGameConstants.DonatedNFT memory nft = donatedNFTs[index];
		return (address(nft.nftAddress), nft.tokenId, nft.round, nft.claimed);
	}

	/// @notice Get the winner of a specific round
	/// @param round The round number
	/// @return The address of the winner for the specified round
	function getWinnerByRound(uint256 round) public view returns (address) {
		return winners[round];
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
		uint256 offset = numParticipants/*.sub*/ - (_positionFromEnd)/*.sub*/ - (1);
		address bidderAddr = raffleParticipants[_round][offset];
		return bidderAddr;
	}

	/// @notice Set the charity address
	/// @dev Only callable by the contract owner
	/// @param _charity The new charity address
	function setCharity(address _charity) external onlyOwner {
		require(_charity != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		charity = _charity;
		emit CharityAddressChanged(_charity);
	}

	/// @notice Set the system mode
	/// @dev Only callable by the contract owner
	/// @param _systemMode The new system mode
	function setSystemMode(uint256 _systemMode) external onlyOwner {
		require(_systemMode <= CosmicGameConstants.MODE_MAINTENANCE, "Invalid system mode");
		systemMode = _systemMode;
		emit SystemModeChanged(_systemMode);
	}

	/// @notice Set the RandomWalk NFT contract address
	/// @dev Only callable by the contract owner
	/// @param _randomWalk The new RandomWalk NFT contract address
	function setRandomWalk(address _randomWalk) external onlyOwner {
		require(_randomWalk != address(0), "Invalid address");
		randomWalk = _randomWalk;
		emit RandomWalkAddressChanged(_randomWalk);
	}

	/// @notice Set the raffle wallet address
	/// @dev Only callable by the contract owner
	/// @param _raffleWallet The new raffle wallet address
	function setRaffleWallet(address _raffleWallet) external onlyOwner {
		require(_raffleWallet != address(0), "Invalid address");
		raffleWallet = _raffleWallet;
		emit RaffleWalletAddressChanged(_raffleWallet);
	}

	/// @notice Set the CST staking wallet address
	/// @dev Only callable by the contract owner
	/// @param _stakingWalletCST The new CST staking wallet address
	function setStakingWalletCST(address _stakingWalletCST) external onlyOwner {
		require(_stakingWalletCST != address(0), "Invalid address");
		stakingWalletCST = _stakingWalletCST;
		emit StakingWalletCSTAddressChanged(_stakingWalletCST);
	}

	/// @notice Set the RWalk staking wallet address
	/// @dev Only callable by the contract owner
	/// @param _stakingWalletRWalk The new RWalk staking wallet address
	function setStakingWalletRWalk(address _stakingWalletRWalk) external onlyOwner {
		require(_stakingWalletRWalk != address(0), "Invalid address");
		stakingWalletRWalk = _stakingWalletRWalk;
		emit StakingWalletRWalkAddressChanged(_stakingWalletRWalk);
	}

	/// @notice Set the marketing wallet address
	/// @dev Only callable by the contract owner
	/// @param _marketingWallet The new marketing wallet address
	function setMarketingWallet(address _marketingWallet) external onlyOwner {
		require(_marketingWallet != address(0), "Invalid address");
		marketingWallet = _marketingWallet;
		emit MarketingWalletAddressChanged(_marketingWallet);
	}

	/// @notice Set the Cosmic Token contract address
	/// @dev Only callable by the contract owner
	/// @param _token The new Cosmic Token contract address
	function setTokenContract(address _token) external onlyOwner {
		require(_token != address(0), "Invalid address");
		token = _token;
		emit CosmicTokenAddressChanged(_token);
	}

	/// @notice Set the Cosmic Signature NFT contract address
	/// @dev Only callable by the contract owner
	/// @param _nft The new Cosmic Signature NFT contract address
	function setNftContract(address _nft) external onlyOwner {
		require(_nft != address(0), "Invalid address");
		nft = _nft;
		emit CosmicSignatureAddressChanged(_nft);
	}

	/// @notice Set the time increase factor
	/// @dev Only callable by the contract owner
	/// @param _timeIncrease The new time increase factor
	function setTimeIncrease(uint256 _timeIncrease) external onlyOwner {
		timeIncrease = _timeIncrease;
		emit TimeIncreaseChanged(_timeIncrease);
	}

	/// @notice Set the price increase factor
	/// @dev Only callable by the contract owner
	/// @param _priceIncrease The new price increase factor
	function setPriceIncrease(uint256 _priceIncrease) external onlyOwner {
		priceIncrease = _priceIncrease;
		emit PriceIncreaseChanged(_priceIncrease);
	}

	/// @notice Set the initial seconds until prize
	/// @dev Only callable by the contract owner
	/// @param _initialSecondsUntilPrize The new initial seconds until prize
	function setInitialSecondsUntilPrize(uint256 _initialSecondsUntilPrize) external onlyOwner {
		initialSecondsUntilPrize = _initialSecondsUntilPrize;
		emit InitialSecondsUntilPrizeChanged(_initialSecondsUntilPrize);
	}

	/// @notice Set the timeout for claiming prize
	/// @dev Only callable by the contract owner
	/// @param _timeoutClaimPrize The new timeout for claiming prize
	function setTimeoutClaimPrize(uint256 _timeoutClaimPrize) external onlyOwner {
		timeoutClaimPrize = _timeoutClaimPrize;
		emit TimeoutClaimPrizeChanged(_timeoutClaimPrize);
	}

	/// @notice Set the token reward amount
	/// @dev Only callable by the contract owner
	/// @param _tokenReward The new token reward amount
	function setTokenReward(uint256 _tokenReward) external onlyOwner {
		tokenReward = _tokenReward;
		emit TokenRewardChanged(_tokenReward);
	}

	/// @notice Set the marketing reward amount
	/// @dev Only callable by the contract owner
	/// @param _marketingReward The new marketing reward amount
	function setMarketingReward(uint256 _marketingReward) external onlyOwner {
		marketingReward = _marketingReward;
		emit MarketingRewardChanged(_marketingReward);
	}

	/// @notice Set the maximum message length
	/// @dev Only callable by the contract owner
	/// @param _maxMessageLength The new maximum message length
	function setMaxMessageLength(uint256 _maxMessageLength) external onlyOwner {
		maxMessageLength = _maxMessageLength;
		emit MaxMessageLengthChanged(_maxMessageLength);
	}

	/// @notice Set the activation time
	/// @dev Only callable by the contract owner
	/// @param _activationTime The new activation time
	function setActivationTime(uint256 _activationTime) external onlyOwner {
		activationTime = _activationTime;
		lastCSTBidTime = _activationTime;
		emit ActivationTimeChanged(_activationTime);
	}

	/// @notice Set the round start CST auction length
	/// @dev Only callable by the contract owner
	/// @param _roundStartCSTAuctionLength The new round start CST auction length
	function setRoundStartCSTAuctionLength(uint256 _roundStartCSTAuctionLength) external onlyOwner {
		RoundStartCSTAuctionLength = _roundStartCSTAuctionLength;
		emit RoundStartCSTAuctionLengthChanged(_roundStartCSTAuctionLength);
	}

	/// @notice Set the ERC20 reward multiplier
	/// @dev Only callable by the contract owner
	/// @param _erc20RewardMultiplier The new ERC20 reward multiplier
	function setErc20RewardMultiplier(uint256 _erc20RewardMultiplier) external onlyOwner {
		erc20RewardMultiplier = _erc20RewardMultiplier;
		emit Erc20RewardMultiplierChanged(_erc20RewardMultiplier);
	}

	/// @notice Set the charity percentage
	/// @dev Only callable by the contract owner
	/// @param _charityPercentage The new charity percentage
	function setCharityPercentage(uint256 _charityPercentage) external onlyOwner {
		charityPercentage = _charityPercentage;
		emit CharityPercentageChanged(_charityPercentage);
	}

	/// @notice Set the prize percentage
	/// @dev Only callable by the contract owner
	/// @param _prizePercentage The new prize percentage
	function setPrizePercentage(uint256 _prizePercentage) external onlyOwner {
		prizePercentage = _prizePercentage;
		emit PrizePercentageChanged(_prizePercentage);
	}

	/// @notice Set the raffle percentage
	/// @dev Only callable by the contract owner
	/// @param _rafflePercentage The new raffle percentage
	function setRafflePercentage(uint256 _rafflePercentage) external onlyOwner {
		rafflePercentage = _rafflePercentage;
		emit RafflePercentageChanged(_rafflePercentage);
	}

	/// @notice Set the staking percentage
	/// @dev Only callable by the contract owner
	/// @param _stakingPercentage The new staking percentage
	function setStakingPercentage(uint256 _stakingPercentage) external onlyOwner {
		stakingPercentage = _stakingPercentage;
		emit StakingPercentageChanged(_stakingPercentage);
	}

	function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
	}

	/// @notice Fallback function to handle incoming ETH transactions
	/// @dev This function is called for empty calldata (and any value)
	receive() external payable /*nonReentrant*/ {
		// // This validation is unnecessary. `_bid` will make it.
		// require(
		// 	systemMode < CosmicGameConstants.MODE_MAINTENANCE,
		// 	CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		// );

		// Treat incoming ETH as a bid with default parameters
		BidParams memory defaultParams;
		// todo-1 Is this assignment redundant?
		defaultParams.message = "";
		defaultParams.randomWalkNFTId = -1;
		bytes memory param_data = abi.encode(defaultParams);

		// todo-1 Making this ugly external call because we can't convert `memory` to `calldata`.
		// todo-1 Make sure this will revert the transaction on error.
		// todo-1 Is it possible to somehow make an internal call to `_bid`?
		// todo-1 If so, refactor the code and mark `receive` `nonReentrant`.
		// todo-1 Otherwise write a todo-3 to revisit this issue when the conversion becomes possible.
		// todo-1 In either case, explain things in a comment.
		this.bid(param_data);
	}

	/// @notice Fallback function to handle incoming calls with data
	/// @dev This function is called when msg.data is not empty
	fallback() external payable /*nonReentrant*/ {
		revert("Function does not exist");
	}
}
