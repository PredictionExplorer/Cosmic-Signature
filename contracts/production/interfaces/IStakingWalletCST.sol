// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

/// @title A staking wallet for Cosmic Signature Tokens.
/// @author Cosmic Game Development Team
/// @notice A contract implementing this interface allows users to stake their Cosmic Signature Tokens (CST) and earn rewards.
/// @dev Supports staking, unstaking, and reward distribution mechanisms for CST NFTs.
/// todo-0 Isn't our fungible token named Cosmic Signature Token? But here we are talking about Cosmic Signature NFTs, right?
/// todo-0 Rename to `IStakingWalletCSNFT` or `IStakingWalletCSTNFT`?
/// todo-0 Also rename the contract implementing this interface.
/// todo-0 Fix the above comments too.
interface IStakingWalletCST {
	/// @notice Emitted when an NFT is staked.
	/// @param stakeActionId Stake action ID.
	/// @param tokenId Staked NFT ID.
	/// @param stakerAddress Staker (NFT owner) address.
	/// @param numStakedNFTs Staked NFT count after this action.
	event StakeActionEvent(
		uint256 indexed stakeActionId,
		uint256 indexed tokenId,
		address indexed stakerAddress,
		uint256 numStakedNFTs
	);

	/// @notice Emitted when an NFT is unstaked.
	/// @param stakeActionId Stake action ID.
	/// @param tokenId Staked NFT ID.
	/// @param stakerAddress Staker (NFT owner) address.
	/// @param numStakedNFTs Staked NFT count after this action.
	/// @param rewardAmount Reward amount paid to the staker.
	event UnstakeActionEvent(
		uint256 indexed stakeActionId,
		uint256 indexed tokenId,
		address indexed stakerAddress,
		uint256 numStakedNFTs,
		uint256 rewardAmount
	);

	/// @notice Emitted when an ETH deposit is received.
	/// @param roundNum Bidding round number.
	/// @param depositId `ETHDeposit` instance ID.
	/// @param depositAmount The deposited ETH amount.
	/// @param numStakedNFTs The current staked NFT count.
	event EthDepositEvent(
		uint256 indexed roundNum,
		uint256 depositId,
		uint256 depositAmount,
		uint256 numStakedNFTs
	);

	/// @notice Stakes an NFT.
	/// @param tokenId_ NFT to stake ID.
	function stake(uint256 tokenId_) external;

	/// @notice Stakes multiple NFTs.
	/// @param tokenIds_ NFT to stake IDs.
	function stakeMany(uint256[] memory tokenIds_) external;

	/// @notice Unstakes an NFT and pays its reward to the staker.
	/// @param stakeActionId_ Stake action ID.
	/// @dev Comment-202410142 applies.
	function unstake(uint256 stakeActionId_) external;

	/// @notice Unstakes multiple NFTs and pays their rewards to the staker.
	/// @param stakeActionIds_ Stake action IDs.
	/// @dev
	/// [Comment-202410142]
	/// `unstakeMany` gas fee can potentially exceed the gas max limit per transaction imposed by Arbitrum.
	/// In that case, the frontend must disallow calling it.
	/// At the same time, it appears to be safe to assume that `unstake` gas fee cannot exceed the limit.
	/// todo-0 Tell Nick about this comment.
	/// [/Comment-202410142]
	function unstakeMany(uint256[] memory stakeActionIds_) external;

	/// @return The current staked NFT count.
	function numTokensStaked() external view returns (uint256);

	/// @notice Checks if an NFT has been used for staking.
	/// @param tokenId_ NFT ID.
	/// @return `true` if the given NFT has been used, `false` otherwise.
	function wasTokenUsed(uint256 tokenId_) external view returns (bool);

	/// @notice Receives an ETH deposit to be distributed to stakers.
	/// @param roundNum_ Bidding round number.
	/// @dev Only callable by the `CosmicGame` contract.
	/// Otherwise a malicious actor could attempt to DoS us.
	/// The deposited amount isn't supposed to be zero, but a zero depsit would not break things,
	/// although the behavior would not necessarily be perfect.
	/// The implementation is not designed to handle the case when there are no staked NFTs,
	/// so in that case it will revert the transaction with the `CosmicGameErrors.NoTokensStaked` error.
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
