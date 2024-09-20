// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ICosmicToken } from "../production/interfaces/ICosmicToken.sol";
import { CosmicToken } from "../production/CosmicToken.sol";
import { IStakingWalletCST } from "../production/interfaces/IStakingWalletCST.sol";
import { StakingWalletCST } from "../production/StakingWalletCST.sol";
import { StakingWalletRWalk } from "../production/StakingWalletRWalk.sol";
import { RaffleWallet } from "../production/RaffleWallet.sol";
import { CharityWallet } from "../production/CharityWallet.sol";
import { CosmicGame } from "../production/CosmicGame.sol";
import { ICosmicSignature } from "../production/interfaces/ICosmicSignature.sol";
import { CosmicSignature } from "../production/CosmicSignature.sol";
import { CosmicGameConstants } from "../production/libraries/CosmicGameConstants.sol";
import { RandomWalkNFT } from "../production/RandomWalkNFT.sol";
import { CosmicGameErrors } from "../production/libraries/CosmicGameErrors.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract BrokenToken {
	// used to test revert() statements in token transfers in claimPrize() function
	uint256 counter;
	function mint(address, uint256 round) public {
		counter = round;
		require(false, "Test mint() failed");
	}
	function totalSupply() public pure returns (uint256) {
		return 1;
	}
}

contract BrokenERC20 {
	// used to test revert() statements in CosmicGameImplementation contract
	uint256 counter;
	constructor(uint256 _counter) {
		counter = _counter;
	}
	function mint(address, uint256) external {
		if (counter == 0 ) {
			require(false, "Test mint() (ERC20) failed");
		} else {
			counter = counter - 1;
		}
	}
}

/// @notice Used to test `revert` statements for charity deposits
contract BrokenCharity {
	// uint256 private counter;
	receive() external payable {
		require(false, "Test deposit failed");
	}
}

/// @notice used to test revert() statements for charity deposits
contract BrokenCharityWallet is CharityWallet {
	// uint256 counter;
	function setCharityToZeroAddress() external {
		charityAddress = address(0);
	}
}

/// @notice Used to test `revert` statements in `StakingWalletCST`
contract BrokenStakingWalletCST {
	StakingWalletCST private stakingWalletCST;
	bool private blockDeposits = false;

	constructor() {}

	function setStakingWallet(IStakingWalletCST sw_) external {
		stakingWalletCST = StakingWalletCST(address(sw_));
	}

	function startBlockingDeposits() external {
		blockDeposits = true;
	}

	receive() external payable {
		require(!blockDeposits, "I am not accepting deposits");
	}

	// /// @dev we don't call it doDeposit() because this method is called from CosmicGame.sol
	// function deposit() external payable {
	// 	require(!blockDeposits, "I am not accepting deposits");
	// 	stakingWalletCST.deposit();
	// }

	/// @dev we don't call it doDepositIfPossible() because this method is called from CosmicGame.sol
	function depositIfPossible() external payable {
		require(!blockDeposits, "I am not accepting deposits");
		stakingWalletCST.depositIfPossible();
	}

	function doStake(uint256 tokenId) external {
		stakingWalletCST.stake(tokenId);
	}

	function doUnstake(uint256 actionId) external {
		stakingWalletCST.unstake(actionId);
	}

	function doClaimReward(uint256 stakeActionId, uint256 depositId) external {
		uint256[] memory actions = new uint256[](1);
		uint256[] memory deposits = new uint256[](1);
		actions[0] = stakeActionId;
		deposits[0] = depositId;
		stakingWalletCST.claimManyRewards(actions, deposits);
	}

	function doSetApprovalForAll(address nft_) external {
		IERC721(nft_).setApprovalForAll(address(stakingWalletCST), true);
	}
}

contract SelfdestructibleCosmicGame is CosmicGame {
	// This contract will return all the assets before selfdestruct transaction,
	// required for testing on the MainNet (Arbitrum) (prior to launch)

	constructor() CosmicGame() {}

	function finalizeTesting() external onlyOwner {
		// returns all the assets to the creator of the contract and self-destroys

		// CosmicSignature tokens
		uint256 cosmicSupply = nft.totalSupply();
		for (uint256 i = 0; i < cosmicSupply; i++) {
			address owner = nft.ownerOf(i);
			if (owner == address(this)) {
				nft.transferFrom(address(this), this.owner(), i);
			}
		}
		cosmicSupply = token.balanceOf(address(this));
		token.transfer(this.owner(), cosmicSupply);
		for (uint256 i = 0; i < numDonatedNFTs; i++) {
			CosmicGameConstants.DonatedNFT memory dnft = donatedNFTs[i];
			IERC721(dnft.nftAddress).transferFrom(address(this), this.owner(), dnft.tokenId);
		}
		selfdestruct(payable(this.owner()));
	}
}

