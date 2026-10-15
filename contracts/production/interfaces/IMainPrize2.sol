// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

/// @notice Comment-202607102 applies.
interface IMainPrize2 {
	/// @notice
	/// [Comment-202607104]
	/// Emitted when main prize gets claimed.
	/// This event indicates that the bidding round has ended.
	/// [/Comment-202607104]
	/// @param roundNum The current bidding round number.
	/// @param beneficiaryAddress The address receiving the prize.
	/// [Comment-202411254]
	/// It will be different from the main prize actual winner if the latter forgot to claim the prize
	/// within a timeout and someone else has claimed it instead.
	/// It's possible to find out from other events who is the actual winner.
	/// Comment-202411285 relates.
	/// Comment-202501249 relates.
	/// [/Comment-202411254]
	/// @param ethPrizeAmount Main ETH prize amount.
	/// It can potentially be zero.
	/// @param cstPrizeAmount The amount of the Cosmic Signature Token minted and awarded.
	/// @param prizeCosmicSignatureNftId The ID of the Cosmic Signature NFT minted and awarded.
	/// @param timeoutTimeToWithdrawSecondaryPrizes The ended bidding round's timeout time to withdraw prizes
	/// from `PrizesWallet`.
	event MainPrizeClaimed(
		uint256 indexed roundNum,
		address indexed beneficiaryAddress,
		uint256 ethPrizeAmount,
		uint256 cstPrizeAmount,
		uint256 indexed prizeCosmicSignatureNftId,
		uint256 timeoutTimeToWithdrawSecondaryPrizes
	);
}
