"use strict";

class State {
	/** 
	 * This is the default signer for all contracts.
	 * It holds no ETH.
	 * So we must explicitly `connect` to a particular signer for each call.
	 * @type {import("ethers").Wallet}
	 */
	dummySigner;

	/** @type {import("ethers").Wallet} */
	ownerSigner;
	/** @type {import("ethers").Wallet} */
	bidder1Signer;
	/** @type {import("ethers").Wallet} */
	bidder2Signer;
	/** @type {import("ethers").Wallet} */
	bidder3Signer;
	/** @type {import("ethers").Wallet} */
	charitySigner;
	/** @type {import("ethers").Wallet} */
	treasurerSigner;

	/** @type {object} */
	contracts;

	constructor() {
		// Doing nothing.
	}
}

module.exports = { State, };
