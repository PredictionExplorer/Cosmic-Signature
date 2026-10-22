"use strict";

// Read-only network inspection. This program has no signer and never submits transactions.
const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");

const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, "../../test/data/deployed-storage-layouts/arbitrumOne-CosmicSignatureGameV3.json"), "utf8"));
const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const safeFailureDetails = {
	RPC_CONNECTION: "RPC connection or URL configuration failed.",
	RPC_HTTP: "The RPC endpoint returned an unsuccessful HTTP status.",
	RPC_JSON: "The RPC endpoint did not return valid JSON.",
	RPC_REJECTED: "The RPC endpoint rejected a read request. Check endpoint permissions and archive access.",
	CHAIN_MISMATCH: "The RPC chain does not match the recorded Arbitrum One deployment.",
};

class InspectionFailure extends Error {
	constructor(code_) {
		super(code_);
		this.code = code_;
	}
}

async function inspectV4Upgrade(rpcUrl_ = process.env.ART_AUCTION_RPC_URL || "https://arb1.arbitrum.io/rpc") {
	let requestId_ = 0;
	async function rpc_(method_, params_) {
		let response_;
		try {
			response_ = await fetch(rpcUrl_, {
				method: "POST", headers: { "content-type": "application/json" },
				body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId_, method: method_, params: params_ }),
				signal: AbortSignal.timeout(30000),
			});
		} catch {
			throw new InspectionFailure("RPC_CONNECTION");
		}
		if (!response_.ok) throw new InspectionFailure("RPC_HTTP");
		let value_;
		try {
			value_ = await response_.json();
		} catch {
			throw new InspectionFailure("RPC_JSON");
		}
		if (value_.error) throw new InspectionFailure("RPC_REJECTED");
		return value_.result;
	}
	const block_ = await rpc_("eth_getBlockByNumber", ["latest", false]);
	const chainId_ = Number(BigInt(await rpc_("eth_chainId", [])));
	if (chainId_ !== baseline.chainId) throw new InspectionFailure("CHAIN_MISMATCH");
	const implementationWord_ = await rpc_("eth_getStorageAt", [baseline.proxyAddress, implementationSlot, block_.number]);
	const implementationAddress_ = ethers.getAddress(`0x${implementationWord_.slice(-40)}`);
	const code_ = await rpc_("eth_getCode", [implementationAddress_, block_.number]);
	const abi_ = new ethers.Interface([
		"function owner() view returns (address)", "function nft() view returns (address)",
		"function roundNum() view returns (uint256)", "function roundActivationTime() view returns (uint256)",
		"function lastBidderAddress() view returns (address)", "function mainPrizeTime() view returns (uint256)",
		"function mainPrizeNumCosmicSignatureNfts() view returns (uint256)",
		"function mainEthPrizeAmountPercentage() view returns (uint256)",
		"function chronoWarriorEthPrizeAmountPercentage() view returns (uint256)",
		"function raffleTotalEthPrizeAmountForBiddersPercentage() view returns (uint256)",
		"function cosmicSignatureNftStakingTotalEthRewardAmountPercentage() view returns (uint256)",
		"function charityEthDonationAmountPercentage() view returns (uint256)",
	]);
	const values_ = {};
	for (const fragment_ of abi_.fragments) {
		const result_ = await rpc_("eth_call", [{ to: baseline.proxyAddress, data: abi_.encodeFunctionData(fragment_.name) }, block_.number]);
		values_[fragment_.name] = abi_.decodeFunctionResult(fragment_.name, result_)[0].toString();
	}
	return {
		mode: "read-only", chainId: chainId_, blockNumber: Number(BigInt(block_.number)), blockHash: block_.hash,
		timestamp: Number(BigInt(block_.timestamp)), proxyAddress: baseline.proxyAddress, implementationAddress: implementationAddress_,
		runtimeBytecodeKeccak256: ethers.keccak256(code_),
		matchesRecordedV3: implementationAddress_ === baseline.implementationAddress && ethers.keccak256(code_) === baseline.runtimeBytecodeKeccak256,
		inactive: BigInt(block_.timestamp) < BigInt(values_.roundActivationTime),
		values: values_,
	};
}

async function main() {
	try {
		console.log(JSON.stringify(await inspectV4Upgrade(), null, 2));
	} catch (error_) {
		console.error("V4 upgrade inspection failed.");
		console.error(error_ instanceof InspectionFailure
			? safeFailureDetails[error_.code]
			: "The RPC response or local deployment data could not be validated.");
		process.exitCode = 1;
	}
}

if (require.main === module) void main();
module.exports = { inspectV4Upgrade, baseline, main };
