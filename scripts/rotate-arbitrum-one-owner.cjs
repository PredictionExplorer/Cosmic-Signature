"use strict";

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { Writable } = require("node:stream");
const { Contract, Interface, JsonRpcProvider, Wallet, ZeroAddress, getAddress, formatEther } = require("ethers");

// This deliberately targets the existing production deployment, not a configurable contract list.
const CHAIN_ID = 42161n;
const OLD_OWNER = "0x14c82Ce4E5713E88C9462680E9c02BF4a3089871";
const IMPLEMENTATION = "0xc1b97E1b0baC86248653B18706dbC5c8898c5c06";
const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const CHARITY_BENEFICIARY = "0xdddd576bAF106bAAe54bDE40BCac602bB4a7cf79";
const ADDRESSES = Object.freeze({
	game: "0x6a714Ae7B5b6eA520F6BCA23d2E609C4Fd5863F2",
	cosmicSignatureToken: "0xAD91843e6A58Ba560F577E676986AFb1dba6FBA0",
	randomWalkNft: "0x895a6F444BE4ba9d124F61DF736605792B35D66b",
	cosmicSignatureNft: "0xbb84Be3500A63581d3F2d5AC3bdF8685AAedad25",
	prizesWallet: "0xE1b619e9B39ea4109D2F429Ea5eAA307759b0011",
	stakingWalletRandomWalkNft: "0x5EB3396092841E6c5b0b51141699F6711E830529",
	stakingWalletCosmicSignatureNft: "0x6308A405B4FF1eA890870Efe2a6D036750B81F7C",
	marketingWallet: "0xa3802c799f5e3D3D3562A9B513a41C6aAF92e25e",
	charityAddress: "0x96bB0ADB414d5350f435E52f94946B6C7A0760a9",
	cosmicSignatureDao: "0xF3D52E1c681949be7E624778dB13DaD7F8c729db",
});
const GAME_GETTERS = Object.freeze({ cosmicSignatureToken: "token", cosmicSignatureNft: "nft" });
const ABI = [
	"function owner() view returns (address)",
	"function transferOwnership(address)",
	"function treasurerAddress() view returns (address)",
	"function setTreasurerAddress(address)",
	"function charityAddress() view returns (address)",
	...Object.keys(ADDRESSES).filter(name_ => !["game", "charityAddress", "cosmicSignatureDao"].includes(name_))
		.map(name_ => `function ${GAME_GETTERS[name_] || name_}() view returns (address)`),
];
const INTERFACE = new Interface(ABI);
const OPERATIONS = Object.freeze([
	{ contract: "game", getter: "owner", method: "transferOwnership" },
	// Revoke the old treasurer's spending power before handing over this wallet's ownership.
	{ contract: "marketingWallet", getter: "treasurerAddress", method: "setTreasurerAddress" },
	{ contract: "marketingWallet", getter: "owner", method: "transferOwnership" },
	{ contract: "charityAddress", getter: "owner", method: "transferOwnership" },
	{ contract: "cosmicSignatureNft", getter: "owner", method: "transferOwnership" },
	{ contract: "prizesWallet", getter: "owner", method: "transferOwnership" },
	{ contract: "stakingWalletCosmicSignatureNft", getter: "owner", method: "transferOwnership" },
]);

class RotationError extends Error {}

function requireCondition(condition_, message_) {
	if (!condition_) throw new RotationError(message_);
}

function validateNewOwner(value_) {
	let address_;
	try { address_ = getAddress(value_); } catch { throw new RotationError("Provide a valid, checksummed new-owner public address."); }
	requireCondition(![ZeroAddress, OLD_OWNER, IMPLEMENTATION, ...Object.values(ADDRESSES)].includes(address_), "The new owner must be a different wallet, not zero or a protocol contract.");
	return address_;
}

function walletFromSecret(secret_, expectedAddress_, provider_) {
	let wallet_;
	try { wallet_ = new Wallet(secret_.trim(), provider_); } catch { throw new RotationError("Invalid private key. Its contents have not been logged."); }
	requireCondition(wallet_.address === expectedAddress_, "The entered private key does not match the expected public address.");
	return wallet_;
}

