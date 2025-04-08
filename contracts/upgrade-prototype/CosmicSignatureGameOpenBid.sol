// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { StorageSlot } from "@openzeppelin/contracts/utils/StorageSlot.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "../production/OwnableUpgradeableWithReservedStorageGaps.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
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
	/// Comment-202503121 applies.
	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() {
		// // #enable_asserts // #disable_smtchecker console.log("2 constructor");
		_disableInitializers();
	}

	// #endregion
	// #region // `fallback`

	// fallback() external payable override {
	// 	revert ("Method does not exist.");
	// }

	// #endregion
	// #region `initialize`

	function initialize(address ownerAddress_) external override initializer() {
		// // #enable_asserts // #disable_smtchecker console.log("2 initialize");

		// Comment-202501012 applies.
		// #enable_asserts assert(owner() == address(0));

		// todo-1 +++ Order these like in the inheritance list.
		__ReentrancyGuardTransient_init();
		__Ownable_init(ownerAddress_);
		__UUPSUpgradeable_init();

		// ethDonationWithInfoRecords =
		// // lastBidType = todo-9 Should we assert that this equals `ETH`?
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
		ethBidPriceIncreaseDivisor = CosmicSignatureConstants.DEFAULT_ETH_BID_PRICE_INCREASE_DIVISOR;
		ethBidRefundAmountInGasMinLimit = CosmicSignatureConstants.DEFAULT_ETH_BID_REFUND_AMOUNT_IN_GAS_MIN_LIMIT;
		// cstDutchAuctionBeginningTimeStamp =
		cstDutchAuctionDurationDivisor = CosmicSignatureConstants.DEFAULT_CST_DUTCH_AUCTION_DURATION_DIVISOR;
		// cstDutchAuctionBeginningBidPrice = CosmicSignatureConstants.DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT;
		nextRoundFirstCstDutchAuctionBeginningBidPrice = CosmicSignatureConstants.DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT;
		cstDutchAuctionBeginningBidPriceMinLimit = CosmicSignatureConstants.DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT;
		// usedRandomWalkNfts =
		bidMessageLengthMaxLimit = CosmicSignatureConstants.DEFAULT_BID_MESSAGE_LENGTH_MAX_LIMIT;
		cstRewardAmountForBidding = CosmicSignatureConstants.DEFAULT_CST_REWARD_AMOUNT_FOR_BIDDING;
		cstPrizeAmountMultiplier = CosmicSignatureConstants.DEFAULT_CST_PRIZE_AMOUNT_MULTIPLIER;
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
	/// [Comment-202502164]
	/// We don't really need `onlyOwner` here.
	/// So hackers can potentially call this method before the contract owner gets a chance to,
	/// which would not inflict a lot of damage.
	/// But if this method had parameters we would need `onlyOwner` here --
	/// to make it impossible for hackers to pass malicious values.
	/// Comment-202503132 relates.
	/// Comment-202412129 relates.
	/// [/Comment-202502164]
	/// [ToDo-202412164-2]
	/// This should be declared in an inherited interface.
	/// [/ToDo-202412164-2]
	function initialize2() external reinitializer(2) /*onlyOwner*/ {
		// // #enable_asserts // #disable_smtchecker console.log("2 initialize2");

		// Comment-202503119 applies.
		// #enable_asserts assert(owner() != address(0));

		// `initialize2` is supposed to not be executed yet.
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
	function _authorizeUpgrade(address newImplementationAddress_) internal view override
		onlyOwner
		_onlyRoundIsInactive
		_providedAddressIsNonZero(newImplementationAddress_) {
		// // #enable_asserts // #disable_smtchecker console.log("2 _authorizeUpgrade");

		// Comment-202503119 applies.
		// #enable_asserts assert(owner() != address(0));

		// `initialize2` is supposed to be already executed.
		// #enable_asserts assert(timesEthBidPrice > 0);
	}

	// #endregion
	// #region `getBlockPrevRandao`

	function getBlockPrevRandao() external view override returns (uint256) {
		return block.prevrandao;
	}

	// #endregion
	// #region `getBlockBaseFee`

	function getBlockBaseFee() external view override returns (uint256) {
		return block.basefee;
	}

	// #endregion
}

// #endregion
