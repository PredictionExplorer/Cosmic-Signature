"use strict";

// Initialize the fork at provider creation; hardhat_reset with a fork is unsupported
// by some EDR versions bundled with this repository's Hardhat release.
const config = require("./hardhat.config.js");
const baseline = require("./test/data/deployed-storage-layouts/arbitrumOne-CosmicSignatureGameV3.json");

if (process.env.RUN_V4_FORK_REHEARSAL === "1") {
	const rpcUrl = process.env.ART_AUCTION_RPC_URL || "https://arb1.arbitrum.io/rpc";
	try {
		if (!["http:", "https:"].includes(new URL(rpcUrl).protocol)) throw new Error();
	} catch {
		throw new Error("Invalid ART_AUCTION_RPC_URL. Provide an HTTP(S) endpoint.");
	}
	config.networks.hardhat.forking = {
		url: rpcUrl,
		blockNumber: baseline.observation.blockNumber,
	};
	// Pin local execution semantics to the verified production compiler target.
	config.networks.hardhat.hardfork = baseline.compiler.settings.evmVersion;
	// The ordinary stress-test configuration deliberately has a huge block gas
	// limit. Osaka caps individual calls/transactions; use that cap for this fork.
	config.networks.hardhat.blockGasLimit = 16_777_216;
	config.networks.hardhat.gas = 16_777_216;
}

module.exports = config;
