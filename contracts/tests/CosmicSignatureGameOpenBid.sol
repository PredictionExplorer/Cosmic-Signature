// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { StorageSlot } from "@openzeppelin/contracts/utils/StorageSlot.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "../production/OwnableUpgradeableWithReservedStorageGaps.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
// import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC1967 } from "@openzeppelin/contracts/interfaces/IERC1967.sol";
import { ERC1967Utils } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import { CosmicSignatureConstants } from "../production/libraries/CosmicSignatureConstants.sol";
import { AddressValidator } from "../production/AddressValidator.sol";
import { CosmicSignatureGameStorage } from "../production/CosmicSignatureGameStorage.sol";
import { BiddingBase } from "../production/BiddingBase.sol";
import { MainPrizeBase } from "../production/MainPrizeBase.sol";
import { SystemManagement } from "../production/SystemManagement.sol";
import { EthDonations } from "../production/EthDonations.sol";
import { NftDonations } from "../production/NftDonations.sol";
import { BidStatistics } from "../production/BidStatistics.sol";
import { BiddingOpenBid } from "./BiddingOpenBid.sol";
import { SecondaryPrizes } from "../production/SecondaryPrizes.sol";
import { MainPrize } from "../production/MainPrize.sol";
import { ICosmicSignatureGame } from "../production/interfaces/ICosmicSignatureGame.sol";

// #endregion
// #region