async function inspectOwnership(provider_, newOwner_) {
	newOwner_ = validateNewOwner(newOwner_);
	requireCondition(BigInt(await provider_.send("eth_chainId", [])) === CHAIN_ID, "Wrong network: Arbitrum One (42161) is required.");
	const blockNumber_ = await provider_.getBlockNumber();
	const blockOptions_ = { blockTag: blockNumber_ };
	requireCondition(await provider_.getCode(newOwner_, blockNumber_) === "0x", "This script supports an ordinary wallet without deployed or delegated code. Stop for a separate review of a smart account or Safe.");
	for (const address_ of Object.values(ADDRESSES)) {
		requireCondition(await provider_.getCode(address_, blockNumber_) !== "0x", "An expected production contract has no code.");
	}
	const implementationWord_ = await provider_.getStorage(ADDRESSES.game, IMPLEMENTATION_SLOT, blockNumber_);
	requireCondition(getAddress("0x" + implementationWord_.slice(-40)) === IMPLEMENTATION, "The game implementation differs from the checked V3 deployment. Stop and review.");
	const game_ = new Contract(ADDRESSES.game, ABI, provider_);
	for (const [name_, address_] of Object.entries(ADDRESSES)) {
		if (["game", "cosmicSignatureDao"].includes(name_)) continue;
		requireCondition(await game_[GAME_GETTERS[name_] || name_](blockOptions_) === address_, `The game's ${name_} address differs from the checked deployment.`);
	}
	const charity_ = new Contract(ADDRESSES.charityAddress, ABI, provider_);
	requireCondition(await charity_.charityAddress(blockOptions_) === CHARITY_BENEFICIARY, "The charity beneficiary has changed. Stop and review; this script never changes it.");
	const operations_ = [];
	for (const operation_ of OPERATIONS) {
		const address_ = ADDRESSES[operation_.contract];
		const contract_ = new Contract(address_, ABI, provider_);
		const current_ = await contract_[operation_.getter](blockOptions_);
		requireCondition([OLD_OWNER, newOwner_].includes(current_), `Unexpected authority on ${operation_.contract}.${operation_.getter}. Stop and investigate.`);
		operations_.push({ ...operation_, address: address_, current: current_, completed: current_ === newOwner_ });
	}
	const marketingOwner_ = operations_.find(operation_ => operation_.contract === "marketingWallet" && operation_.getter === "owner");
	const treasurer_ = operations_.find(operation_ => operation_.getter === "treasurerAddress");
	requireCondition(!marketingOwner_.completed || treasurer_.completed, "Marketing ownership already moved but its old treasurer remains. The new owner must change the treasurer separately.");
	return { chainId: Number(CHAIN_ID), blockNumber: blockNumber_, oldOwner: OLD_OWNER, newOwner: newOwner_, implementation: IMPLEMENTATION, operations: operations_ };
}

function transactionFor(operation_, newOwner_) {
	return { chainId: CHAIN_ID, to: operation_.address, data: INTERFACE.encodeFunctionData(operation_.method, [newOwner_]), value: 0n };
}

async function prepareTransactions(provider_, inspection_) {
	const pending_ = inspection_.operations.filter(operation_ => !operation_.completed);
	if (pending_.length === 0) return { transactions: [], maximumFee: 0n };
	const latestNonce_ = await provider_.getTransactionCount(OLD_OWNER, "latest");
	const pendingNonce_ = await provider_.getTransactionCount(OLD_OWNER, "pending");
	requireCondition(latestNonce_ === pendingNonce_, "The old account has pending transactions. Resolve them before starting or resuming; do not run two copies of this script.");
	const feeData_ = await provider_.getFeeData();
	requireCondition(feeData_.gasPrice != null && feeData_.gasPrice > 0n, "RPC did not return a usable gas price.");
	const transactions_ = [];
	let maximumFee_ = 0n;
	for (const operation_ of pending_) {
		const transaction_ = transactionFor(operation_, inspection_.newOwner);
		const request_ = { ...transaction_, from: OLD_OWNER };
		await provider_.call(request_);
		const estimate_ = await provider_.estimateGas(request_);
		const gasLimit_ = (estimate_ * 125n + 99n) / 100n;
		const gasPrice_ = feeData_.gasPrice * 2n;
		maximumFee_ += gasLimit_ * gasPrice_;
		transactions_.push({ operation: operation_, request: { ...transaction_, gasLimit: gasLimit_, gasPrice: gasPrice_, type: 0 } });
	}
	requireCondition(await provider_.getBalance(OLD_OWNER) >= maximumFee_, "The old account needs more ETH on Arbitrum One for the estimated transaction fees.");
	return { transactions: transactions_, maximumFee: maximumFee_ };
}

