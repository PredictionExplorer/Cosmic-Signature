// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ICosmicToken } from "../production/interfaces/ICosmicToken.sol";
import { CosmicToken } from "../production/CosmicToken.sol";
import { IStakingWalletCST } from "../production/interfaces/IStakingWalletCST.sol";
import { StakingWalletCST } from "../production/StakingWalletCST.sol";
import { StakingWalletRWalk } from "../production/StakingWalletRWalk.sol";
import { RaffleWallet } from "../production/RaffleWallet.sol";
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
	function mint(address, uint256) external pure {
		require(false, "Test mint() (ERC20) failed");
	}
}
contract BrokenCharity {
	// used to test revert() statements for charity deposits
	uint256 counter;
	receive() external payable {
		require(false, "Test deposit failed");
	}
}
/*
contract BrokenStaker {
	// used to test revert() statements in StakingWallet
	bool blockDeposits = false;
	StakingWalletCST stakingWalletCST;

	// todo-1 Should `nft_` type be `CosmicSignature`?
	// todo-1 Is `nft_` the same as `sw_.nft()`?
	// todo-1 But these considerations are prbably not important in this test code.
	// todo-1 At least explain in a comment.
	constructor(StakingWalletCST sw_, address nft_) {
		stakingWalletCST = sw_;
		IERC721(nft_).setApprovalForAll(address(sw_), true);
	}

	receive() external payable {
		require(!blockDeposits, "I am not accepting deposits");
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

	function startBlockingDeposits() external {
		blockDeposits = true;
	}
}*/
contract BrokenStaker {
	// used to test revert() statements in StakingWallet
	bool blockDeposits = false;
	StakingWalletCST stakingWalletCST;

	constructor() {	}

	receive() external payable {
		require(!blockDeposits, "I am not accepting deposits");
	}

	function deposit() external payable {
		/// we don't call it doDeposit() because this method is called from CosmicGame.sol
		require(!blockDeposits, "I am not accepting deposits");
		stakingWalletCST.deposit();
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

	function startBlockingDeposits() external {
		blockDeposits = true;
	}
	function setStakingWallet(address sw_) external {
		stakingWalletCST = StakingWalletCST(sw_);
	}
	function doSetApprovalForAll(address nft_) external {
		IERC721(nft_).setApprovalForAll(address(stakingWalletCST), true);
	}
}
/*
contract BrokenStaker is StakingWalletCST {
	// used to test revert() statements in StakingWallet
	bool blockDeposits = false;

	constructor(address game_, address nft_, address charity_) StakingWalletCST(CosmicSignature(nft_),game_,charity_){
	}

	receive() external payable {
		require(!blockDeposits, "I am not accepting deposits");
	}
	function deposit() external payable override {
		require(!blockDeposits, "I am not accepting deposits");
		super.deposit();
	}

	function startBlockingDeposits() external {
		blockDeposits = true;
	}
}*/

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
	function depositStakingCST() external payable {
		(bool success, ) = address(stakingWalletCST).call{ value: msg.value }(
			abi.encodeWithSelector(StakingWalletCST.deposit.selector)
		);
		if (!success) {
			assembly {
				let ptr := mload(0x40)
				let size := returndatasize()
				returndatacopy(ptr, 0, size)
				revert(ptr, size)
			}
		}
	}
	function mintCST(address to, uint256 roundNum) external {
		// SMTChecker doesn't support low level calls, but maybe it doesn't matter in this test code.
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
	constructor(CosmicSignature nft_, address game_, address charity_) StakingWalletCST(nft_, game_, charity_) {}

	// note: functions must be copied from parent by hand (after every update), since parent have them as 'internal'
	function insertToken(uint256 tokenId, uint256 actionId) external {
		require(
			!isTokenStaked(tokenId),
			CosmicGameErrors.TokenAlreadyInserted("Token already in the list.", tokenId, actionId)
		);
		stakedTokens.push(tokenId);
		tokenIndices[tokenId] = stakedTokens.length;
		lastActionIds[tokenId] = int256(actionId);
	}

	function removeToken(uint256 tokenId) external {
		require(isTokenStaked(tokenId), CosmicGameErrors.TokenAlreadyDeleted("Token is not in the list.", tokenId));
		uint256 index = tokenIndices[tokenId];
		uint256 lastTokenId = stakedTokens[stakedTokens.length - 1];
		stakedTokens[index - 1] = lastTokenId;
		tokenIndices[lastTokenId] = index;
		delete tokenIndices[tokenId];
		stakedTokens.pop();
		lastActionIds[tokenId] = -1;
	}
}
contract TestStakingWalletRWalk is StakingWalletRWalk {
	constructor(RandomWalkNFT nft_) StakingWalletRWalk(nft_) {}

	// note: functions must be copied from parent by hand (after every update), since parent have them as 'internal'
	function insertToken(uint256 tokenId, uint256 actionId) external {
		require(
			!isTokenStaked(tokenId),
			CosmicGameErrors.TokenAlreadyInserted("Token already in the list.", tokenId, actionId)
		);
		stakedTokens.push(tokenId);
		tokenIndices[tokenId] = stakedTokens.length;
		lastActionIds[tokenId] = int256(actionId);
	}

	function removeToken(uint256 tokenId) external {
		require(isTokenStaked(tokenId), CosmicGameErrors.TokenAlreadyDeleted("Token is not in the list.", tokenId));
		uint256 index = tokenIndices[tokenId];
		uint256 lastTokenId = stakedTokens[stakedTokens.length - 1];
		stakedTokens[index - 1] = lastTokenId;
		tokenIndices[lastTokenId] = index;
		delete tokenIndices[tokenId];
		stakedTokens.pop();
		lastActionIds[tokenId] = -1;
	}
}
