// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #endregion
// #region

// #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { StorageSlot } from "@openzeppelin/contracts/utils/StorageSlot.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
// import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC1967 } from "@openzeppelin/contracts/interfaces/IERC1967.sol";
import { ERC1967Utils } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { SystemManagement } from "./SystemManagement.sol";
import { BidStatistics } from "./BidStatistics.sol";
import { Bidding } from "./Bidding.sol";
import { EthDonations } from "./EthDonations.sol";
import { NftDonations } from "./NftDonations.sol";
import { SpecialPrizes } from "./SpecialPrizes.sol";
import { MainPrize } from "./MainPrize.sol";
import { ICosmicSignatureGame } from "./interfaces/ICosmicSignatureGame.sol";

// #endregion
// #region

/// todo-1 Everywhere, make some `public` functions `external`.
/// todo-1 Everywhere, make some `public`/`external` functions `private`.
contract CosmicSignatureGame is
	ReentrancyGuardTransientUpgradeable,
	OwnableUpgradeableWithReservedStorageGaps,
	UUPSUpgradeable,
	AddressValidator,
	CosmicSignatureGameStorage,
	SystemManagement,
	BidStatistics,
	Bidding,
	EthDonations,
	NftDonations,
	SpecialPrizes,
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

	function initialize(address ownerAddress_) external override initializer() {
		// // #enable_asserts // #disable_smtchecker console.log("1 initialize");

		// [Comment-202501012]
		// We are supposed to not be initialized yet.
		// [/Comment-202501012]
		// #enable_asserts assert(activationTime == 0);

		// todo-1 +++ Order these like in the inheritance list.
		__ReentrancyGuardTransient_init();
		__Ownable_init(ownerAddress_);
		__UUPSUpgradeable_init();

		// systemMode = CosmicSignatureConstants.MODE_MAINTENANCE;
		activationTime = CosmicSignatureConstants.INITIAL_ACTIVATION_TIME;
		delayDurationBeforeNextRound = CosmicSignatureConstants.DEFAULT_DELAY_DURATION_BEFORE_NEXT_ROUND;
		marketingWalletCstContributionAmount = CosmicSignatureConstants.DEFAULT_MARKETING_WALLET_CST_CONTRIBUTION_AMOUNT;
		maxMessageLength = CosmicSignatureConstants.MAX_MESSAGE_LENGTH;
		// token =
		// nft =
		// randomWalkNft =
		// stakingWalletCosmicSignatureNft =
		// stakingWalletRandomWalkNft =
		// prizesWallet =
		// marketingWallet =
		// charityAddress =
		// // numDonatedNfts =
		mainPrizeTimeIncrementInMicroSeconds = CosmicSignatureConstants.INITIAL_MAIN_PRIZE_TIME_INCREMENT * CosmicSignatureConstants.MICROSECONDS_PER_SECOND;
		mainPrizeTimeIncrementIncreaseDivisor = CosmicSignatureConstants.DEFAULT_MAIN_PRIZE_TIME_INCREMENT_INCREASE_DIVISOR;
		initialSecondsUntilPrize = CosmicSignatureConstants.INITIAL_SECONDS_UNTIL_PRIZE;
		// mainPrizeTime =
		// roundNum = 0;
		nextEthBidPrice = CosmicSignatureConstants.FIRST_ROUND_INITIAL_ETH_BID_PRICE;
		roundInitialEthBidPriceMultiplier = CosmicSignatureConstants.DEFAULT_ROUND_INITIAL_ETH_BID_PRICE_MULTIPLIER;
		roundInitialEthBidPriceDivisor = CosmicSignatureConstants.DEFAULT_ROUND_INITIAL_ETH_BID_PRICE_DIVISOR;
		priceIncrease = CosmicSignatureConstants.INITIAL_PRICE_INCREASE;
		cstDutchAuctionDurationDivisor = CosmicSignatureConstants.DEFAULT_CST_DUTCH_AUCTION_DURATION_DIVISOR;

		// // [Comment-202411211]
		// // If this condition is `true` it's likely that `setActivationTime` will not be called,
		// // which implies that this is likely our last chance to initialize `cstDutchAuctionBeginTimeStamp`.
		// // [/Comment-202411211]
		// if (CosmicSignatureConstants.INITIAL_ACTIVATION_TIME < CosmicSignatureConstants.TIMESTAMP_9000_01_01) {
		// 	// Comment-202411168 applies.
		// 	cstDutchAuctionBeginTimeStamp = CosmicSignatureConstants.INITIAL_ACTIVATION_TIME;
		// }

		startingBidPriceCST = CosmicSignatureConstants.STARTING_BID_PRICE_CST_DEFAULT_MIN_LIMIT;
		startingBidPriceCSTMinLimit = CosmicSignatureConstants.STARTING_BID_PRICE_CST_DEFAULT_MIN_LIMIT;
		tokenReward = CosmicSignatureConstants.DEFAULT_TOKEN_REWARD;
		// lastBidderAddress = address(0);
		// lastCstBidderAddress =
		// // lastBidType =
		mainEthPrizeAmountPercentage = CosmicSignatureConstants.DEFAULT_MAIN_ETH_PRIZE_AMOUNT_PERCENTAGE;
		chronoWarriorEthPrizeAmountPercentage = CosmicSignatureConstants.DEFAULT_CHRONO_WARRIOR_ETH_PRIZE_AMOUNT_PERCENTAGE;
		raffleTotalEthPrizeAmountPercentage = CosmicSignatureConstants.DEFAULT_RAFFLE_TOTAL_ETH_PRIZE_AMOUNT_PERCENTAGE;
		stakingTotalEthRewardAmountPercentage = CosmicSignatureConstants.DEFAULT_STAKING_TOTAL_ETH_REWARD_AMOUNT_PERCENTAGE;
		charityEthDonationAmountPercentage = CosmicSignatureConstants.DEFAULT_CHARITY_ETH_DONATION_AMOUNT_PERCENTAGE;
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
		numRaffleEthPrizesForBidders = CosmicSignatureConstants.DEFAULT_NUM_RAFFLE_ETH_PRIZES_FOR_BIDDERS;
		numRaffleCosmicSignatureNftsForBidders = CosmicSignatureConstants.DEFAULT_NUM_RAFFLE_COSMIC_SIGNATURE_NFTS_FOR_BIDDERS;
		numRaffleCosmicSignatureNftsForRandomWalkNftStakers = CosmicSignatureConstants.DEFAULT_NUM_RAFFLE_COSMIC_SIGNATURE_NFTS_FOR_RANDOMWALK_NFT_STAKERS;
		// raffleEntropy = keccak256(abi.encode("Cosmic Signature 2023", block.timestamp, blockhash(block.number - 1)));
		// raffleEntropy = bytes32(0x4e48fcb2afb4dabb2bc40604dc13d21579f2ce6b3a3f60b8dca0227d0535b31a);
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
	/// One might want to not impose the `onlyInactive` requirement on this -- to leave the door open for the contract owner
	/// to replace the contract in the middle of a bidding round, just in case a bug results in `claimMainPrize` failing.
	/// But such kind of feature would violate the principle of trustlessness.
	/// [/Comment-202412188]
	function _authorizeUpgrade(address newImplementationAddress_) internal view override onlyOwner onlyInactive {
		// // #enable_asserts // #disable_smtchecker console.log("1 _authorizeUpgrade");
	}

	// #endregion
	// #region `receive`

	receive() external payable override /*nonReentrant*/ /*onlyActive*/ {
		// Bidding with default parameters.
		// BidParams memory defaultParams;
		// // defaultParams.message = "";
		// defaultParams.randomWalkNftId = -1;
		// bytes memory param_data = abi.encode(defaultParams);
		// bid(param_data);
		_bid((-1), "");
	}

	// #endregion
	// #region // `fallback`

	// fallback() external payable override {
	// 	revert("Method does not exist.");
	// }

	// #endregion
}

// #endregion
