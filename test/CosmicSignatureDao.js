"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt32 } = require("../src/Helpers.js");
const { loadFixtureDeployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("CosmicSignatureDao", function () {
	it("Contract parameter setters", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		// [Comment-202508085]
		// Signers are placing bids to get some CSTs, which will give them the right to create proposals
		// and voting weights to vote for them.
		// [/Comment-202508085]
		for ( let signerIndex_ = 0; signerIndex_ <= 1; ++ signerIndex_ ) {
			await expect(contracts_.cosmicSignatureToken.connect(contracts_.signers[signerIndex_]).delegate(contracts_.signers[signerIndex_].address)).not.reverted;
			for ( let bidIndex_ = 0; bidIndex_ <= 1; ++ bidIndex_ ) {
				await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[signerIndex_]).bidWithEth(-1n, "", {value: 10n ** 18n,})).not.reverted;
			}
		}

		// We must mine a dummy block. Otherwise the logic near Comment-202508046 would not assert the latest state.
		await hre.ethers.provider.send("evm_mine");

		const latestBlock_ = await hre.ethers.provider.getBlock("latest");
		let votingDelay_ = await contracts_.cosmicSignatureDao.votingDelay();
		expect(votingDelay_).equal(24n * 60n * 60n);
		let votingPeriod_ = await contracts_.cosmicSignatureDao.votingPeriod();
		expect(votingPeriod_).equal(2n * 7n * 24n * 60n * 60n);
		let proposalThreshold_ = await contracts_.cosmicSignatureDao.proposalThreshold();
		expect(proposalThreshold_).equal(100n * 10n ** 18n);
		let quorumNumerator_ = await contracts_.cosmicSignatureDao.quorumNumerator();
		expect(quorumNumerator_).equal(2n);
		const quorumDenominator_ = await contracts_.cosmicSignatureDao.quorumDenominator();
		expect(quorumDenominator_).equal(100n);

		// [Comment-202508046]
		// `secondsAgoCounter_` cannot start with zero, because of Comment-202508043.
		// [/Comment-202508046]
		for ( let secondsAgoCounter_ = 1; ; ++ secondsAgoCounter_ ) {
			const quorum_ = await contracts_.cosmicSignatureDao.quorum(BigInt(latestBlock_.timestamp - secondsAgoCounter_));
			expect(quorum_).greaterThanOrEqual(0n);

			// [Comment-202508043]
			// The `Votes.getPastTotalSupply` method requires that the timestamp passed to it was in the past.
			// Despite of the last mined block being kinda in the past, when called off-chain, the method doesn't know about that.
			// [/Comment-202508043]
			expect(quorum_).equal(await contracts_.cosmicSignatureToken.getPastTotalSupply(latestBlock_.timestamp - secondsAgoCounter_) * quorumNumerator_ / quorumDenominator_);

			// console.info(secondsAgoCounter_.toString());
			if (quorum_ == 0n) {
				expect(secondsAgoCounter_).greaterThan(1);
				break;
			}
		}

		const clockMode_ = await contracts_.cosmicSignatureDao.CLOCK_MODE();
		expect(clockMode_).equal("mode=timestamp");
		const clock_ = await contracts_.cosmicSignatureToken.clock();
		expect(Number(clock_)).equal(latestBlock_.timestamp);

		{
			const oldVotingDelay_ = votingDelay_;
			votingDelay_ += BigInt(1 - (generateRandomUInt32() & 2));
			const proposalCallData_ = contracts_.cosmicSignatureDao.interface.encodeFunctionData("setVotingDelay", [votingDelay_]);
			const proposalDescription_ = "Call CosmicSignatureDao.setVotingDelay";
			const proposalDescriptionHashSum_ = hre.ethers.id(proposalDescription_);
			const transactionResponse_ = await contracts_.cosmicSignatureDao.connect(contracts_.signers[generateRandomUInt32() & 1]).propose([contracts_.cosmicSignatureDao.target], [0n], [proposalCallData_], proposalDescription_);
			const transactionReceipt_ = await transactionResponse_.wait();
			const parsedLog_ = contracts_.cosmicSignatureDao.interface.parseLog(transactionReceipt_.logs[0]);
			const proposalHashSum_ = parsedLog_.args.proposalId;

			// Comment-202508051 applies.
			await hre.ethers.provider.send("evm_increaseTime", [Number(oldVotingDelay_) + 1]);

			// await hre.ethers.provider.send("evm_mine");
			await expect(contracts_.cosmicSignatureDao.connect(contracts_.signers[generateRandomUInt32() & 1]).castVote(proposalHashSum_, 1n)).not.reverted;
			await hre.ethers.provider.send("evm_increaseTime", [Number(votingPeriod_)]);
			// await hre.ethers.provider.send("evm_mine");
			await expect(contracts_.cosmicSignatureDao.connect(contracts_.signers[generateRandomUInt32() & 3]).execute([contracts_.cosmicSignatureDao.target], [0n], [proposalCallData_], proposalDescriptionHashSum_)).not.reverted;
			expect(await contracts_.cosmicSignatureDao.votingDelay()).equal(votingDelay_);
		}

		{
			const oldVotingPeriod_ = votingPeriod_;
			votingPeriod_ += BigInt(1 - (generateRandomUInt32() & 2));
			const proposalCallData_ = contracts_.cosmicSignatureDao.interface.encodeFunctionData("setVotingPeriod", [votingPeriod_]);
			const proposalDescription_ = "Call CosmicSignatureDao.setVotingPeriod";
			const proposalDescriptionHashSum_ = hre.ethers.id(proposalDescription_);
			const transactionResponse_ = await contracts_.cosmicSignatureDao.connect(contracts_.signers[generateRandomUInt32() & 1]).propose([contracts_.cosmicSignatureDao.target], [0n], [proposalCallData_], proposalDescription_);
			const transactionReceipt_ = await transactionResponse_.wait();
			const parsedLog_ = contracts_.cosmicSignatureDao.interface.parseLog(transactionReceipt_.logs[0]);
			const proposalHashSum_ = parsedLog_.args.proposalId;

			// Comment-202508051 applies.
			await hre.ethers.provider.send("evm_increaseTime", [Number(votingDelay_) + 1]);

			// await hre.ethers.provider.send("evm_mine");
			await expect(contracts_.cosmicSignatureDao.connect(contracts_.signers[generateRandomUInt32() & 1]).castVote(proposalHashSum_, 1n)).not.reverted;
			await hre.ethers.provider.send("evm_increaseTime", [Number(oldVotingPeriod_)]);
			// await hre.ethers.provider.send("evm_mine");
			await expect(contracts_.cosmicSignatureDao.connect(contracts_.signers[generateRandomUInt32() & 3]).execute([contracts_.cosmicSignatureDao.target], [0n], [proposalCallData_], proposalDescriptionHashSum_)).not.reverted;
			expect(await contracts_.cosmicSignatureDao.votingPeriod()).equal(votingPeriod_);
		}

		{
			proposalThreshold_ += BigInt(1 - (generateRandomUInt32() & 2));
			const proposalCallData_ = contracts_.cosmicSignatureDao.interface.encodeFunctionData("setProposalThreshold", [proposalThreshold_]);
			const proposalDescription_ = "Call CosmicSignatureDao.setProposalThreshold";
			const proposalDescriptionHashSum_ = hre.ethers.id(proposalDescription_);
			const transactionResponse_ = await contracts_.cosmicSignatureDao.connect(contracts_.signers[generateRandomUInt32() & 1]).propose([contracts_.cosmicSignatureDao.target], [0n], [proposalCallData_], proposalDescription_);
			const transactionReceipt_ = await transactionResponse_.wait();
			const parsedLog_ = contracts_.cosmicSignatureDao.interface.parseLog(transactionReceipt_.logs[0]);
			const proposalHashSum_ = parsedLog_.args.proposalId;

			// Comment-202508051 applies.
			await hre.ethers.provider.send("evm_increaseTime", [Number(votingDelay_) + 1]);

			// await hre.ethers.provider.send("evm_mine");
			await expect(contracts_.cosmicSignatureDao.connect(contracts_.signers[generateRandomUInt32() & 1]).castVote(proposalHashSum_, 1n)).not.reverted;
			await hre.ethers.provider.send("evm_increaseTime", [Number(votingPeriod_)]);
			// await hre.ethers.provider.send("evm_mine");
			await expect(contracts_.cosmicSignatureDao.connect(contracts_.signers[generateRandomUInt32() & 3]).execute([contracts_.cosmicSignatureDao.target], [0n], [proposalCallData_], proposalDescriptionHashSum_)).not.reverted;
			expect(await contracts_.cosmicSignatureDao.proposalThreshold()).equal(proposalThreshold_);
		}

		{
			quorumNumerator_ += BigInt(1 - (generateRandomUInt32() & 2));
			const proposalCallData_ = contracts_.cosmicSignatureDao.interface.encodeFunctionData("updateQuorumNumerator", [quorumNumerator_]);
			const proposalDescription_ = "Call CosmicSignatureDao.updateQuorumNumerator";
			const proposalDescriptionHashSum_ = hre.ethers.id(proposalDescription_);
			const transactionResponse_ = await contracts_.cosmicSignatureDao.connect(contracts_.signers[generateRandomUInt32() & 1]).propose([contracts_.cosmicSignatureDao.target], [0n], [proposalCallData_], proposalDescription_);
			const transactionReceipt_ = await transactionResponse_.wait();
			const parsedLog_ = contracts_.cosmicSignatureDao.interface.parseLog(transactionReceipt_.logs[0]);
			const proposalHashSum_ = parsedLog_.args.proposalId;

			// Comment-202508051 applies.
			await hre.ethers.provider.send("evm_increaseTime", [Number(votingDelay_) + 1]);

			// await hre.ethers.provider.send("evm_mine");
			await expect(contracts_.cosmicSignatureDao.connect(contracts_.signers[generateRandomUInt32() & 1]).castVote(proposalHashSum_, 1n)).not.reverted;
			await hre.ethers.provider.send("evm_increaseTime", [Number(votingPeriod_)]);
			// await hre.ethers.provider.send("evm_mine");
			await expect(contracts_.cosmicSignatureDao.connect(contracts_.signers[generateRandomUInt32() & 3]).execute([contracts_.cosmicSignatureDao.target], [0n], [proposalCallData_], proposalDescriptionHashSum_)).not.reverted;
			expect(await contracts_.cosmicSignatureDao.quorumNumerator()).equal(quorumNumerator_);
		}
	});

	it("CosmicSignatureDao changes CharityWallet.charityAddress", async function () {
		// Signers 0 through 7 participate.
		// Each of signers 0 through 3 bids once and for that get rewarded with CST, which gives them the right to create proposals.
		// Note that `CosmicSignatureConstants.DEFAULT_CST_REWARD_AMOUNT_FOR_BIDDING` specifies both
		// CST reward amount for bidding and proposal threshold.
		// The CST balance also specifies signer voting weight.
		// Signer 2 delegates its votes to signer 1, which makes it impossible for signer 2 to creates a proposal
		// and makes its voting weight zero. So despite of holding a CST balance,
		// signer 2 is effectively a second class citizen, just like signers 4 through 7.
		// A randomly picked signer out of 0, 1, or 3 creates a proposal.
		// Signer 0 votes to abstain, signer 1 does for, and signer 3 does against the proposal.
		// Any signer has the right to execute an approved proposal, which a randomly selected one out of 0 through 7 does.
		// The above logic gets executed twice. On the 1st iteration signer 3 bids once more, which gives it more CST,
		// which results in the proposal getting rejected.
		// The actual logic is more complex. It also tests a number of special cases, including transaction reversal conditions.

		// This can return 0 through 7.
		const generateRandomSignerIndex_ = () => {
			let signerIndex_ = generateRandomUInt32() % 8;
			// console.info(signerIndex_.toString());
			return signerIndex_;
		};

		// Picks a signer that has a nonzero voting weight.
		// This can return 0, 1, or 3.
		const generateRandomQualifiedSignerIndex_ = () => {
			let signerIndex_ = generateRandomUInt32() % 3;
			if (signerIndex_ >= 2) {
				++ signerIndex_;
			}
			// console.info(signerIndex_.toString());
			return signerIndex_;
		};

		// Picks a signer that has a zero voting weight.
		// This can return 2, 4, 5, 6, or 7.
		const generateRandomUnqualifiedSignerIndex_ = () => {
			let signerIndex_ = generateRandomUInt32() % 5 + 2;
			if (signerIndex_ >= 3) {
				++ signerIndex_;
			}
			// console.info(signerIndex_.toString());
			return signerIndex_;
		};

		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		const mintCstsForSigner3_ = async () => {
			for ( let bidCounter_ = 0; bidCounter_ < 1; ++ bidCounter_ ) {
				await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).bidWithEth(-1n, "", {value: 10n ** 18n,})).not.reverted;
			}
		};

		const votingDelay_ = await contracts_.cosmicSignatureDao.votingDelay();
		const votingPeriod_ = await contracts_.cosmicSignatureDao.votingPeriod();

		await expect(contracts_.cosmicSignatureToken.connect(contracts_.signers[0]).delegate(contracts_.signers[0].address)).not.reverted;
		await expect(contracts_.cosmicSignatureToken.connect(contracts_.signers[1]).delegate(contracts_.signers[1].address)).not.reverted;

		// Delegating to a different signer.
		await expect(contracts_.cosmicSignatureToken.connect(contracts_.signers[2]).delegate(contracts_.signers[1].address)).not.reverted;

		await expect(contracts_.cosmicSignatureToken.connect(contracts_.signers[3]).delegate(contracts_.signers[3].address)).not.reverted;

		const newCharityAddress_ = contracts_.signers[generateRandomSignerIndex_()].address;
		const proposalCallData_ = contracts_.charityWallet.interface.encodeFunctionData("setCharityAddress", [newCharityAddress_]);

		for ( let modeCode_ = 1; ; -- modeCode_ ) {
			for ( let signerIndex_ = 0; signerIndex_ <= 3; ++ signerIndex_ ) {
				const signerCstBalanceAmount_ = await contracts_.cosmicSignatureToken.balanceOf(contracts_.signers[signerIndex_].address);
				await expect(contracts_.cosmicSignatureToken.connect(contracts_.signers[signerIndex_]).burn(signerCstBalanceAmount_)).not.reverted;
				await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[signerIndex_]).bidWithEth(-1n, "", {value: 10n ** 18n,})).not.reverted;
			}

			// Both proposals use the same call data and other arguments, but they must differ at least with their descriptions,
			// so that proposal hashes were different.
			const proposalDescription_ = `Change Charity Address, Mode ${modeCode_}`;

			const proposalDescriptionHashSum_ = hre.ethers.id(proposalDescription_);

			// This signer does not have a sufficient voting weight to create a proposal.
			await expect(contracts_.cosmicSignatureDao.connect(contracts_.signers[generateRandomUnqualifiedSignerIndex_()]).propose([contracts_.charityWalletAddr], [0n], [proposalCallData_], proposalDescription_))
				.revertedWithCustomError(contracts_.cosmicSignatureDao, "GovernorInsufficientProposerVotes");

			const transactionResponse_ = await contracts_.cosmicSignatureDao.connect(contracts_.signers[generateRandomQualifiedSignerIndex_()]).propose([contracts_.charityWalletAddr], [0n], [proposalCallData_], proposalDescription_);
			const transactionReceipt_ = await transactionResponse_.wait();
			const parsedLog_ = contracts_.cosmicSignatureDao.interface.parseLog(transactionReceipt_.logs[0]);
			const proposalHashSum_ = parsedLog_.args.proposalId;
			const proposalCreationTransactionBlock_ = await transactionReceipt_.getBlock();

			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [proposalCreationTransactionBlock_.timestamp + Math.floor(Number(votingDelay_) / 2)]);
			// await hre.ethers.provider.send("evm_mine");
			if (modeCode_ > 0) {
				// [Comment-202508053]
				// Signer 3 gets more CSTs , which increases its voting weight.
				// This has effect only before the voting delay is over.
				// Comment-202508055 relates.
				// [/Comment-202508053]
				await mintCstsForSigner3_();
			}

			// [Comment-202508035]
			// It's too early.
			// [/Comment-202508035]
			await expect(contracts_.cosmicSignatureDao.connect(contracts_.signers[generateRandomSignerIndex_()]).castVote(proposalHashSum_, BigInt(generateRandomUInt32() % 3)))
				.revertedWithCustomError(contracts_.cosmicSignatureDao, "GovernorUnexpectedProposalState");

			// [Comment-202508051]
			// Because of Comment-202508041, adding 1.
			// [/Comment-202508051]
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [proposalCreationTransactionBlock_.timestamp + Number(votingDelay_) + 1]);

			// await hre.ethers.provider.send("evm_mine");
			if (modeCode_ <= 0) {
				// [Comment-202508055]
				// Signer 3 gets more CSTs , but that doesn't give it more voting weight, because the voting delay is over.
				// Comment-202508053 relates.
				// [/Comment-202508055]
				await mintCstsForSigner3_();
			}

			// A signer with a zero voting weight is not prohibited to vote.
			// However doing so does not affect the voting outcome.
			await expect(contracts_.cosmicSignatureDao.connect(contracts_.signers[generateRandomUnqualifiedSignerIndex_()]).castVote(proposalHashSum_, BigInt(generateRandomUInt32() % 3))).not.reverted;
			expect(await contracts_.cosmicSignatureDao.proposalVotes(proposalHashSum_)).deep.equals([0n, 0n, 0n,]);

			await expect(contracts_.cosmicSignatureDao.connect(contracts_.signers[0]).castVote(proposalHashSum_, 2n)).not.reverted;
			await expect(contracts_.cosmicSignatureDao.connect(contracts_.signers[1]).castVote(proposalHashSum_, 1n)).not.reverted;
			await expect(contracts_.cosmicSignatureDao.connect(contracts_.signers[3]).castVote(proposalHashSum_, 0n)).not.reverted;

			// Comment-202508051 applies.
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [proposalCreationTransactionBlock_.timestamp + Number(votingDelay_) + 1 + Math.floor(Number(votingPeriod_) / 2)]);

			// await hre.ethers.provider.send("evm_mine");
			{
				const proposalExecutorSigner_ = contracts_.signers[generateRandomSignerIndex_()];

				// Comment-202508035 applies.
				await expect(contracts_.cosmicSignatureDao.connect(proposalExecutorSigner_).execute([contracts_.charityWalletAddr], [0n], [proposalCallData_], proposalDescriptionHashSum_))
					.revertedWithCustomError(contracts_.cosmicSignatureDao, "GovernorUnexpectedProposalState");

				// Comment-202508051 applies.
				await hre.ethers.provider.send("evm_setNextBlockTimestamp", [proposalCreationTransactionBlock_.timestamp + Number(votingDelay_) + 1 + Number(votingPeriod_)]);

				// await hre.ethers.provider.send("evm_mine");
				const transactionResponsePromise_ = contracts_.cosmicSignatureDao.connect(proposalExecutorSigner_).execute([contracts_.charityWalletAddr], [0n], [proposalCallData_], proposalDescriptionHashSum_);
				const transactionResponsePromiseAssertion_ = expect(transactionResponsePromise_);
				if (modeCode_ > 0) {
					// Voters have rejected the proposal.
					await transactionResponsePromiseAssertion_
						.revertedWithCustomError(contracts_.cosmicSignatureDao, "GovernorUnexpectedProposalState");

					continue;
				}

				// [Comment-202508037]
				// `CharityWallet` is rejecting a call from `CosmicSignatureDao`.
				// [/Comment-202508037]
				await transactionResponsePromiseAssertion_
					.revertedWithCustomError(contracts_.charityWallet, "OwnableUnauthorizedAccount");

				await expect(contracts_.charityWallet.connect(contracts_.ownerAcct).transferOwnership(proposalExecutorSigner_.address)).not.reverted;

				// Comment-202508037 applies.
				await expect(contracts_.cosmicSignatureDao.connect(proposalExecutorSigner_).execute([contracts_.charityWalletAddr], [0n], [proposalCallData_], proposalDescriptionHashSum_))
					.revertedWithCustomError(contracts_.charityWallet, "OwnableUnauthorizedAccount");

				// [Comment-202508086]
				// Initially, the current owner must transfer the ownership to the DAO.
				// [/Comment-202508086]
				await expect(contracts_.charityWallet.connect(proposalExecutorSigner_).transferOwnership(contracts_.cosmicSignatureDaoAddr)).not.reverted;

				expect(await contracts_.charityWallet.charityAddress()).equal(contracts_.charityAcct.address);
				await expect(contracts_.cosmicSignatureDao.connect(proposalExecutorSigner_).execute([contracts_.charityWalletAddr], [0n], [proposalCallData_], proposalDescriptionHashSum_)).not.reverted;
				expect(await contracts_.charityWallet.charityAddress()).equal(newCharityAddress_);
			}

			break;
		}
	});

	it("CosmicSignatureDao changes MarketingWallet.owner()", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(2n);

		// Comment-202508085 applies.
		for ( let signerIndex_ = 0; signerIndex_ <= 1; ++ signerIndex_ ) {
			await expect(contracts_.cosmicSignatureToken.connect(contracts_.signers[signerIndex_]).delegate(contracts_.signers[signerIndex_].address)).not.reverted;
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[signerIndex_]).bidWithEth(-1n, "", {value: 10n ** 18n,})).not.reverted;
		}

		const votingDelay_ = await contracts_.cosmicSignatureDao.votingDelay();
		const votingPeriod_ = await contracts_.cosmicSignatureDao.votingPeriod();

		// Comment-202508086 applies.
		// todo-0 Do we need a backdoor that allows the DAO to forcibly change owners of most/all our contracts
		// todo-0 without the current owners cooperating?
		// todo-0 Maybe only `MarketingWallet.transferOwnership` should always accept a call from the DAO.
		// todo-0 After I implement that, call this only a half of the time, based on a random number.
		await expect(contracts_.marketingWallet.connect(contracts_.ownerAcct).transferOwnership(contracts_.cosmicSignatureDaoAddr)).not.reverted;

		const newOwnerAddress_ = contracts_.signers[generateRandomUInt32() & 3].address;
		const proposalCallData_ = contracts_.marketingWallet.interface.encodeFunctionData("transferOwnership", [newOwnerAddress_]);
		const proposalDescription_ = "change MarketingWallet owner";
		const proposalDescriptionHashSum_ = hre.ethers.id(proposalDescription_);
		const transactionResponse_ = await contracts_.cosmicSignatureDao.connect(contracts_.signers[generateRandomUInt32() & 1]).propose([contracts_.marketingWalletAddr], [0n], [proposalCallData_], proposalDescription_);
		const transactionReceipt_ = await transactionResponse_.wait();
		const parsedLog_ = contracts_.cosmicSignatureDao.interface.parseLog(transactionReceipt_.logs[0]);
		const proposalHashSum_ = parsedLog_.args.proposalId;

		// Comment-202508051 applies.
		await hre.ethers.provider.send("evm_increaseTime", [Number(votingDelay_) + 1]);

		// await hre.ethers.provider.send("evm_mine");
		await expect(contracts_.cosmicSignatureDao.connect(contracts_.signers[generateRandomUInt32() & 1]).castVote(proposalHashSum_, 1n)).not.reverted;
		await hre.ethers.provider.send("evm_increaseTime", [Number(votingPeriod_)]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(contracts_.cosmicSignatureDao.connect(contracts_.signers[generateRandomUInt32() & 3]).execute([contracts_.marketingWalletAddr], [0n], [proposalCallData_], proposalDescriptionHashSum_)).not.reverted;
		expect(await contracts_.marketingWallet.owner()).equal(newOwnerAddress_);
	});
});
