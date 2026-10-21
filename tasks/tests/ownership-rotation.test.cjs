"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const ethers = require("ethers");
const rotation = require("../../scripts/rotate-arbitrum-one-owner.cjs");

// Public, deterministic test fixture. Never fund this account.
const TEST_PRIVATE_KEY = "0x" + "1".padStart(64, "0");
const NEW_OWNER = new ethers.Wallet(TEST_PRIVATE_KEY).address;
const UNEXPECTED_OWNER = "0x0000000000000000000000000000000000000002";
const INTERFACE = new ethers.Interface(rotation.ABI);
const EXPECTED_OPERATIONS = [
	["game", "owner", "transferOwnership"],
	["marketingWallet", "treasurerAddress", "setTreasurerAddress"],
	["marketingWallet", "owner", "transferOwnership"],
	["charityAddress", "owner", "transferOwnership"],
	["cosmicSignatureNft", "owner", "transferOwnership"],
	["prizesWallet", "owner", "transferOwnership"],
	["stakingWalletCosmicSignatureNft", "owner", "transferOwnership"],
];

function roleKey(contract_, getter_) {
	return `${contract_}.${getter_}`;
}

function createHarness() {
	const roles_ = new Map(EXPECTED_OPERATIONS.map(([contract_, getter_]) => [roleKey(contract_, getter_), rotation.OLD_OWNER]));
	const gameAddresses_ = { ...rotation.ADDRESSES };
	const code_ = new Map(Object.values(rotation.ADDRESSES).map(address_ => [address_, "0x6000"]));
	const calls_ = [];
	const submitted_ = [];
	const records_ = [];
	const state_ = {
		chainId: rotation.CHAIN_ID,
		blockNumber: 100,
		implementation: rotation.IMPLEMENTATION,
		beneficiary: rotation.CHARITY_BENEFICIARY,
		latestNonce: 80,
		pendingNonce: 80,
		gasPrice: 100n,
		estimate: 21001n,
		balance: 10n ** 18n,
		receiptStatus: 1,
		applyTransfers: true,
		failSimulation: undefined,
	};
	function decode(transaction_) {
		const target_ = ethers.getAddress(transaction_.to);
		const contract_ = Object.keys(rotation.ADDRESSES).find(name_ => rotation.ADDRESSES[name_] === target_);
		assert(contract_, "Unexpected transaction target");
		return { contract: contract_, parsed: INTERFACE.parseTransaction(transaction_) };
	}
	const provider_ = {
		async send(method_, parameters_) {
			assert.equal(method_, "eth_chainId");
			assert.deepEqual(parameters_, []);
			return ethers.toQuantity(state_.chainId);
		},
		async getBlockNumber() { return state_.blockNumber; },
		async getCode(address_, block_) {
			assert.equal(block_, state_.blockNumber);
			return code_.get(ethers.getAddress(address_)) || "0x";
		},
		async getStorage(address_, slot_, block_) {
			assert.equal(address_, rotation.ADDRESSES.game);
			assert.equal(slot_, rotation.IMPLEMENTATION_SLOT);
			assert.equal(block_, state_.blockNumber);
			return ethers.zeroPadValue(state_.implementation, 32);
		},
		async getTransactionCount(address_, block_) {
			assert.equal(address_, rotation.OLD_OWNER);
			assert(["latest", "pending"].includes(block_));
			return block_ === "latest" ? state_.latestNonce : state_.pendingNonce;
		},
		async getFeeData() { return { gasPrice: state_.gasPrice }; },
		async getBalance(address_) { assert.equal(address_, rotation.OLD_OWNER); return state_.balance; },
		async estimateGas(transaction_) {
			assert.equal(transaction_.from, rotation.OLD_OWNER);
			return state_.estimate;
		},
		async call(transaction_) {
			const { contract: contract_, parsed: parsed_ } = decode(transaction_);
			if (["transferOwnership", "setTreasurerAddress"].includes(parsed_.name)) {
				calls_.push({ ...transaction_ });
				assert.equal(transaction_.from, rotation.OLD_OWNER);
				assert.equal(parsed_.args[0], NEW_OWNER);
				assert.equal(roles_.get(roleKey(contract_, "owner")), rotation.OLD_OWNER);
				if (state_.failSimulation === `${contract_}.${parsed_.name}`) throw new Error("Simulated revert");
				return "0x";
			}
			assert.equal(transaction_.blockTag, state_.blockNumber);
			let value_;
			if (contract_ === "game" && parsed_.name !== "owner") {
				const name_ = { token: "cosmicSignatureToken", nft: "cosmicSignatureNft" }[parsed_.name] || parsed_.name;
				value_ = gameAddresses_[name_];
			}
			else if (contract_ === "charityAddress" && parsed_.name === "charityAddress") value_ = state_.beneficiary;
			else value_ = roles_.get(roleKey(contract_, parsed_.name));
			assert(value_, `Unexpected getter ${contract_}.${parsed_.name}`);
			return INTERFACE.encodeFunctionResult(parsed_.name, [value_]);
		},
	};
	const signer_ = {
		async getAddress() { return rotation.OLD_OWNER; },
		async sendTransaction(transaction_) {
			const { contract: contract_, parsed: parsed_ } = decode(transaction_);
			submitted_.push({ ...transaction_ });
			const hash_ = ethers.toBeHex(1000 + submitted_.length, 32);
			return {
				hash: hash_,
				async wait(confirmations_) {
					assert.equal(confirmations_, 1);
					++state_.blockNumber;
					++state_.latestNonce;
					++state_.pendingNonce;
					if (state_.receiptStatus === 1 && state_.applyTransfers) {
						const getter_ = parsed_.name === "setTreasurerAddress" ? "treasurerAddress" : "owner";
						roles_.set(roleKey(contract_, getter_), parsed_.args[0]);
					}
					return { status: state_.receiptStatus, blockNumber: state_.blockNumber, hash: hash_ };
				},
			};
		},
	};
	return { provider: provider_, signer: signer_, state: state_, roles: roles_, code: code_, gameAddresses: gameAddresses_, calls: calls_, submitted: submitted_, records: records_, record: async event_ => { records_.push(event_); } };
}

