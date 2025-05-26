// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { IERC721, ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { CosmicSignatureConstants } from "../production/libraries/CosmicSignatureConstants.sol";
import { RandomNumberHelpers } from "../production/libraries/RandomNumberHelpers.sol";
import { CosmicSignatureErrors } from "../production/libraries/CosmicSignatureErrors.sol";
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

// todo-0 Delete this. Use `BrokenEthReceiver` instead.
// /// @notice Used to test `revert` statements for charity deposits.
// contract BrokenCharity {
// 	// uint256 private _counter;
//
// 	receive() external payable {
// 		require(false, "Test deposit failed.");
// 	}
// }

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
