"use strict";

// #region Imports

const { expect } = require("chai");
const { generateRandomUInt256FromSeedWrapper } = require("../../../src/Helpers.js");
const { isExpectedTransactionErrorObject } = require("../../../src/ContractTestingHelpers.js");

// #endregion
// #region Revert decoding

const CUSTOM_ERROR_REGEXP = /reverted with custom error '([A-Za-z0-9_]+)\(/;
const REASON_STRING_REGEXP = /reverted with reason string '((?:[^'\\]|\\.)*)'/;
const PANIC_CODE_REGEXP = /reverted with panic code (0x[0-9a-fA-F]+)/;
const UNRECOGNIZED_ERROR_REGEXP = /reverted with an unrecognized custom error \(return data: (0x[0-9a-fA-F]*)\)/;

/**
Decodes a Hardhat transaction revert into `{kind, name, message}`.
@param {Error} errorObject_
@param {Array<import("ethers").Interface>} interfaces_ Interfaces to try for raw revert data.
*/
function decodeRevert(errorObject_, interfaces_) {
	const message_ = errorObject_.message ?? "";
	{
		const match_ = CUSTOM_ERROR_REGEXP.exec(message_);
		if (match_ !== null) {
			return { kind: "custom", name: match_[1], message: message_ };
		}
	}
	{
		const match_ = PANIC_CODE_REGEXP.exec(message_);
		if (match_ !== null) {
			return { kind: "panic", name: `Panic(${match_[1]})`, message: message_ };
		}
	}
	{
		const match_ = REASON_STRING_REGEXP.exec(message_);
		if (match_ !== null) {
			return { kind: "reason", name: match_[1], message: message_ };
		}
	}
	{
		const match_ = UNRECOGNIZED_ERROR_REGEXP.exec(message_);
		if (match_ !== null) {
			for (const iface_ of interfaces_) {
				try {
					const parsed_ = iface_.parseError(match_[1]);
					if (parsed_ !== null) {
						return { kind: "custom", name: parsed_.name, message: message_ };
					}
				} catch {
					// Try the next interface.
				}
			}
			return { kind: "custom", name: `unknown:${match_[1].slice(0, 10)}`, message: message_ };
		}
	}
	return { kind: "unknown", name: "unknown", message: message_ };
}

// #endregion
// #region `FuzzEngine`

/**
Campaign orchestrator: seeded RNG, exact block-timestamp control, transaction execution
with per-transaction gas accounting (including mined-but-reverted transactions),
participant funding with ledger-recorded refills, statistics, and a failure trace.
*/
class FuzzEngine {
	// #region Construction

	/**
	@param {object} args_
	@param {import("hardhat")} args_.hre
	@param {{value: bigint}} args_.randomSeedWrapper
	@param {import("./GameModel.js").GameModel} args_.model
	@param {import("./ShadowState.js").ShadowState} args_.ledger
	@param {object} args_.profile Campaign profile (sizes / weights / verbosity).
	*/
	constructor({ hre, randomSeedWrapper, model, ledger, profile }) {
		this.hre = hre;
		this.provider = hre.ethers.provider;
		this.randomSeedWrapper = randomSeedWrapper;
		this.model = model;
		this.ledger = ledger;
		this.profile = profile;
		/** Latest mined block timestamp; every campaign transaction goes through this engine. */
		this.lastTs = 0n;
		/** @type {Array<import("ethers").Interface>} For raw revert data decoding. */
		this.revertInterfaces = [];
		/** @type {Array<object>} Trace ring buffer. */
		this.trace = [];
		this.traceLimit = 400;
		this.actionSeq = 0;
		/** @type {Map<string, {attempted: number, succeeded: number, skipped: number, reverts: Map<string, number>}>} */
		this.stats = new Map();
		this.maxClaimGasUsed = 0n;
		this.numBursts = 0;
		/**
		ETH a player must retain on top of any value sent, so a single transaction's gas
		(worst case ~5M-gas `claimMainPrize` at the capped gas price) never hits "insufficient funds".
		Players are funded once with finite, human-like budgets and are NEVER auto-refilled, so actions
		must check `canAfford` and skip when they cannot pay (mirroring a human with limited funds).
		*/
		this.gasReserve = 5n * 10n ** 17n; // 0.5 ETH
	}

