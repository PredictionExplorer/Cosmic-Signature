// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.33;

// #endregion
// #region

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { ICosmicSignatureToken, CosmicSignatureToken } from "./CosmicSignatureToken.sol";
import { IMarketingWallet } from "./interfaces/IMarketingWallet.sol";

// #endregion
// #region

/// @title MarketingWallet
/// @author Cosmic Signature Team
/// @notice Manages CST rewards for marketing and promotional activities.
/// @dev This contract holds CST tokens minted at the end of each bidding round and allows
/// a designated treasurer to distribute them to marketers as rewards.
/// Features:
/// - Treasurer role: Only the treasurer can distribute rewards.
/// - Batch transfers: Supports efficient batch reward distribution.
/// - Owner control: Owner can change the treasurer address.
contract MarketingWallet is Ownable, AddressValidator, IMarketingWallet {
	// #region State

	/// @notice The treasurer's role is to distribute marketing rewards.
	address public treasurerAddress;

	/// @notice The `CosmicSignatureToken` contract address.
	CosmicSignatureToken public immutable token;

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @param token_ The `CosmicSignatureToken` contract address.
	constructor(CosmicSignatureToken token_)
		_providedAddressIsNonZero(address(token_))
		Ownable(_msgSender()) {
		treasurerAddress = _msgSender();
		token = token_;
	}

	// #endregion
	// #region `_onlyTreasurer`

	modifier _onlyTreasurer() {
		_checkOnlyTreasurer();
		_;
	}

	// #endregion
	// #region `_checkOnlyTreasurer`

	function _checkOnlyTreasurer() private view {
		if (_msgSender() != treasurerAddress) {
			revert CosmicSignatureErrors.UnauthorizedCaller("Only the tresurer is permitted to call this method.", _msgSender());
		}
	}

	// #endregion
	// #region `setTreasurerAddress`

	/// @inheritdoc IMarketingWallet
	function setTreasurerAddress(address newValue_) external override onlyOwner _providedAddressIsNonZero(newValue_) {
		treasurerAddress = newValue_;
		emit TreasurerAddressChanged(newValue_);
	}

	// #endregion
	// #region `payReward`

	/// @inheritdoc IMarketingWallet
	function payReward(address marketerAddress_, uint256 amount_) external override _onlyTreasurer {
		emit RewardPaid(marketerAddress_, amount_);

		// [Comment-202501137]
		// This will validate that the given address is a nonzero.
		// [/Comment-202501137]
		token.transfer(marketerAddress_, amount_);
	}

	// #endregion
	// #region `payManyRewards`

	/// @inheritdoc IMarketingWallet
	/// @dev Pays the same reward amount to multiple marketers.
	function payManyRewards(address[] calldata marketerAddresses_, uint256 amount_) external override _onlyTreasurer {
		for (uint256 index_ = marketerAddresses_.length; index_ > 0; ) {
			-- index_;
			address marketerAddress_ = marketerAddresses_[index_];
			emit RewardPaid(marketerAddress_, amount_);
		}

		// Comment-202501137 applies.
		token.transferMany(marketerAddresses_, amount_);
	}

	// #endregion
	// #region `payManyRewards`

	/// @inheritdoc IMarketingWallet
	/// @dev Pays different reward amounts to different marketers.
	function payManyRewards(ICosmicSignatureToken.MintSpec[] calldata specs_) external override _onlyTreasurer {
		for (uint256 index_ = specs_.length; index_ > 0; ) {
			-- index_;
			ICosmicSignatureToken.MintSpec calldata specReference_ = specs_[index_];
			address marketerAddress_ = specReference_.account;
			uint256 amount_ = specReference_.value;
			emit RewardPaid(marketerAddress_, amount_);
		}

		// Comment-202501137 applies.
		token.transferMany(specs_);
	}

	// #endregion
}

// #endregion
