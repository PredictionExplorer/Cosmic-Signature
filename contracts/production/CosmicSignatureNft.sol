// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #endregion
// #region

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ERC721Enumerable, ERC721 } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { ICosmicSignatureNft } from "./interfaces/ICosmicSignatureNft.sol";

// #endregion
// #region

/// todo-1 Take a look at https://github.com/protofire/solhint/blob/develop/docs/rules/gas-consumption/gas-multitoken1155.md
/// todo-1 At least write a comment here and near `RandomWalkNFT` and/or near respective interfaces.
contract CosmicSignatureNft is Ownable, ERC721Enumerable, ICosmicSignatureNft {
	// #region State

	/// @notice The `CosmicSignatureGame` contract address.
	/// todo-1 Declare some other variables `immutable`.
	/// todo-1 But first think which variables should be changeable and which should not be.
	/// todo-1 Maybe allow to change this one.
	address public immutable game;

	/// @notice The base URI for NFT metadata.
	/// todo-1 Do we need to hardcode a valid value here?
	string private _nftBaseUri;

	/// @notice An IPFS link to a script that generates NFT images and videos based on the given seed.
	/// todo-1 Do we need to hardcode a valid value here?
	string public nftGenerationScriptUri = "ipfs://TBD";

	// /// @notice The total number of NFTs minted.
	// /// @dev todo-9 We don't need this because we can use `totalSupply` instead.
	// /// todo-9 Rename this to `numNfts`.
	// uint256 public numTokens = 0;

	// /// @notice Mapping of NFT IDs to their unique seeds.
	// /// todo-9 Rename this to `nftSeeds`.
	// mapping(uint256 nftId => bytes32 nftSeed) public seeds;

	// /// @notice Mapping of NFT IDs to their custom names.
	// /// todo-9 Rename this to `nftNames`.
	// mapping(uint256 nftId => string nftName) public tokenNames;

	/// @notice For each NFT index (which equals NFT ID), contains NFT details.
	NftInfo[1 << 64] private _nftsInfo;

	// /// @notice Entropy used to generate random seeds.
	// /// @dev todo-9 The type of this and other similar variables should be `uint256`.
	// bytes32 public entropy;

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @param game_ The `CosmicSignatureGame` contract address.
	/// todo-1 What about changing the symbol to "CSN"?
	constructor(address game_) Ownable(_msgSender()) ERC721("CosmicSignatureNft", "CSS") {
		require(game_ != address(0), CosmicSignatureErrors.ZeroAddress("Zero-address was given."));
		game = game_;
		// entropy = keccak256(abi.encode("newNFT", block.timestamp, blockhash(block.number - 1)));
		// entropy = bytes32(0x9b4631c9a4f4800392c74f3d2ee9e04fa8742b7f86e87b7d4b67fd7400d26f1e);
	}

	// #endregion
	// #region `setNftBaseUri`

	function setNftBaseUri(string memory newValue_) external override onlyOwner {
		_nftBaseUri = newValue_;
		emit NftBaseUriChanged(newValue_);
	}

	// #endregion
	// #region `_baseURI`

	function _baseURI() internal view override returns(string memory) {
		return _nftBaseUri;
	}

	// #endregion
	// #region `setNftGenerationScriptUri`

	function setNftGenerationScriptUri(string memory newValue_) external override onlyOwner {
		nftGenerationScriptUri = newValue_;
		emit NftGenerationScriptUriChanged(newValue_);
	}

	// #endregion
	// #region `mint`

	function mint(uint256 roundNum_, address nftOwnerAddress_, uint256 nftSeed_) external override returns(uint256) {
		// // This validation is unnecessary. `_mint` will perform it.
		// require(nftOwnerAddress_ != address(0), CosmicSignatureErrors.ZeroAddress("Zero-address was given."));

		// It could make sense to move this validation to the `onlyGame` modifier. But it uses a specific custom error. So let's leave it alone.
		require(
			_msgSender() == game,
			CosmicSignatureErrors.NoMintPrivileges("Only the CosmicSignatureGame contract is permitted to mint an NFT.", _msgSender())
		);

		// uint256 nftId_ = numTokens;
		uint256 nftId_ = totalSupply();
		// todo-1 We use safeMint to mint a Random Walk NFT? Why not here? At least explain in a comment.
		_mint(nftOwnerAddress_, nftId_);
		// ++ numTokens;
		// entropy = keccak256(abi.encode(entropy, block.timestamp, blockhash(block.number - 1), nftId_, nftOwnerAddress_));
		// seeds[nftId_] = entropy;
		_nftsInfo[nftId_].seed = nftSeed_;
		emit NftMinted(roundNum_, nftOwnerAddress_, /*uint256(entropy)*/ nftSeed_, nftId_);
		return nftId_;
	}

	// #endregion
	// #region `getNftInfo`

	function getNftInfo(uint256 nftId_) external view override returns(NftInfo memory) {
		return _nftsInfo[nftId_];
	}

	// #endregion
	// #region `setNftName`

	function setNftName(uint256 nftId_, string memory nftName_) external override {
		require(
			_isAuthorized(_ownerOf(nftId_), _msgSender(), nftId_),
			CosmicSignatureErrors.OwnershipError("setNftName caller is not authorized.", nftId_)
		);
		require(
			bytes(nftName_).length <= CosmicSignatureConstants.COSMIC_SIGNATURE_NFT_NAME_LENGTH_MAX_LIMIT,
			CosmicSignatureErrors.TokenNameLength("NFT name is too long.", bytes(nftName_).length)
		);
		// tokenNames[nftId_] = nftName_;
		_nftsInfo[nftId_].name = nftName_;
		emit NftNameChanged(nftId_, nftName_);
	}

	// #endregion
	// #region `getNftName`

	function getNftName(uint256 nftId_) external view override returns(string memory) {
		return _nftsInfo[nftId_].name;
	}

	// #endregion
	// #region `getNftSeed`

	function getNftSeed(uint256 nftId_) external view override returns(uint256) {
		return _nftsInfo[nftId_].seed;
	}

	// #endregion
}

// #endregion
