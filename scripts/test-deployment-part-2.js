// Confirms that deployed contracts are fully operational

"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helpers.js");

/// todo-1 Now Chrono-Warrior also gets ETH.
/// todo-1 So maybe this function name should not include "raffle".
async function claim_raffle_eth(testingAcct, prizesWallet, event_logs) {
	const unique_winners = {};
	for (let i = 0; i < event_logs.length; i++) {
		let wlog = prizesWallet.interface.parseLog(event_logs[i]);
		let prizeWinnerAddress = wlog.args.prizeWinnerAddress;
		if (prizeWinnerAddress.address == testingAcct.address) {
			if (unique_winners[prizeWinnerAddress] == undefined) {
				await prizesWallet.connect(testingAcct).withdrawEth();
				unique_winners[prizeWinnerAddress] = 1;
			}
		}
	}
}

async function claim_prize(testingAcct, cosmicSignatureGame) {
	let mainEthPrizeAmount = await cosmicSignatureGame.getMainEthPrizeAmount();
	let charityEthDonationAmount = await cosmicSignatureGame.getCharityEthDonationAmount();
	// todo-1 Think about `gasLimit`. Maybe add it in some other places. Is there a default value when sending to a testnet or mainnet?
	let transactionResponse = await cosmicSignatureGame.connect(testingAcct).claimMainPrize({ gasLimit: 2500000 });
	let transactionReceipt = await transactionResponse.wait();
	let topic_sig = cosmicSignatureGame.interface.getEventTopic("MainPrizeClaimed");
	let event_logs = transactionReceipt.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
	let parsed_log = cosmicSignatureGame.interface.parseLog(event_logs[0]);
	// todo-1 Assert 2 more params passed to the event.
	expect(parsed_log.args.beneficiaryAddress).equal(testingAcct.address);
	expect(parsed_log.args.amount).equal(mainEthPrizeAmount);

	let cosmicSignatureNftAddr = await cosmicSignatureGame.nft();

	// Comment-202502096 applies.
	let cosmicSignatureNft = await hre.ethers.getContractAt("CosmicSignatureNft", cosmicSignatureNftAddr);

	topic_sig = cosmicSignatureGame.interface.getEventTopic("RaffleWinnerCosmicSignatureNftAwarded");
	event_logs = transactionReceipt.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
	for (let i = 0; i < event_logs.length; i++) {
		let parsed_log = cosmicSignatureGame.interface.parseLog(event_logs[i]);
		let ownr = await cosmicSignatureNft.ownerOf(parsed_log.args.prizeCosmicSignatureNftId);
		expect(ownr).equal(parsed_log.args.winnerAddress);
	}

	let prizesWalletAddr = await cosmicSignatureGame.prizesWallet();

	// Comment-202502096 applies.
	let prizesWallet = await hre.ethers.getContractAt("PrizesWallet", prizesWalletAddr);

	topic_sig = prizesWallet.interface.getEventTopic("EthReceived");
	event_logs = transactionReceipt.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
	await claim_raffle_eth(testingAcct, prizesWallet, event_logs);

	let charityWalletAddr = await cosmicSignatureGame.charityAddress();

	// Comment-202502096 applies.
	let charityWallet = await hre.ethers.getContractAt("CharityWallet", charityWalletAddr);
	
	topic_sig = charityWallet.interface.getEventTopic("DonationReceived");
	event_logs = transactionReceipt.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
	parsed_log = charityWallet.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.amount).equal(charityEthDonationAmount);
}

async function main() {
	let privKey = process.env.PRIVKEY;
	if (privKey == undefined || privKey.length <= 0) {
		console.log(
			// todo-1 "scripts/deploy.js" no longer exists.
			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
		);
		process.exit(1);
	}
	let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	let cosmicSignatureGame = await getCosmicSignatureGameContract();

	await claim_prize(testingAcct, cosmicSignatureGame);

	console.log("Claim prize test result: success");
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
