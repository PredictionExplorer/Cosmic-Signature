"use strict";

const hre = require("hardhat");

class State {
	/**
	[Comment-202508313]
	We will use this variable as a seed to generate private keys of a few accounts.
	We will print the actual generated private keys and addresses.
	By default, we initialize this variable from a hardcoded value, which exists in the Git repo.
	Therefore, when running this script against a mainnet, be sure to use your own secret value.
	Save one as a Hardhat configuration variable by executing the followintg command:
	   npx hardhat vars set accountPrivateKeySeed 0x...
	Substitute the "0x..." with a hard to guess value.
	You can execute "generate-random-uint256.bash" to generate one.
	[/Comment-202508313]
	@type {bigint}
	*/
	accountPrivateKeySeed;

	/** 
	 * This is the default signer for all contracts.
	 * It holds no ETH.
	 * So we must explicitly `connect` to a particular signer for each call.
	 * @type {hre.ethers.Wallet}
	 */
	dummySigner;

	/** @type {hre.ethers.Wallet} */
	ownerSigner;
	/** @type {hre.ethers.Wallet} */
	bidder1Signer;
	/** @type {hre.ethers.Wallet} */
	bidder2Signer;
	/** @type {hre.ethers.Wallet} */
	bidder3Signer;
	/** @type {hre.ethers.Wallet} */
	charitySigner;
	/** @type {hre.ethers.Wallet} */
	treasurerSigner;

	/** Whether we have just deployed our production contracts. */
	deployedCosmicSignatureContracts = false;

	/** @type {object} */
	contracts;

	constructor() {
		// Doing nothing.
	}
}

module.exports = { State, };
