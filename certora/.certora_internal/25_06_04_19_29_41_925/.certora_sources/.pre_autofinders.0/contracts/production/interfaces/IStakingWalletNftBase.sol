// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { IAddressValidator } from "./IAddressValidator.sol";

interface IStakingWalletNftBase is IAddressValidator {
	/// @notice Stakes an NFT.
	/// Transfers the NFT to this contract and records a stake action.
	/// This method would revert if it already staked the given NFT in the past.
	/// @param nftId_ NFT to stake ID.
	function stake(uint256 nftId_) external;

	/// @notice Similarly to `stake`, stakes zero or more NFTs.
	/// @param nftIds_ NFT to stake IDs.
	/// It's OK if it's empty.
	function stakeMany(uint256[] calldata nftIds_) external;
}
