// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { IAddressValidator } from "./IAddressValidator.sol";
import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { ISystemManagement } from "./ISystemManagement.sol";
import { IBidStatistics } from "./IBidStatistics.sol";
import { IBidding } from "./IBidding.sol";
import { IEthDonations } from "./IEthDonations.sol";
import { INftDonations } from "./INftDonations.sol";
import { ISpecialPrizes } from "./ISpecialPrizes.sol";
import { IMainPrize } from "./IMainPrize.sol";

/// @title The Cosmic Signature Game.
/// @author The Cosmic Signature Development Team.
/// @notice A contract implementing this interface implements the main functionality of the Cosmic Signature Game.
/// @dev todo-1 This contract is upgradeable. So should it support a `selfdestruct` after upgrade?
interface ICosmicSignatureGame is
	IAddressValidator,
	ICosmicSignatureGameStorage,
	ISystemManagement,
	IBidStatistics,
	IBidding,
	IEthDonations,
	INftDonations,
	ISpecialPrizes,
	IMainPrize {
	/// @notice Initializes this upgradeable contract.
	/// This method is to be called right after deployment.
	/// @param ownerAddress_ Contract owner address.
	/// It could make sense to eliminate this parameter and use `msg.sender` instead, but let's leave it alone.
	function initialize(address ownerAddress_) external;

	/// @dev
	/// [Comment-202412129]
	/// To upgrade a contract, OpenZeppelin recommends calling `HardhatRuntimeEnvironment.upgrades.upgradeProxy`,
	/// which calls `upgradeToAndCall`, which we inherited from `UUPSUpgradeable`.
	/// I believe that `HardhatRuntimeEnvironment.upgrades.upgradeProxy` would call `upgradeTo`
	/// if `upgradeToAndCall` didn't exist.
	/// A little problem is that `upgradeToAndCall` does a bunch of thngs that not necessarily benefot us, while costing some gas.
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

	/// @notice Handles incoming ETH transfers.
	/// See also: `IEthDonations.donateEth`.
	/// todo-1 +++ Do we have a test for this?
	receive() external payable;

	// /// @dev It appears that we don't need this.
	// fallback() external payable;
}
