// #region

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// #endregion
// #region

// import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Nonces } from "@openzeppelin/contracts/utils/Nonces.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import { ERC20Votes } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { ICosmicSignatureToken } from "./interfaces/ICosmicSignatureToken.sol";

// #endregion
// #region

contract CosmicSignatureToken is
	// Ownable,
	ERC20,

	// Comment-202409177 relates.
	ERC20Burnable, // todo-1 This is needed -- confirmed.

	ERC20Permit,
	ERC20Votes,
	AddressValidator,
	ICosmicSignatureToken {
	// #region State

	/// @notice The `CosmicSignatureGame` contract address.
	address public immutable game;

	// /// @notice This address holds some CST amount.
	// /// The held amount is replenished when someone bids with CST.
	// /// todo-1 The above comment is incorrect. We now mint at the end of a round.
	// /// Comment-202412201 relates and/or applies.
	// /// The funds are to be used to reward people for marketing the project on social media.
	// /// This can be the address of an externally owned account controlled by the project founders.
	// /// The project founders plan to eventually transfer this wallet control to the DAO.
	// /// @dev
	// /// [ToDo-202412202-1]
	// /// So develop a test in which the DAO rewards a marketer.
	// /// But the DAO is too slow to vote. I've set voting period to 2 weeks, right? Discuss this issue with the guys.
	// /// Actually the DAO will only appoint a treasurer to manage the marketing wallet.
	// /// ToDo-202412203-1 relates.
	// /// [/ToDo-202412202-1]
	// address public marketingWalletAddress;

	// /// @notice
	// /// [Comment-202412201]
	// /// If `marketingWalletAddress` already holds at least this token amount, any new received funds will be burned.
	// /// This limit can be exceeded by a little.
	// /// [/Comment-202412201]
	// uint256 public marketingWalletBalanceAmountMaxLimit;

	// #endregion
	// #region `onlyGame`

	/// @dev Comment-202411253 applies.
	modifier onlyGame() {
		require(
			msg.sender == game,
			CosmicSignatureErrors.CallDenied("Only the CosmicSignatureGame contract is permitted to call this method.", msg.sender)
		);
		_;
	}

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @param game_ The `CosmicSignatureGame` contract address.
	/// ---param marketingWalletAddress_ To be assigned to `marketingWalletAddress`.
	constructor(address game_ /* , address marketingWalletAddress_ */)
		// Ownable(msg.sender)
		ERC20("CosmicSignatureToken", "CST")
		ERC20Permit("CosmicSignatureToken")
		providedAddressIsNonZero(game_)
		/*providedAddressIsNonZero(marketingWalletAddress_)*/ {
		game = game_;
		// marketingWalletAddress = marketingWalletAddress_;
		// marketingWalletBalanceAmountMaxLimit = CosmicSignatureConstants.DEFAULT_MARKETING_WALLET_BALANCE_AMOUNT_MAX_LIMIT;
	}

	// #endregion
	// #region // `setMarketingWalletAddress`

	// function setMarketingWalletAddress(address newValue_) external override onlyOwner providedAddressIsNonZero(newValue_) {
	// 	marketingWalletAddress = newValue_;
	// 	emit MarketingWalletAddressChanged(newValue_);
	// }

	// #endregion
	// #region // `setMarketingWalletBalanceAmountMaxLimit`

	// function setMarketingWalletBalanceAmountMaxLimit(uint256 newValue_) external override onlyOwner {
	// 	marketingWalletBalanceAmountMaxLimit = newValue_;
	// 	emit MarketingWalletBalanceAmountMaxLimitChanged(newValue_);
	// }

	// #endregion
	// #region // `transferToMarketingWalletOrBurn`

	// function transferToMarketingWalletOrBurn(address fromAddress_, uint256 amount_) external override onlyGame {
	// 	// Comment-202412251 applies.
	// 	// #enable_asserts assert(fromAddress_ != marketingWalletAddress);
	//
	// 	if (balanceOf(marketingWalletAddress) < marketingWalletBalanceAmountMaxLimit) {
	// 		_transfer(fromAddress_, marketingWalletAddress, amount_);
	// 	} else {
	// 		_burn(fromAddress_, amount_);
	// 	}
	// }

	// #endregion
	// #region // `mintToMarketingWallet`

	// function mintToMarketingWallet(uint256 amount_) external override onlyGame {
	// 	_mint(marketingWalletAddress, amount_);
	// }

	// #endregion
	// #region `mint`

	function mint(address account_, uint256 value_) external override onlyGame {
		_mint(account_, value_);
	}

	// #endregion
	// #region `burn`

	function burn(address account_, uint256 value_) external override onlyGame {
		// // This assert now lives in `Bidding`, near Comment-202412251.
		// // #enable_asserts assert(account_ != marketingWalletAddress);

		_burn(account_, value_);
	}

	// #endregion
	// #region // `safeApprove`

	// /// @dev todo-1 Idea.
	// /// `oldAllowance_` is the allowance the caller has seen before they sent a transaction request to call this method.
	// /// Event if the allowance decreases before the transaction gets executed this method will do the right thing.
	// /// This method offers no benefit if either `oldAllowance_` or `newAllowance_` is zero.
	// /// It's incorrect to call this method if `newAllowance_` is the maximum possible value.
	// /// todo-1 ??? Maybe rename `oldAllowance_` and `newAllowance_` to `oldValue_` and `newValue_`.
	// function safeApprove(address spender_, uint256 oldAllowance_, uint256 newAllowance_) external /*override*/ {
	// 	// Comment-202409215 applies.
	// 	// #enable_asserts assert(newAllowance_ < type(uint256).max);
	//
	// 	uint256 allowance_ = allowance(msg.sender, spender_);
	// 	if (allowance_ < oldAllowance_) {
	// 		uint256 diff_ = oldAllowance_ - allowance_;
	// 		if (diff_ < newAllowance_) {
	// 			newAllowance_ -= diff_;
	// 		} else {
	// 			newAllowance_ = 0;
	// 		}
	// 	}
	// 	_approve(msg.sender, spender_, newAllowance_);
	// }

	// #endregion
	// #region `CLOCK_MODE`

	/// @notice Comment-202501123 relates and/or applies.
	/// solhint-disable-next-line func-name-mixedcase
	function CLOCK_MODE() public pure override returns(string memory) {
		return "mode=timestamp";
	}

	// #endregion
	// #region `clock`

	/// @notice Comment-202501123 relates and/or applies.
	function clock() public view override returns(uint48) {
		return uint48(block.timestamp);
	}

	// #endregion
	// #region Overrides Required By Solidity

	function _update(address from_, address to_, uint256 value_) internal override(ERC20, ERC20Votes) {
		super._update(from_, to_, value_);
	}

	function nonces(address owner_) public view override(ERC20Permit, Nonces) returns(uint256) {
		return super.nonces(owner_);
	}

	// #endregion
}

// #endregion
