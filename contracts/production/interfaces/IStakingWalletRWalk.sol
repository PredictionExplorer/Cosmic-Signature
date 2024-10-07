// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.26;

/// @title Staking wallet for RandomWalk NFTs
/// @author Cosmic Game Development Team
/// @notice A contract implementing this interface allows users to stake their RandomWalk NFTs
/// @dev Supports staking, unstaking, and random staker selection for RandomWalk NFTs
interface IStakingWalletRWalk {
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

	/// @notice Stakes a single RandomWalk NFT
	/// @param _tokenId ID of the token to stake
	/// @dev Transfers the NFT to this contract and records the stake action
	function stake(uint256 _tokenId) external;

	/// @notice Stakes multiple RandomWalk NFTs
	/// @param ids Array of token IDs to stake
	/// @dev Calls stake() for each token ID in the array
	function stakeMany(uint256[] memory ids) external;

	/// @notice Unstakes a single RandomWalk NFT
	/// @param stakeActionId ID of the stake action to unstake
	/// @dev Transfers the NFT back to the owner and records the unstake action
	function unstake(uint256 stakeActionId) external;

	/// @notice Unstakes multiple RandomWalk NFTs
	/// @param ids Array of stake action IDs to unstake
	/// @dev Calls unstake() for each stake action ID in the array
	function unstakeMany(uint256[] memory ids) external;

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

	/// @notice Picks a random staker based on the provided entropy
	/// @param entropy Random bytes used to select a staker
	/// @return Address of the randomly selected staker, or zero if there are no staked NFTs
	/// @dev this function is named "if possible" because it does nothing when there are no staked NFTs.
	function pickRandomStakerIfPossible(bytes32 entropy) external view returns (address);
}
