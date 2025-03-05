// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { IStakingWalletNftBase } from "./IStakingWalletNftBase.sol";

/// @title Staking wallet for RandomWalk NFTs.
/// @author The Cosmic Signature Development Team.
/// @notice A contract implementing this interface allows users to stake their RandomWalk NFTs and win prizes.
/// Supports RandomWalk NFT staking and unstaking, as well as random staker selection.
interface IStakingWalletRandomWalkNft is IStakingWalletNftBase {
	/// @notice Emitted when an NFT is unstaked.
	/// @param stakeActionId Stake action ID.
	/// @param nftId Unstaked NFT ID.
	/// @param stakerAddress Staker (NFT owner) address.
	/// todo-1 ??? Reorder the above param to before `nftId`.
	/// @param numStakedNfts Staked NFT count after this action.
	event NftUnstaked(
		uint256 indexed stakeActionId,
		// NftTypeCode /*indexed*/ nftTypeCode,
		uint256 indexed nftId,
		address indexed stakerAddress,
		uint256 numStakedNfts
	);

	/// @notice Unstakes an NFT.
	/// Deletes the stake action; transfers the NFT back to the staker (NFT owner).
	/// Only the staker who staked the given NFT is permitted to call this method.
	/// @param stakeActionId_ Stake action ID.
	function unstake(uint256 stakeActionId_) external;

	/// @notice Similarly to `unstake`, unstakes zero or more NFTs.
	/// @param stakeActionIds_ Stake action IDs.
	/// It's OK if it's empty.
	function unstakeMany(uint256[] calldata stakeActionIds_) external;

	/// @notice Randomly picks zero or more NFTs and then their owner addresses, based on the provided random number seed.
	/// @param numStakerAddresses_ The number of random staker addresses to pick and return.
	/// It's OK if it's zero.
	/// @param randomNumberSeed_ Random number seed.
	/// @return Selected NFT staker addresses, or an empty array if there are no staked NFTs.
	/// The result can contain duplicates.
	/// @dev This method is named "if possible" because it does nothing when there are no staked NFTs.
	function pickRandomStakerAddressesIfPossible(uint256 numStakerAddresses_, uint256 randomNumberSeed_) external view returns (address[] memory);
}
