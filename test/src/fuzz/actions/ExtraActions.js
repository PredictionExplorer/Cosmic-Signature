"use strict";

// #region Imports

const { expect } = require("chai");
const hre = require("hardhat");

// #endregion
// #region EIP-712 helpers

/** Reads the token's EIP-712 domain (for `permit` / `delegateBySig` signatures). */
async function tokenDomain(ctx_) {
	const [, name_, version_, chainId_, verifyingContract_] = await ctx_.contracts.cosmicSignatureToken.eip712Domain();
	return { name: name_, version: version_, chainId: chainId_, verifyingContract: verifyingContract_ };
}

/** Signs typed data with the actor's underlying wallet (bypassing the nonce manager wrapper). */
function signTyped(actor_, domain_, types_, message_) {
	const underlying_ = actor_.signer.signer ?? actor_.signer;
	return underlying_.signTypedData(domain_, types_, message_);
}

// #endregion
// #region Token signature / allowance actions

const extraTokenActions = [
	{
		// EIP-2612 permit: owner signs an allowance off-chain, anyone submits it.
		name: "cstPermit",
		weight: 1,
		isApplicable: (ctx_) => ctx_.actors.length > 1,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const spender_ = ctx_.pickActorNot(actor_.address);
			const submitter_ = ctx_.pickActor();
			if (spender_ === null || ! engine.canAfford(submitter_.address, 0n)) {
				return "skip";
			}
			const value_ = engine.randomBigIntRange(1n, 10n ** 18n);
			const deadline_ = engine.lastTs + 3_600n;
			const nonce_ = await contracts.cosmicSignatureToken.nonces(actor_.address);
			const domain_ = await tokenDomain(ctx_);
			const types_ = {
				Permit: [
					{ name: "owner", type: "address" },
					{ name: "spender", type: "address" },
					{ name: "value", type: "uint256" },
					{ name: "nonce", type: "uint256" },
					{ name: "deadline", type: "uint256" },
				],
			};
			const signature_ = await signTyped(actor_, domain_, types_,
				{ owner: actor_.address, spender: spender_.address, value: value_, nonce: nonce_, deadline: deadline_ });
			const sig_ = hre.ethers.Signature.from(signature_);
			const result_ = await engine.execTx({
				signer: submitter_.signer,
				buildTx: (overrides_) =>
					contracts.cosmicSignatureToken.connect(submitter_.signer).permit(
						actor_.address, spender_.address, value_, deadline_, sig_.v, sig_.r, sig_.s, overrides_),
			});
			engine.expectOk(result_, "cstPermit");
			expect(await contracts.cosmicSignatureToken.allowance(actor_.address, spender_.address), "permit allowance").to.equal(value_);
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		// EIP-712 delegateBySig: delegator signs, anyone submits.
		name: "cstDelegateBySig",
		weight: 1,
		isApplicable: (ctx_) => ctx_.actors.length > 1,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const delegatee_ = ctx_.pickActor();
			const submitter_ = ctx_.pickActor();
			if ( ! engine.canAfford(submitter_.address, 0n) ) {
				return "skip";
			}
			const expiry_ = engine.lastTs + 3_600n;
			const nonce_ = await contracts.cosmicSignatureToken.nonces(actor_.address);
			const domain_ = await tokenDomain(ctx_);
			const types_ = {
				Delegation: [
					{ name: "delegatee", type: "address" },
					{ name: "nonce", type: "uint256" },
					{ name: "expiry", type: "uint256" },
				],
			};
			const signature_ = await signTyped(actor_, domain_, types_, { delegatee: delegatee_.address, nonce: nonce_, expiry: expiry_ });
			const sig_ = hre.ethers.Signature.from(signature_);
			const result_ = await engine.execTx({
				signer: submitter_.signer,
				buildTx: (overrides_) =>
					contracts.cosmicSignatureToken.connect(submitter_.signer).delegateBySig(delegatee_.address, nonce_, expiry_, sig_.v, sig_.r, sig_.s, overrides_),
			});
			engine.expectOk(result_, "cstDelegateBySig");
			expect((await contracts.cosmicSignatureToken.delegates(actor_.address)).toLowerCase(), "delegateBySig delegatee").to.equal(delegatee_.addressLower);
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		// Approve a spender, who then burns the tokens via ERC20Burnable.burnFrom.
		name: "cstBurnFrom",
		weight: 1,
		isApplicable: (ctx_, actor_) => ctx_.ledger.cstBalanceOf(actor_.address) > 10n ** 18n && ctx_.actors.length > 1,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const spender_ = ctx_.pickActorNot(actor_.address);
			if (spender_ === null || ledger.cstBalanceOf(actor_.address) <= 10n ** 18n || ! engine.canAfford(spender_.address, 0n)) {
				return "skip";
			}
			const amount_ = engine.randomBigIntRange(1n, ledger.cstBalanceOf(actor_.address) / 4n);
			const approveResult_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.cosmicSignatureToken.connect(actor_.signer).approve(spender_.address, amount_, overrides_),
			});
			engine.expectOk(approveResult_, "cstBurnFrom approve");
			const burnResult_ = await engine.execTx({
				signer: spender_.signer,
				buildTx: (overrides_) => contracts.cosmicSignatureToken.connect(spender_.signer).burnFrom(actor_.address, amount_, overrides_),
			});
			engine.expectOk(burnResult_, "cstBurnFrom");
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		// ERC-721 safeTransferFrom of a Cosmic Signature NFT to another actor (EOA recipient).
		name: "safeTransferCosmicSignatureNft",
		weight: 1,
		isApplicable: (ctx_, actor_) =>
			ctx_.ledger.nftIdsOwnedBy("cs", actor_.address).filter((id_) => ! ctx_.ledger.csStaking.usedNfts.has(id_)).length > 0 && ctx_.actors.length > 1,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const other_ = ctx_.pickActorNot(actor_.address);
			const owned_ = ledger.nftIdsOwnedBy("cs", actor_.address).filter((id_) => ! ledger.csStaking.usedNfts.has(id_));
			if (other_ === null || owned_.length === 0) {
				return "skip";
			}
			const nftId_ = BigInt(engine.pick(owned_));
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) =>
					contracts.cosmicSignatureNft.connect(actor_.signer).getFunction("safeTransferFrom(address,address,uint256)")(
						actor_.address, other_.address, nftId_, overrides_),
			});
			engine.expectOk(result_, "safeTransferCosmicSignatureNft");
			expect(ledger.csNftOwners.get(nftId_.toString())).to.equal(other_.addressLower);
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
];

