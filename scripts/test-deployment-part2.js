// Confirms that deployed contracts are fully operational

const hre = require("hardhat");
const { expect } = require("chai");
const { getCosmicGameProxyContract } = require("./helper.js");

async function claim_raffle_eth(testingAcct, raffleWallet, event_logs) {
	var unique_winners = [];
	for (let i = 0; i < event_logs.length; i++) {
		let wlog = raffleWallet.interface.parseLog(event_logs[i]);
		let winner = wlog.args.winner;
		if (winner.address == testingAcct.address) {
			if (typeof unique_winners[winner] === "undefined") {
				await raffleWallet.connect(testingAcct).withdraw();
				unique_winners[winner] = 1;
			}
		}
	}
}
async function claim_prize(testingAcct, cosmicGameProxy) {
	let prizeAmount = await cosmicGameProxy.prizeAmount();
	let charityAmount = await cosmicGameProxy.charityAmount();
	let tx = await cosmicGameProxy.connect(testingAcct).claimPrize({ gasLimit: 2500000 });
	let receipt = await tx.wait();
	let topic_sig = cosmicGameProxy.interface.getEventTopic("PrizeClaimEvent");
	let event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	let parsed_log = cosmicGameProxy.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.destination).to.equal(testingAcct.address);
	expect(parsed_log.args.amount).to.equal(prizeAmount);

	let raffleWalletAddr = await cosmicGameProxy.raffleWallet();
	let raffleWallet = await hre.ethers.getContractAt("RaffleWallet", raffleWalletAddr);
	topic_sig = raffleWallet.interface.getEventTopic("RaffleDepositEvent");
	event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	claim_raffle_eth(testingAcct, raffleWallet, event_logs);

	let cosmicSigAddr = await cosmicGameProxy.nft();
	let cosmicSignature = await hre.ethers.getContractAt("CosmicSignature", cosmicSigAddr);
	topic_sig = cosmicGameProxy.interface.getEventTopic("RaffleNFTWinnerEvent");
	event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	for (let i = 0; i < event_logs.length; i++) {
		let parsed_log = cosmicGameProxy.interface.parseLog(event_logs[i]);
		let ownr = await cosmicSignature.ownerOf(parsed_log.args.tokenId);
		expect(ownr).to.equal(parsed_log.args.winner);
	}

	let CharityWalletAddr = await cosmicGameProxy.charity();
	let charityWallet = await hre.ethers.getContractAt("CharityWallet", CharityWalletAddr);
	topic_sig = charityWallet.interface.getEventTopic("DonationReceivedEvent");
	event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	parsed_log = charityWallet.interface.parseLog(event_logs[0]);
	expect(parsed_log.args.amount).to.equal(charityAmount);
}
async function main() {
	let privKey = process.env.PRIVKEY;
	if (typeof privKey === "undefined" || privKey.length == 0) {
		console.log(
			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
		);
		process.exit(1);
	}
	let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	let cosmicGameProxy = await getCosmicGameProxyContract();

	await claim_prize(testingAcct, cosmicGameProxy);

	console.log("Claim prize test result: success");
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
