// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { CosmicGameConstants } from "../libraries/CosmicGameConstants.sol";

/// @title A wallet to hold ETH, ERC20 token, ERC721 NFT winnings in the Cosmic Signature Game.
/// @author Cosmic Game Development Team.
/// todo-1 Everywhere, rephrase to Cosmic Signature Game?
/// @notice A contract implementing this interface supports depositing ETH, donating ERC20 tokens and ERC721 NFTs,
/// and allows prize winners to withdraw their prizes.
/// @dev It's OK if the same NFT will be donated and claimed multiple times.
/// Nothing would be broken if an NFT contract acts malitiosly.
/// For example, a malitios NFT contract can allow donating an NFT multiple times without claiming it.
///
/// todo-0 Write similar comments regarding ERC-20. Combine them with the above.
///
interface IPrizesWallet {
	/// @notice Emitted when `timeoutDurationToWithdrawPrizes` is changed.
	/// @param newValue The new value.
	event TimeoutDurationToWithdrawPrizesChanged(uint256 newValue);

	/// @notice Emitted when an ETH prize is received for a winner.
	/// @param winner Prize winner address.
	/// @param amount Prize ETH amount.
	/// @dev Issue. This event is kinda redundant, given that `CosmicGame` already emits
	/// a more specific event for each ETH deposit. But Nick is saying that he does need it.
	/// todo-1 Maybe talk to Nick again about that later.
	event EthReceived(uint256 indexed roundNum, address indexed winner, uint256 amount);

	/// @notice Emitted when a prize winner withdraws their ETH balance.
	/// @param winner Prize winner address.
	/// @param withdrawnBy Withdrawer address.
	/// It can be different when withdrawing unclaimed balance.
	/// Comment-202411254 relates and/or applies.
	/// @param amount Balance ETH amount.
	event EthWithdrawn(address indexed winner, address indexed withdrawnBy, uint256 amount);

	/// @notice Emitted when someone donates an NFT.
	/// @param roundNum The bidding round number for which the NFT is donated.
	/// @param donor Donor address.
	/// @param nftAddress NFT contract address.
	/// @param nftId NFT ID.
	/// @param index `donatedNfts` new item index.
	event NftDonated(
		uint256 indexed roundNum,
		address indexed donor,
		IERC721 indexed nftAddress,
		uint256 nftId,
		uint256 index
	);

	/// @notice Emitted when someone claims a donated NFT.
	/// @param roundNum The bidding round number for which the NFT was donated.
	/// @param claimedBy The address that claimed the NFT.
	/// Comment-202411254 applies.
	/// @param nftAddress NFT contract address.
	/// @param nftId NFT ID.
	/// @param index `donatedNfts` item index.
	/// @dev todo-1 Would it make sense to eliminate all these params except `index`?
	/// todo-1 Then it would probably need to be declared `indexed`.
	event DonatedNftClaimed(
		uint256 indexed roundNum,
		address claimedBy,
		IERC721 nftAddress,
		uint256 nftId,
		uint256 index
	);

	/// @notice Sets `timeoutDurationToWithdrawPrizes`.
	/// @param newValue_ The new value.
	/// @dev Only callable by the contract owner.
	function setTimeoutDurationToWithdrawPrizes(uint256 newValue_) external;

	/// @notice `CosmicGame` calls this method on main prize claim.
	/// @dev Only callable by the `CosmicGame` contract.
	function registerRoundEnd(uint256 roundNum_, address roundMainPrizeWinner_) external;

	/// @notice Receives an ETH prize for a winner.
	/// @param winner_ Prize winner address.
	/// @dev Only callable by the `CosmicGame` contract.
	/// todo-1 Do we need a method to deposit for multiple winnes? That method can even be combined with `registerRoundEnd`.
	/// todo-1 Ideally, it should accept an array of structs, each being 32 bytes long.
	function depositEth(uint256 roundNum_, address winner_) external payable;

	/// @notice A prize winner calls this method to withdraw their ETH balance.
	function withdrawEth() external;

	/// @notice Anybody is welcomed to call this method to withdraw a prize winner's unclaimed ETH after a timeout expires.
	/// @param winner_ Prize winner address.
	function withdrawEth(address winner_) external;

	/// @return Details on ETH balance belonging to `msg.sender`.
	/// @dev Comment-202410274 relates.
	function getEthBalanceInfo() external view returns(CosmicGameConstants.BalanceInfo memory);

	/// @param winner_ Prize winner address.
	/// @return Details on ETH balance belonging to the given address.
	/// @dev Comment-202410274 relates.
	function getEthBalanceInfo(address winner_) external view returns(CosmicGameConstants.BalanceInfo memory);

	/// @notice This method allows anybody to donate an NFT.
	/// @dev Only callable by the `CosmicGame` contract.
	/// todo-1 Do we need a method to donate multiple NFTs? Maybe not, because at most 1 NFT per bid is allowed.
	/// @param roundNum_ The bidding round number for which the NFT is donated.
	/// @param donor_ Donor address.
	/// @param nftAddress_ NFT contract address.
	/// @param nftId_ NFT ID.
	function donateNft(uint256 roundNum_, address donor_, IERC721 nftAddress_, uint256 nftId_) external;

	/// @notice Claims a donated NFT.
	/// Only the bidding round main prize winner is permitted to claim a donated NFT until a timeout expires.
	/// Afterwards, anybody is welcomed to.
	/// @param index_ `donatedNfts` item index.
	function claimDonatedNft(uint256 index_) external;

	/// @notice Similarly to `claimDonatedNft`, claims zero or more donated NFTs in a single transaction.
	/// @param indices_ `donatedNfts` item indices.
	function claimManyDonatedNfts(uint256[] calldata indices_) external;



	// todo-1 Do we need a method to withdraw a combination of ETH, ERC20 tokens, ERC721 NFTs?
}
