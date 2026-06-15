"use strict";

// #region Imports

const { expect } = require("chai");
const c = require("../FuzzConstants.js");

// #endregion
// #region Random Walk NFT economy

const randomWalkActions = [
	{
		name: "mintRandomWalkNft",
		weight: 8,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const mintPrice_ = ledger.randomWalkNft.price * c.RANDOMWALK_NFT_PRICE_INCREASE_NUMERATOR / c.RANDOMWALK_NFT_PRICE_INCREASE_DENOMINATOR;
			// Sometimes overpay to exercise the (reentrancy-prone) refund branch; net cost is always `mintPrice`.
			const value_ = engine.chancePercent(30) ? mintPrice_ + engine.randomBigIntRange(1n, 10n ** 15n) : mintPrice_;
			if ( ! engine.canAfford(actor_.address, value_) ) {
				return "skip";
			}
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.randomWalkNft.connect(actor_.signer).mint({ ...overrides_, value: value_ }),
				valueNeeded: value_,
			});
			const receipt_ = engine.expectOk(result_, "mintRandomWalkNft");
			const mintEvent_ = engine.singleEvent(receipt_, contracts.randomWalkNft, "MintEvent", "mintRandomWalkNft");
			expect(mintEvent_.args.price).to.equal(mintPrice_);
			ledger.randomWalkNft.price = mintPrice_;
			ledger.randomWalkNft.lastMinter = actor_.addressLower;
			ledger.randomWalkNft.lastMintTime = result_.ts;
			ledger.randomWalkNft.nextTokenId += 1n;
			ledger.addEth(actor_.address, -mintPrice_);
			ledger.addEth(contracts.randomWalkNftAddress, mintPrice_);
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "randomWalkWithdraw",
		weight: 1,
		isApplicable: (ctx_, actor_) => ctx_.ledger.randomWalkNft.lastMinter === actor_.addressLower,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			if (ledger.randomWalkNft.lastMinter !== actor_.addressLower) {
				return "skip";
			}
			const withdrawalTime_ = ledger.randomWalkNft.lastMintTime + c.RANDOMWALK_NFT_WITHDRAWAL_WAIT_SECONDS;
			const ts_ = engine.clampTs(withdrawalTime_ + engine.randomBigIntRange(1n, 3_600n));
			const rwBalanceBefore_ = ledger.expectedEth(contracts.randomWalkNftAddress);
			const withdrawalAmount_ = rwBalanceBefore_ / 2n;
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.randomWalkNft.connect(actor_.signer).withdraw(overrides_),
				ts: ts_,
			});
			const receipt_ = engine.expectOk(result_, "randomWalkWithdraw");
			const withdrawalEvent_ = engine.singleEvent(receipt_, contracts.randomWalkNft, "WithdrawalEvent", "randomWalkWithdraw");
			expect(withdrawalEvent_.args.amount).to.equal(withdrawalAmount_);
			ledger.addEth(actor_.address, withdrawalAmount_);
			ledger.addEth(contracts.randomWalkNftAddress, -withdrawalAmount_);
			ledger.randomWalkNft.lastMinter = "0x0000000000000000000000000000000000000000";
			ledger.randomWalkNft.numWithdrawals += 1n;
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
];

// #endregion
// #region CST / NFT token actions