async function execute(harness_) {
	return rotation.executeRotation(harness_.provider, NEW_OWNER, harness_.signer, harness_.record);
}

function main() {
	test("production plan contains exactly six owners and the marketing treasurer in safe order", async () => {
		const harness_ = createHarness();
		const inspection_ = await rotation.inspectOwnership(harness_.provider, NEW_OWNER);
		assert.equal(inspection_.chainId, 42161);
		assert.deepEqual(inspection_.operations.map(operation_ => [operation_.contract, operation_.getter, operation_.method]), EXPECTED_OPERATIONS);
		assert(inspection_.operations.every(operation_ => !operation_.completed && operation_.current === rotation.OLD_OWNER));
		assert.equal(harness_.calls.length, 0);
		assert.equal(harness_.submitted.length, 0);
	});

	test("new-owner validation rejects zero, the old owner, all protocol addresses, and invalid addresses", () => {
		for (const address_ of [ethers.ZeroAddress, rotation.OLD_OWNER, rotation.IMPLEMENTATION, ...Object.values(rotation.ADDRESSES), undefined, "not-an-address"]) {
			assert.throws(() => rotation.validateNewOwner(address_), rotation.RotationError);
		}
		assert.equal(rotation.validateNewOwner(NEW_OWNER.toLowerCase()), NEW_OWNER);
		assert.throws(() => rotation.validateNewOwner(NEW_OWNER.replace("E", "e")), /valid, checksummed/);
	});

	test("private-key checks validate the expected account without exposing invalid input", () => {
		assert.equal(rotation.walletFromSecret(` ${TEST_PRIVATE_KEY}\n`, NEW_OWNER).address, NEW_OWNER);
		for (const secret_ of ["private-key-sentinel", "0x" + "0".repeat(64)]) {
			assert.throws(() => rotation.walletFromSecret(secret_, NEW_OWNER), error_ => {
				assert(error_ instanceof rotation.RotationError);
				assert(!String(error_).includes(secret_));
				assert.equal(error_.cause, undefined);
				return true;
			});
		}
		assert.throws(() => rotation.walletFromSecret(TEST_PRIVATE_KEY, rotation.OLD_OWNER), /does not match/);
	});

	test("CLI defaults to read-only and rejects private keys as command arguments without echoing them", () => {
		assert.deepEqual(rotation.parseArguments(["--new-owner", NEW_OWNER]), { execute: false, help: false, newOwner: NEW_OWNER });
		assert.equal(rotation.parseArguments(["--execute", "--new-owner", NEW_OWNER]).execute, true);
		assert.equal(rotation.parseArguments(["--help"]).help, true);
		for (const arguments_ of [[], ["--new-owner"], ["--new-owner", NEW_OWNER, "--new-owner", NEW_OWNER], ["--execute", "--execute"], [TEST_PRIVATE_KEY]]) {
			assert.throws(() => rotation.parseArguments(arguments_), error_ => error_ instanceof rotation.RotationError && !String(error_).includes(TEST_PRIVATE_KEY));
		}
	});

	test("wrong chain fails before any transaction simulation or broadcast", async () => {
		const harness_ = createHarness();
		harness_.state.chainId = 421614n;
		await assert.rejects(execute(harness_), /Wrong network/);
		assert.equal(harness_.calls.length, 0);
		assert.equal(harness_.submitted.length, 0);
	});

	for (const code_ of ["0x6000", "0xef0100" + "12".repeat(20)]) {
		test(`new-owner account with ${code_.startsWith("0xef") ? "delegated" : "contract"} code is rejected`, async () => {
			const harness_ = createHarness();
			harness_.code.set(NEW_OWNER, code_);
			await assert.rejects(execute(harness_), /without deployed or delegated code/);
			assert.equal(harness_.submitted.length, 0);
		});
	}

	test("missing contract code and implementation drift stop execution", async () => {
		for (const contract_ of Object.keys(rotation.ADDRESSES)) {
			const harness_ = createHarness();
			harness_.code.delete(rotation.ADDRESSES[contract_]);
			await assert.rejects(execute(harness_), /has no code/);
			assert.equal(harness_.submitted.length, 0);
		}
		const harness_ = createHarness();
		harness_.state.implementation = UNEXPECTED_OWNER;
		await assert.rejects(execute(harness_), /implementation differs/);
		assert.equal(harness_.submitted.length, 0);
	});

	test("game configuration and charity beneficiary drift stop execution", async () => {
		for (const contract_ of Object.keys(rotation.ADDRESSES).filter(name_ => !["game", "cosmicSignatureDao"].includes(name_))) {
			const harness_ = createHarness();
			harness_.gameAddresses[contract_] = UNEXPECTED_OWNER;
			await assert.rejects(execute(harness_), /differs from the checked deployment/);
			assert.equal(harness_.submitted.length, 0);
		}
		const harness_ = createHarness();
		harness_.state.beneficiary = UNEXPECTED_OWNER;
		await assert.rejects(execute(harness_), /charity beneficiary has changed/);
		assert.equal(harness_.submitted.length, 0);
	});

	test("every unexpected owner or treasurer fails closed", async () => {
		for (const [contract_, getter_] of EXPECTED_OPERATIONS) {
			const harness_ = createHarness();
			harness_.roles.set(roleKey(contract_, getter_), UNEXPECTED_OWNER);
			await assert.rejects(execute(harness_), /Unexpected authority/);
			assert.equal(harness_.submitted.length, 0);
		}
	});

	test("marketing owner cannot be considered migrated while its old treasurer remains", async () => {
		const harness_ = createHarness();
		harness_.roles.set("marketingWallet.owner", NEW_OWNER);
		await assert.rejects(execute(harness_), /old treasurer remains/);
		assert.equal(harness_.submitted.length, 0);
	});

	test("pending old-owner transactions prevent execution", async () => {
		const harness_ = createHarness();
		++harness_.state.pendingNonce;
		await assert.rejects(execute(harness_), /pending transactions/);
		assert.equal(harness_.calls.length, 0);
		assert.equal(harness_.submitted.length, 0);
	});

	test("a failure simulating the final transfer prevents all broadcasts", async () => {
		const harness_ = createHarness();
		harness_.state.failSimulation = "stakingWalletCosmicSignatureNft.transferOwnership";
		await assert.rejects(execute(harness_), /Simulated revert/);
		assert.equal(harness_.calls.length, 7);
		assert.equal(harness_.submitted.length, 0);
		assert.equal(harness_.records.length, 0);
	});

	test("fee budget includes all remaining transfers, padded gas, and doubled gas price", async () => {
		const harness_ = createHarness();
		const inspection_ = await rotation.inspectOwnership(harness_.provider, NEW_OWNER);
		const prepared_ = await rotation.prepareTransactions(harness_.provider, inspection_);
		assert.equal(prepared_.transactions.length, 7);
		assert.equal(prepared_.maximumFee, 7n * 26252n * 200n);
		for (const { request: request_ } of prepared_.transactions) {
			assert.equal(request_.gasLimit, 26252n);
			assert.equal(request_.gasPrice, 200n);
			assert.equal(request_.chainId, 42161n);
			assert.equal(request_.value, 0n);
			assert.equal(request_.type, 0);
			assert.equal(INTERFACE.parseTransaction(request_).args[0], NEW_OWNER);
		}
		assert.equal(harness_.submitted.length, 0);
	});

	test("insufficient fee balance and missing or zero gas price prevent broadcasts", async () => {
		const harness_ = createHarness();
		harness_.state.balance = 7n * 26252n * 200n - 1n;
		await assert.rejects(execute(harness_), /needs more ETH/);
		assert.equal(harness_.submitted.length, 0);
		for (const gasPrice_ of [null, 0n]) {
			const invalidFeeHarness_ = createHarness();
			invalidFeeHarness_.state.gasPrice = gasPrice_;
			await assert.rejects(execute(invalidFeeHarness_), /usable gas price/);
			assert.equal(invalidFeeHarness_.submitted.length, 0);
		}
	});

	test("seven successful transfers update every role, preserving unrelated contract configuration", async () => {
		const harness_ = createHarness();
		const final_ = await execute(harness_);
		assert(final_.operations.every(operation_ => operation_.completed));
		assert.equal(harness_.submitted.length, 7);
		assert.deepEqual(harness_.submitted.map(transaction_ => [transaction_.to, INTERFACE.parseTransaction(transaction_).name]), EXPECTED_OPERATIONS.map(([contract_, , method_]) => [rotation.ADDRESSES[contract_], method_]));
		assert.equal(harness_.records.filter(event_ => event_.kind === "confirmed").length, 7);
		assert.equal(harness_.records.at(-1).kind, "complete");
		assert.deepEqual(harness_.gameAddresses, rotation.ADDRESSES);
		assert.equal(harness_.state.beneficiary, rotation.CHARITY_BENEFICIARY);
		assert.equal(harness_.state.implementation, rotation.IMPLEMENTATION);
		assert(!JSON.stringify(harness_.records).includes(TEST_PRIVATE_KEY));
	});

	test("resume after every successful prefix sends only the unfinished transfers", async () => {
		for (let completed_ = 0; completed_ <= EXPECTED_OPERATIONS.length; ++completed_) {
			const harness_ = createHarness();
			for (const [contract_, getter_] of EXPECTED_OPERATIONS.slice(0, completed_)) harness_.roles.set(roleKey(contract_, getter_), NEW_OWNER);
			const final_ = await execute(harness_);
			assert(final_.operations.every(operation_ => operation_.completed));
			assert.equal(harness_.submitted.length, EXPECTED_OPERATIONS.length - completed_);
			assert.deepEqual(harness_.submitted.map(transaction_ => transaction_.to), EXPECTED_OPERATIONS.slice(completed_).map(([contract_]) => rotation.ADDRESSES[contract_]));
		}
	});

	test("wrong transaction signer is rejected before network work or signing", async () => {
		const harness_ = createHarness();
		harness_.signer.getAddress = async () => NEW_OWNER;
		harness_.provider.send = async () => { assert.fail("Must reject signer before inspecting chain"); };
		await assert.rejects(execute(harness_), /not the current production owner/);
		assert.equal(harness_.submitted.length, 0);
	});

	test("a pending transaction appearing after preparation stops before broadcast", async () => {
		const harness_ = createHarness();
		harness_.record = async event_ => { harness_.records.push(event_); if (event_.kind === "start") ++harness_.state.pendingNonce; };
		await assert.rejects(execute(harness_), /pending transaction appeared/);
		assert.equal(harness_.submitted.length, 0);
	});

	test("an unexpected authority appearing between transfers stops further broadcasts", async () => {
		const harness_ = createHarness();
		harness_.record = async event_ => { harness_.records.push(event_); if (event_.kind === "confirmed") harness_.roles.set("prizesWallet.owner", UNEXPECTED_OWNER); };
		await assert.rejects(execute(harness_), /Unexpected authority/);
		assert.equal(harness_.submitted.length, 1);
	});

	test("a reverted transaction is recorded but never reported confirmed or followed by more transfers", async () => {
		const harness_ = createHarness();
		harness_.state.receiptStatus = 0;
		await assert.rejects(execute(harness_), /transaction did not succeed/);
		assert.equal(harness_.submitted.length, 1);
		assert.deepEqual(harness_.records.map(event_ => event_.kind), ["start", "submitted"]);
	});

	test("a successful receipt without the expected role change fails immediate postflight", async () => {
		const harness_ = createHarness();
		harness_.state.applyTransfers = false;
		await assert.rejects(execute(harness_), /did not set the expected authority/);
		assert.equal(harness_.submitted.length, 1);
		assert.deepEqual(harness_.records.map(event_ => event_.kind), ["start", "submitted"]);
	});

	test("final postflight refuses success if an earlier role changed back", async () => {
		const harness_ = createHarness();
		harness_.record = async event_ => {
			harness_.records.push(event_);
			if (event_.kind === "confirmed" && event_.contract === "stakingWalletCosmicSignatureNft") harness_.roles.set("game.owner", rotation.OLD_OWNER);
		};
		await assert.rejects(execute(harness_), /Rotation is incomplete/);
		assert.equal(harness_.submitted.length, 7);
		assert(!harness_.records.some(event_ => event_.kind === "complete"));
	});

	test("CLI suppresses raw provider errors that could contain secret input", async () => {
		const sentinel_ = "provider-error-private-key-sentinel";
		const output_ = [];
		const module_ = { exports: {} };
		const process_ = { argv: ["node", "rotation", "--new-owner", NEW_OWNER] };
		const require_ = name_ => name_ === "ethers" ? {
			...ethers,
			JsonRpcProvider: class {
				async send() { throw new Error(sentinel_); }
				destroy() {}
			},
		} : require(name_);
		require_.main = module_;
		const scriptPath_ = path.resolve(__dirname, "../../scripts/rotate-arbitrum-one-owner.cjs");
		vm.runInNewContext(fs.readFileSync(scriptPath_, "utf8"), {
			module: module_, require: require_, process: process_, __dirname: path.dirname(scriptPath_),
			console: { info: message_ => output_.push(message_), error: message_ => output_.push(message_) },
		}, { filename: scriptPath_ });
		await new Promise(resolve_ => setImmediate(resolve_));
		assert.equal(process_.exitCode, 1);
		assert.equal(output_.length, 1);
		assert.match(output_[0], /Raw error details are suppressed/);
		assert(!output_.join("\n").includes(sentinel_));
	});
	test("visible prompt survives readline's own redraw and hidden prompts never echo the secret", async () => {
		// readline with terminal:true clears the line before drawing its query, so a visible prompt must be passed to question(), not hand-written.
		const { PassThrough } = require("node:stream");
		const descriptors_ = { stdin: Object.getOwnPropertyDescriptor(process, "stdin"), stdout: Object.getOwnPropertyDescriptor(process, "stdout") };
		const term_ = process.env.TERM;
		process.env.TERM = "xterm";
		try {
			for (const hidden_ of [false, true]) {
				const input_ = Object.assign(new PassThrough(), { isTTY: true, setRawMode() { return this; } });
				const output_ = Object.assign(new PassThrough(), { isTTY: true, columns: 120 });
				Object.defineProperty(process, "stdin", { configurable: true, value: input_ });
				Object.defineProperty(process, "stdout", { configurable: true, value: output_ });
				const chunks_ = [];
				output_.on("data", chunk_ => chunks_.push(chunk_));
				const answerPromise_ = rotation.promptLine("Type PROMPT-SENTINEL: ", hidden_);
				await new Promise(resolve_ => setImmediate(resolve_));
				input_.write(hidden_ ? "private-key-sentinel\r" : "TRANSFER 0xabc\r");
				assert.equal(await answerPromise_, hidden_ ? "private-key-sentinel" : "TRANSFER 0xabc");
				const written_ = Buffer.concat(chunks_).toString();
				if (hidden_) {
					assert(written_.includes("Type PROMPT-SENTINEL: "));
					assert(!written_.includes("private-key-sentinel"));
				} else {
					// What a terminal shows after readline's last clear-to-end-of-screen sequence.
					const rendered_ = written_.slice(written_.lastIndexOf("\x1b[0J") + 4).replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
					assert(rendered_.includes("Type PROMPT-SENTINEL: TRANSFER 0xabc"), JSON.stringify(rendered_));
				}
			}
		} finally {
			Object.defineProperty(process, "stdin", descriptors_.stdin);
			Object.defineProperty(process, "stdout", descriptors_.stdout);
			if (term_ === undefined) delete process.env.TERM; else process.env.TERM = term_;
		}
	});

}

main();
