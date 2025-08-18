// This script transfers the given ETH amount from one address to another.
// The source address shall be a signer known to Hardhat.

"use strict";

const nodeOsModule = require("node:os");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../src/Helpers.js");

main()
	.then(() => (process.exit(0)))
	.catch((errorObject_) => {
		console.error(errorObject_);
		process.exit(1);
	});

async function main() {
	const sourceSigner_ = await hre.ethers.getSigner(process.argv[2]);
	const destinationAddress_ = process.argv[3];
	const ethAmountInEthToTransferAsString_ = process.argv[4];
	const ethAmountInWeiToTransfer_ = hre.ethers.parseEther(ethAmountInEthToTransferAsString_);
	await waitForTransactionReceipt(sourceSigner_.sendTransaction({to: destinationAddress_, value: ethAmountInWeiToTransfer_,}));
	console.info(`${nodeOsModule.EOL}Done.`);
}
