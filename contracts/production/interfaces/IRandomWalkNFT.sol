// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.26;

import { IMyERC721Enumerable } from "./IMyERC721Enumerable.sol";

interface IRandomWalkNFT is IMyERC721Enumerable {
	event TokenNameEvent(uint256 tokenId, string newName);
	event MintEvent(uint256 indexed tokenId, address indexed owner, bytes32 seed, uint256 price);
	event WithdrawalEvent(uint256 indexed tokenId, address destination, uint256 amount);

   function setBaseURI(string memory baseURI) external;

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