const tokenActions = [
	{
		name: "transferCst",
		weight: 2,
		isApplicable: (ctx_, actor_) => ctx_.ledger.cstBalanceOf(actor_.address) > 10n ** 18n,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const other_ = ctx_.pickActorNot(actor_.address);
			if (other_ === null) {
				return "skip";
			}
			const balance_ = ledger.cstBalanceOf(actor_.address);
			if (balance_ <= 10n ** 18n) {
				return "skip";
			}
			const amount_ = engine.randomBigIntRange(1n, balance_ / 4n);
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.cosmicSignatureToken.connect(actor_.signer).transfer(other_.address, amount_, overrides_),
			});
			engine.expectOk(result_, "transferCst");
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "transferCstMany",
		weight: 1,
		isApplicable: (ctx_, actor_) => ctx_.ledger.cstBalanceOf(actor_.address) > 10n ** 19n,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const others_ = ctx_.actors.filter((a_) => a_.addressLower !== actor_.addressLower).slice(0, 3);
			if (others_.length === 0) {
				return "skip";
			}
			const per_ = 10n ** 18n;
			if (ledger.cstBalanceOf(actor_.address) < per_ * BigInt(others_.length)) {
				return "skip";
			}
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) =>
					contracts.cosmicSignatureToken.connect(actor_.signer).getFunction("transferMany(address[],uint256)")(
						others_.map((a_) => a_.address), per_, overrides_),
			});
			engine.expectOk(result_, "transferCstMany");
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "cstBurn",
		weight: 1,
		isApplicable: (ctx_, actor_) => ctx_.ledger.cstBalanceOf(actor_.address) > 100n,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const balance_ = ledger.cstBalanceOf(actor_.address);
			if (balance_ < 100n) {
				return "skip";
			}
			const amount_ = engine.randomBigIntRange(1n, balance_ / 50n + 1n);
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.cosmicSignatureToken.connect(actor_.signer).getFunction("burn(uint256)")(amount_, overrides_),
			});
			engine.expectOk(result_, "cstBurn");
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "cstDelegateSelf",
		weight: 1,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.cosmicSignatureToken.connect(actor_.signer).delegate(actor_.address, overrides_),
			});
			engine.expectOk(result_, "cstDelegateSelf");
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "cstApproveAndTransferFrom",
		weight: 1,
		isApplicable: (ctx_, actor_) => ctx_.ledger.cstBalanceOf(actor_.address) > 10n ** 18n,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const spender_ = ctx_.pickActorNot(actor_.address);
			if (spender_ === null || ledger.cstBalanceOf(actor_.address) <= 10n ** 18n) {
				return "skip";
			}
			const amount_ = engine.randomBigIntRange(1n, ledger.cstBalanceOf(actor_.address) / 4n);
			const approveResult_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.cosmicSignatureToken.connect(actor_.signer).approve(spender_.address, amount_, overrides_),
			});
			engine.expectOk(approveResult_, "cstApprove");
			const transferResult_ = await engine.execTx({
				signer: spender_.signer,
				buildTx: (overrides_) =>
					contracts.cosmicSignatureToken.connect(spender_.signer).transferFrom(actor_.address, spender_.address, amount_, overrides_),
			});
			engine.expectOk(transferResult_, "cstTransferFrom");
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "transferCosmicSignatureNft",
		weight: 2,
		isApplicable: (ctx_, actor_) => {
			const owned_ = ctx_.ledger.nftIdsOwnedBy("cs", actor_.address).filter((id_) => ! ctx_.ledger.csStaking.usedNfts.has(id_));
			return owned_.length > 0 && ctx_.actors.length > 1;
		},
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const other_ = ctx_.pickActorNot(actor_.address);
			const owned_ = ledger.nftIdsOwnedBy("cs", actor_.address);
			if (other_ === null || owned_.length === 0) {
				return "skip";
			}
			const nftId_ = BigInt(engine.pick(owned_));
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) =>
					contracts.cosmicSignatureNft.connect(actor_.signer).transferFrom(actor_.address, other_.address, nftId_, overrides_),
			});
			engine.expectOk(result_, "transferCosmicSignatureNft");
			expect(ledger.csNftOwners.get(nftId_.toString())).to.equal(other_.addressLower);
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "transferRandomWalkNft",
		weight: 1,
		isApplicable: (ctx_, actor_) => ctx_.ledger.nftIdsOwnedBy("rw", actor_.address).length > 0 && ctx_.actors.length > 1,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const other_ = ctx_.pickActorNot(actor_.address);
			const owned_ = ledger.nftIdsOwnedBy("rw", actor_.address);
			if (other_ === null || owned_.length === 0) {
				return "skip";
			}
			const nftId_ = BigInt(engine.pick(owned_));
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.randomWalkNft.connect(actor_.signer).transferFrom(actor_.address, other_.address, nftId_, overrides_),
			});
			engine.expectOk(result_, "transferRandomWalkNft");
			expect(ledger.rwNftOwners.get(nftId_.toString())).to.equal(other_.addressLower);
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "setCosmicSignatureNftName",
		weight: 1,
		isApplicable: (ctx_, actor_) => ctx_.ledger.nftIdsOwnedBy("cs", actor_.address).length > 0,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const owned_ = ledger.nftIdsOwnedBy("cs", actor_.address);
			if (owned_.length === 0) {
				return "skip";
			}
			const nftId_ = BigInt(engine.pick(owned_));
			const name_ = engine.randomMessage(Number(c.COSMIC_SIGNATURE_NFT_NFT_NAME_LENGTH_MAX_LIMIT));
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.cosmicSignatureNft.connect(actor_.signer).setNftName(nftId_, name_, overrides_),
			});
			engine.expectOk(result_, "setCosmicSignatureNftName");
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "setRandomWalkTokenName",
		weight: 1,
		isApplicable: (ctx_, actor_) => ctx_.ledger.nftIdsOwnedBy("rw", actor_.address).length > 0,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const owned_ = ledger.nftIdsOwnedBy("rw", actor_.address);
			if (owned_.length === 0) {
				return "skip";
			}
			const nftId_ = BigInt(engine.pick(owned_));
			const name_ = engine.randomMessage(Number(c.RANDOMWALK_NFT_NAME_LENGTH_MAX_LIMIT));
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.randomWalkNft.connect(actor_.signer).setTokenName(nftId_, name_, overrides_),
			});
			engine.expectOk(result_, "setRandomWalkTokenName");
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
];

