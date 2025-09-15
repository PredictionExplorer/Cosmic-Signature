// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IAddressValidator } from "./IAddressValidator.sol";
import { DonatedTokenHolder } from "../DonatedTokenHolder.sol";

/// @title A wallet to hold the Cosmic Signature Game prizes and donations.
/// @author The Cosmic Signature Development Team.
/// @notice This contract supports depositing ETH, donating third party ERC-20 token amounts and ERC-721 NFTs,
/// and allows prize winners (and after a timeout anybody) to withdraw their prizes.
///
/// @dev It's OK if the same NFT is donated and claimed multiple times.
/// Nothing would be broken if an ERC-20 or ERC-721 contract acts malitiosly.
/// For example, a malitios NFT contract can allow donating an NFT multiple times without claiming it.
/// 
/// It would be incorrect to derive this contract from `ERC721Holder` (which implements `IERC721Receiver'),
/// because if someone makes it an owner of an NFT by making a direct call to the NFT contract,
/// there would be no way to change that NFT owner again.
interface IPrizesWallet is IAddressValidator {
	struct EthDeposit {
		address prizeWinnerAddress;

		/// @notice It's OK if this is zero.
		uint256 amount;
	}

	struct EthBalanceInfo {
		uint256 roundNum;

		/// @notice This can be zero.
		uint256 amount;
	}

	/// @notice Details about ERC-20 token donations made to the Game.
	struct DonatedToken {
		// uint256 roundNum;
		// IERC20 tokenAddress;

		// /// @notice
		// /// [Comment-202501243]
		// /// Donated token amount.
		// /// It's OK if it's zero.
		// /// But higher levels of our software should prohibit and hide zero donations.
		// /// [/Comment-202501243]
		// uint256 amount;

		DonatedTokenHolder holder;
	}

	/// @notice Details about an ERC-20 token donation made to the Game that one is required to provide to claim the donation.
	struct DonatedTokenToClaim {
		/// @notice Bidding round number.
		uint256 roundNum;

		/// @notice
		/// [Comment-202502248]
		/// The ERC-20 contract address.
		/// As explained in Comment-202502242, an invalid value would cause transaction reversal.
		/// [/Comment-202502248]
		IERC20 tokenAddress;

		/// @notice
		/// [Comment-202507143]
		/// The token amount to claim.
		/// It not necessarily equals the donated amount.
		/// The amount available to claim depends on the donated ERC-20 contract logic.
		/// If the provided value is zero we will obtain the amount to claim by calling `tokenAddress.balanceOf`,
		/// which can potentially return zero, especially if someone is claiming an already claimed ERC-20 token donation,
		/// which is OK.
		/// There could be cases when providing a particular nonzero value could be a better option, such as:
		///    (1) `tokenAddress.transferFrom` would accept only a smaller value.
		///    (2) `tokenAddress.transferFrom` would accept a greater value.
		///    (3) The caller wants to save gas.
		///    (4) For whatever reason, the caller/user wants to provide a different value.
		/// So the caller can call `PrizesWallet.getDonatedTokenBalanceAmount` off-chain
		/// and, optionally, apply some formula to its return value.
		/// [/Comment-202507143]
		uint256 amount;
	}

	/// @notice Details about an NFT donated to the game.
	struct DonatedNft {
		uint256 roundNum;
		IERC721 nftAddress;
		uint256 nftId;
	}

	/// @notice Emitted when `timeoutDurationToWithdrawPrizes` is changed.
	/// @param newValue The new value.
	event TimeoutDurationToWithdrawPrizesChanged(uint256 newValue);

	/// @notice Emitted when an ETH prize is received for a prize winner.
	/// This is used only for secondary prizes.
	/// @param roundNum The current bidding round number.
	/// @param prizeWinnerAddress Prize winner address.
	/// @param amount ETH amount.
	/// It can potentially be zero.
	/// @dev Issue. This event is kinda redundant, given that `CosmicSignatureGame` already emits
	/// a more specific event for each ETH deposit. But Nick is saying that he does need it.
	event EthReceived(uint256 indexed roundNum, address indexed prizeWinnerAddress, uint256 amount);