contract SpecialCosmicGame is CosmicGame {
	// special CosmicGame contract to be used in unit tests to create special test setups

	function setCharityRaw(address addr) external {
		charity = addr;
	}
	function setRaffleWalletRaw(address addr) external {
		raffleWallet = addr;
	}
	function setStakingWalletCSTRaw(IStakingWalletCST addr) external {
		stakingWalletCST = StakingWalletCST(address(addr));
	}
	function setNftContractRaw(ICosmicSignature addr) external {
		nft = CosmicSignature(address(addr));
	}
	function setTokenContractRaw(ICosmicToken addr) external {
		token = CosmicToken(address(addr));
	}
	function setActivationTimeRaw(uint256 newActivationTime) external {
		activationTime = newActivationTime;
		lastCSTBidTime = activationTime;
	}
	// function depositStakingCST() external payable {
	//		// todo-9 Should we make a high level call here?
	// 	(bool success, ) = address(stakingWalletCST).call{ value: msg.value }(
	// 		abi.encodeWithSelector(StakingWalletCST.deposit.selector)
	// 	);
	// 	if (!success) {
	// 		assembly {
	// 			let ptr := mload(0x40)
	// 			let size := returndatasize()
	// 			returndatacopy(ptr, 0, size)
	// 			revert(ptr, size)
	// 		}
	// 	}
	// }
	function depositStakingCSTIfPossible() external payable {
		stakingWalletCST.depositIfPossible{ value: msg.value }();
	}
	function mintCST(address to, uint256 roundNum) external {
		(bool success, ) = address(nft).call(abi.encodeWithSelector(CosmicSignature.mint.selector, to, roundNum));

		if (!success) {
			assembly {
				let ptr := mload(0x40)
				let size := returndatasize()
				returndatacopy(ptr, 0, size)
				revert(ptr, size)
			}
		}
	}
}

contract TestStakingWalletCST is StakingWalletCST {
	// todo-1 Is `nft_` the same as `game_.nft()`?
	// todo-1 At least explain in a comment.
	constructor(CosmicSignature nft_, address game_ /* , address charity_ */) StakingWalletCST(nft_, game_ /* , charity_ */) {}

	function insertToken(uint256 tokenId, uint256 actionId) external {
		// // [Comment-202409274]
		// // Issue. The code must be copied from parent by hand (after every update), since parent have them as `internal`.
		// // todo-9 Reference this comment near the code to be copied.
		// // Issue. But why can't we just call the inherited function here? We now do it and it seems to work.
		// // [/Comment-202409274]
		// require(
		// 	!isTokenStaked(tokenId),
		// 	CosmicGameErrors.TokenAlreadyInserted("Token already in the list.", tokenId, actionId)
		// );
		// stakedTokens.push(tokenId);
		// tokenIndices[tokenId] = stakedTokens.length;
		// lastActionIds[tokenId] = int256(actionId);

		_insertToken(tokenId, actionId);
	}

	function removeToken(uint256 tokenId) external {
		// // Comment-202409274 applies.
		// require(isTokenStaked(tokenId), CosmicGameErrors.TokenAlreadyDeleted("Token is not in the list.", tokenId));
		// uint256 index = tokenIndices[tokenId];
		// uint256 lastTokenId = stakedTokens[stakedTokens.length - 1];
		// stakedTokens[index - 1] = lastTokenId;
		// tokenIndices[lastTokenId] = index;
		// delete tokenIndices[tokenId];
		// stakedTokens.pop();
		// lastActionIds[tokenId] = -1;

		_removeToken(tokenId);
	}
}

contract TestStakingWalletRWalk is StakingWalletRWalk {
	constructor(RandomWalkNFT nft_) StakingWalletRWalk(nft_) {}

	function insertToken(uint256 tokenId, uint256 actionId) external {
		// // Comment-202409274 applies.
		// require(
		// 	!isTokenStaked(tokenId),
		// 	CosmicGameErrors.TokenAlreadyInserted("Token already in the list.", tokenId, actionId)
		// );
		// stakedTokens.push(tokenId);
		// tokenIndices[tokenId] = stakedTokens.length;
		// lastActionIds[tokenId] = int256(actionId);

		_insertToken(tokenId, actionId);
	}

	function removeToken(uint256 tokenId) external {
		// // Comment-202409274 applies.
		// require(isTokenStaked(tokenId), CosmicGameErrors.TokenAlreadyDeleted("Token is not in the list.", tokenId));
		// uint256 index = tokenIndices[tokenId];
		// uint256 lastTokenId = stakedTokens[stakedTokens.length - 1];
		// stakedTokens[index - 1] = lastTokenId;
		// tokenIndices[lastTokenId] = index;
		// delete tokenIndices[tokenId];
		// stakedTokens.pop();
		// lastActionIds[tokenId] = -1;

		_removeToken(tokenId);
	}
}
