// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.27;

import { IERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";

/// @title NFT for the Cosmic Signature ecosystem.
/// @author The Cosmic Signature Development Team.
/// @notice A contract implementing this interaface implements the CosmicSignature NFT
/// with unique features for the Cosmic Signature ecosystem.
interface ICosmicSignatureNft is IERC721Enumerable {
	/// @notice Emitted when the token generation script URL is updated
	/// @param newURL The new URL for the token generation script
	/// todo-1 Rename the above param to `newValue`.
	/// todo-1 Rename this to `NftGenerationScriptUriChanged`.
	event TokenGenerationScriptURLEvent(string newURL);

	/// @notice Emitted when the base URI is updated
	/// @param newURI The new base URI
	/// todo-1 Rename the above param to `newValue`.
	/// todo-1 Rename this to `NftBaseUriChanged`.
	event BaseURIEvent(string newURI);

	/// @notice Emitted when a new token is minted
	/// @param nftId The ID of the newly minted token
	/// @param owner The address that received the token
	/// todo-1 Rename the above param to `ownerAddress`.
	/// @param roundNum The bidding round number in which the token was minted.
	/// todo-1 Do we actually need `roundNum` here?
	/// @param seed The unique seed generated for the token
	/// todo-1 Rename the above param to `nftSeed`.
	/// todo-1 Reorder params: roundNum, owner, nftId, seed
	/// todo-1 Rename this to `NftMinted`.
	event MintEvent(uint256 indexed nftId, address indexed owner, uint256 indexed roundNum, bytes32 seed);

	/// @notice Emitted when a token's name is set or changed
	/// @param nftId The ID of the token
	/// @param newName The new name of the token
	/// todo-1 Rename the above param to `nftNewName`.
	/// todo-1 Rename this to `NftNameChanged`.
	event TokenNameEvent(uint256 indexed nftId, string newName);

	/// @notice Sets the URL for the token generation script
	/// @param newTokenGenerationScriptURL The new URL to set
	/// todo-1 Rename the above param to `newValue_`.
	/// todo-1 Rename this to `setNftGenerationScriptUri`.
	function setTokenGenerationScriptURL(string memory newTokenGenerationScriptURL) external;

	/// @notice Sets the base URI for token metadata
	/// @param newValue_ The new value to set
	/// todo-1 Rename this to `setNftBaseUri`.
	function setBaseURI(string memory newValue_) external;

	/// @notice Allows token owners to set a custom name for their token
	/// @param nftId The ID of the token to name
	/// todo-1 Rename the above param to `nftId_`.
	/// @param name The custom name to set for the token
	/// todo-1 Rename the above param to `nftNewName_`.
	/// todo-1 Rename this to `setNftName`.
	function setTokenName(uint256 nftId, string memory name) external;

	/// @notice Mints a new CosmicSignature NFT.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// @param owner The address that will receive the newly minted token
	/// todo-1 Rename the above param to `ownerAddress_`.
	/// @param roundNum The bidding round number in which the token is minted.
	/// todo-1 Rename the above param to `roundNum_`.
	/// @return The ID of the newly minted NFT
	/// @dev todo-1 Reorder `roundNum` to the beginning? Or just eliminate it?
	function mint(address owner, uint256 roundNum) external returns (uint256);
}
