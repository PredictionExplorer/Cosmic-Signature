// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { CryptographyHelpers } from "./CryptographyHelpers.sol";
import { ArbitrumHelpers } from "./ArbitrumHelpers.sol";

library RandomNumberHelpers {
	struct RandomNumberSeedWrapper {
		/// @dev
		/// [Comment-202502075]
		/// This is a random number seed.
		/// We generate a random number by incrementing its seed and calculating a hash sum of the result.
		/// It's important that calculations involving this variable ignored overflows.
		/// That includes cases when we pass it to a method by value and then the method makes calculations involving the passed value.
		/// todo-1 +++ Make sure the above is the case.
		/// [/Comment-202502075]
		/// [Comment-202502077]
		/// Optimization idea.
		/// Use the initially generated random number seed as a random number.
		/// Then, without incrementing it, calculate its hash sum, assign the result to itself, and use it as a random number.
		/// Only then start incrementing random number seed.
		/// [/Comment-202502077]
		uint256 value;
	}

	/// @notice
	/// [Comment-202504067]
	/// Similar logic exists in multiple places.
	/// [/Comment-202504067]
	/// Comment-202502075 applies to the return value.
	/// @dev
	/// [Comment-202503254]
	/// It's safe to call this function without any additional logic only if it's guaranteed
	/// that we can call it no more than once per L2 block.
	/// It's because multiple calls from different trasnactions within a particular L2 block would return correlated
	/// and maybe even potentially equal values, while calls within the same transaction would return equal value.
	/// That said, some correlation is OK because, according to Comment-202502075, we will not use this value as is.
	/// Comment-202506298 relates.
	/// [/Comment-202503254]
	/// Comment-202502077 applies to the return value.
	function generateRandomNumberSeed() internal /*view*/ returns (uint256) {
		// [Comment-202506276]
		// I've seen L1 and L2 block hashes being equal.
		// So it would be incorrect to bitwise xor them with each other.
		// Therefore let's shift this.
		// [/Comment-202506276]
		uint256 randomNumberSeed_ = uint256(blockhash(block.number - 1)) >> 1;

		// Comment-202505294 relates.
		// #enable_asserts assert(block.basefee > 0);

		randomNumberSeed_ ^= block.basefee << 64;

		// Let's expect that calls to Arbitrum precompiles can fail.
		{
			{
				(bool isSuccess_, uint256 arbBlockNumber_) = ArbitrumHelpers.tryGetArbBlockNumber();
				if (isSuccess_) {
					bytes32 arbBlockHash_;
					(isSuccess_, arbBlockHash_) = ArbitrumHelpers.tryGetArbBlockHash(arbBlockNumber_ - 1);
					if (isSuccess_) {
						// Comment-202506276 relates and/or applies.
						randomNumberSeed_ ^= uint256(arbBlockHash_);
					}
				}
			}

			{
				// Comment-202506298 applies.
				(bool isSuccess_, uint256 gasBacklog_) = ArbitrumHelpers.tryGetGasBacklog();
				
				if (isSuccess_) {
					randomNumberSeed_ ^= gasBacklog_ << (64 * 2);
				}
			}

			{
				// Comment-202506298 applies.
				(bool isSuccess_, uint256 l1PricingUnitsSinceUpdate_) = ArbitrumHelpers.tryGetL1PricingUnitsSinceUpdate();

				if (isSuccess_) {
					randomNumberSeed_ ^= l1PricingUnitsSinceUpdate_ << (64 * 3);
				}
			}
		}

		return randomNumberSeed_;
	}

	/// @notice
	/// [Comment-202504065]
	/// Similar logic exists in multiple places.
	/// [/Comment-202504065]
	/// @dev todo-1 +++ Test that `seedWrapper_.value` changes after this call.
	function generateRandomNumber(RandomNumberSeedWrapper memory seedWrapper_) internal pure returns (uint256) {
		unchecked { ++ seedWrapper_.value; }
		return generateRandomNumber(seedWrapper_.value);
	}

	/// @notice
	/// [Comment-202504063]
	/// Similar logic exists in multiple places.
	/// [/Comment-202504063]
	function generateRandomNumber(uint256 seed_) internal pure returns (uint256) {
		return CryptographyHelpers.calculateHashSumOf(seed_);
	}
}
