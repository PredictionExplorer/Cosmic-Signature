// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ERC721Enumerable, ERC721} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { ICosmicSignature } from "./interfaces/ICosmicSignature.sol";

/// @dev Extends ERC721Enumerable and includes custom minting and metadata management
/// todo-0 Take a look at https://github.com/protofire/solhint/blob/develop/docs/rules/gas-consumption/gas-multitoken1155.md
/// todo-0 At least write a comment here and near RandomWalkNFT.
contract CosmicSignature is ERC721Enumerable, Ownable, ICosmicSignature {
	// #region State

	/// @notice Mapping of token IDs to their unique seeds
	mapping(uint256 => bytes32) public seeds;

	/// @notice Mapping of token IDs to their custom names
	mapping(uint256 => string) public tokenNames;

	/// @notice Entropy used for generating random seeds
	bytes32 public entropy;

	/// @notice The total number of tokens minted
	uint256 public numTokens = 0;

	/// @notice The base URI for token metadata
	string private _baseTokenURI;

	/// @notice Address of the CosmicGameProxy contract.
	address public immutable cosmicGameProxyContract;

	/// @notice IPFS link to the script that generates images and videos for each NFT based on seed
	string public tokenGenerationScriptURL = "ipfs://TBD";

	// #endregion

	/// @notice Initializes the CosmicSignature contract
	/// todo-1 Why do we need the above comment? Don't we know what a constructor does?
	/// @param _cosmicGameProxyContract The address of the CosmicGameProxy contract.
	/// ToDo-202408114-1 applies.
	constructor(address _cosmicGameProxyContract) ERC721("CosmicSignature", "CSS") Ownable(msg.sender) {
		require(_cosmicGameProxyContract != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		entropy = keccak256(abi.encode("newNFT", block.timestamp, blockhash(block.number - 1)));
		cosmicGameProxyContract = _cosmicGameProxyContract;
	}

	function setTokenGenerationScriptURL(string memory newTokenGenerationScriptURL) external override onlyOwner {
		tokenGenerationScriptURL = newTokenGenerationScriptURL;
		emit TokenGenerationScriptURLEvent(newTokenGenerationScriptURL);
	}

	function setBaseURI(string memory value) external override onlyOwner {
		_baseTokenURI = value;
		emit BaseURIEvent(value);
	}

	function setTokenName(uint256 tokenId, string memory name) external override {
		require(
			_isAuthorized(_ownerOf(tokenId), _msgSender(), tokenId),
			CosmicGameErrors.OwnershipError("setTokenName caller is not owner nor approved.", tokenId)
		);
		require(
			bytes(name).length <= 32,
			CosmicGameErrors.TokenNameLength("Token name is too long.", bytes(name).length)
		);
		tokenNames[tokenId] = name;
		emit TokenNameEvent(tokenId, name);
	}

	function mint(address owner, uint256 roundNum) external override returns (uint256) {
		require(owner != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		require(
			_msgSender() == cosmicGameProxyContract,
			// todo-1 We no longer have a contract named CosmicGameProxy, right? Rephrase?
			CosmicGameErrors.NoMintPrivileges("Only the CosmicGameProxy contract is permitted to mint.", msg.sender)
		);

		uint256 tokenId = numTokens;
		++ numTokens;
		entropy = keccak256(abi.encode(entropy, block.timestamp, blockhash(block.number - 1), tokenId, owner));
		seeds[tokenId] = entropy;
		// todo-1 We use safeMint to mint a Random Walk NFT? Why not here? At least explain in a comment.
		_mint(owner, tokenId);
		emit MintEvent(tokenId, owner, roundNum, entropy);
		return tokenId;
	}

	/// @return The base URI for token metadata
	function _baseURI() internal view override returns (string memory) {
		return _baseTokenURI;
	}
}
