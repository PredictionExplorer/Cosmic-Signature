// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice Minimal mintable ERC-721.
contract FuzzTestMockErc721 is ERC721 {
	uint256 private _nextNftId = 1;

	constructor() ERC721("FuzzTest ERC721", "FZ721") {
		// Doing nothing.
	}

	/// @notice Mints an NFT to any address.
	function mint(address to_) external returns (uint256 nftId_) {
		nftId_ = _nextNftId;
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			_nextNftId = nftId_ + 1;
		}
		_mint(to_, nftId_);
	}
}
