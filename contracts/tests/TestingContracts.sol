// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { IERC721, ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { CosmicSignatureConstants } from "../production/libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureHelpers } from "../production/libraries/CosmicSignatureHelpers.sol";
import { CosmicSignatureErrors } from "../production/libraries/CosmicSignatureErrors.sol";
import { ICosmicSignatureToken } from "../production/interfaces/ICosmicSignatureToken.sol";
import { RandomWalkNFT } from "../production/RandomWalkNFT.sol";
import { ICosmicSignatureNft, CosmicSignatureNft } from "../production/CosmicSignatureNft.sol";
import { IPrizesWallet } from "../production/interfaces/IPrizesWallet.sol";
import { StakingWalletRandomWalkNft } from "../production/StakingWalletRandomWalkNft.sol";
import { IStakingWalletCosmicSignatureNft, StakingWalletCosmicSignatureNft } from "../production/StakingWalletCosmicSignatureNft.sol";
import { CharityWallet } from "../production/CharityWallet.sol";
// import { IBidding, Bidding } from "../production/Bidding.sol";
// import { NftDonations } from "../production/NftDonations.sol";
import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";

// /// @notice used to test revert() statements in token transfers in claimMainPrize() function
// contract BrokenCosmicSignatureToken1 {
// 	uint256 private _counter;
// 
// 	/// todo-9 Do we need `mintMany` and other similar methods here as well?
// 	function mint(address, uint256 roundNum_) public {
// 		_counter = roundNum_;
// 		require(false, "Test mint() failed.");
// 	}
// 
// 	function totalSupply() public pure returns (uint256) {
// 		return 1;
// 	}
// }

/// @notice used to test revert() statements in CosmicSignatureGame contract
contract BrokenCosmicSignatureToken2 {
	uint256 private _counter;

	constructor(uint256 counter_) {
		_counter = counter_;
	}

	function mint(address, uint256) external {
		_brokenMint();
	}

	function mintMany(ICosmicSignatureToken.MintSpec[] calldata) external {
		_brokenMint();
	}

	function mintAndBurnMany(ICosmicSignatureToken.MintOrBurnSpec[] calldata specs_) external {
		for ( uint256 index_ = 0; index_ < specs_.length; ++ index_ ) {
			ICosmicSignatureToken.MintOrBurnSpec calldata specReference_ = specs_[index_];
			int256 value_ = specReference_.value;
			if (value_ >= int256(0)) {
				_brokenMint();
				break;
			}
		}
	}

	function _brokenMint() private {
		require(_counter > 0, "Test mint() failed.");
		-- _counter;
	}

	function burn(address, uint256) external {
	}
}

/// @notice Used to test `revert` statements for charity deposits.
contract BrokenCharity {
	// uint256 private _counter;
	
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

	// /// @notice returns all the assets to the creator of the contract and self-destroys
	// /// todo-1 This method no longer compiles because I moved NFT donations to `PrizesWallet`.
	// function finalizeTesting() external onlyOwner {
	// 	// CosmicSignature NFTs.
	// 	uint256 cosmicSupply = nft.totalSupply();
	// 	for (uint256 i = 0; i < cosmicSupply; i++) {
	// 		address nftOwnerAddress_ = nft.ownerOf(i);
	// 		if (nftOwnerAddress_ == address(this)) {
	// 			// Comment-202501145 applies.
	// 			nft.transferFrom(address(this), owner(), i);
	// 		}
	// 	}
	//
	// 	// Issue. Making multiple external calls to `token`.
	// 	cosmicSupply = token.balanceOf(address(this));
	// 	token.transfer(owner(), cosmicSupply);
	//
	// 	for (uint256 i = 0; i < numDonatedNfts; i++) {
	// 		// todo-9 I moved `DonatedNft` to `IPrizesWallet`.
	// 		CosmicSignatureConstants.DonatedNft memory dnft = donatedNfts[i];
	// 		dnft.nftAddress.transferFrom(address(this), owner(), dnft.nftId);
	// 	}
	// 	selfdestruct(payable(owner()));
	// }
}

