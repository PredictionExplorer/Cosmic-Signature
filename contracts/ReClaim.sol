pragma solidity 0.8.19;

import "./CosmicGame.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ReClaim is IERC721Receiver {
    CosmicGame public cosmicGameContract;
    uint public numIterations = 0;
    constructor(address payable _cosmicGameContract) {
        cosmicGameContract = CosmicGame(_cosmicGameContract);
    }   
    function claim_and_reset(uint256 p_num_iterations) public {
        numIterations = p_num_iterations;
        cosmicGameContract.claimPrize();
    }   
    receive() external payable {
		if (numIterations == 0) {
			return;
		}
        numIterations--;
        cosmicGameContract.claimPrize();
    }   
    function onERC721Received(address, address, uint256, bytes calldata) public pure returns(bytes4) {
        return this.onERC721Received.selector;
    }

}

