// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGameErrors } from "./CosmicGameErrors.sol";

/// @title CosmicSignature - NFT for the Cosmic Game ecosystem
/// @author Cosmic Game Development Team
/// @notice This contract implements the CosmicSignature NFT with unique features for the Cosmic Game
/// @dev Extends ERC721Enumerable and includes custom minting and metadata management
contract CosmicSignature is ERC721Enumerable, Ownable {
	/// @notice Mapping of token IDs to their unique seeds
	mapping(uint256 => bytes32) public seeds;

	/// @notice Mapping of token IDs to their custom names
	mapping(uint256 => string) public tokenNames;

	/// @notice Entropy used for generating random seeds
	bytes32 public entropy;

	/// @notice Total number of tokens minted
	uint256 public numTokens = 0;

	/// @notice Base URI for token metadata
	string private _baseTokenURI;

	/// @notice Address of the CosmicGameProxy contract.
	address public immutable cosmicGameProxyContract;

	/// @notice IPFS link to the script that generates images and videos for each NFT based on seed
	string public tokenGenerationScriptURL = "ipfs://TBD";

	/// @notice Emitted when a token's name is set or changed
	/// @param tokenId The ID of the token
	/// @param newName The new name of the token
	event TokenNameEvent(uint256 indexed tokenId, string newName);

	/// @notice Emitted when a new token is minted
	/// @param tokenId The ID of the newly minted token
	/// @param owner The address that received the token
	/// @param roundNum The round number in which the token was minted
	/// @param seed The unique seed generated for the token
	event MintEvent(uint256 indexed tokenId, address indexed owner, uint256 indexed roundNum, bytes32 seed);

	/// @notice Emitted when the token generation script URL is updated
	/// @param newURL The new URL for the token generation script
	event TokenGenerationScriptURLEvent(string newURL);

	/// @notice Emitted when the base URI is updated
	/// @param newURI The new base URI
	event BaseURIEvent(string newURI);

	/// @notice Initializes the CosmicSignature contract
	/// @param _cosmicGameProxyContract The address of the CosmicGameProxy contract.
	constructor(address _cosmicGameProxyContract) ERC721("CosmicSignature", "CSS") {
		require(_cosmicGameProxyContract != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		entropy = keccak256(abi.encode("newNFT", block.timestamp, blockhash(block.number - 1)));
		cosmicGameProxyContract = _cosmicGameProxyContract;
	}

	/// @notice Sets the URL for the token generation script
	/// @param newTokenGenerationScriptURL The new URL to set
	function setTokenGenerationScriptURL(string memory newTokenGenerationScriptURL) external onlyOwner {
		tokenGenerationScriptURL = newTokenGenerationScriptURL;
		emit TokenGenerationScriptURLEvent(newTokenGenerationScriptURL);
	}

	/// @notice Sets the base URI for token metadata
	/// @param baseURI The new base URI to set
	function setBaseURI(string memory baseURI) external onlyOwner {
		_baseTokenURI = baseURI;
		emit BaseURIEvent(baseURI);
	}

	/// @notice Allows token owners to set a custom name for their token
	/// @param tokenId The ID of the token to name
	/// @param name The custom name to set for the token
	function setTokenName(uint256 tokenId, string memory name) external {
		require(
			_isApprovedOrOwner(_msgSender(), tokenId),
			CosmicGameErrors.OwnershipError("setTokenName caller is not owner nor approved.", tokenId)
		);
		require(
			bytes(name).length <= 32,
			CosmicGameErrors.TokenNameLength("Token name is too long.", bytes(name).length)
		);
		tokenNames[tokenId] = name;
		emit TokenNameEvent(tokenId, name);
	}

	/// @notice Mints a new CosmicSignature token
	/// @dev Only callable by the CosmicGameProxy contract.
	/// @param owner The address that will receive the newly minted token
	/// @param roundNum The round number in which the token is minted
	/// @return The ID of the newly minted token
	function mint(address owner, uint256 roundNum) external returns (uint256) {
		require(owner != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		require(
			_msgSender() == cosmicGameProxyContract,
			CosmicGameErrors.NoMintPrivileges("Only the CosmicGameProxy contract can mint.", msg.sender)
		);

		uint256 tokenId = numTokens;
		numTokens += 1;

		entropy = keccak256(abi.encode(entropy, block.timestamp, blockhash(block.number - 1), tokenId, owner));
		seeds[tokenId] = entropy;
		_mint(owner, tokenId);

		emit MintEvent(tokenId, owner, roundNum, entropy);
		return tokenId;
	}

	/// @notice Returns the base URI for token metadata
	/// @return The base URI string
	function _baseURI() internal view virtual override returns (string memory) {
		return _baseTokenURI;
	}
}
