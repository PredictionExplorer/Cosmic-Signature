// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { IAddressValidator } from "./IAddressValidator.sol";
import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { ISystemEvents } from "./ISystemEvents.sol";
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
/// @dev Issue. This contract is upgradeable. So it could make sense for it to support a `selfdestruct` after a successful upgrade.
/// Note that `SelfDestructibleCosmicSignatureGame` supports a `selfdestruct`.
/// But I have no time to get such an unsafe feature right in the production code.
interface ICosmicSignatureGame is
	IAddressValidator,
	ICosmicSignatureGameStorage,
	ISystemEvents,
	IBiddingBase,
	IMainPrizeBase,
	ISystemManagement,
	IEthDonations,
	INftDonations,
	IBidStatistics,
	IBidding,
	ISecondaryPrizes,
	IMainPrize {
	/// @notice Initializes this upgradeable contract.
	/// This method is to be called right after deployment.
	/// @param ownerAddress_ Contract owner address.
	/// It could make sense to eliminate this parameter and use `_msgSender()` instead, but let's leave it alone.
	function initialize(address ownerAddress_) external;

	/// @dev
	/// [Comment-202412129]
	/// To upgrade a contract, OpenZeppelin recommends calling `HardhatRuntimeEnvironment.upgrades.upgradeProxy`,
	/// which calls `upgradeToAndCall`, which we inherited from `UUPSUpgradeable`.
	/// I believe that `HardhatRuntimeEnvironment.upgrades.upgradeProxy` would call `upgradeTo`
	/// if `upgradeToAndCall` didn't exist.
	/// A little problem is that `upgradeToAndCall` does a bunch of thngs that not necessarily benefit us, while costing some gas.
	/// So this minimalistic `upgradeTo` method performs only the actions that we do need.
	/// To use it, instead of calling `HardhatRuntimeEnvironment.upgrades.upgradeProxy`,
	/// we simply need to deploy a new version of the contract like we do a non-upgradeable contract and then call `upgradeTo`.
	/// A little problem is that this minimalistic approach skips a bunch of checks.
	/// If the new version happens to be incompatible with the old one nobody will tell us about that.
	/// Issue. This solution is a little bit hackable. Someone can call this method before the deployer gets a chance to.
	/// But it's not too bad because the deployer's call transaction would then fail, so the deployer would notice it
	/// and would have to deploy the contract again. It would be a bigger problem if we were deplpying via `CREATE2`.
	/// One way to eliminate this vulnerability is to deploy and call `upgradeTo` in a single transaction, which is what
	/// `HardhatRuntimeEnvironment.upgrades.deployProxy` and `HardhatRuntimeEnvironment.upgrades.upgradeProxy` do.
	/// [/Comment-202412129]
	function upgradeTo(address newImplementationAddress_) external;

	// /// @notice See also: `IBidding.receive`.
	// /// @dev It appears that we don't need this.
	// fallback() external payable;
}
