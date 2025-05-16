// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { IERC721, ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { CosmicSignatureConstants } from "../production/libraries/CosmicSignatureConstants.sol";
import { RandomNumberHelpers } from "../production/libraries/RandomNumberHelpers.sol";
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

// todo-0 Move each contract to a separate file.

// /// @notice Used to test `revert` statements in token transfers in `claimMainPrize`.
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

/// @notice Used to test `revert` statements in `CosmicSignatureGame`.
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
		// Doing nothing.	
	}
}

/// @notice Used to test `revert` statements for charity deposits.
contract BrokenCharity {
	// uint256 private _counter;
	
	receive() external payable {
		require(false, "Test deposit failed.");
	}
}

/// @notice This contract will return all the assets before selfdestruct transaction,
/// required for testing on the MainNet (Arbitrum) (prior to launch).
contract SelfDestructibleCosmicSignatureGame is CosmicSignatureGame {
	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() CosmicSignatureGame() {
		// Doing nothing.	
	}

	/// @dev Comment-202503124 relates and/or applies.
	function initialize(address ownerAddress_) external override initializer() {
		// // #enable_asserts // #disable_smtchecker console.log("4 initialize");
		_initialize(ownerAddress_);
	}

	// /// @notice returns all the assets to the creator of the contract and self-destroys
	// /// todo-1 This method no longer compiles because I moved NFT donations to `PrizesWallet`.
	// function finalizeTesting() external onlyOwner {
	// 	// Cosmic Signature NFTs.
	// 	uint256 nftTotalSupply = nft.totalSupply();
	// 	for (uint256 i = 0; i < nftTotalSupply; i++) {
	// 		address nftOwnerAddress_ = nft.ownerOf(i);
	// 		if (nftOwnerAddress_ == address(this)) {
	// 			// Comment-202501145 applies.
	// 			nft.transferFrom(address(this), owner(), i);
	// 		}
	// 	}
	//
	// 	uint256 myCstBalanceAmount_ = token.balanceOf(address(this));
	// 	token.transfer(owner(), myCstBalanceAmount_);
	//
	// 	for (uint256 i = 0; i < numDonatedNfts; i++) {
	// 		// todo-9 I moved `DonatedNft` to `IPrizesWallet`.
	// 		CosmicSignatureConstants.DonatedNft memory dnft = donatedNfts[i];
	// 		dnft.nftAddress.transferFrom(address(this), owner(), dnft.nftId);
	// 	}
	//
	// 	// This `selfdestruct`s only the proxy, right?
	// 	// But `selfdestruct` does nothing besides transferring ETH, so maybe this is OK.
	// 	selfdestruct(payable(owner()));
	// }
}

/// @notice special CosmicSignatureGame contract to be used in unit tests to create special test setups
contract SpecialCosmicSignatureGame is CosmicSignatureGame {
	/// @dev Issue. Entropy related logic in this test contract is lousy, but keeping it simple.
	/// Comment-202412104 relates.
	RandomNumberHelpers.RandomNumberSeedWrapper private _entropy;

	/// @custom:oz-upgrades-unsafe-allow constructor
	constructor() CosmicSignatureGame() {
		// Doing nothing.	
	}

	/// @dev Comment-202503124 relates and/or applies.
	function initialize(address ownerAddress_) external override initializer() {
		// // #enable_asserts // #disable_smtchecker console.log("3 initialize");
		_initialize(ownerAddress_);
	}

	// function setRoundActivationTimeRaw(uint256 newValue_) external {
	// 	roundActivationTime = newValue_;
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

	function mintCosmicSignatureNft(address nftOwnerAddress_) external {
		_initializeEntropyOnce();
		unchecked { ++ _entropy.value; }
		// todo-2 Should we make a high level call here? Comment-202502043 relates.
		(bool isSuccess_, ) = address(nft).call(abi.encodeWithSelector(ICosmicSignatureNft.mint.selector, roundNum, nftOwnerAddress_, _entropy.value));
		if ( ! isSuccess_ ) {
			assembly {
				let ptr_ := mload(0x40)
				let size_ := returndatasize()
				returndatacopy(ptr_, 0, size_)
				revert (ptr_, size_)
			}
		}
	}

	function depositToStakingWalletCosmicSignatureNft() external payable {
		// #region // Old Version

		// 	// todo-9 Should we make a high level call here? Comment-202502043 relates.
		// (bool isSuccess_, ) = address(stakingWalletCosmicSignatureNft).call{value: msg.value}(
		// 	abi.encodeWithSelector(IStakingWalletCosmicSignatureNft.deposit.selector)
		// );
		// if ( ! isSuccess_ ) {
		// 	assembly {
		// 		let ptr := mload(0x40)
		// 		let size := returndatasize()
		// 		returndatacopy(ptr, 0, size)
		// 		revert (ptr, size)
		// 	}
		// }

		// #endregion
		// #region New Version

		stakingWalletCosmicSignatureNft.deposit{value: msg.value}(roundNum);

		// #endregion
	}

	function _initializeEntropyOnce() private {
		if (_entropy.value == 0) {
			_entropy.value = RandomNumberHelpers.generateRandomNumberSeed();
		}
	}
}

