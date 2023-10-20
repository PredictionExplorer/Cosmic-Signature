const hre = require("hardhat");
const { expect } = require("chai");
const {getBidderContract}  = require("./helper.js");

async function main() {

	let bidderContract = await getBidderContract();
	await bidderContract.withdraw_all();
}
main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});

