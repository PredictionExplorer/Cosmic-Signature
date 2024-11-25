// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { CosmicSignatureConstants } from "../libraries/CosmicSignatureConstants.sol";

/// @title A wallet to hold the Cosmic Signature Game prizes and donations.
/// @author Cosmic Signature Development Team.
/// @notice A contract implementing this interface supports depositing ETH, donating ERC-20 tokens and ERC-721 NFTs,
/// and allows prize winners (and after a timeout anybody) to withdraw their prizes.
/// @dev It's OK if the same NFT will be donated and claimed multiple times.
/// Nothing would be broken if an ERC-20 or ERC-721 contract acts malitiosly.
/// For example, a malitios NFT contract can allow donating an NFT multiple times without claiming it.
interface IPrizesWallet {
	/// @notice Emitted when `timeoutDurationToWithdrawPrizes` is changed.
	/// @param newValue The new value.
	event TimeoutDurationToWithdrawPrizesChanged(uint256 newValue);

	/// @notice Emitted when an ETH prize is received for a bidding round prize winner.
	/// This is used only for secondary (non-main) prizes.
	/// @param roundNum The current bidding round number.
	/// @param roundPrizeWinnerAddress Bidding round prize winner address.
	/// @param amount ETH amount.
	/// @dev Issue. This event is kinda redundant, given that `CosmicSignatureGame` already emits
	/// a more specific event for each ETH deposit. But Nick is saying that he does need it.
	/// todo-1 Maybe talk to Nick again about that later.
	event EthReceived(uint256 indexed roundNum, address indexed roundPrizeWinnerAddress, uint256 amount);

	/// @notice Emitted when someone withdraws ETH.
	/// @param roundPrizeWinnerAddress Bidding round prize winner address.
	/// @param beneficiaryAddress Withdrawer address.
	/// [Comment-202411285]
	/// It's typically different from `roundPrizeWinnerAddress` when withdrawing an unclaimed prize.
	/// Comment-202411254 relates.
	/// [/Comment-202411285]
	/// @param amount ETH amount.
	event EthWithdrawn(address indexed roundPrizeWinnerAddress, address indexed beneficiaryAddress, uint256 amount);

	/// @notice Emitted when someone makes an ERC-20 token donation.
	/// @param roundNum The current bidding round number.
	/// @param donorAddress Donor address.
	/// @param tokenAddress The ERC-20 contract address.
	/// @param amount Token amount.
	event TokenDonated(
		uint256 indexed roundNum,
		address indexed donorAddress,
		IERC20 indexed tokenAddress,
		uint256 amount
	);

	/// @notice Emitted when someone claims an ERC-20 token donation.
	/// @param roundNum Bidding round number.
	/// @param beneficiaryAddress The address that claimed the donation.
	/// Comment-202411254 applies.
	/// @param tokenAddress The ERC-20 contract address.
	/// @param amount Token amount.
	event DonatedTokenClaimed(
		uint256 indexed roundNum,
		address beneficiaryAddress,
		IERC20 tokenAddress,
		uint256 amount
	);

	/// @notice Emitted when someone donates an NFT.
	/// @param roundNum The current bidding round number.
	/// @param donorAddress Donor address.
	/// @param nftAddress NFT contract address.
	/// @param nftId NFT ID.
	/// @param index `donatedNfts` new item index.
	event NftDonated(
		uint256 indexed roundNum,
		address indexed donorAddress,
		IERC721 indexed nftAddress,
		uint256 nftId,
		uint256 index
	);

	/// @notice Emitted when someone claims a donated NFT.
	/// @param roundNum Bidding round number.
	/// @param beneficiaryAddress The address that claimed the donation.
	/// Comment-202411254 applies.
	/// @param nftAddress NFT contract address.
	/// @param nftId NFT ID.
	/// @param index `donatedNfts` item index.
	event DonatedNftClaimed(
		uint256 indexed roundNum,
		address beneficiaryAddress,
		IERC721 nftAddress,
		uint256 nftId,
		uint256 index
	);

	/// @notice Sets `timeoutDurationToWithdrawPrizes`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setTimeoutDurationToWithdrawPrizes(uint256 newValue_) external;

	/// @notice `CosmicSignatureGame` calls this method on bidding round main prize claim.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// @param roundNum_ The current bidding round number.
	/// @param roundMainPrizeWinnerAddress_ Bidding round main prize winner address.
	function registerRoundEnd(uint256 roundNum_, address roundMainPrizeWinnerAddress_) external;

