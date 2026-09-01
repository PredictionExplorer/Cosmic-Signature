// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { PrizesWallet } from "../production/PrizesWallet.sol";

/// @title Deliberately broken token used to test failed token transfers
/// @notice This incomplete test double exposes the shared ERC-20 and ERC-721 `transferFrom`
/// selector and can reject either all transfers or only transfers out of a particular prizes wallet.
/// @dev This contract used to be named `RevertingToken`. It intentionally implements only the
/// methods needed by the tests and therefore must not be used as a real ERC-20 or ERC-721 token.
// solhint-disable-next-line comprehensive-interface
contract BrokenToken {
	/// @notice The prizes wallet whose outgoing NFT transfers can be made to fail.
	PrizesWallet public immutable prizesWallet;

	/// @notice Selects the simulated failure behavior.
	/// @dev Mode 1 rejects every `transferFrom`; mode 2 rejects only transfers whose `from_`
	/// is `prizesWallet`; any other value permits transfers.
	uint256 public modeCode;

	/// @notice Returns the simulated owner of each NFT ID.
	mapping(uint256 nftId => address ownerAddress) public ownerOf;

	/// @notice Creates the broken token test double.
	/// @param prizesWallet_ The prizes wallet whose outgoing transfers mode 2 rejects.
	constructor(PrizesWallet prizesWallet_) {
		prizesWallet = prizesWallet_;
	}

	/// @notice Changes the simulated failure behavior.
	/// @param newValue_ The new mode code.
	function setModeCode(uint256 newValue_) external {
		modeCode = newValue_;
	}

	/// @notice Assigns a simulated NFT ID to an owner.
	/// @param to_ The address that will own the NFT.
	/// @param nftId_ The simulated NFT ID.
	function mintNft(address to_, uint256 nftId_) external {
		ownerOf[nftId_] = to_;
	}

	/// @notice Simulates the ERC-20 `balanceOf` function.
	/// @dev The value is intentionally always zero because the donation tests need only transfer failure behavior.
	/// @param account_ The ignored account.
	/// @return The simulated balance, always zero.
	function balanceOf(address account_) external pure returns (uint256) {
		account_;
		return 0;
	}

	/// @notice Simulates the ERC-20 `transfer` function.
	/// @param to_ The transfer recipient.
	/// @param amount_ The amount passed through the shared transfer implementation.
	/// @return Always true if the simulated transfer does not revert.
	function transfer(address to_, uint256 amount_) external returns (bool) {
		transferFrom(msg.sender, to_, amount_);
		return true;
	}

	/// @notice Simulates the ERC-20 and ERC-721 `transferFrom` function.
	/// @dev A nonzero simulated owner activates NFT ownership validation; an unminted ID behaves
	/// as an unrestricted ERC-20 amount so the same selector can support both donation paths.
	/// @param from_ The purported current owner or token sender.
	/// @param to_ The recipient.
	/// @param amountOrNftId_ The ERC-20 amount or simulated NFT ID.
	function transferFrom(address from_, address to_, uint256 amountOrNftId_) public {
		if (modeCode == 1) {
			revert("BrokenToken rejects transferFrom.");
		}
		if (modeCode == 2 && from_ == address(prizesWallet)) {
			revert("BrokenToken rejects claim transfer.");
		}

		address ownerAddress_ = ownerOf[amountOrNftId_];
		if (ownerAddress_ != address(0)) {
			require(ownerAddress_ == from_, "BrokenToken: wrong NFT owner.");
			ownerOf[amountOrNftId_] = to_;
		}
	}

	/// @notice Simulates the ERC-721 `approve` function as a no-op.
	/// @param to_ The ignored approved address.
	/// @param nftId_ The ignored NFT ID.
	function approve(address to_, uint256 nftId_) external pure {
		to_;
		nftId_;
	}
}
