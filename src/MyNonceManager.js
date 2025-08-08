"use strict";

const hre = require("hardhat");

class MyNonceManager extends hre.ethers.NonceManager {
	/**
	 * @param {hre.ethers.Signer} signer 
	 */
	constructor(signer) {
		super(signer);
	}

	/** @returns {string} */
	get address() {
		return this.signer.address;
	}
}

module.exports = { MyNonceManager, };
