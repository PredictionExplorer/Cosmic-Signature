## OpenBidding (example of CosmicSignatureGame upgrade)
OpenBidding is an example to show a possible upgrade of CosmicSignatureGame to a new version.
This new business logic contract allows bidding with no upper limit. After bid is made, the `nextEthBidPrice` becomes the amount of the next bid. This way players can rise the bid price to any amount in a few minutes. The purpose of this example is to how how the new CosmicSignatureGame contract can have its own state variables (explicitly declared in the body of the contract) modified via CosmicSignatureGameProxy contract while CosmicSignatureGameProxy being deployed earlier and having no knowledge of these state variables.

### Implementation

`BidParams` struct is modified by adding boolean flag to indicate the bid is going to be unrestricted in price (isOpenBid=true):

    // todo-1 This structure no longer exists.
    // todo-1 These variables are now the `bidWithEth` function parameters.
    struct BidParams {
        string message;
        int256 randomWalkNftId;
        bool isOpenBid; // true if the value sent with the TX is the amount of bid
    }

The bidder now sends transaction for any amount in `msg.value`, that is multiple times bigger than `timesEthBidPrice` state variable which controls minimum value for open bids. For example if current bid price is 1 ETH and `timesEthBidPrice` = 3, then the `msg.value` must be minimum 3 ETH (or bigger). If it is lower, transaction will be reverted.

The call to the `bidWithEth` method must now be done in a new way:

    let bidParams = {message: "bid test", randomWalkNftId: -1, isOpenBid: true};
    let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding],[bidParams]);
    let nextEthBidPrice = await cosmicSignatureGameProxy.getNextEthBidPrice(0n);
    await cosmicSignatureGameProxy.connect(testingAcct).bidWithEth(params, {value: nextEthBidPrice.mul(multiplier), gasLimit: 30000000});
// todo-0 Revisit the `gasLimit` thing above

In this example the `multiplier` variable is the `timesEthBidPrice` state variable (discussed above) which was read from the contract prior to execution of this code.

### Configuration of `timesEthBidPrice` state variable

Here the business logic upgrade occurs after the deployment of CosmicSignatureGameProxy contract, therefore CosmicSignatureGameProxy has no knowledge of new state variables declared in OpenBidLogic.sol contract. But because we have methods to update state variables via delegate call, this is possible to do. For more info check script files `get-times-eth-bid-price.js` and `set-times-eth-bid-price.js` which are used to get/set this variable through CosmicSignatureGameProxy contract.


### Sample test case

Check instructions in run-test.txt file to run a demo of CosmicSignatureGame upgrade process