	async init() {
		await this.resyncTime();
	}

	/** Re-syncs `lastTs` to the latest mined block (e.g. after out-of-band upgrade-plugin transactions). */
	async resyncTime() {
		const block_ = await this.provider.getBlock("latest");
		this.lastTs = BigInt(block_.timestamp);
	}

	// #endregion
	// #region RNG helpers

	randomUint256() {
		return generateRandomUInt256FromSeedWrapper(this.randomSeedWrapper);
	}

	/** Random bigint in `[0, bound_)`. */
	randomBelow(bound_) {
		expect(bound_ > 0n, "randomBelow: bound must be positive").to.equal(true);
		return this.randomUint256() % bound_;
	}

	/** Random JS integer in `[min_, max_]` inclusive. */
	randomIntRange(min_, max_) {
		return min_ + Number(this.randomBelow(BigInt(max_ - min_ + 1)));
	}

	/**
	Random bigint in `[min_, max_]` inclusive.
	@param {bigint} min_
	@param {bigint} max_
	@returns {bigint}
	*/
	randomBigIntRange(min_, max_) {
		return min_ + this.randomBelow(max_ - min_ + 1n);
	}

	/** @template T @param {T[]} items_ @returns {T} */
	pick(items_) {
		expect(items_.length > 0, "pick: empty array").to.equal(true);
		return items_[Number(this.randomBelow(BigInt(items_.length)))];
	}

	/** True with probability `percent_` / 100. */
	chancePercent(percent_) {
		return this.randomIntRange(0, 99) < percent_;
	}

	/** Random legacy gas price in [1, 5] gwei (above the decayed base fee; kept modest so gas stays cheap). */
	randomGasPrice() {
		return BigInt(this.randomIntRange(1, 5)) * 10n ** 9n;
	}

	/**
	Whether `address_` can afford to send `valueWei_` plus a one-transaction gas reserve, given its
	tracked balance. Used by actions to skip (like a real human who is short on funds) rather than refill.
	@param {string} address_
	@param {bigint} valueWei_
	*/
	canAfford(address_, valueWei_ = 0n) {
		return this.ledger.expectedEth(address_) >= valueWei_ + this.gasReserve;
	}

	/** Random printable message of length `[0, maxLength_]`. */
	randomMessage(maxLength_) {
		const length_ = this.randomIntRange(0, maxLength_);
		const chars_ = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 !?.,";
		let message_ = "";
		for (let index_ = 0; index_ < length_; ++ index_) {
			message_ += chars_[this.randomIntRange(0, chars_.length - 1)];
		}
		return message_;
	}

	/** ASCII string of exactly `length_` bytes. */
	exactLengthMessage(length_) {
		return "m".repeat(length_);
	}

	// #endregion
	// #region Time engine

	/**
	Plans the next block timestamp using weighted strategies with boundary snapping.
	@param {bigint[]} boundaryCandidates_ Interesting absolute timestamps (may be in the past).
	@returns {bigint} A timestamp strictly greater than `lastTs`.
	*/
	planTs(boundaryCandidates_ = []) {
		const roll_ = this.randomIntRange(0, 99);
		let delta_;
		if (roll_ < 25) {
			delta_ = this.randomBigIntRange(1n, 5n); // tiny
		} else if (roll_ < 55) {
			delta_ = this.randomBigIntRange(6n, 120n); // small
		} else if (roll_ < 80) {
			delta_ = this.randomBigIntRange(121n, 3_600n); // medium
		} else if (roll_ < 92) {
			delta_ = this.randomBigIntRange(3_601n, 36n * 3_600n); // large
		} else if (roll_ < 96) {
			delta_ = this.randomBigIntRange(2n * 86_400n, 14n * 86_400n); // huge
		} else {
			// Boundary snapping.
			const future_ = boundaryCandidates_.filter((candidate_) => candidate_ > this.lastTs + 2n);
			if (future_.length > 0) {
				const target_ = this.pick(future_);
				const offset_ = this.randomBigIntRange(-2n, 2n);
				const ts_ = target_ + offset_;
				if (ts_ > this.lastTs) {
					return ts_;
				}
			}
			delta_ = this.randomBigIntRange(1n, 600n);
		}
		return this.lastTs + delta_;
	}

