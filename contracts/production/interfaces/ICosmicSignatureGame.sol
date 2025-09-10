// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { IAddressValidator } from "./IAddressValidator.sol";
import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { IBiddingBase } from "./IBiddingBase.sol";
import { IMainPrizeBase } from "./IMainPrizeBase.sol";
import { ISystemManagement } from "./ISystemManagement.sol";
import { IEthDonations } from "./IEthDonations.sol";
import { INftDonations } from "./INftDonations.sol";
import { IBidStatistics } from "./IBidStatistics.sol";
import { IBidding } from "./IBidding.sol";
import { ISecondaryPrizes } from "./ISecondaryPrizes.sol";
import { IMainPrize } from "./IMainPrize.sol";

/// @title The Cosmic Signature Game.
/// @author The Cosmic Signature Development Team.
/// @notice A contract implementing this interface implements the main functionality of the Cosmic Signature Game.
/// @dev Issue. This contract is upgradeable. So it could make sense for it to support a self-destruction after a successful upgrade.
/// Note that `SelfDestructibleCosmicSignatureGame`, which is to be used only for testing, supports a `selfdestruct`.
/// (Actually, as per Comment-202509241, I have now eliminated that `selfdestruct`.)
/// I have also implemented a self-destructability in a non-upgradeable contract prototype
/// at "https://github.com/PredictionExplorer/big-contract-prototype".
/// But I have no plans to implement the self-destruction feature in the production code.
interface ICosmicSignatureGame is
	IAddressValidator,
	ICosmicSignatureGameStorage,
	IBiddingBase,
	IMainPrizeBase,
	ISystemManagement,
	IEthDonations,
	INftDonations,
	IBidStatistics,
	IBidding,
	ISecondaryPrizes,
	IMainPrize {
	// /// @notice See also: `IBidding.receive`.
	// /// @dev It appears that we don't need this.
	// fallback() external payable;

	/// @notice Initializes this upgradeable contract's state variables.
	/// This method is called on the proxy contract right after deployment of both the proxy and the implementation contracts.
	/// @param ownerAddress_ Contract owner address.
	/// It could make sense to eliminate this parameter and use `_msgSender()` instead, but let's leave it alone.
	function initialize(address ownerAddress_) external;
}