async function executeRotation(provider_, newOwner_, signer_, record_) {
	requireCondition(await signer_.getAddress() === OLD_OWNER, "The transaction signer is not the current production owner.");
	const inspection_ = await inspectOwnership(provider_, newOwner_);
	const prepared_ = await prepareTransactions(provider_, inspection_);
	await record_({ kind: "start", inspection: inspection_, maximumFeeWei: prepared_.maximumFee.toString() });
	for (const entry_ of prepared_.transactions) {
		// Re-read roles and critical configuration before each irreversible transaction.
		const current_ = await inspectOwnership(provider_, inspection_.newOwner);
		const operation_ = current_.operations.find(operation_ => operation_.contract === entry_.operation.contract && operation_.getter === entry_.operation.getter);
		if (operation_.completed) continue;
		requireCondition(await provider_.getTransactionCount(OLD_OWNER, "latest") === await provider_.getTransactionCount(OLD_OWNER, "pending"), "A pending transaction appeared. Stop and inspect it before resuming.");
		await provider_.call({ ...entry_.request, from: OLD_OWNER });
		const transaction_ = await signer_.sendTransaction(entry_.request);
		await record_({ kind: "submitted", contract: operation_.contract, method: operation_.method, hash: transaction_.hash });
		const receipt_ = await transaction_.wait(1);
		requireCondition(receipt_ && receipt_.status === 1, "A transaction did not succeed. Inspect the submitted hash before resuming.");
		const contract_ = new Contract(operation_.address, ABI, provider_);
		requireCondition(await contract_[operation_.getter]({ blockTag: receipt_.blockNumber }) === inspection_.newOwner, "The confirmed transaction did not set the expected authority. Stop and investigate.");
		await record_({ kind: "confirmed", contract: operation_.contract, method: operation_.method, hash: receipt_.hash, blockNumber: receipt_.blockNumber });
	}
	const final_ = await inspectOwnership(provider_, inspection_.newOwner);
	requireCondition(final_.operations.every(operation_ => operation_.completed), "Rotation is incomplete. Inspect the remaining roles before resuming.");
	await record_({ kind: "complete", inspection: final_ });
	return final_;
}

function promptLine(prompt_, hidden_ = false) {
	requireCondition(process.stdin.isTTY && process.stdout.isTTY, "Execution requires an interactive terminal; do not pipe private keys into this script.");
	return new Promise((resolve_, reject_) => {
		let settled_ = false;
		const output_ = hidden_ ? new Writable({ write(chunk_, encoding_, callback_) { callback_(); } }) : process.stdout;
		const interface_ = readline.createInterface({ input: process.stdin, output: output_, terminal: true, historySize: 0 });
		// readline redraws its own query on every refresh and erases anything else on the line, so only a hidden prompt is written by hand.
		if (hidden_) process.stdout.write(prompt_);
		interface_.once("SIGINT", () => { settled_ = true; interface_.close(); reject_(new RotationError("Cancelled. Check any submitted transactions before resuming.")); });
		interface_.question(hidden_ ? "" : prompt_, answer_ => { settled_ = true; interface_.close(); if (hidden_) process.stdout.write("\n"); resolve_(answer_); });
		interface_.once("close", () => { if (!settled_) reject_(new RotationError("Input closed. No further transactions will be sent.")); });
	});
}