// #endregion
// #region PrizesWallet / wallet extra actions

const extraPrizesWalletActions = [
	{
		// Batch-claim donated NFTs (verifies the claimer ends up owning each).
		name: "claimManyDonatedNfts",
		weight: 1,
		isApplicable: (ctx_, actor_) => ctx_._claimableDonatedNftIndexesFor(actor_.address).length >= 1,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const indexes_ = ctx_._claimableDonatedNftIndexesFor(actor_.address).slice(0, 3);
			if (indexes_.length === 0) {
				return "skip";
			}
			const records_ = indexes_.map((index_) => ledger.prizesWallet.donatedNfts.get(index_.toString()));
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.prizesWallet.connect(actor_.signer).claimManyDonatedNfts(indexes_, overrides_),
			});
			engine.expectOk(result_, "claimManyDonatedNfts");
			for (const record_ of records_) {
				expect(ledger.mockNftOwners.get(record_.nftId.toString()), "claimed donated NFT goes to claimer").to.equal(actor_.addressLower);
			}
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		// Owner adjusts the PrizesWallet withdrawal timeout (allowed any time).
		name: "setTimeoutDurationToWithdrawPrizes",
		weight: 1,
		infra: true,
		run: async (ctx_) => {
			const { engine, ledger, contracts } = ctx_;
			const owner_ = contracts.ownerSigner;
			const newValue_ = engine.randomBigIntRange(7n * 86_400n, 10n * 7n * 86_400n);
			const result_ = await engine.execTx({
				signer: owner_,
				buildTx: (overrides_) => contracts.prizesWallet.connect(owner_).setTimeoutDurationToWithdrawPrizes(newValue_, overrides_),
			});
			engine.expectOk(result_, "setTimeoutDurationToWithdrawPrizes");
			expect(ledger.prizesWallet.timeoutDurationToWithdrawPrizes, "timeout ledger updated from event").to.equal(newValue_);
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		// Treasurer pays CST rewards to several marketers at once.
		name: "marketingWalletPayManyRewards",
		weight: 1,
		infra: true,
		isApplicable: (ctx_) => ctx_.ledger.cstBalanceOf(ctx_.contracts.marketingWalletAddress) > 10n ** 19n,
		run: async (ctx_) => {
			const { engine, ledger, contracts } = ctx_;
			const balance_ = ledger.cstBalanceOf(contracts.marketingWalletAddress);
			const recipients_ = ctx_.actors.slice(0, 3).map((a_) => a_.address);
			const per_ = engine.randomBigIntRange(1n, balance_ / BigInt(recipients_.length + 1));
			const result_ = await engine.execTx({
				signer: contracts.treasurerSigner,
				buildTx: (overrides_) =>
					contracts.marketingWallet.connect(contracts.treasurerSigner).getFunction("payManyRewards(address[],uint256)")(recipients_, per_, overrides_),
			});
			engine.expectOk(result_, "marketingWalletPayManyRewards");
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		// Owner sweeps an empty CS staking wallet to charity (only valid when nothing is staked).
		name: "stakingTryPerformMaintenance",
		weight: 1,
		infra: true,
		isApplicable: (ctx_) => ctx_.ledger.csStaking.numStakedNfts === 0n,
		run: async (ctx_) => {
			const { engine, ledger, contracts } = ctx_;
			if (ledger.csStaking.numStakedNfts !== 0n) {
				return "skip";
			}
			const owner_ = contracts.ownerSigner;
			const stakingBalance_ = ledger.expectedEth(contracts.stakingWalletCosmicSignatureNftAddress);
			const result_ = await engine.execTx({
				signer: owner_,
				buildTx: (overrides_) =>
					contracts.stakingWalletCosmicSignatureNft.connect(owner_).tryPerformMaintenance(contracts.charityWalletAddress, overrides_),
			});
			engine.expectOk(result_, "stakingTryPerformMaintenance");
			// The full staking-wallet balance (possibly zero) is forwarded to the CharityWallet, which accepts ETH.
			if (stakingBalance_ > 0n) {
				ledger.addEth(contracts.stakingWalletCosmicSignatureNftAddress, -stakingBalance_);
				ledger.addEth(contracts.charityWalletAddress, stakingBalance_);
			}
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
];

// #endregion

module.exports = {
	extraTokenActions,
	extraPrizesWalletActions,
};
