// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

/// @title Staking wallet for Cosmic Signature Tokens.
/// @author Cosmic Game Development Team
/// @notice A contract implementing this interface allows users to stake their Cosmic Signature Tokens (CST) and earn rewards.
/// @dev Supports CST NFT staking and unstaking, as well as staker reward distribution.
/// todo-0 Isn't our fungible token named Cosmic Signature Token? But here we are talking about Cosmic Signature NFTs, right?
/// todo-0 Rename to `IStakingWalletCSNFT` or `IStakingWalletCSTNFT`?
/// todo-0 Also rename the contract implementing this interface.
/// todo-0 Fix the above comments too.
///
/// If I was to implement incremental reward payouts, I would mostly keep the current functions and events.
/// In addition, I would add a `bool` flag to `UnstakeActionOccurred` for whether all rewards have been paid to the staker.
/// In case it equals `false`, the staker would have an option to call a designated incremental reward payout function
/// that would process another 20K or so (configurable) deposits. This logic would be in part similar to the old `claimManyRewards`.
interface IStakingWalletCST {
	/// @notice Emitted when an NFT is staked.
	/// @param stakeActionId Stake action ID.
	/// @param nftId Staked NFT ID.
	/// @param stakerAddress Staker (NFT owner) address.
	/// @param numStakedNfts Staked NFT count after this action.
	event StakeActionOccurred(
		uint256 indexed stakeActionId,
		uint256 indexed nftId,
		address indexed stakerAddress,
		uint256 numStakedNfts
	);

	/// @notice Emitted when an NFT is unstaked and at least a part of the reward is paid to the staker.
	/// @param stakeActionId Stake action ID.
	/// @param nftId Unstaked NFT ID.
	/// @param stakerAddress Staker (NFT owner) address.
	/// @param numStakedNfts Staked NFT count after this action.
	/// @param rewardAmount Reward amount paid to the staker.
	/// @param maxUnpaidEthDepositIndex Comment-202410268 applies.
	event UnstakeActionOccurred(
		uint256 indexed stakeActionId,
		uint256 indexed nftId,
		address indexed stakerAddress,
		uint256 numStakedNfts,
		uint256 rewardAmount,
		uint256 maxUnpaidEthDepositIndex
	);

	/// @notice Emitted when another part of the reward is paid to the staker.
	/// @param stakeActionId Stake action ID.
	/// @param nftId Unstaked NFT ID.
	/// @param stakerAddress Staker (NFT owner) address.
	/// @param rewardAmount Reward amount paid to the staker.
	/// @param maxUnpaidEthDepositIndex Comment-202410268 applies.
	event RewardPaid(
		uint256 indexed stakeActionId,
		uint256 indexed nftId,
		address indexed stakerAddress,
		uint256 rewardAmount,
		uint256 maxUnpaidEthDepositIndex
	);

	/// @notice Emitted when an ETH deposit is received.
	/// @param roundNum Bidding round number.
	/// @param actionCounter An always increasing by at least 1 unique ID of this deposit action.
	/// @param depositIndex `_EthDeposit` instance index in `ethDeposits` (1-based).
	/// It can remain the same as it was in the previous event.
	/// @param depositId `_EthDeposit` instance ID.
	/// It can remain the same as it was in the previous event.
	/// If a new `_EthDeposit` instance was created, `depositId == actionCounter`.
	/// @param depositAmount The deposited ETH amount.
	/// @param numStakedNfts The current staked NFT count.
	event EthDepositReceived(
		uint256 indexed roundNum,
		uint256 actionCounter,
		uint256 depositIndex,
		uint256 depositId,
		uint256 depositAmount,
		uint256 numStakedNfts
	);

	/// @notice Stakes an NFT.
	/// @param nftId_ NFT to stake ID.
	function stake(uint256 nftId_) external;

	/// @notice Stakes multiple NFTs.
	/// @param tokenIds_ NFT to stake IDs.
	function stakeMany(uint256[] memory tokenIds_) external;

	/// @notice Unstakes an NFT and pays its reward to the staker.
	/// @param stakeActionId_ Stake action ID.
	/// @dev Comment-202410142 applies.
	function unstake(uint256 stakeActionId_, uint256 numEthDepositsToEvaluateMaxLimit_) external;

	/// @notice Unstakes multiple NFTs and pays their rewards to the staker.
	/// @param stakeActionIds_ Stake action IDs.
	/// @dev
	/// [Comment-202410142]
	/// `unstakeMany` gas fee can potentially exceed the gas max limit per transaction imposed by Arbitrum.
	/// In that case, the frontend must prohibit calling it.
	/// At the same time, it appears to be safe to assume that `unstake` gas fee cannot exceed the limit.
	/// [/Comment-202410142]
	function unstakeMany(uint256[] memory stakeActionIds_, uint256 numEthDepositsToEvaluateMaxLimit_) external;

	function payReward(uint256 stakeActionId_, uint256 numEthDepositsToEvaluateMaxLimit_) external;

	function payManyRewards(uint256[] memory stakeActionIds_, uint256 numEthDepositsToEvaluateMaxLimit_) external;

	/// @return The current staked NFT count.
	function numNftsStaked() external view returns (uint256);

	/// @notice Checks if an NFT has been used for staking.
	/// @param nftId_ NFT ID.
	/// @return `true` if the given NFT has been used, `false` otherwise.
	function wasNftUsed(uint256 nftId_) external view returns (bool);

	/// @notice Receives an ETH deposit to be distributed to stakers.
	/// @param roundNum_ Bidding round number.
	/// @dev Only callable by the `CosmicGame` contract.
	/// Otherwise a malicious actor could attempt to DoS us.
	/// The deposited amount isn't supposed to be zero, but a zero depsit would not break things,
	/// although the behavior would not necessarily be perfect.
	/// This function is not designed to handle the case when there are no staked NFTs, which is why it's named "if possible",
	/// so in that case it will revert the transaction with the `CosmicGameErrors.NoNftsStaked` error,
	/// which the depositing contract must be prepared to handle (it is, indeed, prepared).
	function depositIfPossible(uint256 roundNum_) external payable;

	/// @notice If eventually all stakers unstake their NFTs and receive their reward payments,
	/// the `owner()` of this contract has an option to call this function
	/// to reset contract state and/or to transfer a small remaining balance to charity
	/// (or to the owner themselves -- to recoup the transaction fees).
	/// @dev Why the balance can remain a nonzero after all payouts have been made?
	/// Our logic is simple, but it can lose some weis.
	/// The loss happens when we discard a division remainder near Comment-202410161.
	/// Any better logic would require orders of magnitude more weis in transaction fees.
	/// As mentioned above, only `owner()` is permitted to call this function. But if it was making a transfer
	/// to an internally stored charity address, it would probably make sense to let anybody call it,
	/// which is the case for functions near Comment-202409273.
	function tryPerformMaintenance(bool resetState_, address charityAddress_) external returns (bool);
}
