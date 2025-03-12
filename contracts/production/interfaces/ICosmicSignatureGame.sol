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
/// @dev Issue. This contract is upgradeable. So it could make sense for it to support a self-destruction after a successful upgrade.
/// Note that `SelfDestructibleCosmicSignatureGame`, which is to be used only for testing, supports a `selfdestruct`.
/// I have also implemented a self-destructability in a non-upgradeable contract prototype
/// at "https://github.com/PredictionExplorer/big-contract-prototype".
/// But I have no plans to implement the self-destruction feature in the production code.
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
	/// This method is to be called on the proxy contract right after deployment of both the proxy and the implementation contracts.
	/// @param ownerAddress_ Contract owner address.
	/// It could make sense to eliminate this parameter and use `_msgSender()` instead, but let's leave it alone.
	/// @dev
	/// [Comment-202503132]
	/// Hackers can potentially call this method before the deployer gets a chance to.
	/// But it's not too bad because the deployer's call transaction would then revert, which the deployer would notice,
	/// and would then have to deploy both the proxy and the implementation contracts again.
	/// It would be a bigger problem if we were deplpying the proxy contract via `CREATE2`.
	/// A way to eliminate this vulnerability is to deploy and call `initialize` in a single transaction, which is what
	/// `HardhatRuntimeEnvironment.upgrades.deployProxy` does.
	/// Comment-202412129 relates.
	/// [/Comment-202503132]
	function initialize(address ownerAddress_) external;

	/// @notice Registers a newly deployed new version of the implementation contract with the proxy contract.
	/// This method is to be called on the proxy contract.
	/// Only the proxy contract owner is permitted to call this method.
	/// @dev
	/// [Comment-202412129]
	/// To upgrade a contract, OpenZeppelin recommends calling `HardhatRuntimeEnvironment.upgrades.upgradeProxy`,
	/// which calls `upgradeToAndCall`, which we inherited from `UUPSUpgradeable`.
	/// I believe that `HardhatRuntimeEnvironment.upgrades.upgradeProxy` would call `upgradeTo`
	/// if `upgradeToAndCall` didn't exist.
	/// A little problem is that `upgradeToAndCall` does a bunch of thngs that not necessarily benefit us, while costing some gas.
	/// So this minimalistic `upgradeTo` method performs only the actions that we do need.
	/// To use it, instead of calling `HardhatRuntimeEnvironment.upgrades.upgradeProxy`,
	/// simply deploy a new version of the implementation contract, like you would any non-upgradeable contract,
	/// and then call `upgradeTo` on the proxy contract.
	/// A little problem, as mentioned above, is that this minimalistic approach skips a bunch of checks.
	/// So if the new version happens to be incompatible with the old one nobody will tell us about that.
	/// The good news is that you can validate upgradeable contracts for correctness
	/// by executing "slither/slither-check-upgradeability-1.bash".
	/// Comment-202503132 relates.
	/// [/Comment-202412129]
	function upgradeTo(address newImplementationAddress_) external;

	// /// @notice See also: `IBidding.receive`.
	// /// @dev It appears that we don't need this.
	// fallback() external payable;
}
