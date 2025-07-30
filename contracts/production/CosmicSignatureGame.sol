// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { StorageSlot } from "@openzeppelin/contracts/utils/StorageSlot.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
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
	/// [Comment-202503121]
	/// This only disables initializers in the implementation contract.
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

	/// todo-1 Delete this.
	fallback() external payable {
		revert ("Method does not exist.");
	}

	// #endregion
	// #region `initialize`

	/// @dev
	/// [Comment-202503124]
	/// The `virtual` keyword is not needed for the production, but derived testing contracts need it to `override` this method.
	/// [/Comment-202503124]
	function initialize(address ownerAddress_) external override virtual initializer() {
		// // #enable_asserts // #disable_smtchecker console.log("1 initialize");
		_initialize(ownerAddress_);
	}

	// #endregion
	// #region `_initialize`

	function _initialize(address ownerAddress_) internal {
		// [Comment-202501012]
		// `initialize` is supposed to not be executed yet.
		// [/Comment-202501012]
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
		ethBidRefundAmountInGasToSwallowMaxLimit = CosmicSignatureConstants.DEFAULT_ETH_BID_REFUND_AMOUNT_IN_GAS_TO_SWALLOW_MAX_LIMIT;
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
	/// One might want to not require `_onlyRoundIsInactive` -- to leave the door open for the contract owner
	/// to replace the contract in the middle of a bidding round, just in case a bug results in `claimMainPrize` reverting.
	/// But such kind of feature would violate the principle of trustlessness.
	/// [/Comment-202412188]
	function _authorizeUpgrade(address newImplementationAddress_) internal view override
		onlyOwner
		_onlyRoundIsInactive
		_providedAddressIsNonZero(newImplementationAddress_) {
		// // #enable_asserts // #disable_smtchecker console.log("1 _authorizeUpgrade");

		// [Comment-202503119]
		// `initialize` is supposed to be already executed.
		// [/Comment-202503119]
		// #enable_asserts assert(owner() != address(0));
	}

	// #endregion
}

// #endregion
