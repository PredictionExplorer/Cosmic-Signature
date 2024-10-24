// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { CosmicGameConstants } from "../libraries/CosmicGameConstants.sol";

interface IStakingWalletNftBase {
	/// @notice Emitted when an NFT is staked.
	/// @param stakeActionId Stake action ID.
	/// @param nftTypeCode NFT type code.
	/// @param nftId Staked NFT ID.
	/// @param stakerAddress Staker (NFT owner) address.
	/// @param numStakedNfts Staked NFT count after this action.
	event NftStaked(
		uint256 indexed stakeActionId,
		CosmicGameConstants.NftTypeCode nftTypeCode,
		uint256 indexed nftId,
		address indexed stakerAddress,
		uint256 numStakedNfts
	);

	/// @notice Stakes an NFT.
	/// @param nftId_ NFT to stake ID.
	/// @dev Transfers the NFT to this contract and records the stake action.
	/// Comment-202411023 relates and/or applies.
	function stake(uint256 nftId_) external;

	/// @notice Similarly to `stake`, stakes zero or more NFTs.
	/// @param nftIds_ NFT to stake IDs.
	function stakeMany(uint256[] calldata nftIds_) external;

	/// @return The current staked NFT count.
	/// @dev Comment-202410274 relates.
	function numStakedNfts() external view returns (uint256);

	/// @notice Checks if an NFT has ever been used for staking.
	/// @param nftId_ NFT ID.
	/// @return `true` if the given NFT has been used; `false` otherwise.
	/// @dev Comment-202410274 relates.
	function wasNftUsed(uint256 nftId_) external view returns (bool);
}
