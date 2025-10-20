// This script transfers the given ETH amount from one address to another.
// The source address shall be a signer known to Hardhat.

"use strict";

const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../src/Helpers.js");

main()
	.then(() => {})
	.catch((errorObject_) => {
		console.error(errorObject_);
		process.exitCode = 1;
	});

async function main() {
	console.info();
	const sourceAddress_ = process.argv[2];
	const sourceSigner_ = await hre.ethers.getSigner(sourceAddress_);
	const destinationAddress_ = process.argv[3];
	const ethAmountInEthToTransferAsString_ = process.argv[4];
	const ethAmountInWeiToTransfer_ = hre.ethers.parseEther(ethAmountInEthToTransferAsString_);
	/** @type {import("ethers").TransactionRequest} */
	const transactionRequest_ = {to: destinationAddress_, value: ethAmountInWeiToTransfer_,};

	// [Comment-202510018]
	// At least when talking to externally running Hardhat Network and using a built-in signer,
	// `sourceSigner_.sendTransaction` will not estimate gas, but will instead use `blockGasLimit`
	// configiured for the given network in Hardhat config file.
	// ChatGPT says:
	// [Quote]
	// You're hitting a sender-path difference:
	// - With --network hardhat_on_localhost and ethers.getSigners(), the signers are JSON-RPC unlocked accounts on the node.
	//   When you call sendTransaction, ethers uses eth_sendTransaction (server-side signing). In that mode
	//   the node fills the gas field and Hardhat Node sets it to its configured default (which is the block gas limit by default).
	//   No client-side estimation/multiplier happens, so you see gasLimit == blockGasLimit.
	// - When you use a locally signed wallet (a Wallet with a private key) the sender uses eth_sendRawTransaction.
	//   Ethers must set gasLimit itself, so it calls eth_estimateGas
	// [/Quote]
	// So let's estimate gas manually.
	// Another option would be to create and use our own `hre.ethers.Wallet`.
	// (Although these consderations is not that important when using fake money.)
	// [/Comment-202510018]
	const gasEstimate_ = await sourceSigner_.estimateGas(transactionRequest_);
	// console.info(`${gasEstimate_}`);
	// console.info(transactionRequest_);
	transactionRequest_.gasLimit = gasEstimate_;

	await waitForTransactionReceipt(sourceSigner_.sendTransaction(transactionRequest_));
	console.info("Done.");
}
