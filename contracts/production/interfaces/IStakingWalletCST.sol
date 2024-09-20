// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

/// @title A staking wallet for Cosmic Signature Tokens
/// @author Cosmic Game Development Team
/// @notice A contract implementing this interface allows users to stake their Cosmic Signature Tokens (CST) and earn rewards
interface IStakingWalletCST {
	/// @notice Emitted when a token is staked
	/// @param actionId The ID of the stake action
	/// @param tokenId The ID of the staked token
	/// @param totalNFTs Total number of staked NFTs after this action
	/// @param staker Address of the staker
	event StakeActionEvent(
		uint256 indexed actionId,
		uint256 indexed tokenId,
		uint256 totalNFTs,
		address indexed staker
	);

	/// @notice Emitted when a token is unstaked
	/// @param actionId The ID of the unstake action
	/// @param tokenId The ID of the unstaked token
	/// @param totalNFTs Total number of staked NFTs after this action
	/// @param staker Address of the staker
	event UnstakeActionEvent(
		uint256 indexed actionId,
		uint256 indexed tokenId,
		uint256 totalNFTs,
		address indexed staker
	);

	/// @notice Emitted when a reward is claimed
	/// @param actionId The ID of the stake action
	/// @param depositId The ID of the ETH deposit
	/// @param reward Amount of reward claimed
	/// @param staker Address of the staker claiming the reward
	event ClaimRewardEvent(uint256 indexed actionId, uint256 indexed depositId, uint256 reward, address indexed staker);

	/// @notice Emitted when an ETH deposit is made
	/// @param depositTime Timestamp of the deposit
	/// @param depositNum Deposit number
	/// @param numStakedNFTs Number of staked NFTs at the time of deposit
	/// @param amount Amount of ETH deposited
	/// // param modulo Accumulated modulo after this deposit
	event EthDepositEvent(
		uint256 indexed depositTime,
		uint256 depositNum,
		uint256 numStakedNFTs,
		uint256 amount
		// uint256 modulo
	);

	// /// @notice Emitted when a deposit is sent to charity
	// /// @param amount Amount sent to charity
	// /// @param charityAddress Address of the charity
	// /// @dev I replaced this with `CosmicGameEvents.FundsTransferredToCharityEvent`.
	// /// todo-1 Remove this garbage.
	// event CharityDepositEvent(uint256 amount, address charityAddress);

	// /// @notice Emitted when the charity address is updated
	// /// @param newCharityAddress New address of the charity
	// /// @dev Comment-202409208 relates and/or applies.
	// event CharityUpdatedEvent(address indexed newCharityAddress);

	// /// @notice Emitted when accumulated modulo is sent to charity
	// /// @param amount Amount of modulo sent to charity
	// /// @dev Comment-202409208 relates and/or applies.
	// event ModuloSentToCharityEvent(uint256 amount);

	/// @notice Stakes a single token
	/// @param _tokenId ID of the token to stake
	function stake(uint256 _tokenId) external;

	/// @notice Stakes multiple tokens
	/// @param ids Array of token IDs to stake
	function stakeMany(uint256[] memory ids) external;

  	/// @notice Unstakes a single token
	/// @param stakeActionId ID of the stake action to unstake
	function unstake(uint256 stakeActionId) external;

	/// @notice Unstakes multiple tokens
	/// @param ids Array of stake action IDs to unstake
	function unstakeMany(uint256[] memory ids) external;

	/// @notice Claims rewards for multiple stake actions and deposits
	/// @param actions Array of stake action IDs
	/// @param deposits Array of deposit IDs
	function claimManyRewards(uint256[] memory actions, uint256[] memory deposits) external;

	/// @notice Unstakes a token and claims its reward in a single transaction
	/// @param stakeActionId ID of the stake action
	/// @param ETHDepositId ID of the ETH deposit for reward calculation
	function unstakeClaim(uint256 stakeActionId, uint256 ETHDepositId) external;

	/// @notice Unstakes multiple tokens and claims their rewards in a single transaction
	/// @param unstake_actions Array of stake action IDs to unstake
	/// @param claim_actions Array of stake action IDs for claiming rewards
	/// @param claim_deposits Array of deposit IDs for claiming rewards
	function unstakeClaimMany(
		uint256[] memory unstake_actions,
		uint256[] memory claim_actions,
		uint256[] memory claim_deposits
	) external;

	/// @notice Checks if a token has been used for staking
	/// @param _tokenId ID of the token to check
	/// @return True if the token has been used, false otherwise
	function wasTokenUsed(uint256 _tokenId) external view returns (bool);

	/// @notice Checks if a token is currently staked
	/// @param tokenId ID of the token to check
	/// @return True if the token is staked, false otherwise
	function isTokenStaked(uint256 tokenId) external view returns (bool);

	/// @notice Returns the number of currently staked tokens
	/// @return Number of staked tokens
	function numTokensStaked() external view returns (uint256);

	/// @notice Gets the last action ID for a given token
	/// @param tokenId ID of the token to check
	/// @return Last action ID for the token, -2 if never staked, -1 if unstaked
	function lastActionIdByTokenId(uint256 tokenId) external view returns (int256);

	/// @notice Gets the staker's address for a given token
	/// @param tokenId ID of the token to check
	/// @return Address of the staker, address(0) if not staked
	function stakerByTokenId(uint256 tokenId) external view returns (address);

	/// @notice Deposits ETH for reward distribution
	/// @dev Only callable by the CosmicGame contract
	/// The implementation is not designed to handle the case when there are no staked NFTs,
	/// so it reverts the transaction with the `CosmicGameErrors.InvalidOperationInCurrentState` error.
	function depositIfPossible() external payable;

	// /// @notice Sets a new charity address
	// /// @param newCharityAddress Address of the new charity
	// /// @dev Comment-202409208 relates and/or applies.
	// function setCharity(address newCharityAddress) external;

	// /// @notice Sends accumulated modulo to charity
	// /// @dev Comment-202409208 relates and/or applies.
	// function moduloToCharity() external;

	/// @dev If this was to make a transfer to an internally stored charity address,
	/// it would probably be unnecessary for this to be `onlyOwner`.
	/// Comment-202409273 relates.
	/// Comment-202409208 relates and/or applies.
	function transferRemainingBalanceToCharity(address charityAddress_) external;
}
