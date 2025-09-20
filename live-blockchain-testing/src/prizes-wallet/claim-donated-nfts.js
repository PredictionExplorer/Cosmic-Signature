// // Comment-202509229 applies.

// // todo-9 This is now broken because I have moved NFT donations to `PrizesWallet`.

// // Helps building transaction to get back donated Random Walk NFTs used in bid+donate calls
// // Two run modes:
// // 	- without PRIVKEY environment variable set -> only lists donated NFTs per bidding round
// // 	- with PRIVKEY environment variable set -> generates claimManyDonatedNfts() calls per prize
// // (note: only for unclaimed NFTs)

// "use strict";

// const hre = require("hardhat");
// const { getCosmicSignatureGameContract } = require("../helpers.js");

// async function get_unclaimed_donated_nfts(cosmicSignatureGame) {
// 	const nextDonatedNftIndex = await cosmicSignatureGame.nextDonatedNftIndex({blockTag: "pending",});
// 	const numNfts = Number(nextDonatedNftIndex);
// 	let prizeData = [];
// 	for (let i = 0; i < numNfts; i++) {
// 		let record_orig = await cosmicSignatureGame.donatedNfts(BigInt(i), {blockTag: "pending",});
// 		let record = Object.assign({}, record_orig);
// 		Object.defineProperty(record, "index", {value: i, writable: true,});
// 		// todo-9 The `claimed` variable no longer exists.
// 		if (record.claimed) {
// 			continue;
// 		}
// 		let prizeArr = prizeData[record.roundNum];
// 		// todo-9 Why would it be `undefined`?
// 		if (prizeArr == undefined) {
// 			prizeArr = new Array();
// 		}
// 		prizeArr.push(record);
// 		prizeData[record.roundNum] = prizeArr;
// 	}
// 	return prizeData;
// }

// async function list_donated_nfts(nfts) {
// 	//console.info(nfts);
// 	const numNfts = nfts.length;
// 	for (let i = 0; i < numNfts; i++) {
// 		const roundNfts = nfts[i];
// 		console.info("Bidding round " + i.toString());
// 		if (roundNfts == undefined || roundNfts.length <= 0) {
// 			console.info("\t(no claimable NFTs)");
// 			continue;
// 		}
// 		for (let j = 0; j < roundNfts.length; j++) {
// 			let record = roundNfts[j];
// 			console.info(
// 				"\t" +
// 					record.nftAddress.toString() +
// 					": nftId = " +
// 					record.nftId.toString() +
// 					", num=" +
// 					record.index,
// 			);
// 		}
// 	}
// }

// function build_parameter_list(token_list) {
// 	let output = [];
// 	for (let i = 0; i < token_list.length; i++) {
// 		let rec = token_list[i];
// 		let bigN = hre.ethers.BigNumber.from(rec.index.toString());
// 		output.push(bigN);
// 		if (i > 1) break;
// 	}
// 	return output;
// }

// async function main() {
// 	let privKey = process.env.PRIVKEY;
//
// 	let testingAcct;
// 	let cosmicSignatureGame = await getCosmicSignatureGameContract();
// 	let nfts = await get_unclaimed_donated_nfts(cosmicSignatureGame);
// 	if (nfts.length <= 0) {
// 		console.info("Map of donated unclaimed NFTs is empty, no claiming is possible");
// 		return;
// 	}
// 	if (privKey == undefined || privKey.length <= 0) {
// 		console.info("Fetching NFTs, please wait ...");
// 		await list_donated_nfts(nfts);
// 		return;
// 	} else {
// 		testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
// 	}
// 	let roundNumStr = process.env.ROUND_NUM;
// 	if (roundNumStr == undefined || roundNumStr.length <= 0) {
// 		console.info("Please provide ROUND_NUM environment variable to claim NFTs");
// 		process.exit(1);
// 	}
// 	let roundToClaim = parseInt(roundNumStr, 10);
// 	let paramList = build_parameter_list(nfts[roundToClaim]);
// 	// todo-9 `cosmicSignatureGame.winners` no longer exists. A similar variable exists in `PrizesWallet`.
// 	let mainPrizeBeneficiaryAddress = await cosmicSignatureGame.winners(roundToClaim, {blockTag: "pending",});
// 	if (mainPrizeBeneficiaryAddress.toString() != testingAcct.address.toString()) {
// 		console.info("You aren't the beneficiary of main prize " + roundToClaim.toString() + ", beneficiary is " + mainPrizeBeneficiaryAddress.toString());
// 		process.exit(1);
// 	}
//
// 	if (privKey.length > 0) {
// 		if (paramList.length > 0) {
// 			console.info("Sending claimMany transaction");
// 			// todo-9 It appears that we need to call `waitForTransactionReceipt` here.
// 			await cosmicSignatureGame.connect(testingAcct).claimManyDonatedNfts(paramList);
// 		}
// 	}
// }

// main()
// 	.then(() => { process.exit(0); })
// 	.catch((errorObject_) => {
// 		console.error(errorObject_);
// 		process.exit(1);
// 	});