// #endregion
// #region PrizesWallet actions

const prizesWalletActions = [
	{
		name: "withdrawEthPrize",
		weight: 5,
		isApplicable: (ctx_, actor_) => ctx_.ledger.prizesWalletRoundsWithEthFor(actor_.address).length > 0,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const rounds_ = ledger.prizesWalletRoundsWithEthFor(actor_.address);
			if (rounds_.length === 0) {
				return "skip";
			}
			const round_ = engine.pick(rounds_);
			const amount_ = ledger.prizesWalletEthOf(round_, actor_.address);
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.prizesWallet.connect(actor_.signer).getFunction("withdrawEth(uint256)")(round_, overrides_),
			});
			engine.expectOk(result_, "withdrawEthPrize");
			ledger.addEth(actor_.address, amount_);
			ledger.addEth(contracts.prizesWalletAddress, -amount_);
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "withdrawEthPrizeMany",
		weight: 2,
		isApplicable: (ctx_, actor_) => ctx_.ledger.prizesWalletRoundsWithEthFor(actor_.address).length >= 2,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const rounds_ = ledger.prizesWalletRoundsWithEthFor(actor_.address).slice(0, 4);
			if (rounds_.length === 0) {
				return "skip";
			}
			let amount_ = 0n;
			for (const round_ of rounds_) {
				amount_ += ledger.prizesWalletEthOf(round_, actor_.address);
			}
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.prizesWallet.connect(actor_.signer).withdrawEthMany(rounds_, overrides_),
			});
			engine.expectOk(result_, "withdrawEthPrizeMany");
			ledger.addEth(actor_.address, amount_);
			ledger.addEth(contracts.prizesWalletAddress, -amount_);
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "withdrawEthPrizeForAnyoneAfterTimeout",
		weight: 1,
		isApplicable: (ctx_) => ctx_._anyTimedOutPrizesWalletEth(),
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const target_ = ctx_._pickTimedOutPrizesWalletEth();
			if (target_ === null) {
				return "skip";
			}
			const { round, winner, amount, timeout } = target_;
			const ts_ = engine.clampTs(timeout + engine.randomBigIntRange(1n, 3_600n));
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) =>
					contracts.prizesWallet.connect(actor_.signer).getFunction("withdrawEth(uint256,address)")(round, winner, overrides_),
				ts: ts_,
			});
			engine.expectOk(result_, "withdrawEthPrizeForAnyoneAfterTimeout");
			// ETH goes to the caller (the beneficiary actor), not the winner.
			ledger.addEth(actor_.address, amount);
			ledger.addEth(contracts.prizesWalletAddress, -amount);
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "withdrawEverythingBatch",
		weight: 2,
		isApplicable: (ctx_, actor_) =>
			ctx_.ledger.prizesWalletRoundsWithEthFor(actor_.address).length > 0 ||
			ctx_._claimableDonatedTokenRoundsFor(actor_.address).length > 0 ||
			ctx_._claimableDonatedNftIndexesFor(actor_.address).length > 0,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const ethRounds_ = ledger.prizesWalletRoundsWithEthFor(actor_.address).slice(0, 3);
			let ethAmount_ = 0n;
			for (const round_ of ethRounds_) {
				ethAmount_ += ledger.prizesWalletEthOf(round_, actor_.address);
			}
			// Donated-ERC-20 leg: claim the full balance (amount 0) for each claimable round. The mock
			// ERC-20 movement is tracked automatically from the `DonatedTokenClaimed` / `Transfer` events.
			const tokenRounds_ = ctx_._claimableDonatedTokenRoundsFor(actor_.address).slice(0, 3);
			const tokenSpecs_ = tokenRounds_.map((round_) => ({
				roundNum: round_,
				tokenAddress: contracts.fuzzTestMockErc20Address,
				amount: 0n,
			}));
			const nftIndexes_ = ctx_._claimableDonatedNftIndexesFor(actor_.address).slice(0, 3);
			if (ethRounds_.length === 0 && tokenSpecs_.length === 0 && nftIndexes_.length === 0) {
				return "skip";
			}
			const mockErc20Before_ = ledger.mockErc20BalanceOf(actor_.address);
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.prizesWallet.connect(actor_.signer).withdrawEverything(ethRounds_, tokenSpecs_, nftIndexes_, overrides_),
			});
			engine.expectOk(result_, "withdrawEverythingBatch");
			if (ethAmount_ > 0n) {
				ledger.addEth(actor_.address, ethAmount_);
				ledger.addEth(contracts.prizesWalletAddress, -ethAmount_);
			}
			if (tokenSpecs_.length > 0) {
				expect(ledger.mockErc20BalanceOf(actor_.address) >= mockErc20Before_, "withdrawEverything: donated tokens not received").to.equal(true);
			}
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "claimDonatedToken",
		weight: 2,
		isApplicable: (ctx_, actor_) => ctx_._claimableDonatedTokenRoundsFor(actor_.address).length > 0,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const rounds_ = ctx_._claimableDonatedTokenRoundsFor(actor_.address);
			if (rounds_.length === 0) {
				return "skip";
			}
			const round_ = engine.pick(rounds_);
			const available_ = ledger.prizesWallet.donatedMockErc20.get(round_.toString()) ?? 0n;
			// Sometimes claim a partial amount, sometimes the full balance (amount 0).
			const amount_ = engine.chancePercent(50) ? 0n : engine.randomBigIntRange(1n, available_);
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) =>
					contracts.prizesWallet.connect(actor_.signer).claimDonatedToken(round_, contracts.fuzzTestMockErc20Address, amount_, overrides_),
			});
			engine.expectOk(result_, "claimDonatedToken");
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "claimManyDonatedTokens",
		weight: 1,
		isApplicable: (ctx_, actor_) => ctx_._claimableDonatedTokenRoundsFor(actor_.address).length > 0,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const rounds_ = ctx_._claimableDonatedTokenRoundsFor(actor_.address).slice(0, 3);
			if (rounds_.length === 0) {
				return "skip";
			}
			const specs_ = rounds_.map((round_) => ({ roundNum: round_, tokenAddress: contracts.fuzzTestMockErc20Address, amount: 0n }));
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.prizesWallet.connect(actor_.signer).claimManyDonatedTokens(specs_, overrides_),
			});
			engine.expectOk(result_, "claimManyDonatedTokens");
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "claimDonatedNft",
		weight: 2,
		isApplicable: (ctx_, actor_) => ctx_._claimableDonatedNftIndexesFor(actor_.address).length > 0,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const indexes_ = ctx_._claimableDonatedNftIndexesFor(actor_.address);
			if (indexes_.length === 0) {
				return "skip";
			}
			const index_ = engine.pick(indexes_);
			const record_ = ledger.prizesWallet.donatedNfts.get(index_.toString());
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.prizesWallet.connect(actor_.signer).claimDonatedNft(index_, overrides_),
			});
			engine.expectOk(result_, "claimDonatedNft");
			// The donated NFT (mock ERC-721) goes to the claimer.
			expect(ledger.mockNftOwners.get(record_.nftId.toString())).to.equal(actor_.addressLower);
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
];

