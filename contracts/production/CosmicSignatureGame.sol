// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { StorageSlot } from "@openzeppelin/contracts/utils/StorageSlot.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
// import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC1967 } from "@openzeppelin/contracts/interfaces/IERC1967.sol";
import { ERC1967Utils } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { BiddingBase } from "./BiddingBase.sol";
import { MainPrizeBase } from "./MainPrizeBase.sol";
import { SystemManagement } from "./SystemManagement.sol";
import { EthDonations } from "./EthDonations.sol";
import { NftDonations } from "./NftDonations.sol";
import { BidStatistics } from "./BidStatistics.sol";
import { Bidding } from "./Bidding.sol";
import { SecondaryPrizes } from "./SecondaryPrizes.sol";
import { MainPrize } from "./MainPrize.sol";
import { ICosmicSignatureGame } from "./interfaces/ICosmicSignatureGame.sol";

// #endregion
// #region

/// todo-1 Everywhere, declare some `public`/`external` functions `private`/`internal` (and name them `_...`).
/// todo-1 Everywhere, declare some `public` functions `external`.
contract CosmicSignatureGame is
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
	Bidding,
	SecondaryPrizes,
	MainPrize,
	ICosmicSignatureGame {
	// #region `constructor`

	/// @notice Constructor.
	/// @dev This constructor is only used to disable initializers for the implementation contract.
	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() {
		// // #enable_asserts // #disable_smtchecker console.log("1 constructor");
		_disableInitializers();
	}

	// #endregion
	// #region `initialize`

	function initialize(address ownerAddress_) external override virtual initializer() {
		// // #enable_asserts // #disable_smtchecker console.log("1 initialize");

		_initialize(ownerAddress_);
	}

	// #endregion
	// #region `_initialize`

	function _initialize(address ownerAddress_) internal {
		// [Comment-202501012]
		// We are supposed to not be initialized yet.
		// [/Comment-202501012]
		// #enable_asserts assert(mainPrizeTimeIncrementInMicroSeconds == 0);

		// todo-1 +++ Order these like in the inheritance list.
		__ReentrancyGuardTransient_init();
		__Ownable_init(ownerAddress_);
		__UUPSUpgradeable_init();

		// ethDonationWithInfoRecords =
		// roundNum =
		delayDurationBeforeRoundActivation = CosmicSignatureConstants.DEFAULT_DELAY_DURATION_BEFORE_ROUND_ACTIVATION;
		roundActivationTime = CosmicSignatureConstants.INITIAL_ROUND_ACTIVATION_TIME;
		ethDutchAuctionDurationDivisor = CosmicSignatureConstants.DEFAULT_ETH_DUTCH_AUCTION_DURATION_DIVISOR;
		// ethDutchAuctionBeginningBidPrice = CosmicSignatureConstants.FIRST_ROUND_INITIAL_ETH_BID_PRICE;
		ethDutchAuctionEndingBidPriceDivisor = CosmicSignatureConstants.DEFAULT_ETH_DUTCH_AUCTION_ENDING_BID_PRICE_DIVISOR;
		// nextEthBidPrice = CosmicSignatureConstants.FIRST_ROUND_INITIAL_ETH_BID_PRICE;
		nextEthBidPriceIncreaseDivisor = CosmicSignatureConstants.DEFAULT_NEXT_ETH_BID_PRICE_INCREASE_DIVISOR;
		ethBidRefundAmountInGasMinLimit = CosmicSignatureConstants.DEFAULT_ETH_BID_REFUND_AMOUNT_IN_GAS_MIN_LIMIT;

		// // [Comment-202411211]
		// // If this condition is `true` it's likely that `setRoundActivationTime` will not be called,
		// // which implies that this is likely our last chance to initialize `cstDutchAuctionBeginningTimeStamp`.
		// // [/Comment-202411211]
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
		initialDurationUntilMainPrizeDivisor = CosmicSignatureConstants.DEFAULT_INITIAL_DURATION_UNTIL_MAIN_PRIZE_DIVISOR;
		// mainPrizeTime =
		mainPrizeTimeIncrementInMicroSeconds = CosmicSignatureConstants.INITIAL_MAIN_PRIZE_TIME_INCREMENT * CosmicSignatureConstants.MICROSECONDS_PER_SECOND;
		mainPrizeTimeIncrementIncreaseDivisor = CosmicSignatureConstants.DEFAULT_MAIN_PRIZE_TIME_INCREMENT_INCREASE_DIVISOR;
		timeoutDurationToClaimMainPrize = CosmicSignatureConstants.DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE;
		mainEthPrizeAmountPercentage = CosmicSignatureConstants.DEFAULT_MAIN_ETH_PRIZE_AMOUNT_PERCENTAGE;
		cstRewardAmountMultiplier = CosmicSignatureConstants.DEFAULT_CST_REWARD_AMOUNT_MULTIPLIER;
		chronoWarriorEthPrizeAmountPercentage = CosmicSignatureConstants.DEFAULT_CHRONO_WARRIOR_ETH_PRIZE_AMOUNT_PERCENTAGE;
		raffleTotalEthPrizeAmountForBiddersPercentage = CosmicSignatureConstants.DEFAULT_RAFFLE_TOTAL_ETH_PRIZE_AMOUNT_FOR_BIDDERS_PERCENTAGE;
		numRaffleEthPrizesForBidders = CosmicSignatureConstants.DEFAULT_NUM_RAFFLE_ETH_PRIZES_FOR_BIDDERS;
		numRaffleCosmicSignatureNftsForBidders = CosmicSignatureConstants.DEFAULT_NUM_RAFFLE_COSMIC_SIGNATURE_NFTS_FOR_BIDDERS;
		numRaffleCosmicSignatureNftsForRandomWalkNftStakers = CosmicSignatureConstants.DEFAULT_NUM_RAFFLE_COSMIC_SIGNATURE_NFTS_FOR_RANDOMWALK_NFT_STAKERS;
		cosmicSignatureNftStakingTotalEthRewardAmountPercentage = CosmicSignatureConstants.DEFAULT_COSMIC_SIGNATURE_NFT_STAKING_TOTAL_ETH_REWARD_AMOUNT_PERCENTAGE;
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
	// #region `upgradeTo`

	function upgradeTo(address newImplementationAddress_) external override {
		// // #enable_asserts // #disable_smtchecker console.log("1 upgradeTo");
		_authorizeUpgrade(newImplementationAddress_);
		StorageSlot.getAddressSlot(ERC1967Utils.IMPLEMENTATION_SLOT).value = newImplementationAddress_;
		emit IERC1967.Upgraded(newImplementationAddress_);
	}

	// #endregion
	// #region `_authorizeUpgrade`

	/// @dev
	/// [Comment-202412188]
	/// One might want to not impose the `onlyRoundIsInactive` requirement on this -- to leave the door open for the contract owner
	/// to replace the contract in the middle of a bidding round, just in case a bug results in `claimMainPrize` failing.
	/// But such kind of feature would violate the principle of trustlessness.
	/// [/Comment-202412188]
	function _authorizeUpgrade(address newImplementationAddress_) internal view override onlyOwner onlyRoundIsInactive {
		// // #enable_asserts // #disable_smtchecker console.log("1 _authorizeUpgrade");
	}

	// #endregion
	// #region // `fallback`

	// fallback() external payable override {
	// 	revert("Method does not exist.");
	// }

	// #endregion
}

// #endregion
