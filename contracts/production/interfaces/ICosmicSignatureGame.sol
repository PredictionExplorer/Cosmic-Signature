// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { IBidding } from "./IBidding.sol";
import { IEthDonations } from "./IEthDonations.sol";
import { INftDonations } from "./INftDonations.sol";
import { IBidStatistics } from "./IBidStatistics.sol";
import { ISpecialPrizes } from "./ISpecialPrizes.sol";
import { IMainPrize } from "./IMainPrize.sol";
import { ISystemManagement } from "./ISystemManagement.sol";

/// @title The Cosmic Signature Game.
/// @author The Cosmic Signature Development Team.
/// @notice A contract implementing this interface implements the main functionality of the Cosmic Signature Game.
/// todo-1 This contract is upgradeable. So should it support a `selfdestruct` after upgrade?
//interface ICosmicSignatureGame is ICosmicSignatureGameStorage, ISystemManagement, IMainPrize, IEthDonations, INftDonations {
interface ICosmicSignatureGame is ICosmicSignatureGameStorage, ISystemManagement, IBidStatistics, IBidding, IMainPrize, IEthDonations, INftDonations, ISpecialPrizes {
	/// @notice Initializes the contract
	/// @dev This function should be called right after deployment. It sets up initial state variables and game parameters.
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

	/// @dev todo-1 Move this method to `IBidding` and `Bidding`.
	/// todo-1 Rename this to `bidWithEthAndDonateToken`.
	function bidAndDonateToken(bytes calldata data_, IERC20 tokenAddress_, uint256 amount_) external payable;

	/// @dev todo-1 Move this method to `IBidding` and `Bidding`.
	function bidWithCstAndDonateToken(uint256 priceMaxLimit_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external;

	/// @notice Bids and donates an NFT in a single transaction.
	/// @param data_ Encoded bid parameters.
	/// @param nftAddress_ NFT contract address.
	/// @param nftId_ NFT ID.
	/// @dev todo-1 Move this method to `IBidding` and `Bidding`.
	/// todo-1 Rename this to `bidWithEthAndDonateNft`.
	function bidAndDonateNft(bytes calldata data_, IERC721 nftAddress_, uint256 nftId_) external payable;

	/// @dev todo-1 Move this method to `IBidding` and `Bidding`.
	function bidWithCstAndDonateNft(uint256 priceMaxLimit_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external;

	/// @notice Fallback function to handle incoming ETH transactions
	/// @dev This function is called for empty calldata (and any value)
	receive() external payable;

	/// @notice Fallback function to handle incoming calls with data
	/// @dev This function is called when msg.data is not empty
	fallback() external payable;
}
