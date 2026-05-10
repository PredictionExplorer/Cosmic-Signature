// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.34;

import { IAddressValidator } from "./IAddressValidator.sol";
import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { IBiddingBase } from "./IBiddingBase.sol";
import { IMainPrizeBase } from "./IMainPrizeBase.sol";
import { ISystemManagement } from "./ISystemManagement.sol";
import { IEthDonations } from "./IEthDonations.sol";
import { INftDonations } from "./INftDonations.sol";
import { IBidStatistics } from "./IBidStatistics.sol";
import { IBiddingV2 } from "./IBiddingV2.sol";
import { ISecondaryPrizes } from "./ISecondaryPrizes.sol";
import { IMainPrize } from "./IMainPrize.sol";

/// @title The Cosmic Signature Game V2.
/// @notice Adds sqrt time-based CST bid rewards and front-running slippage protection.
/// @dev V2 deliberately does NOT inherit `ICosmicSignatureGame` because that would pull in
/// the V1 bid function signatures from `IBidding`, which conflict with `IBiddingV2`'s
/// updated signatures (V2 adds `cstBidRewardMinLimit_`). Instead, V2 inherits the same
/// shared base interfaces directly, replacing `IBidding` with `IBiddingV2`.
interface ICosmicSignatureGameV2 is
	IAddressValidator,
	ICosmicSignatureGameStorage,
	IBiddingBase,
	IMainPrizeBase,
	ISystemManagement,
	IEthDonations,
	INftDonations,
	IBidStatistics,
	IBiddingV2,
	ISecondaryPrizes,
	IMainPrize {
	/// @notice Emitted when the proxy is upgraded to this implementation.
	event ContractUpgradedToV2();

	/// @notice Initializes this upgradeable contract's state variables.
	/// This method is called on the proxy contract right after deployment of both the proxy and the implementation contracts.
	/// @param ownerAddress_ Contract owner address.
	function initialize(address ownerAddress_) external;

	/// @notice Initializes V2-specific behavior after the UUPS upgrade.
	function initialize2() external;
}
