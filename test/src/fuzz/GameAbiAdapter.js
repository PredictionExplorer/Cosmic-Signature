"use strict";

/**
Routes game calls to the V1, V2, or OpenBid ABI. Actions call these helpers and never construct
version-specific call data themselves, so every action works in every campaign phase.

V2 differences handled here (see `docs/v2-vs-v1-changes.md`):
- all 6 bid methods gain a `bidCstRewardAmountMinLimit_` parameter (donate variants insert it 3rd);
- `receive()` exists in both versions (plain ETH transfer);
- `getBidCstRewardAmount*` exist only in V2.

OpenBid (version 3) differences handled here:
- the ETH bid methods gain a `bool isOpenBid_` parameter as their SECOND argument (before `message_`);
  the regular flavors always pass `false`, and `bidWithEthOpenBid` passes `true`;
- the CST bid methods are identical to V1 (no extra parameter);
- explicit overloaded selectors are used because OpenBid keeps the original V1 signatures as
  "not implemented" reverting stubs alongside the real `bool`-carrying ones.
*/
class GameAbiAdapter {
	/**
	@param {import("ethers").Contract} gameContract_ Proxy bound to the right ABI for `version_`.
	@param {1 | 2 | 3} version_
	*/
	constructor(gameContract_, version_) {
		this.contract = gameContract_;
		this.version = version_;
	}

	get address() {
		return this.contract.target;
	}

	connect(signer_) {
		return new GameAbiAdapter(this.contract.connect(signer_), this.version);
	}

	/**
	@param {bigint} randomWalkNftId_ `-1n` for none.
	@param {string} message_
	@param {bigint} minReward_ V2 `bidCstRewardAmountMinLimit_`; ignored on V1.
	@param {{value: bigint, gasPrice?: bigint}} overrides_
	*/
	bidWithEth(randomWalkNftId_, message_, minReward_, overrides_) {
		if (this.version === 3) {
			return this.contract.getFunction("bidWithEth(int256,bool,string)")(randomWalkNftId_, false, message_, overrides_);
		}
		return (this.version === 1) ?
			this.contract.bidWithEth(randomWalkNftId_, message_, overrides_) :
			this.contract.bidWithEth(randomWalkNftId_, message_, minReward_, overrides_);
	}

	/** OpenBid (version 3) only: an "open" ETH bid where the caller may overpay above `ethBidPrice * timesEthBidPrice`. */
	bidWithEthOpenBid(randomWalkNftId_, message_, overrides_) {
		return this.contract.getFunction("bidWithEth(int256,bool,string)")(randomWalkNftId_, true, message_, overrides_);
	}

	bidWithEthAndDonateToken(randomWalkNftId_, message_, minReward_, tokenAddress_, amount_, overrides_) {
		if (this.version === 3) {
			return this.contract.getFunction("bidWithEthAndDonateToken(int256,bool,string,address,uint256)")(
				randomWalkNftId_, false, message_, tokenAddress_, amount_, overrides_);
		}
		return (this.version === 1) ?
			this.contract.bidWithEthAndDonateToken(randomWalkNftId_, message_, tokenAddress_, amount_, overrides_) :
			this.contract.bidWithEthAndDonateToken(randomWalkNftId_, message_, minReward_, tokenAddress_, amount_, overrides_);
	}

	bidWithEthAndDonateNft(randomWalkNftId_, message_, minReward_, nftAddress_, nftId_, overrides_) {
		if (this.version === 3) {
			return this.contract.getFunction("bidWithEthAndDonateNft(int256,bool,string,address,uint256)")(
				randomWalkNftId_, false, message_, nftAddress_, nftId_, overrides_);
		}
		return (this.version === 1) ?
			this.contract.bidWithEthAndDonateNft(randomWalkNftId_, message_, nftAddress_, nftId_, overrides_) :
			this.contract.bidWithEthAndDonateNft(randomWalkNftId_, message_, minReward_, nftAddress_, nftId_, overrides_);
	}

	bidWithCst(priceMaxLimit_, message_, minReward_, overrides_ = {}) {
		// OpenBid (version 3) CST bids are identical to V1.
		return (this.version === 2) ?
			this.contract.bidWithCst(priceMaxLimit_, message_, minReward_, overrides_) :
			this.contract.bidWithCst(priceMaxLimit_, message_, overrides_);
	}

	bidWithCstAndDonateToken(priceMaxLimit_, message_, minReward_, tokenAddress_, amount_, overrides_ = {}) {
		return (this.version === 2) ?
			this.contract.bidWithCstAndDonateToken(priceMaxLimit_, message_, minReward_, tokenAddress_, amount_, overrides_) :
			this.contract.bidWithCstAndDonateToken(priceMaxLimit_, message_, tokenAddress_, amount_, overrides_);
	}

	claimMainPrize(overrides_ = {}) {
		return this.contract.claimMainPrize(overrides_);
	}

	donateEth(overrides_) {
		return this.contract.donateEth(overrides_);
	}

	donateEthWithInfo(data_, overrides_) {
		return this.contract.donateEthWithInfo(data_, overrides_);
	}
}

module.exports = {
	GameAbiAdapter,
};
