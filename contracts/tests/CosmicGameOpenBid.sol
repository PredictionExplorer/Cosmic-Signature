// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

// #region Imports

import { StorageSlot } from "@openzeppelin/contracts/utils/StorageSlot.sol";

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC1967 } from "@openzeppelin/contracts/interfaces/IERC1967.sol";
import { ERC1967Utils } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { CosmicGameConstants } from "../production/libraries/CosmicGameConstants.sol";
import { CosmicSignatureGameStorage } from "../production/CosmicSignatureGameStorage.sol";
import { BiddingOpenBid } from "./BiddingOpenBid.sol";
import { BidStatistics } from "../production/BidStatistics.sol";
import { NftDonations } from "../production/NftDonations.sol";
import { ETHDonations } from "../production/ETHDonations.sol";
import { SpecialPrizes } from "../production/SpecialPrizes.sol";
import { MainPrize } from "../production/MainPrize.sol";
import { SystemManagement } from "../production/SystemManagement.sol";
import { ICosmicGame } from "../production/interfaces/ICosmicGame.sol";

// #endregion

/// @dev This contract inherits from various OpenZeppelin contracts and custom game logic
contract CosmicGameOpenBid is
	OwnableUpgradeable,
	UUPSUpgradeable,
	CosmicSignatureGameStorage,
	SystemManagement,
	BidStatistics,
	BiddingOpenBid,
	MainPrize,
	NftDonations,
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

		// systemMode = CosmicGameConstants.MODE_MAINTENANCE;
		activationTime = CosmicGameConstants.INITIAL_ACTIVATION_TIME;
		delayDurationBeforeNextRound = CosmicGameConstants.INITIAL_DELAY_DURATION_BEFORE_NEXT_ROUND;
		marketingReward = CosmicGameConstants.MARKETING_REWARD;
		maxMessageLength = CosmicGameConstants.MAX_MESSAGE_LENGTH;
		nanoSecondsExtra = CosmicGameConstants.INITIAL_NANOSECONDS_EXTRA;
		timeIncrease = CosmicGameConstants.INITIAL_TIME_INCREASE;
		initialSecondsUntilPrize = CosmicGameConstants.INITIAL_SECONDS_UNTIL_PRIZE;
		roundNum = 0;
		bidPrice = CosmicGameConstants.FIRST_ROUND_BID_PRICE;
		initialBidAmountFraction = CosmicGameConstants.INITIAL_BID_AMOUNT_FRACTION;
		priceIncrease = CosmicGameConstants.INITIAL_PRICE_INCREASE;
		cstAuctionLength = CosmicGameConstants.DEFAULT_AUCTION_LENGTH;
		roundStartCstAuctionLength = CosmicGameConstants.DEFAULT_AUCTION_LENGTH;

		// Comment-202411211 applies.
		if (CosmicGameConstants.INITIAL_ACTIVATION_TIME < CosmicGameConstants.TIMESTAMP_9999_12_31) {
			// Comment-202411168 applies.
			lastCstBidTimeStamp = CosmicGameConstants.INITIAL_ACTIVATION_TIME;
		}

		// ToDo-202409199-0 applies.
		startingBidPriceCST = CosmicGameConstants.STARTING_BID_PRICE_CST_INITIAL_MIN_LIMIT / 2;
		startingBidPriceCSTMinLimit = CosmicGameConstants.STARTING_BID_PRICE_CST_INITIAL_MIN_LIMIT;
		tokenReward = CosmicGameConstants.TOKEN_REWARD;
		lastBidder = address(0);
		mainPrizePercentage = CosmicGameConstants.INITIAL_MAIN_PRIZE_PERCENTAGE;
		chronoWarriorEthPrizePercentage = CosmicGameConstants.INITIAL_CHRONO_WARRIOR_ETH_PRIZE_PERCENTAGE;
		rafflePercentage = CosmicGameConstants.INITIAL_RAFFLE_PERCENTAGE;
		stakingPercentage = CosmicGameConstants.INITIAL_STAKING_PERCENTAGE;
		charityPercentage = CosmicGameConstants.INITIAL_CHARITY_PERCENTAGE;
		timeoutDurationToClaimMainPrize = CosmicGameConstants.DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE;
		chronoWarriorDuration = uint256(int256(-1));
		erc20RewardMultiplier = CosmicGameConstants.ERC20_REWARD_MULTIPLIER;
		numRaffleETHWinnersBidding = CosmicGameConstants.INITIAL_RAFFLE_ETH_WINNERS_BIDDING;
		numRaffleNFTWinnersBidding = CosmicGameConstants.INITIAL_RAFFLE_NFT_WINNERS_BIDDING;
		numRaffleNFTWinnersStakingRWalk = CosmicGameConstants.INITIAL_STAKING_WINNERS_RWALK;
		// raffleEntropy = keccak256(abi.encode("Cosmic Signature 2023", block.timestamp, blockhash(block.number - 1)));
		raffleEntropy = bytes32(0x4e48fcb2afb4dabb2bc40604dc13d21579f2ce6b3a3f60b8dca0227d0535b31a);
	}

	function bidAndDonateNft(bytes calldata data_, IERC721 nftAddress_, uint256 nftId_) external payable override nonReentrant /*onlyActive*/ {
		_bid(data_);
		_donateNft(nftAddress_, nftId_);
	}

	function bidWithCstAndDonateNft(string memory message_, IERC721 nftAddress_, uint256 nftId_) external override nonReentrant /*onlyActive*/ {
		_bidWithCst(message_);
		_donateNft(nftAddress_, nftId_);
	}

	// Moved to `PrizesWallet`.
	// /// @notice Makes it possible for the contract to receive NFTs by implementing the IERC721Receiver interface.
	// /// todo-1 Someone forgot to derive `CosmicGameOpenBid` from `IERC721Receiver` and add the `override` keyword.
	// function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
	// 	// todo-1 This should return `IERC721Receiver.onERC721Received.selector` instead.
	// 	return this.onERC721Received.selector;
	// }

	receive() external payable override {
		// Treating incoming ETH as a bid with default parameters.
		BidParams memory defaultParams;
		// todo-1 Is this assignment redundant? Replace it with an `assert`?
		defaultParams.message = "";
		defaultParams.randomWalkNFTId = -1;
		bytes memory param_data = abi.encode(defaultParams);
		bid(param_data);
	}

	fallback() external payable override {
		revert("Method does not exist.");
	}

	function _authorizeUpgrade(address newImplementation_) internal override {
	}

	/// todo-1 Should this be `onlyInactive`?
	function upgradeTo(address _newImplementation) public override onlyOwner {
		_authorizeUpgrade(_newImplementation);
		StorageSlot.getAddressSlot(ERC1967Utils.IMPLEMENTATION_SLOT).value = _newImplementation;
		// todo-0 See todos in `CosmicGame.upgradeTo` about making sure that this is correct.
		emit IERC1967.Upgraded(_newImplementation);
	}
}
