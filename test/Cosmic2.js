const { time, loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');
const { expect } = require('chai');
const SKIP_LONG_TESTS = '1';
const { basicDeployment, basicDeploymentAdvanced } = require('../src//Deploy.js');

describe('Cosmic Set2', function () {
	// We define a fixture to reuse the same setup in every test.
	// We use loadFixture to run this setup once, snapshot that state,
	// and reset Hardhat Network to that snapshot in every test.
	async function deployCosmic(deployerAcct) {
		let contractDeployerAcct;
		[contractDeployerAcct] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			cosmicGame
		} = await basicDeployment(
			contractDeployerAcct,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			true
		);
		return {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			cosmicGame,
		};
	}
	const bidParamsEncoding = {
		type: 'tuple(string,int256)',
		name: 'bidparams',
		components: [
			{ name: 'msg', type: 'string' },
			{ name: 'rwalk', type: 'int256' }
		]
	};
	const InvalidBidderQueryRoundDef = {
		type: 'tuple(string,uint256,uint256)',
		name: 'InvalidBidderQueryRound',
		components: [
			{ name: 'errStr', type: 'string' },
			{ name: 'providedRound', type: 'uint256' },
			{ name: 'totalRounds', type: 'uint256' }
		]
	};
	it('After bid() , bid-related counters have correct values', async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT, stakingWalletCST, stakingWalletRWalk,marketingWallet,cosmicGame} =
			await loadFixture(deployCosmic);
		
		let donationAmount = ethers.parseEther('10');
		await cosmicGameProxy.donate({ value: donationAmount });
		var bidParams = { msg: '', rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();

		let aLen = await cosmicGameProxy.CSTAuctionLength();
		await ethers.provider.send('evm_increaseTime', [Number(aLen)]); // make CST price drop to 0
		await ethers.provider.send('evm_mine');

		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.mint({ value: tokenPrice }); // tokenId=0

		bidPrice = await cosmicGameProxy.getBidPrice();
		bidParams = { msg: 'rwalk bid', rwalk: 0 };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.bid(params, { value: bidPrice });

		lastBidType = await cosmicGameProxy.lastBidType();
		expect(lastBidType).to.equal(1);

		await cosmicGameProxy.bidWithCST('cst bid');

		lastBidType = await cosmicGameProxy.lastBidType();
		expect(lastBidType).to.equal(2);
	});
	it('Bidder is receiving correct refund amount when using larger bidPrice than required', async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let donationAmount = ethers.parseEther('1');
		await cosmicGameProxy.donate({ value: donationAmount });
		let cosmicGameAddr = await cosmicGameProxy.getAddress();

		// we are using BidderContract for this test because there won't be any subtraction
		// for paying gas price since it is accounted on the EOA that sends the TX,
		// and this will guarantee clean calculations
		const BidderContract = await ethers.getContractFactory('BidderContract');
		let cBidder = await BidderContract.deploy(cosmicGameAddr);
		await cBidder.waitForDeployment();
		let balanceBefore = await ethers.provider.getBalance(await cBidder.getAddress());
		let amountSent = ethers.parseEther('2');
		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cBidder.doBid2({ value: amountSent });

		let balanceAfter = await ethers.provider.getBalance(await cBidder.getAddress());
		let expectedBalanceAfter = amountSent - bidPrice;
		expect(expectedBalanceAfter).to.equal(balanceAfter);
	});
	it('Bidder is receiving correct refund amount when using larger bidPrice than required using RandomWalk', async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let donationAmount = ethers.parseEther('1');
		await cosmicGameProxy.donate({ value: donationAmount });
		let cosmicGameAddr = await cosmicGameProxy.getAddress();

		// we are using BidderContract for this test because there won't be any subtraction
		// for paying gas price since it is accounted on the EOA that sends the TX,
		// and this will guarantee clean calculations
		const BidderContract = await ethers.getContractFactory('BidderContract');
		let cBidder = await BidderContract.deploy(cosmicGameAddr);
		await cBidder.waitForDeployment();
		let balanceBefore = await ethers.provider.getBalance(await cBidder.getAddress());
		let amountSent = ethers.parseUnits('1',15);

		await randomWalkNFT.setApprovalForAll(cosmicGameAddr, true);
		await randomWalkNFT.setApprovalForAll(await cBidder.getAddress(), true);
		let tokenPrice = await randomWalkNFT.getMintPrice();
		await randomWalkNFT.mint({ value: tokenPrice }); // tokenId=0
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cBidder.doBidRWalk2(0, { value: amountSent });

		let balanceAfter = await ethers.provider.getBalance(await cBidder.getAddress());
		let discountedBidPrice = Number(bidPrice)/2;
		let expectedBalanceAfter = Number(amountSent) - discountedBidPrice;
		expect(expectedBalanceAfter).to.equal(Number(balanceAfter));
	});
	it('Maintenance mode works as expected', async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let ownableErr = cosmicGameProxy.interface.getError('OwnableUnauthorizedAccount');

		let cosmicGameAddr = await cosmicGameProxy.getAddress();
		let donationAmount = ethers.parseEther('10');
		await cosmicGameProxy.donate({ value: donationAmount });
		var bidParams = { msg: '', rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });

		let sysMode = await cosmicGameProxy.systemMode();
		expect(sysMode.toString()).to.equal('0');

		await cosmicGameProxy.connect(owner).prepareMaintenance();
		await expect(cosmicGameProxy.connect(addr1).prepareMaintenance()).to.be.revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");

		sysMode = await cosmicGameProxy.systemMode();
		expect(sysMode.toString()).to.equal('1');

		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await ethers.provider.send('evm_mine');
		await cosmicGameProxy.connect(addr1).claimPrize();

		sysMode = await cosmicGameProxy.systemMode();
		expect(sysMode.toString()).to.equal('2');

		await cosmicGameProxy.setRuntimeMode();
		sysMode = await cosmicGameProxy.systemMode();
		expect(sysMode.toString()).to.equal('0');

		// make another bid just to make sure runtime mode is enabled
		bidParams = { msg: '', rwalk: -1 };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
	});
	it('Bidding a lot & staking a lot works correctly ', async function () {
		[owner, addr1, addr2, addr3, addr4, addr5] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let donationAmount = ethers.parseEther('100');
		await cosmicGameProxy.donate({ value: donationAmount });

		let bidParams, params, prizeTime;
		bidParams = { msg: '', rwalk: -1 };
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		for (let i = 0; i < 30; i++) {
			bidPrice = await cosmicGameProxy.getBidPrice();
			await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
			bidPrice = await cosmicGameProxy.getBidPrice();
			await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
			bidPrice = await cosmicGameProxy.getBidPrice();
			await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });
			bidPrice = await cosmicGameProxy.getBidPrice();
			await cosmicGameProxy.connect(addr4).bid(params, { value: bidPrice });
			prizeTime = await cosmicGameProxy.timeUntilPrize();
			await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
			await ethers.provider.send('evm_mine');
			await cosmicGameProxy.connect(addr4).claimPrize();
		}
		let tx, receipt, log, parsed_log;
		let topic_sig = stakingWalletCST.interface.getEvent('StakeActionEvent').topicHash;
		let ts = await cosmicSignature.totalSupply();
		let rn = await cosmicGameProxy.roundNum();
		let tokensByStaker = {};
		for (let i = 0; i < Number(ts); i++) {
			let ownr = await cosmicSignature.ownerOf(i);
			let userTokens = tokensByStaker[ownr];
			if (userTokens === undefined) {
				userTokens = [];
			}
			userTokens.push(i);
			tokensByStaker[ownr] = userTokens;
			let owner_signer = await ethers.getSigner(ownr);
			await cosmicSignature.connect(owner_signer).setApprovalForAll(await stakingWalletCST.getAddress(), true);
			tx = await stakingWalletCST.connect(owner_signer).stake(i);
			receipt = await tx.wait();
			log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
			parsed_log = stakingWalletCST.interface.parseLog(log);
		}
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr4).bid(params, { value: bidPrice });
		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await ethers.provider.send('evm_mine');
		prizeTime = await cosmicGameProxy.timeoutClaimPrize(); // we need another time increase to claim as addr5 (addr5 has no bids, won't get raffle NFTs)
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await ethers.provider.send('evm_mine');
		let totSupBefore = await cosmicSignature.totalSupply();
		tx = await cosmicGameProxy.connect(addr5).claimPrize();
		receipt = await tx.wait();
		topic_sig = cosmicGameProxy.interface.getEvent('RaffleNFTWinnerEvent').topicHash;
		let raffle_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		// all Raffle NFTs must have zero address because they are not staked, verify it
		for (let i = 0; i < raffle_logs.length; i++) {
			let rlog = cosmicGameProxy.interface.parseLog(raffle_logs[i]);
			let winner = rlog.args.winner;
			let owner = await cosmicSignature.ownerOf(rlog.args.tokenId);
			let stakerAddr = await stakingWalletCST.stakerByTokenId(rlog.args.tokenId);
			expect(stakerAddr).to.equal('0x0000000000000000000000000000000000000000');
		}
		// all the remaining NFTs must have stakerByTokenId() equal to the addr who staked it
		// also check the correctness of lastActionId map
		ts = await cosmicSignature.totalSupply();
		for (let i = 0; i < Number(ts); i++) {
			let stakerAddr = await stakingWalletCST.stakerByTokenId(i);
			if (stakerAddr == '0x0000000000000000000000000000000000000000') {
				let ownr = await cosmicSignature.ownerOf(i);
				let userTokens = tokensByStaker[ownr];
				if (userTokens === undefined) {
					userTokens = [];
				}
				userTokens.push(i);
				tokensByStaker[ownr] = userTokens;
				if (i >= Number(totSupBefore)) {
					// this is new token, it is not staked yet
					continue;
				}
			}
			let isStaked = await stakingWalletCST.isTokenStaked(i);
			expect(isStaked).to.equal(true);
			let lastActionId = await stakingWalletCST.lastActionIdByTokenId(i);
			lastActionId = Number(lastActionId);
			if (lastActionId < 0) {
				throw 'Invalid action id' + lastActionId;
			}
			let stakeActionRecord = await stakingWalletCST.stakeActions(lastActionId);
			expect(stakeActionRecord.nftOwner).to.equal(stakerAddr);
		}
		await ethers.provider.send('evm_increaseTime', [3600 * 24 * 60]);
		await ethers.provider.send('evm_mine');
		let num_actions;
		num_actions = await stakingWalletCST.numStakeActions();
		for (let i = 0; i < Number(num_actions); i++) {
			let action_rec = await stakingWalletCST.stakeActions(i);
			action_rec = action_rec.toObject();
			let ownr = action_rec.nftOwner;
			let owner_signer = await ethers.getSigner(ownr);
			await ethers.provider.send('evm_increaseTime', [100]);
			await stakingWalletCST.connect(owner_signer).unstake(i);
		}
		// at this point, all tokens were unstaked
		num_actions = await stakingWalletCST.numStakeActions();
		for (let i = 0; i < Number(num_actions); i++) {
			let action_rec = await stakingWalletCST.stakeActions(i);
			action_rec = action_rec.toObject();
			let ownr = action_rec.nftOwner;
			let num_deposits = await stakingWalletCST.numETHDeposits();
			let owner_signer = await ethers.getSigner(ownr);
			for (let j = 0; j < Number(num_deposits); j++) {
				let deposit_rec = await stakingWalletCST.ETHDeposits(j);
				await stakingWalletCST.connect(owner_signer).claimManyRewards([i], [j]);
			}
		}
		let contractBalance = await ethers.provider.getBalance(await stakingWalletCST.getAddress());
		let m = await stakingWalletCST.modulo();
		expect(m).to.equal(contractBalance);

		// check that every staker has its own tokens back
		for (user in tokensByStaker) {
			let userTokens = tokensByStaker[user];
			for (let i = 0; i < userTokens.length; i++) {
				let o = await cosmicSignature.ownerOf(userTokens[i]);
				expect(o).to.equal(user);
			}
		}
	});
	it('Bidding with CST works', async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: '', rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });
		// // todo-0 Uncomment this when fixing ToDo-202409199-0.
		// bidPrice = await cosmicGameProxy.getBidPrice();
		// await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await cosmicGameProxy.connect(addr1).claimPrize();

		await ethers.provider.send('evm_increaseTime', [20000]); // make CST bid price cheaper
		await ethers.provider.send('evm_mine');
		await cosmicGameProxy.connect(addr1).bidWithCST('cst bid');

		let cstPrice = await cosmicGameProxy.getCurrentBidPriceCST();
		expect(cstPrice.toString()).to.equal('200000000000000000000');
		// // todo-0 Replace the above with this when fixing ToDo-202409199-0.
		// expect(cstPrice.toString()).to.equal('214831600000000000000');

		let tx = await cosmicGameProxy.connect(addr1).bidWithCST('cst bid');
		let receipt = await tx.wait();
		let topic_sig = cosmicGameProxy.interface.getEvent('BidEvent').topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicGameProxy.interface.parseLog(log);
		let args = parsed_log.args.toObject();
		expect('199995400000000000000').to.equal(args.numCSTTokens.toString());
		// // todo-0 Replace the above with this when fixing ToDo-202409199-0.
		// expect(args.numCSTTokens.toString()).to.equal('214826658873200000000');
		expect(args.bidPrice.toString()).to.equal("-1");
		expect(args.lastBidder).to.equal(addr1.address);
		expect(args.message).to.equal('cst bid');
	});
	it('Distribution of prize amounts matches specified business logic', async function () {
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			randomWalkNFT,
			raffleWallet,
			stakingWalletCST,
			stakingWalletRWalk,
			marketingWallet,
			bidLogic
		} = await basicDeploymentAdvanced(
			'SpecialCosmicGame',
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			true
		);

		let donationAmount = ethers.parseEther('1');
		await cosmicGameProxy.donate({ value: donationAmount });
		let charityAddr = await cosmicGameProxy.charity();

		await cosmicGameProxy.mintCST(addr1.address, 0); // mint a token so we can stake
		await cosmicSignature.connect(addr1).setApprovalForAll(await stakingWalletCST.getAddress(), true);
		await stakingWalletCST.connect(addr1).stake(0); // stake a token so the deposits to staking wallet go to staking wallet , not to charity

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: '', rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });

		// we are using BidderContract for this test because there won't be any subtraction
		// for paying gas price since it is accounted on the EOA that sends the TX,
		// and this will guarantee clean calculations
		const BidderContract = await ethers.getContractFactory('BidderContract');
		let cBidder = await BidderContract.deploy(await cosmicGameProxy.getAddress());
		await cBidder.waitForDeployment();

		bidPrice = await cosmicGameProxy.getBidPrice();
		await cBidder.doBid({ value: bidPrice });

		let mainPrizeAmount = await cosmicGameProxy.prizeAmount();
		let charityAmount = await cosmicGameProxy.charityAmount();
		let stakingAmount = await cosmicGameProxy.stakingAmount();
		let balanceBefore = await ethers.provider.getBalance(await cBidder.getAddress());
		let balanceCharityBefore = await ethers.provider.getBalance(charityAddr);
		let balanceStakingBefore = await ethers.provider.getBalance(await stakingWalletCST.getAddress());
		let raffleAmount = await cosmicGameProxy.raffleAmount();
		let numWinners = await cosmicGameProxy.numRaffleETHWinnersBidding();
		let amountPerWinner = Number(raffleAmount)/Number(numWinners);
		let modAmount = Number(raffleAmount) % Number(numWinners);
		raffleAmount = raffleAmount - BigInt(modAmount); // clean the value from reminder if not divisible by numWinners
		prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await ethers.provider.send('evm_mine');
		let tx = await cBidder.doClaim();
		let receipt = await tx.wait();
		let balanceAfter = await ethers.provider.getBalance(await cBidder.getAddress());
		let balanceCharityAfter = await ethers.provider.getBalance(charityAddr);
		let balanceStakingAfter = await ethers.provider.getBalance(await stakingWalletCST.getAddress());

		let topic_sig = cosmicGameProxy.interface.getEvent('RaffleETHWinnerEvent').topicHash;
		let deposit_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
		var unique_winners = [];
		var sumDeposits = 0n;
		for (let i = 0; i < deposit_logs.length; i++) {
			let wlog = cosmicGameProxy.interface.parseLog(deposit_logs[i]);
			let args = wlog.args.toObject();
			let winner = args.winner;
			sumDeposits = sumDeposits + args.amount;
			let winner_signer = await ethers.getSigner(winner);
			if (typeof unique_winners[winner] === 'undefined') {
				if (winner != (await cBidder.getAddress())) {
					await raffleWallet.connect(winner_signer).withdraw();
				}
				unique_winners[winner] = 1;
			}
		}
		expect(sumDeposits).to.equal(raffleAmount);

		let expectedBalanceAfter = balanceBefore + mainPrizeAmount;
		expect(expectedBalanceAfter).to.equal(balanceAfter);
		let expectedBalanceCharityAfter = balanceCharityBefore + charityAmount;
		expect(expectedBalanceCharityAfter).to.equal(balanceCharityAfter);
		let expectedBalanceStakingAfter = balanceStakingBefore + stakingAmount;
		expect(expectedBalanceStakingAfter).to.equal(balanceStakingAfter);
	});
	it('Function bidderAddress() works as expected', async function () {
		[owner, addr1, addr2, addr3, addr4, addr5] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		let bidPrice = await cosmicGameProxy.getBidPrice();
		let bidParams = { msg: '', rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });

		let bAddr = await cosmicGameProxy.bidderAddress(0,0);
		expect(bAddr).to.equal(addr3.address);

		bAddr = await cosmicGameProxy.bidderAddress(0,1); 
		expect(bAddr).to.equal(addr2.address);

		bAddr = await cosmicGameProxy.bidderAddress(0,2); 
		expect(bAddr).to.equal(addr1.address);

		bAddr = await expect(cosmicGameProxy.bidderAddress(1,2)).to.be.revertedWithCustomError(
			contractErrors,
			'InvalidBidderQueryRound'
		);
		bAddr = await expect(cosmicGameProxy.bidderAddress(0,3)).to.be.revertedWithCustomError(
			contractErrors,
			'InvalidBidderQueryOffset'
		);
		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await cosmicGameProxy.connect(addr3).claimPrize();
		await expect(cosmicGameProxy.bidderAddress(1, 1)).to.be.revertedWithCustomError(
			contractErrors,
			'BidderQueryNoBidsYet'
		);

		// lets check roundNum > 0 now

		bidPrice = await cosmicGameProxy.getBidPrice();
		params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });

		bAddr = await cosmicGameProxy.bidderAddress(1,0);
		expect(bAddr).to.equal(addr3.address);

		bAddr = await cosmicGameProxy.bidderAddress(1,1);
		expect(bAddr).to.equal(addr2.address);

		bAddr = await cosmicGameProxy.bidderAddress(1,2);
		expect(bAddr).to.equal(addr1.address);
	});
	it('Bid statistics are generating correct values for giving complementary prizes', async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		let donationAmount = ethers.parseEther('9000');
		await cosmicGameProxy.donate({ value: donationAmount });
		var bidParams = { msg: '', rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime)]);
		await ethers.provider.send('evm_mine');
		await cosmicGameProxy.connect(addr1).claimPrize(); // we need to claim prize because we want updated bidPrice (larger value)

		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		let maxBidderAddr = await cosmicGameProxy.stellarSpender();
		let maxEthBidderAmount = await cosmicGameProxy.stellarSpenderAmount();

		expect(maxBidderAddr).to.equal(addr1.address);
		expect(maxEthBidderAmount).to.equal(bidPrice);
	});
	it("The msg.sender will get the prize if the lastBidder won't claim it", async function () {
		[contractDeployerAcct] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet
		} = await basicDeployment(
			contractDeployerAcct,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			true
		);
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		// in this test we will make one bid as EOA, after that we will wait for claimPrize() timeout
		// and call the claimPrize() function from a contract. The contract should get the (main) prize.

		const BidderContract = await ethers.getContractFactory('BidderContract');
		const bContract = await BidderContract.deploy(await cosmicGameProxy.getAddress());

		let donationAmount = hre.ethers.parseEther('10');
		await cosmicGameProxy.donate({ value: donationAmount });

		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

		let bidPrice = await cosmicGameProxy.getBidPrice();
		var bidParams = { msg: '', rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		await cosmicGameProxy.connect(addr3).bid(params, { value: bidPrice });
		let prizeTime = await cosmicGameProxy.timeUntilPrize();
		// forward time 2 days
		await ethers.provider.send('evm_increaseTime', [Number(prizeTime) + (48 * 3600)]);
		await ethers.provider.send('evm_mine');

		let tx = await bContract.connect(addr2).doClaim();
		let receipt = await tx.wait();
		let topic_sig = cosmicGameProxy.interface.getEvent('PrizeClaimEvent').topicHash;
		let log = receipt.logs.find(x => x.topics.indexOf(topic_sig) >= 0);
		let parsed_log = cosmicGameProxy.interface.parseLog(log);
		expect(parsed_log.args.destination).to.equal(await bContract.getAddress());
	});
	it("Fallback function works", async function () {
		[contractDeployerAcct] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet
		} = await basicDeployment(
			contractDeployerAcct,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			true
		);
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');
		await expect(
			ethers.provider.call({
				to:  await cosmicGameProxy.getAddress(),
				data: "0xffffffff", // non-existent selector
			})
		).to.be.revertedWith("Function does not exist");
	})
	it("upgradeTo() works", async function () {
		[contractDeployerAcct] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet
		} = await basicDeployment(
			contractDeployerAcct,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			true
		);
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');

        const BrokenCharity = await ethers.getContractFactory("BrokenCharity");
        let brokenCharity = await BrokenCharity.deploy();
        await brokenCharity.waitForDeployment();

		await cosmicGameProxy.upgradeTo(await brokenCharity.getAddress());
		await expect(contractDeployerAcct.sendTransaction({ to: await cosmicGameProxy.getAddress(), value: 1000000000000000000n})).to.be.revertedWith("Test deposit failed");
	})
	it("initialize() is disabled", async function () {
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet
		} = await basicDeployment(
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			true
		);
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		await expect(cosmicGameProxy.initialize(owner.address)).revertedWithCustomError(cosmicGameProxy,"InvalidInitialization");
	})
	it("Only owner can upgrade proxy", async function () {
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
		const {
			cosmicGameProxy,
			cosmicToken,
			cosmicSignature,
			charityWallet,
			cosmicDAO,
			raffleWallet,
			randomWalkNFT,
			stakingWallet,
			marketingWallet
		} = await basicDeployment(
			owner,
			'',
			0,
			'0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
			true,
			true
		);
		let = contractErrors = await ethers.getContractFactory('CosmicGameErrors');

		await expect(cosmicGameProxy.connect(addr2).upgradeTo(addr1.address)).revertedWithCustomError(cosmicGameProxy,"OwnableUnauthorizedAccount");
	})
	it('It is not possible to bid with CST if balance is not enough', async function () {
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT } =
			await loadFixture(deployCosmic);
		[owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
		await expect(cosmicGameProxy.connect(addr1).bidWithCST('cst bid')).to.be.revertedWithCustomError(cosmicGameProxy,"InsufficientCSTBalance");
	});
	it('getBidderAtPosition() reverts if invalid position index is provided', async function () {
		[owner, addr1, addr2, ...addrs] = await ethers.getSigners();
		const { cosmicGameProxy, cosmicToken, cosmicSignature, charityWallet, cosmicDAO, raffleWallet, randomWalkNFT, stakingWalletCST, stakingWalletRWalk,marketingWallet,cosmicGame} =
			await loadFixture(deployCosmic);
		
		let donationAmount = ethers.parseEther('10');
		await cosmicGameProxy.donate({ value: donationAmount });
		var bidParams = { msg: '', rwalk: -1 };
		let params = ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding], [bidParams]);
		let bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr1).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();
		await cosmicGameProxy.connect(addr2).bid(params, { value: bidPrice });
		bidPrice = await cosmicGameProxy.getBidPrice();

		expect(await cosmicGameProxy.getBidderAtPosition(0)).to.equal(addr1.address);
		expect(await cosmicGameProxy.getBidderAtPosition(1)).to.equal(addr2.address);
		await expect(cosmicGameProxy.getBidderAtPosition(2)).to.be.revertedWith("Position out of bounds");
	});
});
