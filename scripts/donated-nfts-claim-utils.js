// todo-1 This is now broken because I have moved NFT donations to `PrizesWallet`.

// Helps building transaction to get back donated Random Walk NFTs used in bid+donate calls
// Two run modes:
// 	- without PRIVKEY environment variable set -> only lists donated NFTs per round
// 	- with PRIVKEY environment variable set -> generates claimManyDonatedNfts() calls per prize
// (note: only for unclaimed NFTs)

"use strict";

// const { expect } = require("chai");
const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helpers.js");

async function get_unclaimed_donated_nfts(cosmicSignatureGame) {
	let numDonatedNfts = await cosmicSignatureGame.numDonatedNfts();
	const numNfts_ = numDonatedNfts.toNumber();
	let prizeData = [];
	for (let i = 0; i < numNfts_; i++) {
		let record_orig = await cosmicSignatureGame.donatedNfts(i);
		let record = Object.assign({}, record_orig);
		Object.defineProperty(record, "index", { value: i, writable: true });
		// todo-1 The `claimed` variable no longer exists.
		if (record.claimed) {
			continue;
		}
		let prizeArr = prizeData[record.roundNum];
		// todo-1 Why would it be `undefined`?
		if (typeof prizeArr === "undefined") {
			prizeArr = new Array();
		}
		prizeArr.push(record);
		prizeData[record.roundNum] = prizeArr;
	}
	return prizeData;
}

async function list_donated_nfts(nfts) {
	//console.log(nfts);
	const numNfts_ = nfts.length;
	for (let i = 0; i < numNfts_; i++) {
		const roundNfts_ = nfts[i];
		console.log("Round " + i);
		if (typeof roundNfts_ === "undefined" || roundNfts_.length == 0) {
			console.log("\t(no claimable NFTs)");
			continue;
		}
		for (let j = 0; j < roundNfts_.length; j++) {
			let record = roundNfts_[j];
			console.log(
				"\t" +
					record.nftAddress.toString() +
					": nftId = " +
					record.nftId.toString() +
					", num=" +
					record.index,
			);
		}
	}
}

function build_parameter_list(token_list) {
	let output = [];
	for (let i = 0; i < token_list.length; i++) {
		let rec = token_list[i];
		let bigN = hre.ethers.BigNumber.from(rec.index.toString());
		output.push(bigN);
		if (i > 1) break;
	}
	return output;
}

async function main() {
	let privKey = process.env.PRIVKEY;

	let testingAcct;
	let cosmicSignatureGame = await getCosmicSignatureGameContract();
	let nfts = await get_unclaimed_donated_nfts(cosmicSignatureGame);
	if (nfts.length == 0) {
		console.log("Map of donated unclaimed NFTs is empty, no claiming is possible");
		return;
	}
	if (typeof privKey === "undefined" || privKey.length == 0) {
		console.log("Fetching NFTs, please wait ...");
		await list_donated_nfts(nfts);
		return;
	} else {
		testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	}
	let roundNumStr = process.env.ROUND_NUM;
	if (typeof roundNumStr === "undefined" || roundNumStr.length == 0) {
		console.log("Please provide ROUND_NUM environment variable to claim NFTs");
		process.exit(1);
	}
	let roundToClaim = parseInt(roundNumStr, 10);
	let paramList = build_parameter_list(nfts[roundToClaim]);
	// todo-1 This variable no longer exists. A similar variable exists in `PrizesWallet`.
	let mainPrizeBeneficiaryAddress_ = await cosmicSignatureGame.winners(roundToClaim);
	if (mainPrizeBeneficiaryAddress_.toString() != testingAcct.address.toString()) {
		console.log("You aren't the beneficiary of main prize " + roundToClaim.toString() + ", beneficiary is " + mainPrizeBeneficiaryAddress_.toString());
		process.exit(1);
	}

	if (privKey.length > 0) {
		if (paramList.length > 0) {
			console.log("Sending claimMany transaction");
			await cosmicSignatureGame.connect(testingAcct).claimManyDonatedNfts(paramList);
		}
	}
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
