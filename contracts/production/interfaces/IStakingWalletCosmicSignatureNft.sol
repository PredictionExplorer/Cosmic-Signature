// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

/// @title Staking wallet for Cosmic Signature NFTs.
/// @author Cosmic Game Development Team.
/// @notice A contract implementing this interface allows users to stake their Cosmic Signature NFTs and earn rewards.
/// @dev Supports CosmicSignature NFT staking and unstaking, as well as staker reward distribution.
interface IStakingWalletCosmicSignatureNft {
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
	/// @param nftIds_ NFT to stake IDs.
	function stakeMany(uint256[] calldata nftIds_) external;

	/// @notice Unstakes an NFT and pays at least a part of its reward to the staker.
	/// @param stakeActionId_ Stake action ID.
	/// @param numEthDepositsToEvaluateMaxLimit_ Evaluate at most this many `_EthDeposit` instances.
	/// @dev
	/// [Comment-202410142]
	/// The `numEthDepositsToEvaluateMaxLimit_` parameter makes it possible to ensure that the function gas fee
	/// won't exceed the max gas per transaction imposed by the blockchain.
	/// For Arbitrum, the best value appears to be over 20000, given some 2200 gas needed to evaluate a deposit
	/// and 50 million max gas per transaction.
	/// The client code has means to find out off-chain the number of deposits that need to be evaluated.
	/// Keep in mind that if a staker is entitled to receive a particular number of deposits,
	/// the contract must evaluate 1 more deposit with a smaller by 1 index to observe that the staker isn't entitled to it.
	/// A marginal case here is when the staker is entitled to the deposit at the index of 1 (the index is 1-based),
	/// so in this case the non-existing deposit at the index of zero doesn't require evaluation.
	/// So client code recommended logic is the following. In case, for exmple, the contract can evaluate at most 20000 deposits
	/// within the max gas per transaction limit, and 20001 deposits must be evaluated, of which 20000 will be paid to the staker,
	/// the client code should call the contract twice. On the 1st call pass `numEthDepositsToEvaluateMaxLimit_ = 10001`
	/// and on the 2nd call pass `numEthDepositsToEvaluateMaxLimit_ = 20000`. On the 2nd call the contract will evaluate
	/// 10000 deposits, or, in a marginal case, 1 more deposit, if another deposit arrives right before the unstake.
	/// An uglier situation will happen if 20000 deposits need to be evaluated, of which the staker is entitled to 19999 ones.
	/// The client code passes `numEthDepositsToEvaluateMaxLimit_ = 20000`, but a new deposit arrives right before the unstake.
	/// In this case, the staker will get all their rewards from 20000 deposits, but the staking action state will not be finalized.
	/// In this case, it would be dishonest for the client code to trick the staker into spending gas to call the contract again
	/// without being rewarded just to properly update contract state. Nothing would, really, be broken
	/// if a stake action remains unfinalized, except, as noted in Comment-202410296, the `tryPerformMaintenance` function
	/// would never allow calling itself.
	/// But even without this issue, it will, anyway, never allow calling itself, so this is kinda a minor issue.
	/// To further complicate things, the maximum possible `numEthDepositsToEvaluateMaxLimit_` is different
	/// for each function that supports this parameter. Besides, it also depends on the number of items in `stakeActionIds_`.
	/// Therefore the client code should simulate the contract call off-chain before making the call on-chain.
	/// [/Comment-202410142]
	function unstake(uint256 stakeActionId_, uint256 numEthDepositsToEvaluateMaxLimit_) external;

	/// @notice Similar to `unstake`. Performs the instake action for zero or more stake actions in a single transaction.
	/// @dev Comment-202410142 applies.
	function unstakeMany(uint256[] calldata stakeActionIds_, uint256 numEthDepositsToEvaluateMaxLimit_) external;

	/// @notice After an NFT has been unstaked, pays another part of the reward to the staker.
	/// @param stakeActionId_ Stake action ID.
	/// @param numEthDepositsToEvaluateMaxLimit_ Evaluate at most this many `_EthDeposit` instances.
	/// @dev Comment-202410142 applies.
	function payReward(uint256 stakeActionId_, uint256 numEthDepositsToEvaluateMaxLimit_) external;

	/// @notice Similar to `payReward`. Performs the pay reward action for zero or more stake actions in a single transaction.
	/// @dev Comment-202410142 applies.
	function payManyRewards(uint256[] calldata stakeActionIds_, uint256 numEthDepositsToEvaluateMaxLimit_) external;

	/// @return The current staked NFT count.
	/// @dev Comment-202410274 relates.
	function numStakedNfts() external view returns (uint256);

	/// @notice Checks if an NFT has ever been used for staking.
	/// @param nftId_ NFT ID.
	/// @return `true` if the given NFT has been used; `false` otherwise.
	/// @dev Comment-202410274 relates.
	function wasNftUsed(uint256 nftId_) external view returns (bool);

	/// @notice Receives an ETH deposit to be distributed to stakers.
	/// @param roundNum_ Bidding round number.
	/// @dev Only callable by the `CosmicGame` contract.
	/// Otherwise a malicious actor could attempt to DoS us.
	/// The deposited amount isn't supposed to be zero, but a zero depsit would not break things,
	/// although the behavior would not necessarily be perfect.
	/// This function is not designed to handle the case when there are no staked NFTs, which is why it's named "if possible",
	/// so in that case it will revert the transaction with the `CosmicGameErrors.NoStakedNfts` error,
	/// which the depositing contract must be prepared to handle (it is, indeed, prepared).
	function depositIfPossible(uint256 roundNum_) external payable;

	/// @notice
	/// [Comment-202410296]
	/// If eventually all stakers unstake their NFTs and receive their reward payments,
	/// the `owner()` of this contract has an option to call this function
	/// to reset contract state and/or to transfer a small remaining balance to charity
	/// (or to the owner themselves -- to recoup the transaction fees).
	/// A major problem is that it's unlikely that eventually all stakers will unstake their NFTs and receive their reward payments,
	/// so, realistically, nobody will ever call this function. It exists just for completeness.
	/// Comment-202410142 relates.
	/// [/Comment-202410296]
	/// @dev Why the balance can remain a nonzero after all payouts have been made?
	/// Our logic is simple, but it can lose some weis.
	/// The loss happens when we discard a division remainder near Comment-202410161.
	/// Any better logic would require orders of magnitude more weis in transaction fees.
	/// As mentioned above, only `owner()` is permitted to call this function. But if it was making a transfer
	/// to an internally stored charity address, it would probably make sense to let anybody call it,
	/// which is the case for functions tagged with Comment-202409273.
	function tryPerformMaintenance(bool resetState_, address charityAddress_) external returns (bool);
}
