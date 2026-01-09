// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
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

/// @title CosmicSignatureGame
/// @author Cosmic Signature Team
/// @notice The main upgradeable contract for the Cosmic Signature bidding game.
/// @dev This contract composes all game logic through multiple inheritance:
/// - `ReentrancyGuardTransientUpgradeable`: Provides gas-efficient reentrancy protection using transient storage.
/// - `OwnableUpgradeableWithReservedStorageGaps`: Ownership management with reserved storage for upgrades.
/// - `UUPSUpgradeable`: Enables UUPS proxy upgrade pattern.
/// - `AddressValidator`: Provides address validation utilities.
/// - `CosmicSignatureGameStorage`: Declares all state variables.
/// - `BiddingBase`: Base bidding round status checks and modifiers.
/// - `MainPrizeBase`: Time calculations for main prize eligibility.
/// - `SystemManagement`: Owner-controlled parameter setters.
/// - `EthDonations`: ETH donation handling.
/// - `NftDonations`: NFT donation handling (placeholder).
/// - `BidStatistics`: Bid-related statistics and champion tracking.
/// - `Bidding`: ETH and CST bidding logic.
/// - `SecondaryPrizes`: Secondary prize calculations.
/// - `MainPrize`: Main prize claiming and distribution.
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

	/// @notice Constructor that disables initializers in the implementation contract.
	/// @dev
	/// [Comment-202503121]
	/// When deploying an upgradeable contract, the implementation contract should have its initializers disabled
	/// to prevent unauthorized initialization. This is a security measure required by the UUPS pattern.
	/// [/Comment-202503121]
	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() {
		// // #enable_asserts // #disable_smtchecker console.log("1 constructor");
		_disableInitializers();
	}

	// #endregion
	// #region // `fallback`

	// fallback() external payable override {
	// 	revert ("Method does not exist.");
	// }

	// #endregion
	// #region `initialize`

	/// @notice Initializes the proxy contract with the given owner address.
	/// @param ownerAddress_ The address that will become the contract owner.
	/// @dev
	/// [Comment-202503124]
	/// The `virtual` keyword is not needed for production, but derived testing contracts need it to `override` this method.
	/// [/Comment-202503124]
	function initialize(address ownerAddress_) external override virtual initializer() {
		// // #enable_asserts // #disable_smtchecker console.log("1 initialize");
		_initialize(ownerAddress_);
	}

	// #endregion
	// #region `_initialize`

	/// @notice Internal initialization logic called by `initialize`.
	/// @param ownerAddress_ The address that will become the contract owner.
	/// @dev Sets up all inherited contracts and initializes game parameters to their default values.
	function _initialize(address ownerAddress_) internal {
		// `initialize` is supposed to not be executed yet.
		// #enable_asserts assert(owner() == address(0));

		// Initialize inherited upgradeable contracts.
		__ReentrancyGuardTransient_init();
		__Ownable_init(ownerAddress_);
		__UUPSUpgradeable_init();

		// The following state variables are left at their default zero values:
		// - ethDonationWithInfoRecords
		// - lastBidderAddress
		// - lastCstBidderAddress
		// - bidderAddresses
		// - biddersInfo
		// - enduranceChampionAddress
		// - enduranceChampionStartTimeStamp
		// - enduranceChampionDuration
		// - prevEnduranceChampionDuration
		// - chronoWarriorAddress
		// - roundNum

		// Initialize `chronoWarriorDuration` to max value so any valid duration is considered smaller.
		chronoWarriorDuration = uint256(int256(-1));
		// Initialize bidding round timing parameters.
		delayDurationBeforeRoundActivation = CosmicSignatureConstants.DEFAULT_DELAY_DURATION_BEFORE_ROUND_ACTIVATION;
		roundActivationTime = CosmicSignatureConstants.INITIAL_ROUND_ACTIVATION_TIME;

		// Initialize ETH Dutch auction parameters.
		ethDutchAuctionDurationDivisor = CosmicSignatureConstants.DEFAULT_ETH_DUTCH_AUCTION_DURATION_DIVISOR;
		ethDutchAuctionEndingBidPriceDivisor = CosmicSignatureConstants.DEFAULT_ETH_DUTCH_AUCTION_ENDING_BID_PRICE_DIVISOR;
		ethBidPriceIncreaseDivisor = CosmicSignatureConstants.DEFAULT_ETH_BID_PRICE_INCREASE_DIVISOR;
		ethBidRefundAmountInGasToSwallowMaxLimit = CosmicSignatureConstants.DEFAULT_ETH_BID_REFUND_AMOUNT_IN_GAS_TO_SWALLOW_MAX_LIMIT;

		// Initialize CST Dutch auction parameters.
		cstDutchAuctionDurationDivisor = CosmicSignatureConstants.DEFAULT_CST_DUTCH_AUCTION_DURATION_DIVISOR;
		nextRoundFirstCstDutchAuctionBeginningBidPrice = CosmicSignatureConstants.DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT;
		cstDutchAuctionBeginningBidPriceMinLimit = CosmicSignatureConstants.DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT;

		// Initialize bid message and CST reward parameters.
		bidMessageLengthMaxLimit = CosmicSignatureConstants.DEFAULT_BID_MESSAGE_LENGTH_MAX_LIMIT;
		cstRewardAmountForBidding = CosmicSignatureConstants.DEFAULT_CST_REWARD_AMOUNT_FOR_BIDDING;

		// Initialize secondary prize parameters.
		cstPrizeAmount = CosmicSignatureConstants.DEFAULT_CST_PRIZE_AMOUNT;
		chronoWarriorEthPrizeAmountPercentage = CosmicSignatureConstants.DEFAULT_CHRONO_WARRIOR_ETH_PRIZE_AMOUNT_PERCENTAGE;
		raffleTotalEthPrizeAmountForBiddersPercentage = CosmicSignatureConstants.DEFAULT_RAFFLE_TOTAL_ETH_PRIZE_AMOUNT_FOR_BIDDERS_PERCENTAGE;
		numRaffleEthPrizesForBidders = CosmicSignatureConstants.DEFAULT_NUM_RAFFLE_ETH_PRIZES_FOR_BIDDERS;
		numRaffleCosmicSignatureNftsForBidders = CosmicSignatureConstants.DEFAULT_NUM_RAFFLE_COSMIC_SIGNATURE_NFTS_FOR_BIDDERS;
		numRaffleCosmicSignatureNftsForRandomWalkNftStakers = CosmicSignatureConstants.DEFAULT_NUM_RAFFLE_COSMIC_SIGNATURE_NFTS_FOR_RANDOMWALK_NFT_STAKERS;
		cosmicSignatureNftStakingTotalEthRewardAmountPercentage = CosmicSignatureConstants.DEFAULT_COSMIC_SIGNATURE_NFT_STAKING_TOTAL_ETH_REWARD_AMOUNT_PERCENTAGE;

		// Initialize main prize timing parameters.
		initialDurationUntilMainPrizeDivisor = CosmicSignatureConstants.DEFAULT_INITIAL_DURATION_UNTIL_MAIN_PRIZE_DIVISOR;
		mainPrizeTimeIncrementInMicroSeconds = CosmicSignatureConstants.INITIAL_MAIN_PRIZE_TIME_INCREMENT * CosmicSignatureConstants.MICROSECONDS_PER_SECOND;
		mainPrizeTimeIncrementIncreaseDivisor = CosmicSignatureConstants.DEFAULT_MAIN_PRIZE_TIME_INCREMENT_INCREASE_DIVISOR;
		timeoutDurationToClaimMainPrize = CosmicSignatureConstants.DEFAULT_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE;
		mainEthPrizeAmountPercentage = CosmicSignatureConstants.DEFAULT_MAIN_ETH_PRIZE_AMOUNT_PERCENTAGE;

		// Initialize marketing wallet CST contribution.
		// Contract addresses (token, nft, prizesWallet, etc.) must be set by owner after deployment.
		marketingWalletCstContributionAmount = CosmicSignatureConstants.DEFAULT_MARKETING_WALLET_CST_CONTRIBUTION_AMOUNT;

		// Initialize charity donation percentage.
		// The `charityAddress` must be set by owner after deployment.
		charityEthDonationAmountPercentage = CosmicSignatureConstants.DEFAULT_CHARITY_ETH_DONATION_AMOUNT_PERCENTAGE;
	}

	// #endregion
	// #region `_authorizeUpgrade`

	/// @notice Authorizes an upgrade to a new implementation contract.
	/// @param newImplementationAddress_ The address of the new implementation contract.
	/// @dev
	/// [Comment-202412188]
	/// One might want to not require `_onlyRoundIsInactive` -- to leave the door open for the contract owner
	/// to replace the contract in the middle of a bidding round, just in case a bug results in `claimMainPrize` reverting.
	/// But such kind of feature would violate the principle of trustlessness.
	/// [/Comment-202412188]
	///
	/// Security: Upgrades are only allowed when no bidding round is active to prevent mid-game manipulation.
	function _authorizeUpgrade(address newImplementationAddress_) internal view override
		// [Comment-202503119]
		// `initialize` is supposed to be already executed.
		// [/Comment-202503119]
		// [Comment-202510114]
		// Otherwise `owner()` would be zero and therefore this modifier would revert.
		// [/Comment-202510114]
		onlyOwner

		_onlyRoundIsInactive {
		// _providedAddressIsNonZero(newImplementationAddress_) {
		// // #enable_asserts // #disable_smtchecker console.log("1 _authorizeUpgrade");
	}

	// #endregion
}

// #endregion
