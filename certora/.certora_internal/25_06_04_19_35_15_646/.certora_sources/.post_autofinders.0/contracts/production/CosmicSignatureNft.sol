// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

// #endregion
// #region

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { RandomNumberHelpers } from "./libraries/RandomNumberHelpers.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { ICosmicSignatureNft } from "./interfaces/ICosmicSignatureNft.sol";

// #endregion
// #region

/// @dev
/// todo-1 +++ Review again what can possibly fail here and cause a transaction reversal.
contract CosmicSignatureNft is Ownable, ERC721Enumerable, AddressValidator, ICosmicSignatureNft {
	// #region State

	/// @notice The `CosmicSignatureGame` contract address.
	address public immutable game;

	/// @notice The base URI for NFT metadata.
	/// Comment-202411064 applies.
	string public nftBaseUri = CosmicSignatureConstants.COSMIC_SIGNATURE_NFT_DEFAULT_NFT_BASE_URI;

	/// @notice An IPFS link to a script that generates NFT images and videos based on the given seed.
	/// Comment-202411064 applies.
	string public nftGenerationScriptUri = CosmicSignatureConstants.COSMIC_SIGNATURE_NFT_DEFAULT_NFT_GENERATION_SCRIPT_URI;

	/// @notice For each NFT index (which equals NFT ID), contains NFT details.
	NftInfo[1 << 64] private _nftsInfo;

	// #endregion
	// #region `_onlyGame`

	/// @dev Comment-202411253 applies.
	// modifier _onlyGameMint() {
	modifier _onlyGame() {
		_checkOnlyGame();
		_;
	}

	// #endregion
	// #region `_checkOnlyGame`

	/// @dev Comment-202411253 applies.
	function _checkOnlyGame() private view {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01950000, 1037618708885) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01950001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01950004, 0) }
		if (_msgSender() != game) {
			// revert CosmicSignatureErrors.NoMintPrivileges("Only the CosmicSignatureGame contract is permitted to mint an NFT.", _msgSender());
			revert CosmicSignatureErrors.UnauthorizedCaller("Only the CosmicSignatureGame contract is permitted to call this method.", _msgSender());
		}
	}

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @param game_ The `CosmicSignatureGame` contract address.
	constructor(address game_)
		_providedAddressIsNonZero(game_)
		Ownable(_msgSender())
		ERC721("CosmicSignatureNft", "CSN") {
		game = game_;
	}

	// #endregion
	// #region `setNftBaseUri`

	function setNftBaseUri(string calldata newValue_) external override onlyOwner {
		nftBaseUri = newValue_;
		emit NftBaseUriChanged(newValue_);
	}

	// #endregion
	// #region `_baseURI`

	function _baseURI() internal view override returns (string memory) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01960000, 1037618708886) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01960001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01960004, 0) }
		return nftBaseUri;
	}

	// #endregion
	// #region `setNftGenerationScriptUri`

	function setNftGenerationScriptUri(string calldata newValue_) external override onlyOwner {
		nftGenerationScriptUri = newValue_;
		emit NftGenerationScriptUriChanged(newValue_);
	}

	// #endregion
	// #region `mint`

	function mint(uint256 roundNum_, address nftOwnerAddress_, uint256 randomNumberSeed_) external override _onlyGame returns (uint256) {
		uint256 nftId_ = _mint(roundNum_, nftOwnerAddress_, randomNumberSeed_);assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000e3,nftId_)}
		return nftId_;
	}

	// #endregion
	// #region `mintMany`

	function mintMany(uint256 roundNum_, address[] calldata nftOwnerAddresses_, uint256 randomNumberSeed_) external override _onlyGame returns (uint256) {
		uint256 firstNftId_;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000e4,firstNftId_)}
		if (nftOwnerAddresses_.length > 0) {
			firstNftId_ = _mint(roundNum_, nftOwnerAddresses_[0], randomNumberSeed_);
			for ( uint256 index_ = 1; index_ < nftOwnerAddresses_.length; ++ index_ ) {
				unchecked { ++ randomNumberSeed_; }
				_mint(roundNum_, nftOwnerAddresses_[index_], randomNumberSeed_);
			}
		}
		return firstNftId_;
	}

	// #endregion
	// #region `_mint`

	function _mint(uint256 roundNum_, address nftOwnerAddress_, uint256 randomNumberSeed_) private returns (uint256) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01970000, 1037618708887) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01970001, 3) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01970005, 73) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01976002, randomNumberSeed_) }
		uint256 nftId_ = totalSupply();assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000e5,nftId_)}

		// This will validate that `nftOwnerAddress_` is a nonzero.
		// Although, given that only the Game is permitted to call us, it's not going to provide a zero address.
		_mint(nftOwnerAddress_, nftId_);

		uint256 nftSeed_ = RandomNumberHelpers.generateRandomNumber(randomNumberSeed_);assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000e6,nftSeed_)}
		_nftsInfo[nftId_].seed = nftSeed_;
		emit NftMinted(roundNum_, nftOwnerAddress_, nftSeed_, nftId_);
		return nftId_;
	}

	// #endregion
	// #region `getNftInfo`

	function getNftInfo(uint256 nftId_) external view override returns (NftInfo memory) {
		return _nftsInfo[nftId_];
	}

	// #endregion
	// #region `setNftName`

	function setNftName(uint256 nftId_, string calldata nftName_) external override {
		// require(
		// 	_isAuthorized(_ownerOf(nftId_), _msgSender(), nftId_),
		// 	CosmicSignatureErrors.CallerIsNotAuthorizedToManageNft("The caller is not authorized to manage this NFT.", nftId_)
		// );
		_checkAuthorized(_ownerOf(nftId_), _msgSender(), nftId_);
		if (bytes(nftName_).length > CosmicSignatureConstants.COSMIC_SIGNATURE_NFT_NFT_NAME_LENGTH_MAX_LIMIT) {
			revert CosmicSignatureErrors.TooLongNftName("NFT name is too long.", bytes(nftName_).length);
		}
		_nftsInfo[nftId_].name = nftName_;
		emit NftNameChanged(nftId_, nftName_);
	}

	// #endregion
	// #region `getNftName`

	function getNftName(uint256 nftId_) external view override returns (string memory) {
		return _nftsInfo[nftId_].name;
	}

	// #endregion
	// #region `getNftSeed`

	function getNftSeed(uint256 nftId_) external view override returns (uint256) {
		return _nftsInfo[nftId_].seed;
	}

	// #endregion
}

// #endregion
