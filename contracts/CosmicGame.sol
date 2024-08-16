// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

// #region Imports

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import { CosmicGameConstants } from "./CosmicGameConstants.sol";
import { CosmicGameErrors } from "./CosmicGameErrors.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { RaffleWallet } from "./RaffleWallet.sol";
import { StakingWalletCST } from "./StakingWalletCST.sol";
import { StakingWalletRWalk } from "./StakingWalletRWalk.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { SpecialPrizes } from "./SpecialPrizes.sol";
import { ETHDonations } from "./ETHDonations.sol";
import { NFTDonations } from "./NFTDonations.sol";
import { MainPrize } from "./MainPrize.sol";
import { SystemManagement } from "./SystemManagement.sol";
import { CosmicGameStorage } from "./CosmicGameStorage.sol";
import { Bidding } from "./Bidding.sol";
import { NFTDonations } from  "./NFTDonations.sol";
import { SystemEvents} from "./interfaces/SystemEvents.sol";

// #endregion

/// @title Cosmic Game Implementation
/// @author Cosmic Game Team
/// @notice This contract implements the main functionality of the Cosmic Game
/// @dev This contract inherits from various OpenZeppelin contracts and custom game logic
/// [ToDo-202408119-0]
/// Is `CosmicGameStorage` supposed to be the first base contract
/// in both `CosmicGameImplementation` and `CosmicGameProxy`?
/// Write a comment explaining things.
/// [/ToDo-202408119-0]
contract CosmicGame is OwnableUpgradeable, UUPSUpgradeable, CosmicGameStorage, Bidding, NFTDonations, ETHDonations, SpecialPrizes, MainPrize, SystemManagement {
	// using SafeERC20Upgradeable for IERC20Upgradeable;
	using SafeERC20 for IERC20;
	// [ToDo-202408115-0]
	// Commented out to suppress a compile error.
	// [/ToDo-202408115-0]
	// using SafeMathUpgradeable for uint256;
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
	function initialize(address _gameAdministrator) public initializer {
		__UUPSUpgradeable_init();
		__ReentrancyGuard_init();
		// ToDo-202408114-1 applies.
		__Ownable_init(msg.sender);

		// Initialize state variables
		transferOwnership(_gameAdministrator);
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

	/// @notice Fallback function to handle incoming ETH transactions
	/// @dev This function is called for empty calldata (and any value)
	receive() external payable {
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
	fallback() external payable {
		revert("Function does not exist");
	}
	function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
	}
}