contract CosmicSignatureGameOpenBid is
	ReentrancyGuardTransientUpgradeable,
	OwnableUpgradeableWithReservedStorageGaps,
	UUPSUpgradeable,
	AddressValidator,
	CosmicSignatureGameStorage,
	BiddingBase,
	MainPrizeBase,
	SystemManagement,
	EthDonations,
	NftDonations,
	BidStatistics,
	BiddingOpenBid,
	SecondaryPrizes,
	MainPrize,
	ICosmicSignatureGame {
	// #region `constructor`

	/// @notice Constructor.
	/// @dev This constructor is only used to disable initializers for the implementation contract.
	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() {
		// // #enable_asserts // #disable_smtchecker console.log("2 constructor");
		_disableInitializers();
	}

	// #endregion
	// #region `initialize`

	function initialize(address ownerAddress_) external override initializer() {
		// // #enable_asserts // #disable_smtchecker console.log("2 initialize");

		// Comment-202501012 applies.
		// #enable_asserts assert(mainPrizeTimeIncrementInMicroSeconds == 0);

		// todo-1 +++ Order these like in the inheritance list.
		__ReentrancyGuardTransient_init();
		__Ownable_init(ownerAddress_);
		__UUPSUpgradeable_init();

		// ethDonationWithInfoRecords =
		// // lastBidType = todo-9 Do we need to assert that this equals `ETH`?
		// lastBidderAddress =
		// lastCstBidderAddress =
		// bidderAddresses =
		// biddersInfo =
		// enduranceChampionAddress =
		// enduranceChampionStartTimeStamp =
		// enduranceChampionDuration =
		// prevEnduranceChampionDuration =
		// chronoWarriorAddress =
		chronoWarriorDuration = uint256(int256(-1));
		// roundNum =
		delayDurationBeforeRoundActivation = CosmicSignatureConstants.DEFAULT_DELAY_DURATION_BEFORE_ROUND_ACTIVATION;
		roundActivationTime = CosmicSignatureConstants.INITIAL_ROUND_ACTIVATION_TIME;
		ethDutchAuctionDurationDivisor = CosmicSignatureConstants.DEFAULT_ETH_DUTCH_AUCTION_DURATION_DIVISOR;
		// ethDutchAuctionBeginningBidPrice = CosmicSignatureConstants.FIRST_ROUND_INITIAL_ETH_BID_PRICE;
		ethDutchAuctionEndingBidPriceDivisor = CosmicSignatureConstants.DEFAULT_ETH_DUTCH_AUCTION_ENDING_BID_PRICE_DIVISOR;
		// nextEthBidPrice = CosmicSignatureConstants.FIRST_ROUND_INITIAL_ETH_BID_PRICE;
		nextEthBidPriceIncreaseDivisor = CosmicSignatureConstants.DEFAULT_NEXT_ETH_BID_PRICE_INCREASE_DIVISOR;
		ethBidRefundAmountInGasMinLimit = CosmicSignatureConstants.DEFAULT_ETH_BID_REFUND_AMOUNT_IN_GAS_MIN_LIMIT;

		// // Comment-202411211 applies.
		// if (CosmicSignatureConstants.INITIAL_ROUND_ACTIVATION_TIME < CosmicSignatureConstants.TIMESTAMP_9000_01_01) {
		// 	// Comment-202411168 applies.
		// 	cstDutchAuctionBeginningTimeStamp = CosmicSignatureConstants.INITIAL_ROUND_ACTIVATION_TIME;
		// }

		cstDutchAuctionDurationDivisor = CosmicSignatureConstants.DEFAULT_CST_DUTCH_AUCTION_DURATION_DIVISOR;
		// cstDutchAuctionBeginningBidPrice = CosmicSignatureConstants.DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT;
		nextRoundFirstCstDutchAuctionBeginningBidPrice = CosmicSignatureConstants.DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT;
		cstDutchAuctionBeginningBidPriceMinLimit = CosmicSignatureConstants.DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT;
		// usedRandomWalkNfts =
		bidMessageLengthMaxLimit = CosmicSignatureConstants.DEFAULT_BID_MESSAGE_LENGTH_MAX_LIMIT;
		cstRewardAmountForBidding = CosmicSignatureConstants.DEFAULT_CST_REWARD_AMOUNT_FOR_BIDDING;
		cstRewardAmountMultiplier = CosmicSignatureConstants.DEFAULT_CST_REWARD_AMOUNT_MULTIPLIER;
		chronoWarriorEthPrizeAmountPercentage = CosmicSignatureConstants.DEFAULT_CHRONO_WARRIOR_ETH_PRIZE_AMOUNT_PERCENTAGE;
		raffleTotalEthPrizeAmountForBiddersPercentage = CosmicSignatureConstants.DEFAULT_RAFFLE_TOTAL_ETH_PRIZE_AMOUNT_FOR_BIDDERS_PERCENTAGE;
		numRaffleEthPrizesForBidders = CosmicSignatureConstants.DEFAULT_NUM_RAFFLE_ETH_PRIZES_FOR_BIDDERS;
		numRaffleCosmicSignatureNftsForBidders = CosmicSignatureConstants.DEFAULT_NUM_RAFFLE_COSMIC_SIGNATURE_NFTS_FOR_BIDDERS;
		numRaffleCosmicSignatureNftsForRandomWalkNftStakers = CosmicSignatureConstants.DEFAULT_NUM_RAFFLE_COSMIC_SIGNATURE_NFTS_FOR_RANDOMWALK_NFT_STAKERS;
		cosmicSignatureNftStakingTotalEthRewardAmountPercentage = CosmicSignatureConstants.DEFAULT_COSMIC_SIGNATURE_NFT_STAKING_TOTAL_ETH_REWARD_AMOUNT_PERCENTAGE;
		initialDurationUntilMainPrizeDivisor = CosmicSignatureConstants.DEFAULT_INITIAL_DURATION_UNTIL_MAIN_PRIZE_DIVISOR;
		// mainPrizeTime =
		mainPrizeTimeIncrementInMicroSeconds = CosmicSignatureConstants.INITIAL_MAIN_PRIZE_TIME_INCREMENT * CosmicSignatureConstants.MICROSECONDS_PER_SECOND;
		mainPrizeTimeIncrementIncreaseDivisor = CosmicSignatureConstants.DEFAULT_MAIN_PRIZE_TIME_INCREMENT_INCREASE_DIVISOR;
		timeoutDurationToClaimMainPrize = CosmicSignatureConstants.DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE;
		mainEthPrizeAmountPercentage = CosmicSignatureConstants.DEFAULT_MAIN_ETH_PRIZE_AMOUNT_PERCENTAGE;
		// token =
		// randomWalkNft =
		// nft =
		// prizesWallet =
		// stakingWalletRandomWalkNft =
		// stakingWalletCosmicSignatureNft =
		// marketingWallet =
		marketingWalletCstContributionAmount = CosmicSignatureConstants.DEFAULT_MARKETING_WALLET_CST_CONTRIBUTION_AMOUNT;
		// charityAddress =
		charityEthDonationAmountPercentage = CosmicSignatureConstants.DEFAULT_CHARITY_ETH_DONATION_AMOUNT_PERCENTAGE;
	}

	// #endregion
	// #region `initialize2`

	/// @dev
	/// [ToDo-202412164-2]
	/// This method should be declared in an inherited interface.
	/// [/ToDo-202412164-2]
	function initialize2() reinitializer(2) /*onlyOwner*/ public {
		// // #enable_asserts // #disable_smtchecker console.log("2 initialize2");

		// `initialize` is supposed to be already executed.
		// `initialize2` is supposed to not be executed yet.
		// Comment-202501012 relates.
		// #enable_asserts assert(mainPrizeTimeIncrementInMicroSeconds > 0);
		// #enable_asserts assert(timesEthBidPrice == 0);

		timesEthBidPrice = 3;
	}

	// #endregion
	// #region `upgradeTo`

	function upgradeTo(address newImplementationAddress_) external override {
		// // #enable_asserts // #disable_smtchecker console.log("2 upgradeTo");
		_authorizeUpgrade(newImplementationAddress_);
		StorageSlot.getAddressSlot(ERC1967Utils.IMPLEMENTATION_SLOT).value = newImplementationAddress_;
		emit IERC1967.Upgraded(newImplementationAddress_);
	}

	// #endregion
	// #region `_authorizeUpgrade`

	/// @dev Comment-202412188 applies.
	function _authorizeUpgrade(address newImplementationAddress_) internal view override onlyOwner onlyRoundIsInactive {
		// // #enable_asserts // #disable_smtchecker console.log("2 _authorizeUpgrade");
	}

	// #endregion
	// #region // `fallback`

	// fallback() external payable override {
	// 	revert("Method does not exist.");
	// }

	// #endregion
}

// #endregion
