// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #region Imports

import { StorageSlot } from "@openzeppelin/contracts/utils/StorageSlot.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC1967 } from "@openzeppelin/contracts/interfaces/IERC1967.sol";
import { ERC1967Utils } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { SystemManagement } from "./SystemManagement.sol";
import { Bidding } from "./Bidding.sol";
import { BidStatistics } from "./BidStatistics.sol";
import { EthDonations } from "./EthDonations.sol";
import { NftDonations } from "./NftDonations.sol";
import { MainPrize } from "./MainPrize.sol";
import { SpecialPrizes } from "./SpecialPrizes.sol";
import { ICosmicSignatureGame } from "./interfaces/ICosmicSignatureGame.sol";

// #endregion

/// @dev This contract inherits from various OpenZeppelin contracts and custom game logic
contract CosmicSignatureGame is
	OwnableUpgradeable,
	UUPSUpgradeable,
	CosmicSignatureGameStorage,
	SystemManagement,
	BidStatistics,
	Bidding,
	MainPrize,
	EthDonations,
	NftDonations,
	SpecialPrizes,
	ICosmicSignatureGame {
	// todo-1 Should we use this for `ERC20` instead, to give SMTChecker more info?
	// todo-1 But it won't compile then, right?
	// todo-1 Do we actually need this? I dislike this. Maybe comment this out.
	// todo-1 Review all uses of `IERC20`. Make sure we check the return value.
	using SafeERC20 for IERC20;

	/// @custom:oz-upgrades-unsafe-allow constructor
	/// @notice Contract constructor
	/// @dev This constructor is only used to disable initializers for the implementation contract	
	constructor() {
		_disableInitializers();
	}

	function initialize(address _gameAdministrator) public override initializer {
		__UUPSUpgradeable_init();
		__ReentrancyGuard_init();
		// ToDo-202408114-1 applies.
		__Ownable_init(_gameAdministrator);

		// todo-1 Think again which of these should not be reset on upgrade. Comment.
		// todo-1 I wrote some comments already.
		// todo-1 Really,it looks like most variables should not be reset on upgrade.
		// todo-1 So maybe write one common comment to revisit this when developing a new upgrade contract.
		// todo-1 Write and cross-ref that in `CosmicSignatureGameOpenBid` most of these should not be done.
		// todo-1 Revisit and cross-ref with Comment-202412064.

		// systemMode = CosmicSignatureConstants.MODE_MAINTENANCE;
		activationTime = CosmicSignatureConstants.INITIAL_ACTIVATION_TIME;
		delayDurationBeforeNextRound = CosmicSignatureConstants.INITIAL_DELAY_DURATION_BEFORE_NEXT_ROUND;
		marketingReward = CosmicSignatureConstants.MARKETING_REWARD;
		maxMessageLength = CosmicSignatureConstants.MAX_MESSAGE_LENGTH;
		// prizesWallet =
		// token =
		// marketingWallet =
		// nft =
		// randomWalkNft =
		// stakingWalletCosmicSignatureNft =
		// stakingWalletRandomWalkNft =
		// charityAddress =
		// numDonationInfoRecords =
		// // numDonatedNfts =
		nanoSecondsExtra = CosmicSignatureConstants.INITIAL_NANOSECONDS_EXTRA;
		timeIncrease = CosmicSignatureConstants.INITIAL_TIME_INCREASE;
		initialSecondsUntilPrize = CosmicSignatureConstants.INITIAL_SECONDS_UNTIL_PRIZE;
		// prizeTime =
		// todo-1 This is already zero, right? Assert?
		// todo-1 But on ipgrade this won't be zero, right? So don't reset this back to zero on upgrade?
		roundNum = 0;

		// Issue. It appears that on upgrade this will be incorrect.
		bidPrice = CosmicSignatureConstants.FIRST_ROUND_BID_PRICE;

		initialBidAmountFraction = CosmicSignatureConstants.INITIAL_BID_AMOUNT_FRACTION;
		priceIncrease = CosmicSignatureConstants.INITIAL_PRICE_INCREASE;
		cstAuctionLength = CosmicSignatureConstants.DEFAULT_AUCTION_LENGTH;
		roundStartCstAuctionLength = CosmicSignatureConstants.DEFAULT_AUCTION_LENGTH;

		// [Comment-202411211]
		// If this condition is `true` it's likely that `setActivationTime` will not be called,
		// which implies that this is likely our last chance to initialize `lastCstBidTimeStamp`.
		// [/Comment-202411211]
		if (CosmicSignatureConstants.INITIAL_ACTIVATION_TIME < CosmicSignatureConstants.TIMESTAMP_9999_12_31) {
			// Comment-202411168 applies.
			lastCstBidTimeStamp = CosmicSignatureConstants.INITIAL_ACTIVATION_TIME;
		}

		// [ToDo-202409199-0]
		// It's very likely a bug that we assign a twice smaller value here.
		// Waiting for Taras to comment on the issue.
		// [/ToDo-202409199-0]
		startingBidPriceCST = CosmicSignatureConstants.STARTING_BID_PRICE_CST_DEFAULT_MIN_LIMIT / 2;
		startingBidPriceCSTMinLimit = CosmicSignatureConstants.STARTING_BID_PRICE_CST_DEFAULT_MIN_LIMIT;
		tokenReward = CosmicSignatureConstants.TOKEN_REWARD;
		// todo-0 Is this redundant? Assert?
		lastBidderAddress = address(0);
		// lastCstBidderAddress =
		// // lastBidType =
		mainPrizePercentage = CosmicSignatureConstants.INITIAL_MAIN_PRIZE_PERCENTAGE;
		chronoWarriorEthPrizePercentage = CosmicSignatureConstants.INITIAL_CHRONO_WARRIOR_ETH_PRIZE_PERCENTAGE;
		rafflePercentage = CosmicSignatureConstants.INITIAL_RAFFLE_PERCENTAGE;
		stakingPercentage = CosmicSignatureConstants.INITIAL_STAKING_PERCENTAGE;
		charityPercentage = CosmicSignatureConstants.INITIAL_CHARITY_PERCENTAGE;
		timeoutDurationToClaimMainPrize = CosmicSignatureConstants.DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE;
		// // stellarSpender =
		// // stellarSpenderTotalSpentCst =
		// enduranceChampion =
		// enduranceChampionStartTimeStamp =
		// enduranceChampionDuration =
		// prevEnduranceChampionDuration =
		// chronoWarrior =

		// Issue. It appears that on upgrade this will be redundant.
		chronoWarriorDuration = uint256(int256(-1));

		cstRewardAmountMultiplier = CosmicSignatureConstants.DEFAULT_CST_REWARD_AMOUNT_MULTIPLIER;
		numRaffleETHWinnersBidding = CosmicSignatureConstants.INITIAL_RAFFLE_ETH_WINNERS_BIDDING;
		numRaffleNftWinnersBidding = CosmicSignatureConstants.INITIAL_RAFFLE_NFT_WINNERS_BIDDING;
		numRaffleNftWinnersStakingRWalk = CosmicSignatureConstants.INITIAL_STAKING_WINNERS_RWALK;

		// Issue. It appears that on upgrade this will be unnecessary.
		// raffleEntropy = keccak256(abi.encode("Cosmic Signature 2023", block.timestamp, blockhash(block.number - 1)));
		raffleEntropy = bytes32(0x4e48fcb2afb4dabb2bc40604dc13d21579f2ce6b3a3f60b8dca0227d0535b31a);
	}

	/// todo-1 Should `_authorizeUpgrade` and/or `upgradeTo` be `onlyInactive`?
	function _authorizeUpgrade(address newImplementation_) internal override {
	}

	/// todo-1 Should `_authorizeUpgrade` and/or `upgradeTo` be `onlyInactive`?
	function upgradeTo(address _newImplementation) public override onlyOwner {
		_authorizeUpgrade(_newImplementation);
		StorageSlot.getAddressSlot(ERC1967Utils.IMPLEMENTATION_SLOT).value = _newImplementation;
		// todo-0 This event has been eliminated.
		// todo-0 But this library now includes a a function named `upgradeToAndCall`, which appears to emit an equivalent event.
		// todo-0 So I have refactored this to emit that same event.
		// todo-0 But would it be better to call that function here?
		// todo-0 Nick, please take a closer look at this.
		//
		// todo-0 OpenZeppelin docs says:
		// todo-0 ERC1967Utils: Removed duplicate declaration of the Upgraded, AdminChanged and BeaconUpgraded events. These events are still available through the IERC1967 interface located under the contracts/interfaces/ directory.
		//
		// emit ERC1967Utils.Upgraded(_newImplementation);
		emit IERC1967.Upgraded(_newImplementation);
	}

	function bidAndDonateToken(bytes calldata data_, IERC20 tokenAddress_, uint256 amount_) external payable override nonReentrant /*onlyActive*/ {
		_bid(data_);
		prizesWallet.donateToken(roundNum, msg.sender, tokenAddress_, amount_);
	}

	function bidWithCstAndDonateToken(uint256 priceMaxLimit_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external override nonReentrant /*onlyActive*/ {
		_bidWithCst(priceMaxLimit_, message_);
		prizesWallet.donateToken(roundNum, msg.sender, tokenAddress_, amount_);
	}

	function bidAndDonateNft(bytes calldata data_, IERC721 nftAddress_, uint256 nftId_) external payable override nonReentrant /*onlyActive*/ {
		_bid(data_);
		// _donateNft(nftAddress_, nftId_);
		prizesWallet.donateNft(roundNum, msg.sender, nftAddress_, nftId_);
	}

	function bidWithCstAndDonateNft(uint256 priceMaxLimit_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external override nonReentrant /*onlyActive*/ {
		_bidWithCst(priceMaxLimit_, message_);
		// _donateNft(nftAddress_, nftId_);
		prizesWallet.donateNft(roundNum, msg.sender, nftAddress_, nftId_);
	}

	// Moved to `PrizesWallet`.
	// /// @notice Makes it possible for the contract to receive NFTs by implementing the IERC721Receiver interface.
	// /// todo-1 Someone forgot to derive `CosmicSignatureGame` from `IERC721Receiver` and add the `override` keyword.
	// function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
	// 	// todo-1 This should return `IERC721Receiver.onERC721Received.selector` instead.
	// 	return this.onERC721Received.selector;
	// }

	receive() external payable override {
		// Treating incoming ETH as a bid with default parameters.
		BidParams memory defaultParams;
		// todo-1 Is this assignment redundant? Replace it with an `assert`?
		defaultParams.message = "";
		defaultParams.randomWalkNftId = -1;
		bytes memory param_data = abi.encode(defaultParams);
		bid(param_data);
	}

	fallback() external payable override {
		revert("Method does not exist.");
	}
}
