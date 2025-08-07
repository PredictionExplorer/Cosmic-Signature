// [Comment-202508288]
// This script calculates some contract configuration params.
// [/Comment-202508288]

"use strict";

const { input } = require("./input.js");

calculateDivisor(input.ethDutchAuctionDuration, "ethDutchAuctionDurationDivisor");
calculateDivisor(input.cstDutchAuctionDuration, "cstDutchAuctionDurationDivisor");
calculateDivisor(input.initialDurationUntilMainPrize, "initialDurationUntilMainPrizeDivisor");

function calculateDivisor(desiredValue_, divisorName_) {
	const divisor_ = (input.mainPrizeTimeIncrementInMicroSeconds + desiredValue_ / 2n) / desiredValue_;
	console.info(`${divisorName_} = ${divisor_}`);
	// prototype1(desiredValue_);
}

// function prototype1(desiredValue_) {
// 	let output_ = "";
// 	for ( let counter_ = 0; counter_ < 100; ++counter_ ) {
// 		const divisor_ =
// 			// input.mainPrizeTimeIncrementInMicroSeconds / desiredValue_ - 1n;
// 			// (input.mainPrizeTimeIncrementInMicroSeconds - desiredValue_ / 2n) / desiredValue_;
// 			// input.mainPrizeTimeIncrementInMicroSeconds / desiredValue_;
// 			(input.mainPrizeTimeIncrementInMicroSeconds + desiredValue_ / 2n) / desiredValue_;
// 			// input.mainPrizeTimeIncrementInMicroSeconds / desiredValue_ + 1n;
// 		const error_ = desiredValue_ - input.mainPrizeTimeIncrementInMicroSeconds / divisor_;
// 		output_ += error_.toString() + " ";
// 		++ desiredValue_;
// 	}
// 	console.info(output_);
// 	console.info();
// }
