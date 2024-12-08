// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #region Imports

// #enable_asserts // #disable_smtchecker import "hardhat/console.sol";

import { StorageSlot } from "@openzeppelin/contracts/utils/StorageSlot.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC1967 } from "@openzeppelin/contracts/interfaces/IERC1967.sol";
import { ERC1967Utils } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { OwnableUpgradeableWithReservedStorageGaps } from "../production/OwnableUpgradeableWithReservedStorageGaps.sol";
import { CosmicSignatureConstants } from "../production/libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureGameStorage } from "../production/CosmicSignatureGameStorage.sol";
import { SystemManagement } from "../production/SystemManagement.sol";
import { BiddingOpenBid } from "./BiddingOpenBid.sol";
import { BidStatistics } from "../production/BidStatistics.sol";
import { EthDonations } from "../production/EthDonations.sol";
import { NftDonations } from "../production/NftDonations.sol";
import { MainPrize } from "../production/MainPrize.sol";
import { SpecialPrizes } from "../production/SpecialPrizes.sol";
import { ICosmicSignatureGame } from "../production/interfaces/ICosmicSignatureGame.sol";

// #endregion

/// @dev This contract inherits from various OpenZeppelin contracts and custom game logic
contract CosmicSignatureGameOpenBid is
	OwnableUpgradeableWithReservedStorageGaps,
	UUPSUpgradeable,
	CosmicSignatureGameStorage,
	SystemManagement,
	BidStatistics,
	BiddingOpenBid,
	MainPrize,
	EthDonations,
	NftDonations,
	SpecialPrizes,
	ICosmicSignatureGame {
	using SafeERC20 for IERC20;

	/// @notice Constructor.
	/// @dev This constructor is only used to disable initializers for the implementation contract.
	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() {
		// // #enable_asserts // #disable_smtchecker console.log("2 constructor");
		_disableInitializers();
	}

	function initialize(address ownerAddress_) external override initializer {
		// // #enable_asserts // #disable_smtchecker console.log("2 initialize");
		// #enable_asserts assert(activationTime == 0);

		// todo-1 Order these like in the inheritance list.
		__UUPSUpgradeable_init();
		__ReentrancyGuard_init();
		// ToDo-202408114-1 applies.
		__Ownable_init(ownerAddress_);

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
		// roundNum = 0;
		bidPrice = CosmicSignatureConstants.FIRST_ROUND_BID_PRICE;
		initialBidAmountFraction = CosmicSignatureConstants.INITIAL_BID_AMOUNT_FRACTION;
		priceIncrease = CosmicSignatureConstants.INITIAL_PRICE_INCREASE;
		cstAuctionLength = CosmicSignatureConstants.DEFAULT_AUCTION_LENGTH;
		roundStartCstAuctionLength = CosmicSignatureConstants.DEFAULT_AUCTION_LENGTH;

		// Comment-202411211 applies.
		if (CosmicSignatureConstants.INITIAL_ACTIVATION_TIME < CosmicSignatureConstants.TIMESTAMP_9999_12_31) {
			// Comment-202411168 applies.
			lastCstBidTimeStamp = CosmicSignatureConstants.INITIAL_ACTIVATION_TIME;
		}

		startingBidPriceCST = CosmicSignatureConstants.STARTING_BID_PRICE_CST_DEFAULT_MIN_LIMIT;
		startingBidPriceCSTMinLimit = CosmicSignatureConstants.STARTING_BID_PRICE_CST_DEFAULT_MIN_LIMIT;
		tokenReward = CosmicSignatureConstants.DEFAULT_TOKEN_REWARD;
		// lastBidderAddress = address(0);
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
		// enduranceChampionAddress =
		// enduranceChampionStartTimeStamp =
		// enduranceChampionDuration =
		// prevEnduranceChampionDuration =
		// chronoWarriorAddress =
		chronoWarriorDuration = uint256(int256(-1));
		cstRewardAmountMultiplier = CosmicSignatureConstants.DEFAULT_CST_REWARD_AMOUNT_MULTIPLIER;
		numRaffleETHWinnersBidding = CosmicSignatureConstants.INITIAL_RAFFLE_ETH_WINNERS_BIDDING;
		numRaffleNftWinnersBidding = CosmicSignatureConstants.INITIAL_RAFFLE_NFT_WINNERS_BIDDING;
		numRaffleNftWinnersStakingRWalk = CosmicSignatureConstants.INITIAL_STAKING_WINNERS_RWALK;
		// raffleEntropy = keccak256(abi.encode("Cosmic Signature 2023", block.timestamp, blockhash(block.number - 1)));
		// raffleEntropy = bytes32(0x4e48fcb2afb4dabb2bc40604dc13d21579f2ce6b3a3f60b8dca0227d0535b31a);
	}

	/// @dev todo-2 This method should be declared in an inherited interface.
	function initialize2() reinitializer(2) public {
		// // #enable_asserts // #disable_smtchecker console.log("2 initialize2");
		// #enable_asserts assert(timesBidPrice == 0);
		timesBidPrice = 3;
	}

	function _authorizeUpgrade(address newImplementationAddress_) internal view override onlyOwner onlyInactive {
		// // #enable_asserts // #disable_smtchecker console.log("2 _authorizeUpgrade");
	}

	function upgradeTo(address newImplementationAddress_) external override {
		// // #enable_asserts // #disable_smtchecker console.log("2 upgradeTo");
		_authorizeUpgrade(newImplementationAddress_);
		StorageSlot.getAddressSlot(ERC1967Utils.IMPLEMENTATION_SLOT).value = newImplementationAddress_;
		emit IERC1967.Upgraded(newImplementationAddress_);
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
	// /// todo-1 Someone forgot to derive `CosmicSignatureGameOpenBid` from `IERC721Receiver` and add the `override` keyword.
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