	/// @notice This method combines `withdrawEth`, `claimManyDonatedTokens`, `claimManyDonatedNfts`.
	function withdrawEverything(
		bool withdrawEth_,
		CosmicSignatureConstants.DonatedTokenToClaim[] calldata donatedTokensToClaim_,
		uint256[] calldata donatedNftIndices_
	) external;

	/// @notice Receives an ETH prize for a bidding round prize winner.
	/// This is used only for secondary (non-main) prizes.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// @param roundNum_ The current bidding round number.
	/// @param roundPrizeWinnerAddress_ Bidding round prize winner address.
	/// @dev
	/// todo-1 Do we need a method to deposit for multiple winnes? That method can even be combined with `registerRoundEnd`.
	/// todo-1 Ideally, it should accept an array of structs, each being 32 bytes long (or maybe don't bother with that kind of optimization).
	function depositEth(uint256 roundNum_, address roundPrizeWinnerAddress_) external payable;

	/// @notice A biddig round prize winner calls this method to withdraw their ETH balance.
	/// Only the winner is permitted to call this method.
	function withdrawEth() external;

	/// @notice Anybody is welcomed to call this method after a timeout expires
	/// to withdraw a biddig round prize winner's unclaimed ETH.
	/// @param roundPrizeWinnerAddress_ Bidding round prize winner address.
	function withdrawEth(address roundPrizeWinnerAddress_) external;

	/// @return Details on ETH balance belonging to `msg.sender`.
	/// @dev Comment-202410274 relates.
	function getEthBalanceInfo() external view returns(CosmicSignatureConstants.BalanceInfo memory);

	/// @return Details on ETH balance belonging to the given address.
	/// @param roundPrizeWinnerAddress_ Bidding round prize winner address.
	/// @dev Comment-202410274 relates.
	function getEthBalanceInfo(address roundPrizeWinnerAddress_) external view returns(CosmicSignatureConstants.BalanceInfo memory);

	/// @notice This method allows anybody to make an ERC-20 token donation.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// @param roundNum_ The current bidding round number.
	/// @param donorAddress_ Donor address.
	/// @param tokenAddress_ The ERC-20 contract address.
	/// @param amount_ Token amount.
	/// @dev
	/// [Comment-202411288]
	/// We do not need a method to make multiple ERC-20 token and/or ETC-721 NFT donations
	/// because we allow at most 1 donation per bid.
	/// [/Comment-202411288]
	function donateToken(uint256 roundNum_, address donorAddress_, IERC20 tokenAddress_, uint256 amount_) external;

	/// @notice Claims an ERC-20 token donateion.
	/// [Comment-202411289]
	/// Only the bidding round main prize winner is permitted to claim donated ERC-20 tokens and ERC-721 NFTs
	/// before a timeout expires. Afterwards, anybody is welcomed to.
	/// [/Comment-202411289]
	/// @param roundNum_ Bidding round number.
	/// @param tokenAddress_ The ERC-20 contract address.
	function claimDonatedToken(uint256 roundNum_, IERC20 tokenAddress_) external;

	/// @notice Similarly to `claimDonatedToken`, claims zero or more ERC-20 token donations in a single transaction.
	function claimManyDonatedTokens(CosmicSignatureConstants.DonatedTokenToClaim[] calldata donatedTokensToClaim_) external;

	/// @return The ERC-20 token amount donated during the given bidding round that has not been claimed yet.
	/// @param roundNum_ Bidding round number.
	/// @param tokenAddress_ The ERC-20 contract address.
	function getDonatedTokenAmount(uint256 roundNum_, IERC20 tokenAddress_) external view returns(uint256);

	/// @notice This method allows anybody to donate an NFT.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// @param roundNum_ The current bidding round number.
	/// @param donorAddress_ Donor address.
	/// @param nftAddress_ NFT contract address.
	/// @param nftId_ NFT ID.
	/// @dev Comment-202411288 applies.
	function donateNft(uint256 roundNum_, address donorAddress_, IERC721 nftAddress_, uint256 nftId_) external;

	/// @notice Claims a donated NFT.
	/// Comment-202411289 applies.
	/// @param index_ `donatedNfts` item index.
	function claimDonatedNft(uint256 index_) external;

	/// @notice Similarly to `claimDonatedNft`, claims zero or more donated NFTs in a single transaction.
	/// @param indices_ `donatedNfts` item indices.
	function claimManyDonatedNfts(uint256[] calldata indices_) external;
}
