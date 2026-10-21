"use strict";

class State {
	/**
	[Comment-202508313]
	We will use this variable as a seed to generate private keys of a few accounts.
	We log only the generated account names and public addresses, never the seed or private keys.
	By default, we initialize this variable from a hardcoded value, which exists in the Git repo.
	Therefore, when running this script against a mainnet, be sure to use your own secret value.
	Keep a cryptographically random uint256 seed in a secure backup and enter it at a hidden prompt
	into the temporary HARDHAT_VAR_accountPrivateKeySeed environment variable before starting Hardhat.
	See live-blockchain-testing/docs/live-blockchain-tests.md. Do not persist a real seed with `hardhat vars set`.
	[/Comment-202508313]
	@type {bigint}
	*/
	accountPrivateKeySeed;

	/**
	This is the default signer for all contracts. It holds no ETH.
	So we must explicitly `connect` to a particular signer for each call.
	@type {import("hardhat").ethers.Wallet}
	*/
	dummySigner;

	/** @type {import("hardhat").ethers.Wallet} */
	ownerSigner;
	/** @type {import("hardhat").ethers.Wallet} */
	bidder1Signer;
	/** @type {import("hardhat").ethers.Wallet} */
	bidder2Signer;
	/** @type {import("hardhat").ethers.Wallet} */
	bidder3Signer;
	/** @type {import("hardhat").ethers.Wallet} */
	treasurerSigner;

	/** Whether we have just deployed our production contracts. */
	deployedCosmicSignatureContracts = false;

	/**
	Contains all contract objects and their addresses.
	@type {object}
	*/
	contracts;

	nextRandomWalkNftIndex = 0;

	/**
	Key is bidder address.
	Value is an array of bidding round numbers in which ETH was deposited to `PrizesWallet` for the bidder.
	*/
	accountEthPrizeRoundNums = {};

	donatedTokensToClaim = [];
	donatedNftIndexes = [];

	constructor() {
		// Doing nothing.
	}
}

module.exports = {
	State,
};
