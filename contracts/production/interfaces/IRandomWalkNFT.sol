// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { IERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";

/// ToDo-202412106-1 relates and/or applies.
interface IRandomWalkNFT is IERC721Enumerable {
	event TokenNameEvent(uint256 tokenId, string newName);
	event MintEvent(uint256 indexed tokenId, address indexed owner, bytes32 seed, uint256 price);
	event WithdrawalEvent(uint256 indexed tokenId, address destination, uint256 amount);

	/// @notice Sets the base URI for token metadata
	/// @param value The new value to set
	function setBaseURI(string memory value) external;

	function setTokenName(uint256 tokenId, string memory name) external;

	function getMintPrice() external view returns (uint256);

	function timeUntilSale() external view returns (uint256);

	function timeUntilWithdrawal() external view returns (uint256);

	function withdrawalAmount() external view returns (uint256);

	function withdraw() external;

	function mint() external payable;

	function walletOfOwner(address _owner) external view returns (uint256[] memory);

	function seedsOfOwner(address _owner) external view returns (bytes32[] memory);
}
