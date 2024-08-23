// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.26;

import { ERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

/// @dev We don't currently need an `interface` for this to implement.
abstract contract MyERC721Enumerable is ERC721Enumerable {
	// todo-0 ChatGPT provided this code. Is it correct?
	// todo-0 The code is almost the same as it was in the old OpenZeppelin, but see todos below.
	// todo-0 See old code at https://www.npmjs.com/package/@openzeppelin/contracts/v/4.9.6?activeTab=code
	/// @notice This method was removed from OpenZeppelin 5.
	function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
		address owner = ownerOf(tokenId);
		// todo-0 Are we happy with the order in which `getApproved` and `isApprovedForAll` are called?
		// todo-0 Would the code be more efficient in a typical case if those calls were swapped?
		// todo-0 In the old OpenZeppelin the call order was the opposite.
		return spender == owner || getApproved(tokenId) == spender || isApprovedForAll(owner, spender);
	}
}
