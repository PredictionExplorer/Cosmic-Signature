## OpenBidding (example of CosmicGameImplementation upgrade)
OpenBidding is an example to show a possible upgrade of CosmicGameImplementation to a new version.
This new business logic contract allows bidding with no upper limit. After bid is made, the `bidPrice` becomes the amount of last bid. This way players can rise the bid price to any amount in a few minutes. The purpose of this example is to how how the new CosmicGameImplementation contract can have its own state variables (explicitly declared in the body of the contract) modified via CosmicGameProxy contract while CosmicGameProxy being deployed earlier and having no knowledge of these state variables.

### Implementation

`BidParams` struct is modified by adding boolean flag to indicate the bid is going to be unrestricted in price (openBid=true):

    struct BidParams {
        string message;
        int256 randomWalkNFTId;
        bool openBid;       // true if the value sent with the TX is the amount of bid
    }   

The bidder now sends transaction for any amount in `msg.value`, that is multiple times bigger than `timesBidPrice` state variable which controls minium value for open bids. For example if current bid price is 1 ETH and `timesBidPrice` = 3, then the `msg.value` must be minimum 3 ETH (or bigger). If it is lower, transaction will be reverted.

The call to `bid()` function must now be done in a new way:

    let bidParams = {msg:'bid test',rwalk:-1,'openbid':true};
    let params = hre.ethers.utils.defaultAbiCoder.encode([bidParamsEncoding],[bidParams]);
    let bidPrice = await cosmicGameProxy.getBidPrice();
    await cosmicGameProxy.connect(testingAcct).bid(params, { value: bidPrice.mul(multiplier), gasLimit: 30000000 }); 

In this example the `multiplier` variable is the `timesBidPrice` state variable (discussed above) which was read from the contract prior to execution of this code.

### Configuration of `timesBidPrice` state variable

Here the business logic upgrade occurs after the deployment of CosmicGameProxy contract, therefore CosmicGameProxy has no knowledge of new state variables declared in OpenBidLogic.sol contract. But because we have methods to update state variables via delegate call, this is possible to do. For more info check script files `gettimesbidprice.js` and `settimesbidprice.js` which are used to get/set this variable through CosmicGameProxy contract.


### Sample test case

Check instructions in run-test.txt file to run a demo of CosmicGameImplementation upgrade process
