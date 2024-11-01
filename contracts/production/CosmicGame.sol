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

import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
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
	CosmicSignatureGameStorage,
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

		// todo-1 Think again which of these should not be reset on upgrade. Comment.
		// todo-1 I wrote some comments already.
		// todo-1 Really,it lloks like most variables should not be reset on upgrade.
		// todo-1 So maybe write one common comment to revisit this when developing a new upgrade contract.

		// systemMode = CosmicGameConstants.MODE_MAINTENANCE;
		activationTime = CosmicGameConstants.INITIAL_ACTIVATION_TIME;
		delayDurationBeforeNextRound = CosmicGameConstants.INITIAL_DELAY_DURATION_BEFORE_NEXT_ROUND;
		marketingReward = CosmicGameConstants.MARKETING_REWARD;
		maxMessageLength = CosmicGameConstants.MAX_MESSAGE_LENGTH;
		// ethPrizesWallet =
		// token =
		// marketingWallet =
		// nft =
		// randomWalkNft =
		// stakingWalletCosmicSignatureNft =
		// stakingWalletRandomWalkNft =
		// charity =
		// numDonationInfoRecords =
		// numDonatedNFTs =
		nanoSecondsExtra = CosmicGameConstants.INITIAL_NANOSECONDS_EXTRA;
		timeIncrease = CosmicGameConstants.INITIAL_TIME_INCREASE;
		initialSecondsUntilPrize = CosmicGameConstants.INITIAL_SECONDS_UNTIL_PRIZE;
		// prizeTime =
		// todo-1 This is already zero, right? Assert?
		// todo-1 But on ipgrade this won't be zero, right? So don't reset this back to zero on upgrade?
		roundNum = 0;

		// Issue. It appears that on upgrade this will be incorrect.
		bidPrice = CosmicGameConstants.FIRST_ROUND_BID_PRICE;

		initialBidAmountFraction = CosmicGameConstants.INITIAL_BID_AMOUNT_FRACTION;
		priceIncrease = CosmicGameConstants.INITIAL_PRICE_INCREASE;
		cstAuctionLength = CosmicGameConstants.DEFAULT_AUCTION_LENGTH;
		roundStartCstAuctionLength = CosmicGameConstants.DEFAULT_AUCTION_LENGTH;

		// Comment-202411168 applies.
		lastCstBidTimeStamp = CosmicGameConstants.INITIAL_ACTIVATION_TIME;

		// [ToDo-202409199-0]
		// It's very likely a bug that we assign a twice smaller value here.
		// Waiting for Taras to comment on the issue.
		// [/ToDo-202409199-0]
		startingBidPriceCST = CosmicGameConstants.STARTING_BID_PRICE_CST_INITIAL_MIN_LIMIT / 2;
		startingBidPriceCSTMinLimit = CosmicGameConstants.STARTING_BID_PRICE_CST_INITIAL_MIN_LIMIT;
		tokenReward = CosmicGameConstants.TOKEN_REWARD;
		// todo-0 Is this redundant? Assert?
		lastBidder = address(0);
		// lastBidType =
		mainPrizePercentage = CosmicGameConstants.INITIAL_MAIN_PRIZE_PERCENTAGE;
		chronoWarriorEthPrizePercentage = CosmicGameConstants.INITIAL_CHRONO_WARRIOR_ETH_PRIZE_PERCENTAGE;
		rafflePercentage = CosmicGameConstants.INITIAL_RAFFLE_PERCENTAGE;
		stakingPercentage = CosmicGameConstants.INITIAL_STAKING_PERCENTAGE;
		charityPercentage = CosmicGameConstants.INITIAL_CHARITY_PERCENTAGE;
		timeoutClaimPrize = CosmicGameConstants.INITIAL_TIMEOUT_CLAIM_PRIZE;
		// stellarSpender =
		// stellarSpenderTotalSpentCst =
		// enduranceChampion =
		// enduranceChampionStartTimeStamp =
		// enduranceChampionDuration =
		// prevEnduranceChampionDuration =
		// chronoWarrior =

		// Issue. It appears that on upgrade this will be redundant.
		chronoWarriorDuration = uint256(int256(-1));

		erc20RewardMultiplier = CosmicGameConstants.ERC20_REWARD_MULTIPLIER;
		numRaffleETHWinnersBidding = CosmicGameConstants.INITIAL_RAFFLE_ETH_WINNERS_BIDDING;
		numRaffleNFTWinnersBidding = CosmicGameConstants.INITIAL_RAFFLE_NFT_WINNERS_BIDDING;
		numRaffleNFTWinnersStakingRWalk = CosmicGameConstants.INITIAL_STAKING_WINNERS_RWALK;

		// todo-0 I have just hardcoded some number. It's more gas-efficient this way. Comment. Tell Nick.
		// Issue. It appears that on upgrade this will be unnecessary.
		raffleEntropy = bytes32(uint256(202411186)); // keccak256(abi.encode("Cosmic Signature 2023", block.timestamp, blockhash(block.number - 1)));
	}

	function bidAndDonateNFT(bytes calldata data_, IERC721 nftAddress_, uint256 nftId_) external payable override nonReentrant {
		_bid(data_);
		_donateNFT(nftAddress_, nftId_);
	}

	/// @notice Makes it possible for the contract to receive NFTs by implementing the IERC721Receiver interface.
	/// todo-1 Is this actually necessary? Don't we have designated functions to receive donated NFTs?
	function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
		return this.onERC721Received.selector;
	}

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
		revert("Function does not exist.");
	}

	function _authorizeUpgrade(address newImplementation_) internal override {
	}

	/// todo-1 Should this be `onlyInactive`?
	function upgradeTo(address _newImplementation) public override onlyOwner {
		_authorizeUpgrade(_newImplementation);
		StorageSlot.getAddressSlot(ERC1967Utils.IMPLEMENTATION_SLOT).value = _newImplementation;
		 // todo-0 This event has been eliminated.
		 // todo-0 But this library now includes a a function named `upgradeToAndCall`, which appears to emit an equivalent event.
		 // todo-0 So I have refactored this to emit that same event.
		 // todo-0 But would it be better to call that function here?
		 // todo-0 Nick, please take a closer look at this.
		 // emit ERC1967Utils.Upgraded(_newImplementation);
		 emit IERC1967.Upgraded(_newImplementation);
	}
}
