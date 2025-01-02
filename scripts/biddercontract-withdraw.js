// todo-1 Rename this file to "bidder-contract-withdraw.js".

// const { expect } = require("chai");
// const hre = require("hardhat");
const { getBidderContract } = require("./helper.js");

async function main() {
	let bidderContract = await getBidderContract();
	await bidderContract.withdraw_all();
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