	/** Standard boundary candidates derived from current model / ledger state. */
	boundaryCandidates() {
		const model_ = this.model;
		const out_ = [model_.roundActivationTime];
		if (model_.lastBidderAddress !== "0x0000000000000000000000000000000000000000") {
			out_.push(model_.mainPrizeTime);
			out_.push(model_.mainPrizeTime + model_.timeoutDurationToClaimMainPrize);
		}
		out_.push(model_.cstDutchAuctionBeginningTimeStamp + model_.getCstDutchAuctionDuration());
		out_.push(model_.roundActivationTime + model_.getEthDutchAuctionDuration());
		if (this.ledger.randomWalkNft.lastMinter !== "0x0000000000000000000000000000000000000000") {
			out_.push(this.ledger.randomWalkNft.lastMintTime + 30n * 86_400n);
		}
		for (const timeout_ of this.ledger.prizesWallet.roundTimeouts.values()) {
			out_.push(timeout_);
		}
		return out_;
	}

	/** Smallest valid next timestamp. */
	nextTs() {
		return this.lastTs + 1n;
	}

	/** Clamps a desired timestamp to be strictly after the latest block. */
	clampTs(ts_) {
		return (ts_ > this.lastTs) ? ts_ : this.lastTs + 1n;
	}

	// #endregion
	// #region Funding

	/**
	Defensive affordability assertion used right before sending a transaction. Players are funded once
	and never auto-refilled, so every action is expected to have already checked `canAfford` and skipped
	if short. A failure here means an action forgot that check (a harness bug), surfaced loudly.
	@param {string} signerAddress_
	@param {bigint} valueWei_ ETH the transaction will send.
	*/
	assertCanAfford(signerAddress_, valueWei_) {
		const expected_ = this.ledger.expectedEth(signerAddress_);
		const need_ = valueWei_ + this.gasReserve;
		if (expected_ < need_) {
			throw new Error(
				`harness affordability: ${this.ledger.labelOf(signerAddress_)} has ${expected_} wei but needs ${need_} ` +
				`(value ${valueWei_} + gas reserve ${this.gasReserve}); the action should have checked canAfford and skipped`
			);
		}
	}

	// #endregion
	// #region Transaction execution

	/**
	Executes one transaction at an exactly planned block timestamp.

	@param {object} args_
	@param {{address: string, reset: () => void}} args_.signer The sending `MyNonceManager`.
	@param {(overrides: {gasPrice: bigint}) => Promise<import("ethers").TransactionResponse>} args_.buildTx
	@param {bigint} [args_.ts] Planned block timestamp; defaults to `lastTs + 1`.
	@param {bigint} [args_.gasPrice] Explicit legacy gas price; defaults to a random one.
	@param {bigint} [args_.valueNeeded] ETH the signer must afford (refill check).
	@returns {Promise<{ok: true, receipt: import("ethers").TransactionReceipt, ts: bigint, gasPrice: bigint}
		| {ok: false, revert: {kind: string, name: string, message: string}, ts: bigint, gasPrice: bigint, minedTs: bigint | null}>}
	*/
	async execTx({ signer, buildTx, ts, gasPrice, valueNeeded }) {
		const plannedTs_ = this.clampTs(ts ?? this.nextTs());
		const gasPrice_ = gasPrice ?? this.randomGasPrice();
		this.assertCanAfford(signer.address, valueNeeded ?? 0n);
		await this.provider.send("evm_setNextBlockTimestamp", [Number(plannedTs_)]);
		try {
			const txResponse_ = await buildTx({ gasPrice: gasPrice_ });
			const receipt_ = await txResponse_.wait();
			const block_ = await this.provider.getBlock(receipt_.blockNumber);
			expect(BigInt(block_.timestamp), "engine: mined block timestamp differs from planned").to.equal(plannedTs_);
			this.lastTs = plannedTs_;
			this.ledger.applyGas(receipt_.from, receipt_.gasUsed * receipt_.gasPrice);
			this.ledger.applyReceipt(receipt_);
			return { ok: true, receipt: receipt_, ts: plannedTs_, gasPrice: gasPrice_ };
		} catch (errorObject_) {
			// todo-ai-1 It appears that you can call `checkTransactionErrorObject` here instead.
			if ( ! isExpectedTransactionErrorObject(errorObject_) ) {
				throw errorObject_;
			}
			// Hardhat mines reverted transactions (gas is consumed, nonce advances); account for it exactly.
			const minedTs_ = await this._accountFailedTransactionGas(signer.address);
			signer.reset();
			const revert_ = decodeRevert(errorObject_, this.revertInterfaces);
			return { ok: false, revert: revert_, ts: plannedTs_, gasPrice: gasPrice_, minedTs: minedTs_ };
		}
	}

