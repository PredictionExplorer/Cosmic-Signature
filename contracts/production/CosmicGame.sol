// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

// #region Imports

import { StorageSlot } from "@openzeppelin/contracts/utils/StorageSlot.sol";

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ERC1967Utils } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
// import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
// import { CosmicToken } from "./CosmicToken.sol";
// import { CosmicSignature } from "./CosmicSignature.sol";
// import { RandomWalkNFT } from "./RandomWalkNFT.sol";
// import { RaffleWallet } from "./RaffleWallet.sol";
// import { StakingWalletCST } from "./StakingWalletCST.sol";
// import { StakingWalletRWalk } from "./StakingWalletRWalk.sol";
import { CosmicGameStorage } from "./CosmicGameStorage.sol";
import { Bidding } from "./Bidding.sol";
import { NFTDonations } from "./NFTDonations.sol";
import { ETHDonations } from "./ETHDonations.sol";
import { SpecialPrizes } from "./SpecialPrizes.sol";
import { MainPrize } from "./MainPrize.sol";
import { SystemManagement } from "./SystemManagement.sol";
import { ICosmicGame } from "./interfaces/ICosmicGame.sol";

// #endregion

/// @dev This contract inherits from various OpenZeppelin contracts and custom game logic
contract CosmicGame is
	OwnableUpgradeable,
	UUPSUpgradeable,
	CosmicGameStorage,
	Bidding,
	NFTDonations,
	ETHDonations,
	SpecialPrizes,
	MainPrize,
	SystemManagement,
	ICosmicGame {
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

	// todo-0 Is this related?: `CosmicGameProxy.initialize` and todos there.
	// todo-0 Cross-reference them?
	// todo-0 Remember that there are respective function declarations in the interfaces.
	function initialize(address _gameAdministrator) public override initializer {
		__UUPSUpgradeable_init();
		__ReentrancyGuard_init();
		// ToDo-202408114-1 applies.
		__Ownable_init(_gameAdministrator);

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

	function bidAndDonateNFT(
		bytes calldata _param_data,
		IERC721 nftAddress,
		uint256 tokenId
	) external payable override nonReentrant {
		// // This validation is unnecessary. `_bid` will make it.
		// require(
		// 	systemMode < CosmicGameConstants.MODE_MAINTENANCE,
		// 	CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		// );
		
		_bid(_param_data);
		_donateNFT(nftAddress, tokenId);
	}

	receive() external payable override {
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

	fallback() external payable override {
		revert("Function does not exist");
	}

	function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
	}

	function upgradeTo(address _newImplementation) public override onlyOwner {
		 _authorizeUpgrade(_newImplementation);
		 StorageSlot.getAddressSlot(ERC1967Utils.IMPLEMENTATION_SLOT).value = _newImplementation;
	}
}
