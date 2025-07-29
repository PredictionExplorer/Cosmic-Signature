"use strict";

const { NonceManager } = require("ethers");

class MyNonceManager extends NonceManager {
	constructor(signer) {
		super(signer);
	}

	get address() {
		return this.signer.address;
	}
}

module.exports.MyNonceManager = MyNonceManager;
