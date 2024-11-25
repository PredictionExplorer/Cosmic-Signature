// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.27;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ERC721Enumerable, ERC721} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { ICosmicSignatureNft } from "./interfaces/ICosmicSignatureNft.sol";

/// @dev Extends ERC721Enumerable and includes custom minting and metadata management
/// todo-0 Take a look at https://github.com/protofire/solhint/blob/develop/docs/rules/gas-consumption/gas-multitoken1155.md
/// todo-0 At least write a comment here and near RandomWalkNFT.
contract CosmicSignatureNft is ERC721Enumerable, Ownable, ICosmicSignatureNft {
	// #region State

	/// @notice Mapping of token IDs to their unique seeds
	mapping(uint256 => bytes32) public seeds;

	/// @notice Mapping of token IDs to their custom names
	mapping(uint256 => string) public tokenNames;

	/// @notice Entropy used for generating random seeds
	/// todo-1 Allow the game (`onlyGame`) to provide entropy as a parameter. It would allow to optimize the game.
	bytes32 public entropy;

	/// @notice The total number of tokens minted
	/// todo-1 We inherited `totalSupply`. Does it return the same value? If so can I eliminate this?
	/// todo-1 If I do that write a comment in RWalk near the respective variable that it's possible to eliminate it.
	uint256 public numTokens = 0;

	/// @notice The base URI for token metadata
	string private _baseTokenURI;

	/// @notice The `CosmicSignatureGame` contract address.
	/// todo-1 Declare some other variables `immutable`.
	address public immutable game;

	/// @notice IPFS link to the script that generates images and videos for each NFT based on seed
	string public tokenGenerationScriptURL = "ipfs://TBD";

	// #endregion

	/// @notice Initializes the CosmicSignatureNft contract
	/// todo-1 Why do we need the above comment? Don't we know what a constructor does?
	/// @param game_ The `CosmicSignatureGame` contract address.
	/// todo-1 What about changing the symbol to "CSN"?
	/// ToDo-202408114-1 applies.
	constructor(address game_) ERC721("CosmicSignatureNft", "CSS") Ownable(_msgSender()) {
		require(game_ != address(0), CosmicSignatureErrors.ZeroAddress("Zero-address was given."));
		game = game_;
		// entropy = keccak256(abi.encode("newNFT", block.timestamp, blockhash(block.number - 1)));
		entropy = bytes32(0x9b4631c9a4f4800392c74f3d2ee9e04fa8742b7f86e87b7d4b67fd7400d26f1e);
	}

	function setTokenGenerationScriptURL(string memory newTokenGenerationScriptURL) external override onlyOwner {
		tokenGenerationScriptURL = newTokenGenerationScriptURL;
		emit TokenGenerationScriptURLEvent(newTokenGenerationScriptURL);
	}

	function setBaseURI(string memory value) external override onlyOwner {
		_baseTokenURI = value;
		emit BaseURIEvent(value);
	}

	function setTokenName(uint256 nftId, string memory name) external override {
		require(
			_isAuthorized(_ownerOf(nftId), _msgSender(), nftId),
			CosmicSignatureErrors.OwnershipError("setTokenName caller is not authorized.", nftId)
		);
		require(
			bytes(name).length <= 32,
			CosmicSignatureErrors.TokenNameLength("Token name is too long.", bytes(name).length)
		);
		tokenNames[nftId] = name;
		emit TokenNameEvent(nftId, name);
	}

	function mint(address owner, uint256 roundNum) external override returns (uint256) {
		require(owner != address(0), CosmicSignatureErrors.ZeroAddress("Zero-address was given."));
		// todo-1 Move this validation to the `onlyGame` modifier.
		require(
			_msgSender() == game,
			CosmicSignatureErrors.NoMintPrivileges("Only the CosmicSignatureGame contract is permitted to mint.", _msgSender())
		);

		uint256 nftId = numTokens;
		++ numTokens;
		entropy = keccak256(abi.encode(entropy, block.timestamp, blockhash(block.number - 1), nftId, owner));
		seeds[nftId] = entropy;
		// todo-1 We use safeMint to mint a Random Walk NFT? Why not here? At least explain in a comment.
		_mint(owner, nftId);
		emit MintEvent(nftId, owner, roundNum, entropy);
		return nftId;
	}

	/// @return The base URI for token metadata
	function _baseURI() internal view override returns (string memory) {
		return _baseTokenURI;
	}
}
