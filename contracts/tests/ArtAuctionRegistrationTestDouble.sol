// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

/// @dev A controllably failing auction endpoint for the game's atomic-finalization tests.
contract ArtAuctionRegistrationTestDouble {
	address public immutable game;
	address public immutable nft;
	bool public rejectRegistration = true;
	uint256 public registrations;
	error RegistrationRejected();

	constructor(address game_, address nft_) {
		game = game_;
		nft = nft_;
	}

	function setRejectRegistration(bool rejectRegistration_) external {
		rejectRegistration = rejectRegistration_;
	}

	function registerAuctionBatch(uint256, uint256) external {
		require(msg.sender == game);
		if (rejectRegistration) revert RegistrationRejected();
		++registrations;
	}
}
