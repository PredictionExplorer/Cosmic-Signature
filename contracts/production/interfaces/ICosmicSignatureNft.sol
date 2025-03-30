// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { IERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import { IAddressValidator } from "./IAddressValidator.sol";

/// @title The Cosmic Signature ecosystem NFT.
/// @author The Cosmic Signature Development Team.
/// @notice A contract implementing this interaface implements the Cosmic Signature NFT with unique features
/// for the Cosmic Signature ecosystem, in particular, custom minting and metadata management.
/// @dev Issue. It could make sense to derive this contract from `ERC721Permit`,
/// but OpenZeppelin doesn't include such a contract.
/// Issue. See https://github.com/protofire/solhint/blob/develop/docs/rules/gas-consumption/gas-multitoken1155.md .
/// 
/// todo-1 +++ Review https://wizard.openzeppelin.com/#erc721
/// 
/// todo-1 +++ Research modern features that we might need to implement.
/// 
/// todo-1 +++ Ask ChatGPT:
/// todo-1 +++ How to make an ERC-721 contract compatible with NFT marketplaces?
/// todo-1 Test manually that we can trade this on OpenSea and the others.
interface ICosmicSignatureNft is IERC721Enumerable, IAddressValidator {
	/// @notice Details about a Cosmic Signature NFT.
	struct NftInfo {
		/// @notice The custom name set for the NFT.
		/// It's not required to provide one.
		/// If the user doesn't provide a name for the NFT, this value will stay empty.
		string name;

		/// @notice A unique seed generated for the NFT.
		/// @dev One might prefer this parameter to be a byte-array or `bytes32`, but for now it's simpler to treat it as a number,
		/// even though `bytes32` would probably not be any less efficient. It would make sense to change this parameter type
		/// if we need more than 32 bytes.
		uint256 seed;
	}

	/// @dev
	/// [Comment-202501144]
	/// This is similar to `ICosmicSignatureToken.MintSpec` and `ICosmicSignatureToken.MintOrBurnSpec`.
	/// Issue. This is not used.
	/// Something like this can be used to implement the transfer of multiple NFTs in a single transaction.
	/// A method offering such a functionality could be named `transferFromMany`.
	/// But, I feel, such a feature is not a high priority, so I have no plans to implement it.
	/// Comment-202501145 relates.
	/// [/Comment-202501144]
	struct TransferFromSpec {
		address from;
		address to;
		uint256 nftId;
	}

	/// @notice Emitted when `nftBaseUri` is changed.
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
	/// It may be empty.
	event NftNameChanged(uint256 indexed nftId, string nftName);

	/// @notice Sets `nftBaseUri`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setNftBaseUri(string calldata newValue_) external;

	/// @notice Sets `nftGenerationScriptUri`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setNftGenerationScriptUri(string calldata newValue_) external;

	/// @notice Mints a new Cosmic Signature NFT.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// @param roundNum_ The current bidding round number.
	/// @param nftOwnerAddress_ The address that will receive the NFT.
	/// @param randomNumberSeed_ A value to be used to generate a unique seed for the NFT.
	/// [Comment-202501148]
	/// Random number seed and NFT seed are different things. The former is used to generate the latter.
	/// [/Comment-202501148]
	/// Assuming that the caller hasn't used this particular value.
	/// @return The newly minted NFT ID.
	function mint(uint256 roundNum_, address nftOwnerAddress_, uint256 randomNumberSeed_) external returns (uint256);

	/// @notice Mints zero or more new Cosmic Signature NFTs.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// @param roundNum_ The current bidding round number.
	/// @param nftOwnerAddresses_ The addresses that will receive the NFTs.
	/// It's OK if it contains duplicates.
	/// @param randomNumberSeed_ A value to be used to generate unique seeds for the NFTs.
	/// Comment-202501148 applies.
	/// Assuming that the caller hasn't used this particular value or subsequent values.
	/// @return The first newly minted NFT ID. Further minted NFT IDs are sequential.
	/// If `nftOwnerAddresses_` is empty the return value is indeterminate.
	function mintMany(uint256 roundNum_, address[] calldata nftOwnerAddresses_, uint256 randomNumberSeed_) external returns (uint256);

	/// @param nftId_ NFT ID.
	/// It shall be less than `totalSupply()`. Otherwise the return value is indeterminate.
	function getNftInfo(uint256 nftId_) external view returns (NftInfo memory);

	/// @notice Allows the given NFT owner or authorized caller to set a custom name for an NFT.
	/// @param nftId_ NFT ID.
	/// It shall be less than `totalSupply()`. Otherwise the transaction would revert.
	/// @param nftName_ The custom name to set for the NFT.
	/// It may be empty.
	function setNftName(uint256 nftId_, string calldata nftName_) external;

	/// @param nftId_ NFT ID.
	/// It shall be less than `totalSupply()`. Otherwise the return value is indeterminate.
	function getNftName(uint256 nftId_) external view returns (string memory);

	/// @param nftId_ NFT ID.
	/// It shall be less than `totalSupply()`. Otherwise the return value is indeterminate.
	function getNftSeed(uint256 nftId_) external view returns (uint256);
}
