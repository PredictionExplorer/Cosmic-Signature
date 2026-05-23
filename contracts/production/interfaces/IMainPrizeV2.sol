// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.34;

import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { IBiddingBaseV2 } from "./IBiddingBaseV2.sol";
import { IMainPrizeBaseV2 } from "./IMainPrizeBaseV2.sol";
import { IBidStatistics } from "./IBidStatistics.sol";
import { ISecondaryPrizes } from "./ISecondaryPrizes.sol";

/// @notice Comment-202605305 applies.
interface IMainPrizeV2 is
	ICosmicSignatureGameStorage,
	IBiddingBaseV2,
	IMainPrizeBaseV2,
	IBidStatistics,
	ISecondaryPrizes {
	/// @notice Comment-202605298 applies.
	/// @param roundNum The current bidding round number.
	/// @param beneficiaryAddress The address receiving the prize.
	/// Comment-202411254 applies.
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

	/// @notice Comment-202605299 applies.
	function claimMainPrize() external;

	/// @return Comment-202605301 applies.
	function getMainEthPrizeAmount() external view returns (uint256);

	/// @return Comment-202605302 applies.
	/// @dev Comment-202605303 applies.
	function getCharityEthDonationAmount() external view returns (uint256);
}
