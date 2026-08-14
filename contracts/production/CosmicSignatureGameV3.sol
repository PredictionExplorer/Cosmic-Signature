// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureGameStorageV3Core } from "./CosmicSignatureGameStorageV3Core.sol";
import { BiddingCommonV3Core } from "./BiddingCommonV3Core.sol";
import { MainPrizeCommonV3Core } from "./MainPrizeCommonV3Core.sol";
import { BidStatisticsV3Core } from "./BidStatisticsV3Core.sol";
import { BiddingV3Core } from "./BiddingV3Core.sol";

// #endregion
// #region

/// @title The V3 Cosmic Signature Game UUPS implementation contract.
/// @author The Cosmic Signature Development Team.
/// @notice
/// [Comment-202608248]
/// In V3+, this implementation contract dispatches only the hot path and the upgrade machinery itself:
/// plain ETH and CST bids (including the plain-ETH-transfer `receive`), `reinitialize`,
/// and the OpenZeppelin `Ownable`/`UUPS` members. Everything else that used to be compiled into
/// the monolithic implementation (the state variable getters, the computed views, the bid-with-donation
/// combinations, the configuration setters, the ETH donations, and the whole main prize claim)
/// is served by three delegatecall modules reached through the fallback forwarding chain,
/// with unchanged selectors and unchanged behavior. Comment-202608245 and Comment-202608246 apply.
///
/// This keeps the implementation bytecode far below the EIP-170 limit (the monolith was 154 bytes under it),
/// restores the runtime-oriented optimizer profile that the monolith had to give up (Comment-202608121
/// used to configure `optimizer.runs = 1` for this source file; that override is gone),
/// and gives future versions room to grow: new cold-path features belong in a module
/// (or in a new module appended to the chain), and only new hot-path entry points would grow this contract.
///
/// [Comment-202608253]
/// Only this implementation contract is managed by the OpenZeppelin Upgrades plugin; the modules are
/// deployed as plain contracts. The plugin validates this contract's storage layout against the live proxy
/// on every upgrade, with no unsafe storage flags; the module-vs-implementation layout identity is enforced
/// by `test/tests-src/CosmicSignatureGameV3-ModularEquality.js`.
/// [/Comment-202608253]
/// [/Comment-202608248]
/// @custom:oz-upgrades-unsafe-allow missing-initializer state-variable-immutable
contract CosmicSignatureGameV3 is
	ReentrancyGuardTransientUpgradeable,
	OwnableUpgradeableWithReservedStorageGaps,
	UUPSUpgradeable,
	CosmicSignatureGameStorageV3Core,
	BiddingCommonV3Core,
	MainPrizeCommonV3Core,
	BidStatisticsV3Core,
	BiddingV3Core {
	// #region Data.

	uint256 private constant _CONTRACT_VERSION_NUMBER = 3;

	/// @notice The head of the module fallback forwarding chain (`CosmicSignatureGameViewsModuleV3`).
	/// Comment-202608246 applies.
	address private immutable _VIEWS_MODULE_ADDRESS;

	/// @notice The module serving `claimMainPrize` (`CosmicSignatureGamePrizesModuleV3`).
	/// The implementation contract forwards that selector to it directly, in a single hop,
	/// which also keeps the whole user action API (bids and the claim) declared on this contract.
	/// Comment-202608246 applies.
	address private immutable _PRIZES_MODULE_ADDRESS;

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// Comment-202503121 applies.
	/// @param viewsModuleAddress_ Comment-202608246 applies.
	/// @param prizesModuleAddress_ Comment-202608246 applies.
	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor(address viewsModuleAddress_, address prizesModuleAddress_) {
		// // #enable_asserts // #disable_smtchecker console.log("CosmicSignatureGameV3.constructor");
		_disableInitializers();
		_VIEWS_MODULE_ADDRESS = viewsModuleAddress_;
		_PRIZES_MODULE_ADDRESS = prizesModuleAddress_;
	}

	// #endregion
	// #region `fallback`

	/// @notice Comment-202608246 applies.
	fallback() external payable {
		_delegateToModule(_VIEWS_MODULE_ADDRESS);
	}

	// #endregion
	// #region `claimMainPrize`

	/// @notice A bare forwarder to `CosmicSignatureGamePrizesModuleV3.claimMainPrize`.
	/// It deliberately carries no `nonReentrant`: the guard lives on the module function that does the work,
	/// so that the guard engages exactly once. Comment-202608246 applies.
	function claimMainPrize() external {
		_delegateToModule(_PRIZES_MODULE_ADDRESS);
	}

	// #endregion
	// #region `_delegateToModule`

	/// @notice Forwards the full calldata and ETH value to the given module via `delegatecall`,
	/// and bubbles up whatever it returns or reverts with. Comment-202608246 applies.
	function _delegateToModule(address moduleAddress_) private {
		assembly {
			calldatacopy(0, 0, calldatasize())
			let isSuccess_ := delegatecall(gas(), moduleAddress_, 0, calldatasize(), 0, 0)
			returndatacopy(0, 0, returndatasize())
			switch isSuccess_
			case 0 {
				revert(0, returndatasize())
			}
			default {
				return(0, returndatasize())
			}
		}
	}

	// #endregion
	// #region `reinitialize`

	/// @dev Comment-202606128 applies
	/// Comment-202607079 applies.
	/// Comment-202606084 relates and/or applies.
	function reinitialize() external /*virtual*/ /*onlyOwner*/ _onlyNonFirstRound() _onlyIfPrevVersionWasInitialized() reinitializer(uint64(_CONTRACT_VERSION_NUMBER)) {
		// // #enable_asserts // #disable_smtchecker console.log("CosmicSignatureGameV3.reinitialize");

		// championDurations =
		cstDutchAuctionBeginningBidPriceMinLimit = CosmicSignatureConstants.DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT_V3;
		cstBidPriceDeclineMultiplier = CosmicSignatureConstants.INITIAL_CST_BID_PRICE_DECLINE_MULTIPLIER;
		cstBidPriceDeclineMultiplierChangeDivisor = CosmicSignatureConstants.DEFAULT_CST_BID_PRICE_DECLINE_MULTIPLIER_CHANGE_DIVISOR;
		roundLateBidDurationDivisor = CosmicSignatureConstants.DEFAULT_ROUND_LATE_BID_DURATION_DIVISOR;
		roundLateBidPricePremiumAmountBaseMultiplier = CosmicSignatureConstants.DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_BASE_MULTIPLIER;
		roundLateBidPricePremiumAmountExponent = CosmicSignatureConstants.DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_EXPONENT;
		bidCstRewardAmountMultiplier = CosmicSignatureConstants.DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER;
		mainPrizeNumCosmicSignatureNfts = CosmicSignatureConstants.DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS;
		mainEthPrizeAmountPercentage = CosmicSignatureConstants.DEFAULT_MAIN_ETH_PRIZE_AMOUNT_PERCENTAGE_V3;
		charityEthDonationAmountPercentage = CosmicSignatureConstants.DEFAULT_CHARITY_ETH_DONATION_AMOUNT_PERCENTAGE_V3;
		raffleTotalEthPrizeAmountForBiddersPercentage = CosmicSignatureConstants.DEFAULT_RAFFLE_TOTAL_ETH_PRIZE_AMOUNT_FOR_BIDDERS_PERCENTAGE_V3;
		cosmicSignatureNftStakingTotalEthRewardAmountPercentage = CosmicSignatureConstants.DEFAULT_COSMIC_SIGNATURE_NFT_STAKING_TOTAL_ETH_REWARD_AMOUNT_PERCENTAGE_V3;
		chronoWarriorEthPrizeAmountPercentage = CosmicSignatureConstants.DEFAULT_CHRONO_WARRIOR_ETH_PRIZE_AMOUNT_PERCENTAGE_V3;
	}

	// #endregion
	// #region `_onlyIfPrevVersionWasInitialized`

	/// @dev Comment-202606084 relates.
	/// This used to be declared in `CosmicSignatureGameV2Base`, which the V3+ implementation contract
	/// no longer inherits. Comment-202608248 applies.
	modifier _onlyIfPrevVersionWasInitialized() {
		_checkIfPrevVersionWasInitialized();
		_;
	}

	// #endregion
	// #region `_checkIfPrevVersionWasInitialized`

	function _checkIfPrevVersionWasInitialized() private view {
		// Comment-202605294 applies.
		// #enable_asserts bool isSuccess_ = _getInitializedVersion() == uint64(_CONTRACT_VERSION_NUMBER - 1);
		// #enable_asserts assert(isSuccess_);

		// if ( ! isSuccess_ ) {
		// 	revert InvalidInitialization();
		// }
	}

	// #endregion
	// #region `_authorizeUpgrade`

	/// @dev Comment-202412188 applies.
	/// Comment-202606128 relates.
	function _authorizeUpgrade(address newImplementationAddress_) internal view override onlyOwner _onlyRoundIsInactive {
		// _providedAddressIsNonZero(newImplementationAddress_) {
		// // #enable_asserts // #disable_smtchecker console.log("CosmicSignatureGameV3._authorizeUpgrade");
	}

	// #endregion
}

// #endregion
