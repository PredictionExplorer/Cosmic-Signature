// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { CosmicGameErrors } from "./Errors.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MarketingWallet is Ownable {
	CosmicToken public token;

	event RewardSentEvent(address indexed marketer, uint256 amount);
	event CosmicTokenAddressChanged(address newCosmicToken);

	constructor(CosmicToken token_) {
		require(
			address(token_) != address(0),
			CosmicGameErrors.ZeroAddress("Zero-address was given.")
		);
		token = token_;
	}

	function send(uint256 amount, address to) external onlyOwner {
		(bool success, ) = address(token).call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
		require(
			success,
			CosmicGameErrors.ERC20TransferFailed(
				"Transfer failed.",
				to,
				amount
			)
		);
		emit RewardSentEvent(to, amount);
	}

	function setTokenContract(address addr) external onlyOwner {
		require(
			addr != address(0),
			CosmicGameErrors.ZeroAddress("Zero-address was given.")
		);
		token = CosmicToken(addr);
		emit CosmicTokenAddressChanged(addr);
	}
}
