// This script transfers the given ETH amount from one address to another.
// The source address shall be a signer known to Hardhat.

"use strict";

prepare();

const nodeOsModule = require("node:os");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../src/Helpers.js");

main()
	.then(() => (process.exit(0)))
	.catch((errorObject) => {
		console.error(errorObject);
		process.exit(1);
	});

function prepare() {
	if (process.argv[2].length > 0) {
		process.env.HARDHAT_NETWORK = process.argv[2];
	}
}

async function main() {
	const sourceSigner_ = await hre.ethers.getSigner(process.argv[3]);
	const destinationAddress_ = process.argv[4];
	const ethAmountInEthToTransferAsString_ = process.argv[5];
	const ethAmountInWeiToTransfer_ = hre.ethers.parseEther(ethAmountInEthToTransferAsString_);
	await waitForTransactionReceipt(sourceSigner_.sendTransaction({to: destinationAddress_, value: ethAmountInWeiToTransfer_,}));
	console.info(`${nodeOsModule.EOL}Done.`);
}
