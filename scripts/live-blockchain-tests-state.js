"use strict";

const hre = require("hardhat");

class State {
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

	/** @type {object} */
	contracts;

	constructor() {
		// Doing nothing.
	}
}

module.exports = { State, };
