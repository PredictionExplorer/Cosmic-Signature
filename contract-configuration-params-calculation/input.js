"use strict";

const input = {
	ethDutchAuctionDuration: 2n * 24n * 60n * 60n,
	cstDutchAuctionDuration: 1n * 24n * 60n * 60n / 2n,
	initialDurationUntilMainPrize: 1n * 24n * 60n * 60n,
	mainPrizeTimeIncrementInMicroSeconds: 1n * 60n * 60n * 1_000_000n,
};

module.exports = { input, };
