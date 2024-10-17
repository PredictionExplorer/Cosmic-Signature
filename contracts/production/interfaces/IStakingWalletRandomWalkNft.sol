// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { IStakingWalletNftBase } from "./IStakingWalletNftBase.sol";

/// @title Staking wallet for RandomWalk NFTs.
/// @author Cosmic Game Development Team.
/// @notice A contract implementing this interface allows users to stake their RandomWalk NFTs and win prizes.
/// @dev Supports RandomWalk NFT staking and unstaking, as well as random staker selection.
interface IStakingWalletRandomWalkNft is IStakingWalletNftBase {
	/// @notice Emitted when an NFT is unstaked.
	/// @param stakeActionId Stake action ID.
	/// @param nftId Unstaked NFT ID.
	/// @param stakerAddress Staker (NFT owner) address.
	/// @param numStakedNfts Staked NFT count after this action.
	event NftUnstaked(
		uint256 indexed stakeActionId,
		// CosmicGameConstants.NftTypeCode nftTypeCode,
		uint256 indexed nftId,
		address indexed stakerAddress,
		uint256 numStakedNfts
	);

	/// @notice Unstakes an NFT.
	/// @param stakeActionId_ Stake action ID.
	/// @dev Transfers the NFT back to the owner and deletes the stake action.
	function unstake(uint256 stakeActionId_) external;

	/// @notice Similar to `unstake`. Performs the instake action for zero or more stake actions in a single transaction.
	function unstakeMany(uint256[] calldata stakeActionIds_) external;

	/// @notice Picks a random staker based on the provided entropy.
	/// @param entropy_ A random number.
	/// @return Address of the selected staker, or zero if there are no staked NFTs.
	/// @dev This function is named "if possible" because it does nothing when there are no staked NFTs.
	function pickRandomStakerIfPossible(bytes32 entropy_) external view returns (address);
}
