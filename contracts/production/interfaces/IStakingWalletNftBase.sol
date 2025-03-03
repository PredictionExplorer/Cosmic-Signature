// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { IAddressValidator } from "./IAddressValidator.sol";

interface IStakingWalletNftBase is IAddressValidator {
	enum NftTypeCode {
		/// @notice This denotes an uninitialized or invalid value.
		None,

		CosmicSignature,
		RandomWalk
	}

	/// @notice Emitted when an NFT is staked.
	/// @param stakeActionId Stake action ID.
	/// @param nftTypeCode NFT type code.
	/// @param nftId Staked NFT ID.
	/// @param stakerAddress Staker (NFT owner) address.
	/// todo-1 ??? Reorder the above param to before `nftTypeCode`.
	/// @param numStakedNfts Staked NFT count after this action.
	event NftStaked(
		uint256 indexed stakeActionId,
		NftTypeCode nftTypeCode,
		uint256 indexed nftId,
		address indexed stakerAddress,
		uint256 numStakedNfts
	);

	/// @notice Stakes an NFT.
	/// Transfers the NFT to this contract and records a stake action.
	/// @param nftId_ NFT to stake ID.
	/// Comment-202411023 relates and/or applies.
	function stake(uint256 nftId_) external;

	/// @notice Similarly to `stake`, stakes zero or more NFTs.
	/// @param nftIds_ NFT to stake IDs.
	/// It's OK if it's empty.
	function stakeMany(uint256[] calldata nftIds_) external;
}
