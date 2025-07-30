// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

// import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { IDonatedTokenHolder } from "./interfaces/IDonatedTokenHolder.sol";

/// @dev todo-1 We aren't going to deploy this contract together with the others.
/// todo-1 So how to make its source code officially available on EtherScan or a similar site?
/// todo-1 Will it be automatically included in the `PrizesWallet` source code?
contract DonatedTokenHolder is /*ReentrancyGuardTransient,*/ IDonatedTokenHolder {
	address private immutable _deployerAddress = msg.sender;

	/// @notice Comment-202507146 applies.
	constructor(IERC20 tokenAddress_) {
		_authorizeDeployerAsMyTokenSpender(tokenAddress_);
	}

	modifier _onlyDeployer() {
		_checkOnlyDeployer();
		_;
	}

	function _checkOnlyDeployer() private view {
		if (msg.sender != _deployerAddress) {
			revert CosmicSignatureErrors.UnauthorizedCaller("Deployer only.", msg.sender);
		}
	}

	function authorizeDeployerAsMyTokenSpender(IERC20 tokenAddress_) external override /*nonReentrant*/ _onlyDeployer {
		_authorizeDeployerAsMyTokenSpender(tokenAddress_);
	}

	function _authorizeDeployerAsMyTokenSpender(IERC20 tokenAddress_) private {
		// [Comment-202502242]
		// This would revert if `tokenAddress_` is zero or there is no ERC-20-compatible contract there.
		// [/Comment-202502242]
		SafeERC20.forceApprove(tokenAddress_, _deployerAddress, type(uint256).max);
	}
}
