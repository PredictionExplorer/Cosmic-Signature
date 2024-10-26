// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.26;

import { IERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";

/// @title NFT for the Cosmic Game ecosystem
/// @author Cosmic Game Development Team
/// @notice A contract implementing this interaface implements the CosmicSignature NFT
/// with unique features for the Cosmic Game
interface ICosmicSignature is IERC721Enumerable {
	/// @notice Emitted when a token's name is set or changed
	/// @param nftId The ID of the token
	/// @param newName The new name of the token
	event TokenNameEvent(uint256 indexed nftId, string newName);

	/// @notice Emitted when a new token is minted
	/// @param nftId The ID of the newly minted token
	/// @param owner The address that received the token
	/// @param roundNum The round number in which the token was minted
	/// @param seed The unique seed generated for the token
	event MintEvent(uint256 indexed nftId, address indexed owner, uint256 indexed roundNum, bytes32 seed);

	/// @notice Emitted when the token generation script URL is updated
	/// @param newURL The new URL for the token generation script
	event TokenGenerationScriptURLEvent(string newURL);

	/// @notice Emitted when the base URI is updated
	/// @param newURI The new base URI
	event BaseURIEvent(string newURI);

	/// @notice Sets the URL for the token generation script
	/// @param newTokenGenerationScriptURL The new URL to set
	function setTokenGenerationScriptURL(string memory newTokenGenerationScriptURL) external;

	/// @notice Sets the base URI for token metadata
	/// @param value The new value to set
	function setBaseURI(string memory value) external;

	/// @notice Allows token owners to set a custom name for their token
	/// @param nftId The ID of the token to name
	/// @param name The custom name to set for the token
	function setTokenName(uint256 nftId, string memory name) external;

	/// @notice Mints a new CosmicSignature token
	/// @dev Only callable by the CosmicGameProxy contract.
	/// @param owner The address that will receive the newly minted token
	/// @param roundNum The round number in which the token is minted
	/// @return The ID of the newly minted token
	function mint(address owner, uint256 roundNum) external returns (uint256);
}
