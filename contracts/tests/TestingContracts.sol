// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC721, ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { CosmicSignatureConstants } from "../production/libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureHelpers } from "../production/libraries/CosmicSignatureHelpers.sol";
import { CosmicSignatureErrors } from "../production/libraries/CosmicSignatureErrors.sol";
import { /*ICosmicSignatureToken,*/ CosmicSignatureToken } from "../production/CosmicSignatureToken.sol";
import { ICosmicSignatureNft, CosmicSignatureNft } from "../production/CosmicSignatureNft.sol";
import { RandomWalkNFT } from "../production/RandomWalkNFT.sol";
import { IStakingWalletCosmicSignatureNft, StakingWalletCosmicSignatureNft } from "../production/StakingWalletCosmicSignatureNft.sol";
import { StakingWalletRandomWalkNft } from "../production/StakingWalletRandomWalkNft.sol";
import { IPrizesWallet } from "../production/interfaces/IPrizesWallet.sol";
import { CharityWallet } from "../production/CharityWallet.sol";
import { IBidding, Bidding } from "../production/Bidding.sol";
// import { NftDonations } from "../production/NftDonations.sol";
import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";

contract BrokenToken {
	/// notice used to test revert() statements in token transfers in claimPrize() function
	uint256 private _counter;

	function mint(address, uint256 roundNum_) public {
		_counter = roundNum_;
		require(false, "Test mint() failed.");
	}
	
	function totalSupply() public pure returns (uint256) {
		return 1;
	}
}