/// @notice special CosmicSignatureGame contract to be used in unit tests to create special test setups
contract SpecialCosmicSignatureGame is CosmicSignatureGame {
	/// @dev Issue. Entropy related logic in this test contract is lousy, but keeping it simple.
	/// Comment-202412104 relates.
	CosmicSignatureHelpers.RandomNumberSeedWrapper private _entropy;

	// function setRoundActivationTimeRaw(uint256 newValue_) external {
	// 	roundActivationTime = newValue_;
	//
	// 	// // Comment-202411168 applies.
	// 	// cstDutchAuctionBeginningTimeStamp = newValue_;
	// }

	// function setCosmicSignatureTokenRaw(ICosmicSignatureToken newValue_) external {
	// 	token = CosmicSignatureToken(address(newValue_));
	// }

	// function setCosmicSignatureNftRaw(ICosmicSignatureNft newValue_) external {
	// 	nft = CosmicSignatureNft(address(newValue_));
	// }

	// function setPrizesWalletRaw(IPrizesWallet newValue_) external {
	// 	prizesWallet = PrizesWallet(address(newValue_));
	// }

	// function setStakingWalletCosmicSignatureNftRaw(IStakingWalletCosmicSignatureNft newValue_) external {
	// 	stakingWalletCosmicSignatureNft = StakingWalletCosmicSignatureNft(address(newValue_));
	// }

	// function setCharityAddressRaw(address newValue_) external {
	// 	charityAddress = newValue_;
	// }

	function _initializeEntropyOnce() private {
		if (_entropy.value == 0) {
			_entropy.value = CosmicSignatureHelpers.generateRandomNumberSeed();
		}
	}

	function mintCosmicSignatureNft(address nftOwnerAddress_) external {
		_initializeEntropyOnce();
		unchecked { ++ _entropy.value; }
		// todo-2 Should we make a high level call here?
		(bool isSuccess_, ) = address(nft).call(abi.encodeWithSelector(ICosmicSignatureNft.mint.selector, roundNum, nftOwnerAddress_, _entropy.value));
		if ( ! isSuccess_ ) {
			assembly {
				let ptr_ := mload(0x40)
				let size_ := returndatasize()
				returndatacopy(ptr_, 0, size_)
				revert(ptr_, size_)
			}
		}
	}

	// function depositStakingCST() external payable {
	//		// todo-9 Should we make a high level call here?
	// 	(bool isSuccess_, ) = address(stakingWalletCosmicSignatureNft).call{value: msg.value}(
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

	/// @notice sends donateNft() inside a call to transfer an NFT, generating reentrant function call
	function transferFrom(address from, address to, uint256 nftId) public override {
		// the following call should revert
		// todo-1 This will probably now revert due to `onlyGame`.
		// todo-2 Should we make a high level call here?
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
	CosmicSignatureGame private _game;
	uint256 private transient _counter;

	constructor(CosmicSignatureGame game_, string memory name_, string memory symbol_) ERC721(name_, symbol_) {
		_game = game_;
	}

	receive() external payable {
	}

	/// @notice sends bidWithEthAndDonateNft() inside a call to transfer an NFT, generating reentrant function call
	function transferFrom(address from_, address to_, uint256 nftId_) public override {
		// // uint256 price = _game.getNextEthBidPrice(int256(0));
		// // todo-9 This structure no longer exists.
		// CosmicSignatureGame.BidParams memory defaultParams;
		// // defaultParams.message = "";
		// defaultParams.randomWalkNftId = -1;
		// bytes memory param_data = abi.encode(defaultParams);
		// // This call should revert.
		// // todo-9 Should we make a high level call here?
		// (bool isSuccess_, /*bytes memory retval*/) =
		// 	// todo-9 This call is now incorrect because `msg.sender` points at `PrizesWallet`, rather than at `CosmicSignatureGame`.
		// 	// todo-9 Besides, this transfers zero `value`.
		// 	msg.sender.call(abi.encodeWithSelector(IBidding.bidWithEthAndDonateNft.selector, param_data, address(this), nftId_));
		// if ( ! isSuccess_ ) {
		// 	assembly {
		// 		let ptr := mload(0x40)
		// 		let size := returndatasize()
		// 		returndatacopy(ptr, 0, size)
		// 		revert(ptr, size)
		// 	}
		// }

		if (_counter < 3) {
			++ _counter;

			// This call should revert.
			// todo-1 But it doesn't, which is probably OK. To be revisited.
			_game.bidWithEthAndDonateNft{value: 1 ether}(-1, "", this, nftId_ + 1);

			-- _counter;
		}
	}
}