	/**
	After a classified revert, finds the mined failed transaction (it is the single transaction
	of the latest block under automine) and applies its exact gas cost.
	@returns {Promise<bigint | null>} Mined block timestamp, or null if no mined transaction was found.
	*/
	async _accountFailedTransactionGas(senderAddress_) {
		const block_ = await this.provider.getBlock("latest");
		const blockTs_ = BigInt(block_.timestamp);
		if (blockTs_ <= this.lastTs || block_.transactions.length !== 1) {
			// The transaction was rejected without being mined (e.g. at the RPC layer).
			await this._resyncSenderAfterUnminedFailure(senderAddress_);
			return null;
		}
		const receipt_ = await this.provider.getTransactionReceipt(block_.transactions[0]);
		if (receipt_ === null || receipt_.from.toLowerCase() !== senderAddress_.toLowerCase() || receipt_.status !== 0) {
			await this._resyncSenderAfterUnminedFailure(senderAddress_);
			return blockTs_;
		}
		this.lastTs = blockTs_;
		this.ledger.applyGas(receipt_.from, receipt_.gasUsed * receipt_.gasPrice);
		return blockTs_;
	}

	/** Fallback: re-reads the sender balance and attributes any unexplained delta to gas. */
	async _resyncSenderAfterUnminedFailure(senderAddress_) {
		const actual_ = await this.provider.getBalance(senderAddress_);
		const expected_ = this.ledger.expectedEth(senderAddress_);
		const delta_ = expected_ - actual_;
		expect(delta_ >= 0n, "engine: sender balance increased unexpectedly after a failed tx").to.equal(true);
		// Bounded by the worst-case upfront gas cost.
		expect(delta_ <= 30_000_000n * 100n * 10n ** 9n, "engine: failed tx burned more than max gas").to.equal(true);
		if (delta_ !== 0n) {
			this.ledger.applyGas(senderAddress_, delta_);
		}
	}

	/**
	Executes several transactions inside one block (same timestamp), via automine toggling.
	Items run in submission (FIFO) order. Each item's `onResult({status, receipt})` is invoked
	in order so callers can apply model/ledger updates sequentially.
	@param {bigint} ts_ Planned block timestamp.
	@param {Array<{signer: any, buildTx: (overrides: {gasPrice: bigint}) => Promise<any>, gasPrice?: bigint, valueNeeded?: bigint}>} items_
	@returns {Promise<Array<{status: number, receipt: import("ethers").TransactionReceipt}>>}
	*/
	async execBurst(ts_, items_) {
		const plannedTs_ = this.clampTs(ts_);
		++ this.numBursts;
		// All burst transactions sit in the mempool simultaneously (automine off) before the single
		// mined block, so a sender that appears in multiple items must be able to cover the SUM of its
		// items' upfront costs at once. The caller pre-checks affordability per sender; assert it here.
		const needBySender_ = new Map();
		for (const item_ of items_) {
			item_.gasPrice = item_.gasPrice ?? this.randomGasPrice();
			const key_ = item_.signer.address;
			needBySender_.set(key_, (needBySender_.get(key_) ?? 0n) + (item_.valueNeeded ?? 0n) + this.gasReserve);
		}
		for (const [senderAddress_, need_] of needBySender_) {
			if (this.ledger.expectedEth(senderAddress_) < need_) {
				throw new Error(`harness affordability (burst): ${this.ledger.labelOf(senderAddress_)} cannot cover its ${need_} wei of burst items`);
			}
		}
		await this.provider.send("evm_setAutomine", [false]);
		/** @type {string[]} */
		const txHashes_ = [];
		try {
			for (const item_ of items_) {
				const txResponse_ = await item_.buildTx({ gasPrice: item_.gasPrice });
				txHashes_.push(txResponse_.hash);
			}
			await this.provider.send("evm_setNextBlockTimestamp", [Number(plannedTs_)]);
			await this.provider.send("evm_mine");
		} finally {
			await this.provider.send("evm_setAutomine", [true]);
		}
		this.lastTs = plannedTs_;
		const results_ = [];
		for (let index_ = 0; index_ < txHashes_.length; ++ index_) {
			const receipt_ = await this.provider.getTransactionReceipt(txHashes_[index_]);
			expect(receipt_ !== null, "engine: burst transaction was not mined").to.equal(true);
			expect(BigInt((await this.provider.getBlock(receipt_.blockNumber)).timestamp)).to.equal(plannedTs_);
			this.ledger.applyGas(receipt_.from, receipt_.gasUsed * receipt_.gasPrice);
			if (receipt_.status === 1) {
				this.ledger.applyReceipt(receipt_);
			}
			items_[index_].signer.reset();
			results_.push({ status: receipt_.status, receipt: receipt_ });
		}
		return results_;
	}

