// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// import { IERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";

/// @title The Cosmic Signature ecosystem NFT.
/// @author The Cosmic Signature Development Team.
/// @notice A contract implementing this interaface implements the CosmicSignature NFT with unique features
/// for the Cosmic Signature ecosystem, in particular, custom minting and metadata management.
/// [ToDo-202412106-1]
/// I feel that it's unnecessary to derive this from `IERC721Enumerable`. So I have commented it out.
/// On the other hand, maybe uncomment it and also derive `ICosmicSignatureToken` and `ICosmicSignatureDao`
/// from their respective interfaces too.
/// Take a look at `IRandomWalkNFT` as well. Possibly write comment there.
/// [/ToDo-202412106-1]
interface ICosmicSignatureNft /*is IERC721Enumerable*/ {
	/// @notice Details about a CosmicSignature NFT.
	struct NftInfo {
		/// @notice The custom name set for the NFT.
		/// It's not required to provide one.
		string name;

		/// @notice A unique seed generated for the NFT.
		/// todo-1 I changed seed type from `bytes32` to `uint256`. Did doing so break anything?
		uint256 seed;
	}

	/// @notice Emitted when `_nftBaseUri` is changed.
	/// @param newValue The new value.
	event NftBaseUriChanged(string newValue);

	/// @notice Emitted when `nftGenerationScriptUri` is changed.
	/// @param newValue The new value.
	event NftGenerationScriptUriChanged(string newValue);

	/// @notice Emitted when a new NFT is minted.
	/// @param roundNum The current bidding round number.
	/// @param nftOwnerAddress The address that received the NFT.
	/// @param nftSeed A unique seed generated for the NFT.
	/// @param nftId The newly minted NFT ID.
	event NftMinted(uint256 indexed roundNum, address indexed nftOwnerAddress, uint256 nftSeed, uint256 indexed nftId);

	/// @notice Emitted when an NFT name is set for the first time or changed.
	/// @param nftId NFT ID.
	/// @param nftName The custom name set for the NFT.
	event NftNameChanged(uint256 indexed nftId, string nftName);

	/// @notice Sets `_nftBaseUri`.
	/// @param newValue_ The new value.
	function setNftBaseUri(string memory newValue_) external;

	/// @notice Sets `nftGenerationScriptUri`.
	/// @param newValue_ The new value.
	function setNftGenerationScriptUri(string memory newValue_) external;

	/// @notice Mints a new CosmicSignature NFT.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// @param roundNum_ The current bidding round number.
	/// @param nftOwnerAddress_ The address that will receive the NFT.
	/// @param nftSeed_ A unique seed generated for the NFT.
	/// @return The newly minted NFT ID.
	function mint(uint256 roundNum_, address nftOwnerAddress_, uint256 nftSeed_) external returns(uint256);

	/// @param nftId_ NFT ID.
	/// It shall be less than `totalSupply()`. Otherwise the behavior is undefined.
	function getNftInfo(uint256 nftId_) external view returns(NftInfo memory);

	/// @notice Allows an NFT owner or authorized caller to set a custom name for an NFT.
	/// @param nftId_ NFT ID.
	/// @param nftName_ The custom name to set for the NFT.
	function setNftName(uint256 nftId_, string memory nftName_) external;

	/// @param nftId_ NFT ID.
	/// It shall be less than `totalSupply()`. Otherwise the behavior is undefined.
	function getNftName(uint256 nftId_) external view returns(string memory);

	/// @param nftId_ NFT ID.
	/// It shall be less than `totalSupply()`. Otherwise the behavior is undefined.
	function getNftSeed(uint256 nftId_) external view returns(uint256);
}