// contract TestStakingWalletCosmicSignatureNft is StakingWalletCosmicSignatureNft {
// 	constructor(CosmicSignatureNft nft_, address game_) StakingWalletCosmicSignatureNft(nft_, game_) {}
//
// 	// function doInsertToken(uint256 _nftId, uint256 stakeActionId_) external {
// 	// 	// This method no longer exists.
// 	// 	_insertToken(_nftId, stakeActionId_);
// 	// }
//
// 	// function doRemoveToken(uint256 _nftId) external {
// 	// 	// This method no longer exists.
// 	// 	_removeToken(_nftId);
// 	// }
// }

// contract TestStakingWalletRandomWalkNft is StakingWalletRandomWalkNft {
// 	constructor(RandomWalkNFT nft_) StakingWalletRandomWalkNft(nft_) {}
//
// 	// function doInsertToken(uint256 _nftId, uint256 stakeActionId_) external {
// 	// 	// This method no longer exists.
// 	// 	_insertToken(_nftId, stakeActionId_);
// 	// }
//
// 	// function doRemoveToken(uint256 _nftId) external {
// 	// 	// This method no longer exists.
// 	// 	_removeToken(_nftId);
// 	// }
// }

/// @dev todo-1 Do I need to refactor this similarly to `MaliciousNft2`?
contract MaliciousNft1 is ERC721 {
	constructor(string memory name_, string memory symbol_) ERC721(name_,symbol_) {
		// Doing nothing.
	}

	/// @notice sends donateNft() inside a call to transfer an NFT, generating reentrant function call
	function transferFrom(address from, address to, uint256 nftId) public override {
		// This call shall revert.
		// todo-1 This will probably now revert due to `_onlyGame`.
		// todo-2 Should we make a high level call here? Comment-202502043 relates.
		(bool isSuccess_, /*bytes memory retval*/) =
			_msgSender().call(abi.encodeWithSelector(IPrizesWallet.donateNft.selector, uint256(0), address(this), uint256(0)));

		if ( ! isSuccess_ ) {
			assembly {
				let ptr := mload(0x40)
				let size := returndatasize()
				returndatacopy(ptr, 0, size)
				revert (ptr, size)
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
		// Doing nothing.	
	}

	/// @notice sends bidWithEthAndDonateNft() inside a call to transfer an NFT, generating reentrant function call
	function transferFrom(address from_, address to_, uint256 nftId_) public override {
		// // uint256 price = _game.getNextEthBidPrice(int256(0));
		// // todo-9 This structure no longer exists.
		// CosmicSignatureGame.BidParams memory defaultParams;
		// // defaultParams.message = "";
		// defaultParams.randomWalkNftId = -1;
		// bytes memory param_data = abi.encode(defaultParams);
		//
		// // This call shall revert.
		// // todo-9 This call is now incorrect because `_msgSender()` points at `PrizesWallet`, rather than at `CosmicSignatureGame`.
		// // todo-9 Besides, this transfers zero `value`.
		// // todo-9 Should we make a high level call here? Comment-202502043 relates.
		// (bool isSuccess_, /*bytes memory retval*/) =
		// 	_msgSender().call(abi.encodeWithSelector(IBidding.bidWithEthAndDonateNft.selector, param_data, address(this), nftId_));
		//
		// if ( ! isSuccess_ ) {
		// 	assembly {
		// 		let ptr := mload(0x40)
		// 		let size := returndatasize()
		// 		returndatacopy(ptr, 0, size)
		// 		revert (ptr, size)
		// 	}
		// }

		if (_counter <= 0) {
			++ _counter;

			// This call shall revert.
			_game.bidWithEthAndDonateNft{value: 1 ether}(-1, "", this, nftId_ + 1);

			-- _counter;
		}
	}
}

contract BlockchainPropertyGetter {
	// function getBlockNumber() external view returns (uint256) {
	// 	return block.number;
	// }

	// function getBlockTimeStamp() external view returns (uint256) {
	// 	return block.timestamp;
	// }

	/// @dev
	/// [Comment-202504082]
	/// Issue. We need this for testing, because of Comment-202504071.
	/// [/Comment-202504082]
	function getBlockPrevRandao() external view returns (uint256) {
		// #enable_asserts assert(block.prevrandao > 0);
		return block.prevrandao;
	}

	// /// @dev Comment-202504082 applies.
	// function getBlockBaseFeePerGas() external view returns (uint256) {
	// 	// #enable_asserts assert(block.basefee > 0);
	// 	return block.basefee;
	// }
}
