// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import { StakingWalletCST } from "../StakingWalletCST.sol";
import { StakingWalletRWalk } from "../StakingWalletRWalk.sol";
import { RaffleWallet } from "../RaffleWallet.sol";
import { CosmicGame } from "../CosmicGame.sol";
import { CosmicSignature } from "../CosmicSignature.sol";
import { CosmicToken } from "../CosmicToken.sol";
import { CosmicGameConstants } from "../Constants.sol";
import { RandomWalkNFT } from "../RandomWalkNFT.sol";
import { CosmicGameErrors } from "../Errors.sol";
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
	// used to test revert() statements in BusinessLogic contract
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
contract BrokenStaker {
	// used to test revert() statements in StakingWallet
	bool blockDeposits = false;
	StakingWalletCST stakingWalletCST;
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
		stakingWalletCST.claimReward(stakeActionId, depositId);
	}
	function startBlockingDeposits() external {
		blockDeposits = true;
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

	constructor() CosmicGame() {}
	function setCharityRaw(address addr) external {
		charity = addr;
	}
	function setRaffleWalletRaw(address addr) external {
		raffleWallet = RaffleWallet(addr);
	}
	function setStakingWalletCSTRaw(address addr) external {
		stakingWalletCST = StakingWalletCST(addr);
	}
	function setNftContractRaw(address addr) external {
		nft = CosmicSignature(addr);
	}
	function setTokenContractRaw(address addr) external {
		token = CosmicToken(addr);
	}
	function setActivationTimeRaw(uint256 newActivationTime) external {
		activationTime = newActivationTime;
		lastCSTBidTime = activationTime;
	}
	function depositStakingCST() payable external {

		(bool success, ) = address(stakingWalletCST).call{value:msg.value}(
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
}
contract TestStakingWalletCST is StakingWalletCST {
	constructor(
		CosmicSignature nft_,
		CosmicGame game_,
		address charity_
	) StakingWalletCST(nft_, game_, charity_) {}

	// note: functions must be copied from parent by hand (after every update), since parent have them as 'internal'
	function insertToken(uint256 tokenId, uint256 actionId) external {
		require(
			!isTokenStaked(tokenId),
			CosmicGameErrors.TokenAlreadyInserted(
				"Token already in the list.",
				tokenId,
				actionId
			)
		);
		stakedTokens.push(tokenId);
		tokenIndices[tokenId] = stakedTokens.length;
		lastActionIds[tokenId] = int256(actionId);
	}

	function removeToken(uint256 tokenId) external {
		require(
			isTokenStaked(tokenId),
			CosmicGameErrors.TokenAlreadyDeleted(
				"Token is not in the list.",
				tokenId
			)
		);
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
	constructor(
		RandomWalkNFT nft_,
		CosmicGame game_
	) StakingWalletRWalk(nft_, game_) {}

	// note: functions must be copied from parent by hand (after every update), since parent have them as 'internal'
	function insertToken(uint256 tokenId, uint256 actionId) external {
		require(
			!isTokenStaked(tokenId),
			CosmicGameErrors.TokenAlreadyInserted(
				"Token already in the list.",
				tokenId,
				actionId
			)
		);
		stakedTokens.push(tokenId);
		tokenIndices[tokenId] = stakedTokens.length;
		lastActionIds[tokenId] = int256(actionId);
	}

	function removeToken(uint256 tokenId) external {
		require(
			isTokenStaked(tokenId),
			CosmicGameErrors.TokenAlreadyDeleted(
				"Token is not in the list.",
				tokenId
			)
		);
		uint256 index = tokenIndices[tokenId];
		uint256 lastTokenId = stakedTokens[stakedTokens.length - 1];
		stakedTokens[index - 1] = lastTokenId;
		tokenIndices[lastTokenId] = index;
		delete tokenIndices[tokenId];
		stakedTokens.pop();
		lastActionIds[tokenId] = -1;
	}
}
