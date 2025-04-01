// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { IStakingWalletNftBase } from "./IStakingWalletNftBase.sol";

/// @title Staking wallet for Cosmic Signature NFTs.
/// @author The Cosmic Signature Development Team.
/// @notice A contract implementing this interface allows users to stake their Cosmic Signature NFTs and earn rewards.
/// Supports Cosmic Signature NFT staking and unstaking, as well as staking reward deposits and distribution.
interface IStakingWalletCosmicSignatureNft is IStakingWalletNftBase {
	/// @notice Emitted when an NFT is staked.
	/// @param stakeActionId Stake action ID.
	/// @param nftId Staked NFT ID.
	/// @param stakerAddress Staker (NFT owner) address.
	/// Comment-202504011 applies.
	/// @param numStakedNfts Staked NFT count after this action.
	/// @param rewardAmountPerStakedNft The current all-time cumulative staking ETH reward amount per staked NFT.
	event NftStaked(
		uint256 indexed stakeActionId,
		uint256 indexed nftId,
		address indexed stakerAddress,
		uint256 numStakedNfts,
		uint256 rewardAmountPerStakedNft
	);

	/// @notice Emitted when an NFT is unstaked and a staking reward is paid to the staker.
	/// @param actionCounter An always increasing by at least 1 unique ID of this action.
	/// @param stakeActionId Stake action ID.
	/// @param nftId Unstaked NFT ID.
	/// @param stakerAddress Staker (NFT owner) address.
	/// Comment-202504011 applies.
	/// @param numStakedNfts Staked NFT count after this action.
	/// @param rewardAmountPerStakedNft The current all-time cumulative staking ETH reward amount per staked NFT.
	/// @param rewardAmount Staking ETH reward amount paid to the staker.
	/// It equals the difference of `rewardAmountPerStakedNft` provided in the `NftUnstaked` and `NftStaked` events
	/// with the same `stakeActionId`.
	event NftUnstaked(
		uint256 /*indexed*/ actionCounter,
		uint256 indexed stakeActionId,
		uint256 indexed nftId,
		address indexed stakerAddress,
		uint256 numStakedNfts,
		uint256 rewardAmountPerStakedNft,
		uint256 rewardAmount
	);

	/// @notice Emitted when an ETH deposit is received.
	/// @param roundNum The ended bidding round number.
	/// @param actionCounter An always increasing by at least 1 unique ID of this action.
	/// @param depositAmount The deposited ETH amount.
	/// It can potentially be zero.
	/// @param rewardAmountPerStakedNft The all-time cumulative staking ETH reward amount per staked NFT after this action.
	/// It can potentially be zero.
	/// @param numStakedNfts The current staked NFT count.
	/// It cannot be zero because the transaction would revert near Comment-202410161.
	event EthDepositReceived(
		uint256 indexed roundNum,
		uint256 /*indexed*/ actionCounter,
		uint256 depositAmount,
		uint256 rewardAmountPerStakedNft,
		uint256 numStakedNfts
	);

	/// @notice Unstakes an NFT.
	/// Deletes the stake action; transfers the NFT back to the staker (NFT owner); pays a staking reward to the staker.
	/// Only the staker who staked the given NFT is permitted to call this method.
	/// @param stakeActionId_ Stake action ID.
	function unstake(uint256 stakeActionId_) external;

	/// @notice Similarly to `unstake`, unstakes zero or more NFTs.
	/// @param stakeActionIds_ Stake action IDs.
	/// It's OK if it's empty.
	function unstakeMany(uint256[] calldata stakeActionIds_) external;

	/// @notice Receives an ETH deposit to be distributed to stakers.
	/// This method is not designed to handle the case when there are no staked NFTs,
	/// so in that case, near Comment-202410161, it will revert the transaction with the division-by-zero panic.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// It's because otherwise the backend would have to support the processing of any unexpected deposits.
	/// `msg.value` can potentially be zero.
	/// @param roundNum_ The ended bidding round number.
	function deposit(uint256 roundNum_) external payable;

	/// @notice If eventually all stakers unstake their NFTs, the owner of this contract has an option to call this method
	/// to transfer a small remaining balance to charity (or to the owner themselves -- to recoup the transaction fees).
	/// A problem is that it's unlikely that eventually all stakers will unstake their NFTs,
	/// so, realistically, this method will never be called. It exists just for completeness.
	/// Only the contract owner is permitted to call this method.
	/// @param charityAddress_ Charity address.
	/// May be zero. If it's zero the method will do nothing.
	/// @return `true` on success; `false` on error.
	/// @dev
	/// [Comment-202503043]
	/// Why the balance can remain a nonzero after all payouts have been made?
	/// Our logic is simple, but it can lose some Weis.
	/// The loss happens when we discard a division remainder near Comment-202410161.
	/// Any better logic would require orders of magnitude more weis in transaction fees.
	/// [/Comment-202503043]
	/// As mentioned above, only the contract owner is permitted to call this method. But if it was making a transfer
	/// to an internally stored charity address, it would probably make sense to let anybody call it,
	/// which is the case for methods tagged with Comment-202409273.
	function tryPerformMaintenance(address charityAddress_) external returns (bool);
}
