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
import { Bidding } from "../production/Bidding.sol";
import { NFTDonations } from "../production/NFTDonations.sol";
import { ICosmicSignature } from "../production/interfaces/ICosmicSignature.sol";
import { CosmicSignature } from "../production/CosmicSignature.sol";
import { CosmicGameConstants } from "../production/libraries/CosmicGameConstants.sol";
import { RandomWalkNFT } from "../production/RandomWalkNFT.sol";
import { CosmicGameErrors } from "../production/libraries/CosmicGameErrors.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

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
/// @dev todo-1 This contract name is confising. Make sense to rename it to `BrokenStakingWalletCST`?
contract BrokenStaker {
	StakingWalletCST private stakingWalletCST;
	bool private blockDeposits = false;

	constructor() {}

	receive() external payable {
		require(!blockDeposits, "I am not accepting deposits");
	}

	// /// @dev we don't call it doDeposit() because this method is called from CosmicGame.sol
	// function deposit() external payable {
	// 	require(!blockDeposits, "I am not accepting deposits");
	// 	stakingWalletCST.deposit();
	// }

	/// @dev we don't call it doDepositIfPossible() because this method is called from CosmicGame.sol
	function depositIfPossible(uint256 roundNum_) external payable {
		require(!blockDeposits, "I am not accepting deposits");
		stakingWalletCST.depositIfPossible(roundNum_);
	}

	function doStake(uint256 tokenId) external {
		stakingWalletCST.stake(tokenId);
	}

	function doUnstake(uint256 actionId) external {
		stakingWalletCST.unstake(actionId);
	}

	// todo-0 I have commented this out because the `StakingWalletCST.claimManyRewards` function no longer exists.
	// function doClaimReward(uint256 stakeActionId, uint256 depositId) external {
	// 	uint256[] memory actions = new uint256[](1);
	// 	uint256[] memory deposits = new uint256[](1);
	// 	actions[0] = stakeActionId;
	// 	deposits[0] = depositId;
	// 	stakingWalletCST.claimManyRewards(actions, deposits);
	// }

	function startBlockingDeposits() external {
		blockDeposits = true;
	}

	function setStakingWallet(IStakingWalletCST sw_) external {
		stakingWalletCST = StakingWalletCST(address(sw_));
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
	function depositStakingCSTIfPossible(uint256 roundNum_) external payable {
		stakingWalletCST.depositIfPossible{ value: msg.value }(roundNum_);
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

// todo-0 I have commented this out because the `StakingWalletCST._insertToken` and `StakingWalletCST._removeToken` functions no longer exist.
// contract TestStakingWalletCST is StakingWalletCST {
// 	// todo-1 Is `nft_` the same as `game_.nft()`?
// 	// todo-1 At least explain in a comment.
// 	constructor(CosmicSignature nft_, address game_ /* , address charity_ */) StakingWalletCST(nft_, game_ /* , charity_ */) {}
//
// 	function doInsertToken(uint256 _tokenId,uint256 _actionId) external {
// 		_insertToken(_tokenId,_actionId);
// 	}
// 	function doRemoveToken(uint256 _tokenId) external {
// 		_removeToken(_tokenId);
// 	}
// }

contract TestStakingWalletRWalk is StakingWalletRWalk {
	constructor(RandomWalkNFT nft_) StakingWalletRWalk(nft_) {}

	function doInsertToken(uint256 _tokenId,uint256 _actionId) external {
		_insertToken(_tokenId,_actionId);
	}
	function doRemoveToken(uint256 _tokenId) external {
		_removeToken(_tokenId);
	}
}

contract MaliciousToken1 is ERC721 {

	// sends donateNFT() inside a call to transfer a token, generating reentrant function call
	constructor(string memory name_, string memory symbol_) ERC721(name_,symbol_) {

	}
	function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public override {
		// the following call should revert
		(bool success, bytes memory retval) = msg.sender.call(abi.encodeWithSelector(NFTDonations.donateNFT.selector,address(this),0));
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

contract MaliciousToken2 is ERC721 {
	address game;
	// sends bidAndDonateNFT() inside a call to transfer a token, generating reentrant function call
	constructor(address game_,string memory name_, string memory symbol_) ERC721(name_,symbol_) {
		game = game_;
	}
	function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public override {
		uint256 price = Bidding(payable(address(game))).getBidPrice();
		CosmicGame.BidParams memory defaultParams;
		defaultParams.message = "";
		defaultParams.randomWalkNFTId = -1;
		bytes memory param_data;
		param_data = abi.encode(defaultParams);
		// the following call should revert
		(bool success, bytes memory retval) = msg.sender.call(abi.encodeWithSelector(CosmicGame.bidAndDonateNFT.selector,param_data,address(this),0));
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
