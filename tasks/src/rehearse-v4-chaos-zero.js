"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sourceAddress = "0x099c29624E05506582655417344A17FB71c9d138";
const legacyMarketAddress = "0x2BC4759A2b44e1197EAdc4E035Eb8c52299658d2";
const unit = 10n ** 18n;
const grant = 8_000n * unit;

// Called exclusively from the in-process, pinned fork rehearsal.
async function deployForkMarket(hre_, game_, owner_) {
	const chaosRoot_ = process.env.CHAOS_ZERO_ROOT || path.resolve(__dirname, "../../../ChaosZero");
	function artifactFor_(name_) {
		return JSON.parse(fs.readFileSync(path.join(chaosRoot_, "out", name_ + ".sol", name_ + ".json"), "utf8"));
	}
	const artifact_ = artifactFor_("GameFundedOutcomeMarket");
	const cst_ = await hre_.ethers.getContractAt("CosmicSignatureToken", await game_.token(), owner_);
	const source_ = new hre_.ethers.Contract(sourceAddress, [
		"function game() view returns(address)", "function cst() view returns(address)",
		"function outcomeState(uint256) view returns(bool,bool,uint8,uint8)",
	], owner_);
	assert.equal(await source_.game(), game_.target);
	assert.equal(await source_.cst(), cst_.target);
	const factory_ = new hre_.ethers.ContractFactory(artifact_.abi, artifact_.bytecode.object, owner_);
	const market_ = await factory_.deploy(cst_.target, sourceAddress, game_.target);
	await market_.waitForDeployment();
	const legacy_ = new hre_.ethers.Contract(legacyMarketAddress, [
		"function source() view returns(address)", "function lastFundedRound() view returns(uint256)",
		"function totalActiveCollateral() view returns(uint256)", "function settleRound(uint256) returns(uint256,uint256)",
		"function settlementVault() view returns(address)",
	], owner_);
	assert.equal(await legacy_.source(), sourceAddress);
	assert.notEqual(await market_.settlementVault(), await legacy_.settlementVault());
	const views_ = new hre_.ethers.Contract(await market_.marketViews(), artifactFor_("GameFundedMarketViews").abi, owner_);
	return { market: market_, source: source_, legacy: legacy_, cst: cst_, views: views_ };
}

async function exerciseFirstGrant(hre_, game_, contracts_, holderAddress_, cycle_) {
	const { market, source, legacy, cst } = contracts_;
	assert.equal(await game_.chaosZeroMarket(), market.target);
	assert.deepEqual(Array.from(await game_.chaosZeroFunding(market.target, cycle_)), [grant, grant]);
	assert.equal(await cst.balanceOf(market.target), grant);
	assert.equal(await market.totalActiveCollateral(), 0n);
	const preview_ = await market.fundingPreview(cycle_, 0);
	assert.equal(preview_.canFund, true);
	assert.deepEqual(Array.from(preview_.allocations), Array(8).fill(grant / 8n));
	const holder_ = await hre_.ethers.getSigner(holderAddress_);
	await (await cst.connect(holder_).transfer(market.target, unit)).wait();
	assert.deepEqual((await market.fundingPreview(cycle_, 0)).toArray(true), preview_.toArray(true));
	assert.deepEqual((await contracts_.views.fundingPreview(market.target, cycle_, 0)).toArray(true), preview_.toArray(true));
	await (await cst.connect(holder_).approve(market.target, 8n * unit)).wait();
	for (let question_ = 0; question_ < 8; ++question_) {
		await (await market.connect(holder_).splitPosition(cycle_, question_, unit)).wait();
		const state_ = await market.questionState(cycle_, question_);
		assert.equal(state_.activeCollateral, grant / 8n + unit);
		assert.equal(state_.currentYesBps, 5000n);
	}
	assert.equal(await market.totalActiveCollateral(), grant + 8n * unit);
	assert.equal(await cst.balanceOf(market.target), grant + 9n * unit);

	const legacyCycle_ = await legacy.lastFundedRound();
	assert(legacyCycle_ < cycle_);
	const priorBacking_ = await legacy.totalActiveCollateral();
	assert(priorBacking_ > 0n);
	const [open_, finalized_, known_] = await source.outcomeState(legacyCycle_);
	assert(!open_ && finalized_ && known_ === 255n);
	await (await legacy.settleRound(legacyCycle_)).wait();
	assert.equal(await legacy.totalActiveCollateral(), 0n);
	assert.equal(await cst.balanceOf(market.target), grant + 9n * unit);
}

async function exerciseSecondGrant(game_, contracts_, holder_, cycle_) {
	const { market, source, legacy, cst } = contracts_;
	const next_ = cycle_ + 1n;
	assert.equal(await game_.roundNum(), next_);
	assert.deepEqual(Array.from(await game_.chaosZeroFunding(market.target, next_)), [grant, 2n * grant]);
	const [open_, finalized_, known_, answers_] = await source.outcomeState(cycle_);
	assert(!open_ && finalized_ && known_ === 255n);
	const preview_ = await market.fundingPreview(next_, 0);
	assert.equal(preview_.needsSettlement, true);
	assert.deepEqual((await contracts_.views.fundingPreview(market.target, next_, 0)).toArray(true), preview_.toArray(true));
	assert.deepEqual(Array.from(preview_.allocations), Array(8).fill(grant / 4n));
	await (await market.syncFunding(next_)).wait();
	assert.equal((await market.roundState(cycle_)).getValue("values"), answers_);
	const vault_ = await market.settlementVault();
	assert.equal(await cst.balanceOf(vault_), 8n * unit);
	const before_ = await cst.balanceOf(holder_.address);
	await (await market.connect(holder_).claimKnown(cycle_)).wait();
	assert.equal(await cst.balanceOf(holder_.address), before_ + 8n * unit);
	assert.equal(await cst.balanceOf(vault_), 0n);
	assert.equal(await market.totalActiveCollateral(), 2n * grant);
	assert.equal(await cst.balanceOf(market.target), 2n * grant + unit);
	return { source: source.target, legacyMarket: legacy.target, firstCycle: String(cycle_),
		nextCycle: String(next_), issuedCst: 16_000, paidPositionsCst: 8, excludedTransferCst: 1 };
}

module.exports = { deployForkMarket, exerciseFirstGrant, exerciseSecondGrant };
