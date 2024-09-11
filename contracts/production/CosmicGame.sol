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
import { CosmicGameStorage } from "./CosmicGameStorage.sol";
import { Bidding } from "./Bidding.sol";
import { BidStatistics } from "./BidStatistics.sol";
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
	SystemManagement,
	BidStatistics,
	Bidding,
	MainPrize,
	NFTDonations,
	ETHDonations,
	SpecialPrizes,
	ICosmicGame {
	// todo-0 Should we use this for `ERC20` instead, to give SMTChecker more info?
	// todo-0 But it won't compile then, right?
	using SafeERC20 for IERC20;

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
		startingBidPriceCSTMinLimit = CosmicGameConstants.STARTING_BID_PRICE_CST_INITIAL_MIN_LIMIT;
		startingBidPriceCST = CosmicGameConstants.STARTING_BID_PRICE_CST_INITIAL_MIN_LIMIT;
		nanoSecondsExtra = CosmicGameConstants.INITIAL_NANOSECONDS_EXTRA;
		timeIncrease = CosmicGameConstants.INITIAL_TIME_INCREASE;
		priceIncrease = CosmicGameConstants.INITIAL_PRICE_INCREASE;
		initialBidAmountFraction = CosmicGameConstants.INITIAL_BID_AMOUNT_FRACTION;
		lastBidder = address(0);
		initialSecondsUntilPrize = CosmicGameConstants.INITIAL_SECONDS_UNTIL_PRIZE;
		timeoutClaimPrize = CosmicGameConstants.INITIAL_TIMEOUT_CLAIM_PRIZE;
		activationTime = CosmicGameConstants.INITIAL_ACTIVATION_TIME;
		lastCSTBidTime = activationTime;
		CSTAuctionLength = CosmicGameConstants.DEFAULT_AUCTION_LENGTH;
		RoundStartCSTAuctionLength = CosmicGameConstants.DEFAULT_AUCTION_LENGTH;
		tokenReward = CosmicGameConstants.TOKEN_REWARD;
		erc20RewardMultiplier = CosmicGameConstants.ERC20_REWARD_MULTIPLIER;
		marketingReward = CosmicGameConstants.MARKETING_REWARD;
		maxMessageLength = CosmicGameConstants.MAX_MESSAGE_LENGTH;
		systemMode = CosmicGameConstants.MODE_MAINTENANCE;

		// Initialize percentages
		prizePercentage = CosmicGameConstants.INITIAL_PRIZE_PERCENTAGE;
		charityPercentage = CosmicGameConstants.INITIAL_CHARITY_PERCENTAGE;
		rafflePercentage = CosmicGameConstants.INITIAL_RAFFLE_PERCENTAGE;
		stakingPercentage = CosmicGameConstants.INITIAL_STAKING_PERCENTAGE;

		// Initialize raffle winners
		numRaffleETHWinnersBidding = CosmicGameConstants.INITIAL_RAFFLE_ETH_WINNERS_BIDDING;
		numRaffleNFTWinnersBidding = CosmicGameConstants.INITIAL_RAFFLE_NFT_WINNERS_BIDDING;
		numRaffleNFTWinnersStakingRWalk = CosmicGameConstants.INITIAL_STAKING_WINNERS_RWALK;

		raffleEntropy = keccak256(abi.encode("Cosmic Signature 2023", block.timestamp, blockhash(block.number - 1)));
	}

	function bidAndDonateNFT(
		bytes calldata _param_data,
		IERC721 nftAddress,
		uint256 tokenId
	) external payable override nonReentrant {
		
		_bid(_param_data);
		_donateNFT(nftAddress, tokenId);
	}

	// Make it possible for the contract to receive NFTs by implementing the IERC721Receiver interface
	function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
		return this.onERC721Received.selector;
	}

	receive() external payable override {

		// Treat incoming ETH as a bid with default parameters
		BidParams memory defaultParams;
		// todo-1 Is this assignment redundant? Replace it with an `assert`?
		defaultParams.message = "";
		defaultParams.randomWalkNFTId = -1;
		bytes memory param_data = abi.encode(defaultParams);

		bid(param_data);
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
