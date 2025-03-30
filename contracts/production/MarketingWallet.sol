// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

// #endregion
// #region

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { ICosmicSignatureToken, CosmicSignatureToken } from "./CosmicSignatureToken.sol";
import { IMarketingWallet } from "./interfaces/IMarketingWallet.sol";

// #endregion
// #region

contract MarketingWallet is Ownable, AddressValidator, IMarketingWallet {
	// #region State

	/// @notice The `CosmicSignatureToken` contract address.
	/// Comment-202411064 no longer applies, because of Comment-202502235.
	/// @dev
	/// [Comment-202502235]
	/// I have declared `token` `immutable` and eliminatd `setCosmicSignatureToken` and `CosmicSignatureTokenAddressChanged`.
	/// [/Comment-202502235]
	CosmicSignatureToken public immutable token;

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @param token_ The `CosmicSignatureToken` contract address.
	constructor(CosmicSignatureToken token_)
		_providedAddressIsNonZero(address(token_))
		Ownable(_msgSender()) {
		token = token_;
	}

	// #endregion
	// #region // `setCosmicSignatureToken`

	// function setCosmicSignatureToken(ICosmicSignatureToken newValue_) external override
	// 	onlyOwner
	// 	_providedAddressIsNonZero(address(newValue_)) {
	// 	token = CosmicSignatureToken(address(newValue_));
	// 	emit CosmicSignatureTokenAddressChanged(newValue_);
	// }

	// #endregion
	// #region `payReward`

	function payReward(address marketerAddress_, uint256 amount_) external override onlyOwner {
		emit RewardPaid(marketerAddress_, amount_);

		// [Comment-202501137]
		// This will validate that the given address is a nonzero.
		// [/Comment-202501137]
		token.transfer(marketerAddress_, amount_);
	}

	// #endregion
	// #region `payManyRewards`

	function payManyRewards(address[] calldata marketerAddresses_, uint256 amount_) external override onlyOwner {
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

	function payManyRewards(ICosmicSignatureToken.MintSpec[] calldata specs_) external override onlyOwner {
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
