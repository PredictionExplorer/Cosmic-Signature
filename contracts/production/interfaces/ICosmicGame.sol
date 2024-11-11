// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { IBidding } from "./IBidding.sol";
import { INFTDonations } from "./INFTDonations.sol";
import { IETHDonations } from "./IETHDonations.sol";
import { IBidStatistics } from "./IBidStatistics.sol";
import { ISpecialPrizes } from "./ISpecialPrizes.sol";
import { IMainPrize } from "./IMainPrize.sol";
import { ISystemManagement } from "./ISystemManagement.sol";

/// @title Cosmic Game Implementation
/// @author Cosmic Game Development Team
/// @notice A contract implementing this interface implements the main functionality of the Cosmic Game
//interface ICosmicGame is ICosmicSignatureGameStorage, ISystemManagement, IMainPrize, INFTDonations, IETHDonations {
interface ICosmicGame is ICosmicSignatureGameStorage, ISystemManagement, IBidStatistics, IBidding, IMainPrize, INFTDonations, IETHDonations, ISpecialPrizes {

	/// @notice Initializes the contract
	/// @dev This function should be called right after deployment. It sets up initial state variables and game parameters.
	function initialize(address _gameAdministrator) external;

	// /// @notice Bid and donate an NFT in a single transaction
	// /// @param _param_data Encoded bid parameters
	// /// @param nftAddress Address of the NFT contract
	// /// @param nftId ID of the NFT to donate
	// /// @dev This function combines bidding and NFT donation
	// /// todo-1 Do we need a similar method for bidding with CST? This one doesn't support CST bidding, right?
	// /// todo-1 I have commented this out because now the donation would be a separate external call to `PrizesWallet`.
	// /// todo-1 The donor can make it on their own. It would not cost them more gas.
	// function bidAndDonateNft(
	// 	bytes calldata _param_data,
	// 	IERC721 nftAddress,
	// 	uint256 nftId
	// ) external payable;

	/// @notice Fallback function to handle incoming ETH transactions
	/// @dev This function is called for empty calldata (and any value)
	receive() external payable;

	/// @notice Fallback function to handle incoming calls with data
	/// @dev This function is called when msg.data is not empty
	fallback() external payable;

	function upgradeTo(address _newImplementation) external;
}
