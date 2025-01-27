// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #endregion
// #region

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ERC721Enumerable, ERC721 } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureHelpers } from "./libraries/CosmicSignatureHelpers.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { ICosmicSignatureNft } from "./interfaces/ICosmicSignatureNft.sol";

// #endregion
// #region

contract CosmicSignatureNft is Ownable, ERC721Enumerable, AddressValidator, ICosmicSignatureNft {
	// #region State

	/// @notice The `CosmicSignatureGame` contract address.
	/// todo-1 Declare some other variables `immutable`.
	/// todo-1 But first think which variables should be changeable and which should not be.
	/// todo-1 Do we need to make any contracts upgradeable or replaceable?
	/// todo-1 If we use the `CREATE2` opcode to deploy contracrs we will know their addresses in advance,
	/// todo-1 so we will be able to declare all addresses `immutable`.
	/// todo-1 But the use of `CREATE2` won't be helpful because the Game anyway can't contain `immutable` variables.
	/// todo-1 In addition, do we want to have an option to deploy new versions of staking wallets?
	/// todo-1 There was a discussion about that on Slack.
	address public immutable game;

	/// @notice The base URI for NFT metadata.
	/// todo-1 Do we need to hardcode a valid value here?
	string private _nftBaseUri;

	/// @notice An IPFS link to a script that generates NFT images and videos based on the given seed.
	/// todo-1 Do we need to hardcode a valid value here?
	string public nftGenerationScriptUri = "ipfs://TBD";

	/// @notice For each NFT index (which equals NFT ID), contains NFT details.
	NftInfo[1 << 64] private _nftsInfo;

	// #endregion
	// #region `onlyGame`

	/// @dev Comment-202411253 applies.
	// modifier onlyGameMint() {
	modifier onlyGame() {
		require(
			_msgSender() == game,
			// CosmicSignatureErrors.NoMintPrivileges("Only the CosmicSignatureGame contract is permitted to mint an NFT.", _msgSender())
			CosmicSignatureErrors.UnauthorizedCaller("Only the CosmicSignatureGame contract is permitted to call this method.", _msgSender())
		);
		_;
	}

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @param game_ The `CosmicSignatureGame` contract address.
	/// todo-1 What about changing the symbol to "CSN"?
	constructor(address game_)
		Ownable(_msgSender())
		ERC721("CosmicSignatureNft", "CSS")
		providedAddressIsNonZero(game_) {
		game = game_;
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

	function mint(uint256 roundNum_, address nftOwnerAddress_, uint256 randomNumberSeed_) external override onlyGame returns(uint256) {
		uint256 nftId_ = _mint(roundNum_, nftOwnerAddress_, randomNumberSeed_);
		return nftId_;
	}

	// #endregion
	// #region `mintMany`

	function mintMany(uint256 roundNum_, address[] calldata nftOwnerAddresses_, uint256 randomNumberSeed_) external override onlyGame returns(uint256) {
		uint256 firstNftId_;
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

	function _mint(uint256 roundNum_, address nftOwnerAddress_, uint256 randomNumberSeed_) private returns(uint256) {
		uint256 nftId_ = totalSupply();

		// This will validate that `nftOwnerAddress_` is a nonzero.
		// Although, given that only the Game is permitted to call us, it's not going to provide a zero address.
		_mint(nftOwnerAddress_, nftId_);

		uint256 nftSeed_ = CosmicSignatureHelpers.generateRandomNumber(randomNumberSeed_);
		_nftsInfo[nftId_].seed = nftSeed_;
		emit NftMinted(roundNum_, nftOwnerAddress_, nftSeed_, nftId_);
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
		// require(
		// 	_isAuthorized(_ownerOf(nftId_), _msgSender(), nftId_),
		// 	CosmicSignatureErrors.CallerIsNotAuthorizedToManageNft("The caller is not authorized to manage this NFT.", nftId_)
		// );
		_checkAuthorized(_ownerOf(nftId_), _msgSender(), nftId_);
		require(
			bytes(nftName_).length <= CosmicSignatureConstants.COSMIC_SIGNATURE_NFT_NAME_LENGTH_MAX_LIMIT,
			CosmicSignatureErrors.TooLongNftName("NFT name is too long.", bytes(nftName_).length)
		);
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