	/** Mines an empty block at the given timestamp (rarely needed; prefer `execTx`). */
	async mineAt(ts_) {
		const plannedTs_ = this.clampTs(ts_);
		await this.provider.send("evm_setNextBlockTimestamp", [Number(plannedTs_)]);
		await this.provider.send("evm_mine");
		this.lastTs = plannedTs_;
		return plannedTs_;
	}

	// #endregion
	// #region Assertion helpers

	/**
	Asserts that an `execTx` result is a revert with the exact given error name.
	@param {{ok: boolean, revert?: {name: string, message: string}}} result_
	@param {string} expectedErrorName_ Custom error name, reason string, or `Panic(0x..)`.
	@param {string} context_
	*/
	expectRevert(result_, expectedErrorName_, context_) {
		expect(result_.ok, `${context_}: expected a revert with ${expectedErrorName_}, but the tx succeeded`).to.equal(false);
		expect(
			result_.revert.name,
			`${context_}: wrong revert (message: ${result_.revert.message.slice(0, 300)})`
		).to.equal(expectedErrorName_);
	}

	/** Asserts that an `execTx` result succeeded. */
	expectOk(result_, context_) {
		if ( ! result_.ok ) {
			expect.fail(`${context_}: expected success, got revert: ${result_.revert.message.slice(0, 400)}`);
		}
		return result_.receipt;
	}

	/**
	Finds parsed events with the given name emitted by the given contract in a receipt.
	@returns {Array<import("ethers").LogDescription>}
	*/
	parsedEvents(receipt_, contract_, eventName_) {
		const address_ = (contract_.target ?? contract_.address).toLowerCase();
		const out_ = [];
		for (const log_ of receipt_.logs) {
			if (log_.address.toLowerCase() !== address_) {
				continue;
			}
			try {
				const parsed_ = contract_.interface.parseLog(log_);
				if (parsed_ !== null && parsed_.name === eventName_) {
					out_.push(parsed_);
				}
			} catch {
				// Not this contract's event.
			}
		}
		return out_;
	}

	/** Like `parsedEvents` but asserts exactly one match and returns it. */
	singleEvent(receipt_, contract_, eventName_, context_) {
		const events_ = this.parsedEvents(receipt_, contract_, eventName_);
		expect(events_.length, `${context_}: expected exactly 1 ${eventName_} event, got ${events_.length}`).to.equal(1);
		return events_[0];
	}

	// #endregion
	// #region Stats / trace

	_statsFor(actionName_) {
		let entry_ = this.stats.get(actionName_);
		if (entry_ === undefined) {
			entry_ = { attempted: 0, succeeded: 0, skipped: 0, reverts: new Map() };
			this.stats.set(actionName_, entry_);
		}
		return entry_;
	}

	recordTrace(record_) {
		this.trace.push({ seq: this.actionSeq, ...record_ });
		if (this.trace.length > this.traceLimit) {
			this.trace.shift();
		}
	}

	dumpTrace(count_ = 60) {
		console.error("\n========== FUZZ TRACE (most recent last) ==========");
		for (const record_ of this.trace.slice(-count_)) {
			console.error(JSON.stringify(record_, (key_, value_) => ((typeof value_ === "bigint") ? value_.toString() : value_)));
		}
		console.error("====================================================\n");
	}

	// #endregion
	// #region Action running