/// @notice used to test revert() statements in CosmicSignatureGame contract
/// todo-1 Rename to `BrokenErc20`.
contract BrokenERC20 {
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

/// @notice Used to test `revert` statements for charity deposits.
contract BrokenCharity {
	// uint256 private counter;
	
	receive() external payable {
		require(false, "Test deposit failed.");
	}
}

/// @notice used to test `revert` statements for charity deposits.
contract BrokenCharityWallet is CharityWallet {
	function clearCharityAddress() external {
		charityAddress = address(0);
	}
}

/// @notice Used to test `revert` statements in `StakingWalletCosmicSignatureNft`
contract BrokenStakingWalletCosmicSignatureNft {
	StakingWalletCosmicSignatureNft private _stakingWalletCosmicSignatureNft;
	bool private _blockDeposits = false;

	constructor() {}

	receive() external payable {
		require(!_blockDeposits, "I am not accepting deposits");
	}

	// /// @dev we don't call it doDeposit() because this method is called from CosmicSignatureGame.sol
	// function deposit() external payable {
	// 	require(!_blockDeposits, "I am not accepting deposits");
	// 	_stakingWalletCosmicSignatureNft.deposit();
	// }

	/// @dev we don't call it doDepositIfPossible() because this method is called from CosmicSignatureGame.sol
	function depositIfPossible(uint256 roundNum_) external payable {
		require(!_blockDeposits, "I am not accepting deposits");
		_stakingWalletCosmicSignatureNft.depositIfPossible(roundNum_);
	}

	function doStake(uint256 nftId) external {
		_stakingWalletCosmicSignatureNft.stake(nftId);
	}

	// todo-0 Nick, I added the 2nd param. Tests that call this function are broken now.
	function doUnstake(uint256 stakeActionId_, uint256 numEthDepositsToEvaluateMaxLimit_) external {
		_stakingWalletCosmicSignatureNft.unstake(stakeActionId_, numEthDepositsToEvaluateMaxLimit_);
	}

	// todo-1 I have commented this out because the `StakingWalletCosmicSignatureNft.claimManyRewards` function no longer exists.
	// function doClaimReward(uint256 stakeActionId, uint256 depositId) external {
	// 	uint256[] memory actions = new uint256[](1);
	// 	uint256[] memory deposits = new uint256[](1);
	// 	actions[0] = stakeActionId;
	// 	deposits[0] = depositId;
	// 	_stakingWalletCosmicSignatureNft.claimManyRewards(actions, deposits);
	// }

	function startBlockingDeposits() external {
		_blockDeposits = true;
	}

	function stopBlockingDeposits() external {
		_blockDeposits = false;
	}

	function setStakingWalletCosmicSignatureNft(IStakingWalletCosmicSignatureNft newValue_) external {
		_stakingWalletCosmicSignatureNft = StakingWalletCosmicSignatureNft(address(newValue_));
	}

	function doSetApprovalForAll(IERC721 nft_) external {
		nft_.setApprovalForAll(address(_stakingWalletCosmicSignatureNft), true);
	}
}

/// @notice This contract will return all the assets before selfdestruct transaction,
/// required for testing on the MainNet (Arbitrum) (prior to launch).
contract SelfDestructibleCosmicSignatureGame is CosmicSignatureGame {
	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() CosmicSignatureGame() {
	}

	// todo-1 This method no longer compiles because I moved NFT donations to `PrizesWallet`.
	// function finalizeTesting() external onlyOwner {
	// 	// returns all the assets to the creator of the contract and self-destroys
	//
	// 	// CosmicSignature NFTs.
	// 	uint256 cosmicSupply = nft.totalSupply();
	// 	for (uint256 i = 0; i < cosmicSupply; i++) {
	// 		address nftOwnerAddress_ = nft.ownerOf(i);
	// 		if (nftOwnerAddress_ == address(this)) {
	// 			nft.transferFrom(address(this), owner(), i);
	// 		}
	// 	}
	// 	cosmicSupply = token.balanceOf(address(this));
	// 	token.transfer(owner(), cosmicSupply);
	// 	for (uint256 i = 0; i < numDonatedNfts; i++) {
	// 		CosmicSignatureConstants.DonatedNft memory dnft = donatedNfts[i];
	// 		dnft.nftAddress.transferFrom(address(this), owner(), dnft.nftId);
	// 	}
	// 	selfdestruct(payable(owner()));
	// }
}

/// @notice special CosmicSignatureGame contract to be used in unit tests to create special test setups
contract SpecialCosmicSignatureGame is CosmicSignatureGame {
	/// @dev Issue. Random number generation logic in this test contract smells bad, but keeping it simple.
	/// Comment-202412104 relates.
	uint256 private _entropy;

	// function setActivationTimeRaw(uint256 newValue_) external {
	// 	activationTime = newValue_;
	//
	// 	// Comment-202411168 applies.
	// 	lastCstBidTimeStamp = newValue_;
	// }

	// function setPrizesWalletRaw(IPrizesWallet newValue_) external {
	// 	prizesWallet = PrizesWallet(address(newValue_));
	// }

	// function setCosmicSignatureTokenRaw(ICosmicSignatureToken newValue_) external {
	// 	token = CosmicSignatureToken(address(newValue_));
	// }

	/// @dev todo-1 Do we really need this? We now can set activation time to the future and make any changes the normal way.
	/// todo-1 Rename to `setCosmicSignatureNftRaw`.
	function setNftContractRaw(ICosmicSignatureNft newValue_) external {
		nft = CosmicSignatureNft(address(newValue_));
	}

	/// @dev todo-1 Do we really need this? We now can set activation time to the future and make any changes the normal way.
	function setStakingWalletCosmicSignatureNftRaw(IStakingWalletCosmicSignatureNft newValue_) external {
		stakingWalletCosmicSignatureNft = StakingWalletCosmicSignatureNft(address(newValue_));
	}

	// function setCharityAddressRaw(address newValue_) external {
	// 	charityAddress = newValue_;
	// }

	// function depositStakingCST() external payable {
	//		// todo-9 Should we make a high level call here?
	// 	(bool isSuccess_, ) = address(stakingWalletCosmicSignatureNft).call{ value: msg.value }(
	// 		abi.encodeWithSelector(IStakingWalletCosmicSignatureNft.deposit.selector)
	// 	);
	// 	if ( ! isSuccess_ ) {
	// 		assembly {
	// 			let ptr := mload(0x40)
	// 			let size := returndatasize()
	// 			returndatacopy(ptr, 0, size)
	// 			revert(ptr, size)
	// 		}
	// 	}
	// }

	function depositToStakingWalletCosmicSignatureNftIfPossible() external payable {
		stakingWalletCosmicSignatureNft.depositIfPossible{ value: msg.value }(roundNum);
	}
	
	function mintCosmicSignatureNft(address to_) external {
		_updateEntropy();
		// todo-1 Should we make a high level call here?
		(bool isSuccess_, ) = address(nft).call(abi.encodeWithSelector(ICosmicSignatureNft.mint.selector, roundNum, to_, _entropy));
		if ( ! isSuccess_ ) {
			assembly {
				let ptr_ := mload(0x40)
				let size_ := returndatasize()
				returndatacopy(ptr_, 0, size_)
				revert(ptr_, size_)
			}
		}
	}

	function _updateEntropy() private {
		_entropy = CosmicSignatureHelpers.calculateHashSumOf((_entropy == 0) ? block.prevrandao : _entropy);
	}
}

/// todo-1 These legacy functions no longer exist.
contract TestStakingWalletCosmicSignatureNft is StakingWalletCosmicSignatureNft {
	constructor(CosmicSignatureNft nft_, address game_) StakingWalletCosmicSignatureNft(nft_, game_) {}

	// function doInsertToken(uint256 _nftId, uint256 stakeActionId_) external {
	// 	_insertToken(_nftId, stakeActionId_);
	// }

	// function doRemoveToken(uint256 _nftId) external {
	// 	_removeToken(_nftId);
	// }
}

/// todo-1 These legacy functions no longer exist.
contract TestStakingWalletRandomWalkNft is StakingWalletRandomWalkNft {
	constructor(RandomWalkNFT nft_) StakingWalletRandomWalkNft(nft_) {}

	// function doInsertToken(uint256 _nftId, uint256 stakeActionId_) external {
	// 	_insertToken(_nftId, stakeActionId_);
	// }
	
	// function doRemoveToken(uint256 _nftId) external {
	// 	_removeToken(_nftId);
	// }
}

contract MaliciousNft1 is ERC721 {
	constructor(string memory name_, string memory symbol_) ERC721(name_,symbol_) {
	}

	/// @notice sends donateNft() inside a call to transfer a token, generating reentrant function call
	function safeTransferFrom(address from, address to, uint256 nftId, bytes memory data) public override {
		// the following call should revert
		// todo-1 This will probably revert now due to `onlyGame`.
		// todo-1 Should we make a high level call here?
		(bool isSuccess_, /*bytes memory retval*/) =
			msg.sender.call(abi.encodeWithSelector(IPrizesWallet.donateNft.selector, uint256(0), address(this), uint256(0)));
		if ( ! isSuccess_ ) {
			assembly {
				let ptr := mload(0x40)
				let size := returndatasize()
				returndatacopy(ptr, 0, size)
				revert(ptr, size)
			}
		}
	}
}

contract MaliciousNft2 is ERC721 {
	// address private game;

	constructor(/*address game_,*/ string memory name_, string memory symbol_) ERC721(name_, symbol_) {
		// game = game_;
	}

	// /// @notice sends bidAndDonateNft() inside a call to transfer a token, generating reentrant function call
	// /// @dev todo-1 This method is now broken. See todos in its body.
	// function safeTransferFrom(address from, address to, uint256 nftId, bytes memory data) public override {
	// 	// uint256 price = Bidding(/*payable*/(game)).getBidPrice();
	// 	// todo-1 This structure no longer exists.
	// 	CosmicSignatureGame.BidParams memory defaultParams;
	// 	// defaultParams.message = "";
	// 	defaultParams.randomWalkNftId = -1;
	// 	bytes memory param_data = abi.encode(defaultParams);
	// 	// the following call should revert
	// 	// todo-1 Should we make a high level call here?
	// 	(bool isSuccess_, /*bytes memory retval*/) =
	// 		// todo-1 This call is now incorrect because `msg.sender` points at `PrizesWallet`, rather than at `CosmicSignatureGame`.
	// 		msg.sender.call(abi.encodeWithSelector(IBidding.bidAndDonateNft.selector, param_data, address(this), uint256(0)));
	// 	if ( ! isSuccess_ ) {
	// 		assembly {
	// 			let ptr := mload(0x40)
	// 			let size := returndatasize()
	// 			returndatacopy(ptr, 0, size)
	// 			revert(ptr, size)
	// 		}
	// 	}
	// }
}
