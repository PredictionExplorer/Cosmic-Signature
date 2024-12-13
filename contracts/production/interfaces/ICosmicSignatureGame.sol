// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
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
/// todo-1 This contract is upgradeable. So should it support a `selfdestruct` after upgrade?
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
	function initialize(address ownerAddress_) external;

	/// @dev
	/// [Comment-202412129]
	/// To upgrade a contract, OpenZeppelin recommends calling `HardhatRuntimeEnvironment.upgrades.upgradeProxy`,
	/// which calls `upgradeToAndCall`, which we inherited from `UUPSUpgradeable`.
	/// I believe that `HardhatRuntimeEnvironment.upgrades.upgradeProxy` would call `upgradeTo`
	/// if `upgradeToAndCall` didn't exist.
	/// A little problem is that `upgradeToAndCall` does a bunch of thngs that not necessarily benefot us, while costing some gas.
	/// So this `upgradeTo` method performs only the actions that we do need.
	/// To use it, we simply need to call it directly instead of calling `HardhatRuntimeEnvironment.upgrades.upgradeProxy`.
	/// A little problem is that this minimalistic approach is unsafe.
	/// [/Comment-202412129]
	function upgradeTo(address newImplementationAddress_) external;

	/// @notice This method handles incoming ETH transfers.
	/// See also: `IEthDonations.donateEth`.
	receive() external payable;

	// /// @dev It appears that we don't need this.
	// fallback() external payable;
}
