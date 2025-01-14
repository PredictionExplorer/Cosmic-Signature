// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
// import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { ICosmicSignatureToken, CosmicSignatureToken } from "./CosmicSignatureToken.sol";
import { IMarketingWallet } from "./interfaces/IMarketingWallet.sol";

contract MarketingWallet is Ownable, AddressValidator, IMarketingWallet {
	/// @notice The `CosmicSignatureToken` contract address.
	/// Comment-202411064 applies.
	CosmicSignatureToken public token;

	/// @notice Constructor.
	/// @param token_ The `CosmicSignatureToken` contract address.
	constructor(CosmicSignatureToken token_)
		Ownable(msg.sender)
		providedAddressIsNonZero(address(token_)) {
		token = token_;
	}

	function setCosmicSignatureToken(ICosmicSignatureToken newValue_) external override
		onlyOwner
		providedAddressIsNonZero(address(newValue_)) {
		token = CosmicSignatureToken(address(newValue_));
		emit CosmicSignatureTokenAddressChanged(newValue_);
	}

	function payReward(address marketerAddress_, uint256 amount_) external override onlyOwner {
		// try
		// [Comment-202501137]
		// This will validate that the address to transfer funds to is a nonzero.
		// [/Comment-202501137]
		// ToDo-202409245-1 applies.
		token.transfer(marketerAddress_, amount_);
		// {
		// } catch {
		// 	revert CosmicSignatureErrors.ERC20TransferFailed("Transfer failed.", marketerAddress_, amount_);
		// }

		emit RewardPaid(marketerAddress_, amount_);
	}

	function payRewards(address[] calldata marketerAddresses_, uint256 amount_) external override onlyOwner {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// Comment-202501137 applies.
			token.transferMany(marketerAddresses_, amount_);

			for (uint256 index_ = marketerAddresses_.length; index_ > 0; ) {
				-- index_;
				address marketerAddress_ = marketerAddresses_[index_];
				emit RewardPaid(marketerAddress_, amount_);
			}
		}
	}

	function payRewards(ICosmicSignatureToken.MintSpec[] calldata specs_) external override onlyOwner {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// Comment-202501137 applies.
			token.transferMany(specs_);

			for (uint256 index_ = specs_.length; index_ > 0; ) {
				-- index_;
				ICosmicSignatureToken.MintSpec calldata spec_ = specs_[index_];
				address marketerAddress_ = spec_.account;
				uint256 amount_ = spec_.value;
				emit RewardPaid(marketerAddress_, amount_);
			}
		}
	}
}