	/**
	Runs one action and updates statistics / trace.
	@param {{name: string, run: (ctx: object) => Promise<string | undefined>}} action_
	@param {object} ctx_
	@param {object} actor_
	*/
	async runAction(action_, ctx_, actor_) {
		++ this.actionSeq;
		const entry_ = this._statsFor(action_.name);
		// Player actions are sent by `actor_`; if that human is too broke to even pay gas, they skip
		// (no auto-refill). Infra actions (sent by the owner/treasurer/proposer) are exempt.
		if ( ! action_.infra && actor_ !== undefined && actor_ !== null && ! this.canAfford(actor_.address, 0n) ) {
			++ entry_.skipped;
			this.recordTrace({ action: action_.name, actor: actor_.label ?? null, lastTs: this.lastTs, outcome: "skip(broke)" });
			return "skip";
		}
		++ entry_.attempted;
		const traceRecord_ = { action: action_.name, actor: actor_?.label ?? null, lastTs: this.lastTs };
		let outcome_;
		try {
			outcome_ = await action_.run(ctx_, actor_);
		} catch (errorObject_) {
			this.recordTrace({ ...traceRecord_, outcome: "FAILED", error: String(errorObject_?.message ?? errorObject_).slice(0, 500) });
			throw errorObject_;
		}
		if (outcome_ === undefined || outcome_ === "ok") {
			++ entry_.succeeded;
			this.recordTrace({ ...traceRecord_, outcome: "ok" });
			return "ok";
		}
		if (outcome_ === "skip") {
			++ entry_.skipped;
			-- entry_.attempted;
			this.recordTrace({ ...traceRecord_, outcome: "skip" });
			return "skip";
		}
		if (typeof outcome_ === "string" && outcome_.startsWith("revert:")) {
			const name_ = outcome_.slice("revert:".length);
			entry_.reverts.set(name_, (entry_.reverts.get(name_) ?? 0) + 1);
			++ entry_.succeeded;
			this.recordTrace({ ...traceRecord_, outcome: outcome_ });
			return "ok";
		}
		throw new Error(`Action ${action_.name} returned unexpected outcome ${outcome_}`);
	}

	/** Weighted random choice among applicable actions. */
	pickAction(actions_, ctx_, actor_) {
		const applicable_ = [];
		let totalWeight_ = 0;
		for (const action_ of actions_) {
			let weight_ = (typeof action_.weight === "function") ? action_.weight(ctx_, actor_) : action_.weight;
			if (weight_ <= 0) {
				continue;
			}
			if (action_.isApplicable !== undefined && ! action_.isApplicable(ctx_, actor_)) {
				continue;
			}
			applicable_.push({ action: action_, weight: weight_ });
			totalWeight_ += weight_;
		}
		if (applicable_.length === 0) {
			return null;
		}
		let roll_ = this.randomIntRange(0, totalWeight_ - 1);
		for (const { action: action_, weight: weight_ } of applicable_) {
			roll_ -= weight_;
			if (roll_ < 0) {
				return action_;
			}
		}
		return applicable_[applicable_.length - 1].action;
	}

	printStats() {
		console.info("\n  ACTION BREAKDOWN:");
		const sorted_ = [...this.stats.entries()].sort((a_, b_) => b_[1].attempted - a_[1].attempted);
		for (const [name_, entry_] of sorted_) {
			const revertSummary_ =
				[...entry_.reverts.entries()].map(([revertName_, count_]) => `${revertName_} x${count_}`).join(", ");
			console.info(
				`    ${name_.padEnd(44)} ok=${String(entry_.succeeded).padStart(5)} ` +
				`att=${String(entry_.attempted).padStart(5)} skip=${String(entry_.skipped).padStart(5)}` +
				(revertSummary_.length > 0 ? `  [${revertSummary_}]` : "")
			);
		}
		console.info(`    refilled ETH total: ${this.hre.ethers.formatEther(this.ledger.totalRefilled)} ETH`);
		console.info(`    gas burned total:   ${this.hre.ethers.formatEther(this.ledger.totalGasBurned)} ETH`);
		console.info(`    max claimMainPrize gas: ${this.maxClaimGasUsed}`);
		console.info(`    same-block bursts: ${this.numBursts}`);
	}

	// #endregion
}

// #endregion

module.exports = {
	FuzzEngine,
	decodeRevert,
};