	/// @notice Emitted when someone withdraws ETH.
	/// @param prizeWinnerAddress Prize winner address.
	/// @param beneficiaryAddress The address that withdrew the funds.
	/// [Comment-202411285]
	/// It will be different from `prizeWinnerAddress` if the latter forgot to claim the prize
	/// within a timeout and someone else has claimed it instead.
	/// Comment-202411254 relates.
	/// Comment-202501249 relates.
	/// [/Comment-202411285]
	/// @param amount ETH amount.
	/// It can potentially be zero, especially if someone withdraws an already withdrawn ETH balance.
	event EthWithdrawn(address indexed prizeWinnerAddress, address indexed beneficiaryAddress, uint256 amount);

	/// @notice Emitted when someone makes an ERC-20 token donation.
	/// @param roundNum The current bidding round number.
	/// @param donorAddress Donor address.
	/// @param tokenAddress The ERC-20 contract address.
	/// @param amount Comment-202501243 applies.
	event TokenDonated(
		uint256 indexed roundNum,
		address indexed donorAddress,
		IERC20 indexed tokenAddress,
		uint256 amount
	);

	/// @notice Emitted when someone claims an ERC-20 token donation.
	/// @param roundNum Bidding round number.
	/// @param beneficiaryAddress The address that claimed the donation.
	/// [Comment-202501249]
	/// It will be different from the main prize beneficiary if the latter forgot to claim the donation
	/// within a timeout and someone else has claimed it instead.
	/// Comment-202411254 relates.
	/// Comment-202411285 relates.
	/// [/Comment-202501249]
	/// @param tokenAddress The ERC-20 contract address.
	/// @param amount Token amount.
	/// This is the same value as the one near Comment-202507143,
	/// but if it was initially zero it was replaced with the actual balance received from `tokenAddress`.
	event DonatedTokenClaimed(
		uint256 indexed roundNum,
		address indexed beneficiaryAddress,
		IERC20 indexed tokenAddress,
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
	/// Comment-202501249 applies.
	/// @param nftAddress NFT contract address.
	/// @param nftId NFT ID.
	/// @param index `donatedNfts` item index.
	event DonatedNftClaimed(
		uint256 indexed roundNum,
		address indexed beneficiaryAddress,
		IERC721 indexed nftAddress,
		uint256 nftId,
		uint256 index
	);

	/// @notice Sets `timeoutDurationToWithdrawPrizes`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setTimeoutDurationToWithdrawPrizes(uint256 newValue_) external;

	/// @notice Calling this method is equivalent to calling `registerRoundEnd` once and then `depositEth` zero or more times.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// Comments near `registerRoundEnd` and `depositEth` apply.
	/// Comment-202502076 relates.
	function registerRoundEndAndDepositEthMany(uint256 roundNum_, address mainPrizeBeneficiaryAddress_, EthDeposit[] calldata ethDeposits_) external payable returns (uint256);

	/// @notice Registers the end of a bidding round.
	/// `CosmicSignatureGame` calls this method on main prize claim.
	/// Actually, see Comment-202502076.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// @param roundNum_ The current bidding round number.
	/// @param mainPrizeBeneficiaryAddress_ Main prize beneficiary address.
	/// Comment-202411254 applies.
	/// The Game contract passes `_msgSender()` for this parameter.
	/// An alternative would be to pass `lastBidderAddress` instead.
	/// As a result, even if the last bidder forgets to claim the main prize, we would still record them as the winner,
	/// which would make them entitled to claim donated ERC-20 tokens and ERC-721 NFTs.
	/// But the team feels that it's better to simply treat the person who clicked "Claim" as the winner.
	/// @return The ended bidding round's timeout time to withdraw prizes.
	/// @dev
	/// [Comment-202502076]
	/// Issue. `registerRoundEnd` and `depositEth` are never called. They exist only for completeness.
	/// `registerRoundEndAndDepositEthMany` is called instead.
	/// [/Comment-202502076]
	function registerRoundEnd(uint256 roundNum_, address mainPrizeBeneficiaryAddress_) external returns (uint256);

	/// @notice This method combines `withdrawEth`, `claimManyDonatedTokens`, `claimManyDonatedNfts`.
	function withdrawEverything(
		bool withdrawEth_,
		DonatedTokenToClaim[] calldata donatedTokensToClaim_,
		uint256[] calldata donatedNftIndexes_
	) external;

	/// @notice Receives an ETH prize for a prize winner.
	/// This is used only for secondary prizes.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// It's OK if `msg.value` is zero.
	/// @param roundNum_ The current bidding round number.
	/// @param prizeWinnerAddress_ Prize winner address.
	/// @dev Comment-202502076 applies.
	function depositEth(uint256 roundNum_, address prizeWinnerAddress_) external payable;

	/// @notice A prize winner calls this method to withdraw their ETH balance.
	/// Only the winner is permitted to call this method.
	function withdrawEth() external;

	/// @notice Anybody is welcomed to call this method after a timeout expires
	/// to withdraw a prize winner's unclaimed ETH.
	/// @param prizeWinnerAddress_ Prize winner address.
	function withdrawEth(address prizeWinnerAddress_) external;

	/// @return Details on ETH balance belonging to `_msgSender()`.
	function getEthBalanceInfo() external view returns (EthBalanceInfo memory);

	/// @return Details on ETH balance belonging to the given address.
	/// @param prizeWinnerAddress_ Prize winner address.
	function getEthBalanceInfo(address prizeWinnerAddress_) external view returns (EthBalanceInfo memory);

	/// @notice Deposits a donated ERC-20 token amount.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// Comment-202503151 relates.
	/// @param roundNum_ The current bidding round number.
	/// @param donorAddress_ Donor address.
	/// @param tokenAddress_ Comment-202502248 applies.
	/// @param amount_ Comment-202501243 applies.
	/// @dev
	/// [Comment-202411288]
	/// We do not need a method to make multiple ERC-20 token and/or ETC-721 NFT donations
	/// because we allow at most 1 donation per bid.
	/// [/Comment-202411288]
	function donateToken(uint256 roundNum_, address donorAddress_, IERC20 tokenAddress_, uint256 amount_) external;

	/// @notice Claims an ERC-20 token donateion.
	/// [Comment-202411289]
	/// Only the given bidding round main prize beneficiary is permitted to claim donated ERC-20 tokens and ERC-721 NFTs
	/// before a timeout expires. Afterwards, anybody is welcomed to.
	/// [/Comment-202411289]
	/// @param roundNum_ Bidding round number.
	/// @param tokenAddress_ Comment-202502248 applies.
	/// @param amount_ Comment-202507143 applies.
	function claimDonatedToken(uint256 roundNum_, IERC20 tokenAddress_, uint256 amount_) external;

	/// @notice Similarly to `claimDonatedToken`, claims zero or more ERC-20 token donations.
	function claimManyDonatedTokens(DonatedTokenToClaim[] calldata donatedTokensToClaim_) external;

	/// @return The donated in the given bidding round ERC-20 token balance amount, minus any already claimed amount.
	/// It not necessarily equals the donated amount near Comment-202501243.
	/// It could provide a hint on what amount to claim near Comment-202507143.
	/// This method is simply a convenient wrapper around `tokenAddress_.balanceOf`.
	/// @param roundNum_ Bidding round number.
	/// @param tokenAddress_ Comment-202502248 applies.
	function getDonatedTokenBalanceAmount(uint256 roundNum_, IERC20 tokenAddress_) external view returns (uint256);

	/// @notice Deposits a donated ERC-721 NFT.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// Comment-202503153 relates.
	/// @param roundNum_ The current bidding round number.
	/// @param donorAddress_ Donor address.
	/// @param nftAddress_ NFT contract address.
	/// As explained in Comment-202502245, an invalid value would cause transaction reversal.
	/// @param nftId_ NFT ID.
	/// @dev Comment-202411288 applies.
	function donateNft(uint256 roundNum_, address donorAddress_, IERC721 nftAddress_, uint256 nftId_) external;

	/// @notice Claims a donated ERC-721 NFT.
	/// Comment-202411289 applies.
	/// @param index_ `donatedNfts` item index.
	function claimDonatedNft(uint256 index_) external;

	/// @notice Similarly to `claimDonatedNft`, claims zero or more donated NFTs.
	/// @param indexes_ `donatedNfts` item indexes.
	function claimManyDonatedNfts(uint256[] calldata indexes_) external;
}
