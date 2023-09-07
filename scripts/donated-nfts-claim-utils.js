// Helps building transaction to get back donated Random Walk tokens used in bid+donate calls
// Two run modes:
// 	- without PRIVKEY environment variable set -> only lists donated tokens per round
// 	- with PRIVKEY environment variable set -> generates claimManyDonatedNFTs() calls per prize
// (note: only for unclaimed tokens)
const hre = require("hardhat");
const { expect } = require("chai");
const {getCosmicGameContract} = require("./helper.js");

async function get_unclaimed_donated_nfts(cosmicGame) {

	let numDonatedNFTs = await cosmicGame.numDonatedNFTs();
	let numNFTs = numDonatedNFTs.toNumber();
	let prizeData = [];
	for (let i=0; i < numNFTs; i++) {
		let record_orig = await cosmicGame.donatedNFTs(i);
		let record = Object.assign({},record_orig);
		Object.defineProperty(record,'index',{value:i,writable:true});
		if (record.claimed) {
			continue;
		}
		let prizeArr = prizeData[record.round];
		if (typeof prizeArr === 'undefined') {
			prizeArr = new Array();
		}
		prizeArr.push(record);
		prizeData[record.round] = prizeArr;
	}
	return prizeData;
}
async function list_donated_nfts(nfts) {
	//console.log(nfts);
	let numElts = nfts.length;
	for (let i = 0; i<numElts; i++ ) {
		let roundNFTs = nfts[i];
		console.log("Round "+i);
		if ((typeof roundNFTs === 'undefined') || (roundNFTs.length == 0)) {
			console.log("\t(no claimable tokens)");
			continue;
		}
		for (let j = 0; j<roundNFTs.length; j++) {
			let record = roundNFTs[j];
			console.log("\t"+record.nftAddress.toString()+": tokenId = "+record.tokenId.toString()+ ", num="+record.index);
		}
	}
}
function build_parameter_list(token_list) {

	let output = [];
	for (let i = 0; i<token_list.length; i++) {
		let rec = token_list[i];
		let bigN = hre.ethers.BigNumber.from(rec.index.toString());
		output.push(bigN);
		if (i>1) break;
	}
	return output;
}
async function main() {
	let privKey = process.env.PRIVKEY;

	let testingAcct;
	let cosmicGame = await getCosmicGameContract();
	let nfts = await get_unclaimed_donated_nfts(cosmicGame);

	if ((typeof privKey === 'undefined') || (privKey.length == 0) )  {
		console.log("Fetching tokens, please wait ...");
		await list_donated_nfts(nfts);
		return
	} else {
		testingAcct = new hre.ethers.Wallet(privKey,hre.ethers.provider);
	}
	let roundToClaim = parseInt(process.env.ROUND_NUM,10);
	if ((typeof roundToClaim === 'undefined') || (roundToClaim.length == 0) )  {
		console.log("Please provide ROUND_NUM environment variable to claim tokens")
		process.exit(1);
	}
	let paramList = build_parameter_list(nfts[roundToClaim]);
	let prizeWinner = await cosmicGame.winners(roundToClaim);
	if (prizeWinner.toString() != testingAcct.address.toString()) {
		console.log("You aren't the winner of prize "+roundToClaim+", winner is "+prizeWinner.toString());
		process.exit(1);
	}

	await cosmicGame.connect(testingAcct).claimManyDonatedNFTs(paramList);
}
main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});

