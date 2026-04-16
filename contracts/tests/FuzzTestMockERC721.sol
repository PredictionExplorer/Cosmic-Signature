// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.34;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice Minimal mintable ERC-721 for Hardhat fuzz tests (`FuzzTest.js`). Not used in production.
contract FuzzTestMockERC721 is ERC721 {
	uint256 private nextTokenId = 1;

	constructor() ERC721("FuzzTest ERC721", "FZ721") {
		// Doing nothing.
	}

	/// @notice Mints the next token id to `to_` (test-only).
	function mint(address to_) external returns (uint256 nftId_) {
		nftId_ = nextTokenId;
		unchecked {
			++ nextTokenId;
		}
		_mint(to_, nftId_);
	}
}
