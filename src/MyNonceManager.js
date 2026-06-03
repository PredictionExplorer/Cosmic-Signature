"use strict";

const hre = require("hardhat");

class MyNonceManager extends hre.ethers.NonceManager {
	/**
	@param {import("ethers").Signer} signer_
	*/
	constructor(signer_) {
		super(signer_);
	}

	/** @returns {string} */
	get address() {
		return this.signer.address;
	}
}

module.exports = {
	MyNonceManager,
};
