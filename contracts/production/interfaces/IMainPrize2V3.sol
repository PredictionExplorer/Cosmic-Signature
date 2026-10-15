// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

/// @notice Comment-202607102 applies.
interface IMainPrize2V3 {
	/// @notice Comment-202607104 applies.
	/// @param roundNum The current bidding round number.
	/// @param beneficiaryAddress The address receiving the prize.
	/// Comment-202411254 applies.
	/// @param ethPrizeAmount Main ETH prize amount.
	/// It can potentially be zero.
	/// @param cstPrizeAmount The amount of the Cosmic Signature Token minted and awarded.
	/// @param prizeFirstCosmicSignatureNftId The ID of the first Cosmic Signature NFT minted and awarded.
	/// IDs of any additional NFTs are sequential.
	/// @param prizeNumCosmicSignatureNfts The number of Cosmic Signature NFTs minted and awarded.
	/// @param timeoutTimeToWithdrawSecondaryPrizes The ended bidding round's timeout time to withdraw prizes
	/// from `PrizesWallet`.
	event MainPrizeClaimed(
		uint256 indexed roundNum,
		address indexed beneficiaryAddress,
		uint256 ethPrizeAmount,
		uint256 cstPrizeAmount,
		uint256 indexed prizeFirstCosmicSignatureNftId,
		uint256 prizeNumCosmicSignatureNfts,
		uint256 timeoutTimeToWithdrawSecondaryPrizes
	);
}