// #endregion
// #region Charity / marketing actions

const walletActions = [
	{
		name: "charityWalletSendAll",
		weight: 1,
		isApplicable: (ctx_) => ctx_.ledger.expectedEth(ctx_.contracts.charityWalletAddress) > 0n,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const balance_ = ledger.expectedEth(contracts.charityWalletAddress);
			if (balance_ === 0n) {
				return "skip";
			}
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.charityWallet.connect(actor_.signer).getFunction("send()")(overrides_),
			});
			engine.expectOk(result_, "charityWalletSendAll");
			ledger.addEth(contracts.charityWalletAddress, -balance_);
			ledger.addEth(contracts.charitySignerAddress, balance_);
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "charityWalletSendAmount",
		weight: 1,
		isApplicable: (ctx_) => ctx_.ledger.expectedEth(ctx_.contracts.charityWalletAddress) > 2n,
		run: async (ctx_, actor_) => {
			const { engine, ledger, contracts } = ctx_;
			const balance_ = ledger.expectedEth(contracts.charityWalletAddress);
			if (balance_ <= 2n) {
				return "skip";
			}
			const amount_ = balance_ / 3n;
			const result_ = await engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => contracts.charityWallet.connect(actor_.signer).getFunction("send(uint256)")(amount_, overrides_),
			});
			engine.expectOk(result_, "charityWalletSendAmount");
			ledger.addEth(contracts.charityWalletAddress, -amount_);
			ledger.addEth(contracts.charitySignerAddress, amount_);
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
	{
		name: "marketingWalletPayReward",
		weight: 1,
		infra: true,
		isApplicable: (ctx_) => ctx_.ledger.cstBalanceOf(ctx_.contracts.marketingWalletAddress) > 10n ** 18n,
		run: async (ctx_) => {
			const { engine, ledger, contracts } = ctx_;
			const marketingBalance_ = ledger.cstBalanceOf(contracts.marketingWalletAddress);
			if (marketingBalance_ <= 10n ** 18n) {
				return "skip";
			}
			const recipient_ = ctx_.pickActor();
			const amount_ = engine.randomBigIntRange(1n, marketingBalance_ / 4n);
			const result_ = await engine.execTx({
				signer: contracts.treasurerSigner,
				buildTx: (overrides_) => contracts.marketingWallet.connect(contracts.treasurerSigner).payReward(recipient_.address, amount_, overrides_),
			});
			engine.expectOk(result_, "marketingWalletPayReward");
			await ledger.verifyDirtyEth();
			return "ok";
		},
	},
];

// #endregion

module.exports = {
	randomWalkActions,
	tokenActions,
	prizesWalletActions,
	walletActions,
};
