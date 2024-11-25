// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

import { IStakingWalletNftBase } from "./IStakingWalletNftBase.sol";

/// @title Staking wallet for RandomWalk NFTs.
/// @author Cosmic Signature Development Team.
/// @notice A contract implementing this interface allows users to stake their RandomWalk NFTs and win prizes.
/// Supports RandomWalk NFT staking and unstaking, as well as random staker selection.
interface IStakingWalletRandomWalkNft is IStakingWalletNftBase {
	/// @notice Emitted when an NFT is unstaked.
	/// @param stakeActionId Stake action ID.
	/// @param nftId Unstaked NFT ID.
	/// @param stakerAddress Staker (NFT owner) address.
	/// @param numStakedNfts Staked NFT count after this action.
	event NftUnstaked(
		uint256 indexed stakeActionId,
		// CosmicSignatureConstants.NftTypeCode nftTypeCode,
		uint256 indexed nftId,
		address indexed stakerAddress,
		uint256 numStakedNfts
	);

	/// @notice Unstakes an NFT.
	/// Transfers the NFT back to the owner and deletes the stake action.
	/// @param stakeActionId_ Stake action ID.
	function unstake(uint256 stakeActionId_) external;

	/// @notice Similarly to `unstake`, performs the instake action for zero or more stake actions in a single transaction.
	/// @param stakeActionIds_ Stake action IDs.
	function unstakeMany(uint256[] calldata stakeActionIds_) external;

	/// @notice Picks a random NFT based on the provided entropy.
	/// @param entropy_ A random number.
	/// @return Selected NFT staker address, or zero if there are no staked NFTs.
	/// @dev This method is named "if possible" because it does nothing when there are no staked NFTs.
	function pickRandomStakerAddressIfPossible(bytes32 entropy_) external view returns(address);
}