function parseArguments(arguments_) {
	const options_ = { execute: false, help: false };
	for (let index_ = 0; index_ < arguments_.length; ++index_) {
		const argument_ = arguments_[index_];
		if (argument_ === "--help") options_.help = true;
		else if (argument_ === "--execute") { requireCondition(!options_.execute, "Duplicate execution flag."); options_.execute = true; }
		else if (argument_ === "--new-owner") {
			requireCondition(options_.newOwner === undefined, "Duplicate destination argument.");
			options_.newOwner = validateNewOwner(arguments_[++index_]);
		} else throw new RotationError("Unknown argument. Keys must only be entered at the hidden prompts, never as command arguments.");
	}
	requireCondition(options_.help || options_.newOwner, "Supply --new-owner followed by the new public address, or use --help.");
	return options_;
}

async function main(arguments_ = process.argv.slice(2)) {
	const options_ = parseArguments(arguments_);
	if (options_.help) {
		console.info("node scripts/rotate-arbitrum-one-owner.cjs --new-owner PUBLIC_ADDRESS [--execute]\nDefault: read-only preflight. --execute requires hidden local key prompts and confirmation.\nSee tasks/docs/Arbitrum-One-Ownership-Rotation.md.");
		return;
	}
	const provider_ = new JsonRpcProvider("https://arb1.arbitrum.io/rpc", undefined, { cacheTimeout: -1 });
	try {
		const inspection_ = await inspectOwnership(provider_, options_.newOwner);
		const prepared_ = await prepareTransactions(provider_, inspection_);
		console.info(JSON.stringify(inspection_, null, 2));
		console.info(`Remaining transactions: ${prepared_.transactions.length}. Current maximum fee budget: ${formatEther(prepared_.maximumFee)} ETH.`);
		if (prepared_.transactions.length === 0) { console.info("Verified: all six owners and the marketing treasurer are the new address."); return; }
		if (!options_.execute) { console.info("Read-only preflight passed. No transactions sent and no private keys requested."); return; }
		console.info("Transfers are immediate and are seven separate transactions. Do not run another transaction from the old account during this process.");
		walletFromSecret(await promptLine("NEW owner's private key (hidden; checked locally only): ", true), inspection_.newOwner);
		const signer_ = walletFromSecret(await promptLine("OLD owner's private key (hidden): ", true), OLD_OWNER, provider_);
		const confirmation_ = await promptLine(`To authorize the remaining transfers, type TRANSFER ${inspection_.newOwner}: `);
		requireCondition(confirmation_ === `TRANSFER ${inspection_.newOwner}`, "Confirmation did not match. No transactions sent.");
		const reportPath_ = path.resolve(__dirname, "../tasks/output", `ownership-rotation-arbitrumOne-${Date.now()}.jsonl`);
		fs.mkdirSync(path.dirname(reportPath_), { recursive: true });
		const reportDescriptor_ = fs.openSync(reportPath_, "wx", 0o600);
		console.info(`Public transaction report: ${reportPath_}`);
		try {
			await executeRotation(provider_, inspection_.newOwner, signer_, event_ => {
				// Events contain only an allowlist of public addresses, hashes and status fields.
				console.info(JSON.stringify(event_));
				fs.writeSync(reportDescriptor_, JSON.stringify(event_) + "\n");
				fs.fsyncSync(reportDescriptor_);
			});
		} finally { fs.closeSync(reportDescriptor_); }
		console.info("Rotation complete and all seven roles verified on Arbitrum One.");
	} finally { provider_.destroy(); }
}

// Do not print provider/wallet errors: third-party errors can embed input data.
if (require.main === module) main().catch(error_ => {
	console.error(error_ instanceof RotationError ? error_.message : "Rotation stopped because a check or RPC operation failed. Review the last submitted transaction and run the read-only preflight before retrying. Raw error details are suppressed to protect credentials.");
	process.exitCode = 1;
});

module.exports = { ADDRESSES, ABI, CHAIN_ID, OLD_OWNER, IMPLEMENTATION, IMPLEMENTATION_SLOT, CHARITY_BENEFICIARY, OPERATIONS, RotationError, validateNewOwner, walletFromSecret, inspectOwnership, transactionFor, prepareTransactions, executeRotation, parseArguments, promptLine, main };
