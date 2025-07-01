methods {

	function game() external returns (address) envfree;
}
persistent ghost mathint numOfCallsStake;
persistent ghost mathint numOfCallsUnstake;
hook CALL(uint g, address addr, uint value, uint argsOffset, uint argsLength, uint retOffset, uint retLength) uint rc {
	if(selector == sig:stake(uint256).selector) {
		numOfCallsStake = numOfCallsStake + 1;
	}
	if(selector == sig:unstake(uint256).selector) {
		numOfCallsUnstake = numOfCallsUnstake + 1;
	}
}

rule genericMethodMatcher() {

    method f; env e; calldataarg args;
    require currentContract != e.msg.sender;
    if (f.selector == sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector) {
    	require currentContract.game() == e.msg.sender;
    }

	mathint actionCounterBefore = currentContract.actionCounter(e);	

    f(e, args);

	mathint actionCounterAfter = currentContract.actionCounter(e);

    if (
		(f.selector == sig:StakingWalletCosmicSignatureNft.stake(uint256).selector) ||
		(f.selector == sig:StakingWalletCosmicSignatureNft.unstake(uint256).selector) ||
		(f.selector == sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector)
	) {
		assert (actionCounterBefore + 1) == actionCounterAfter,"Action counter must be increemented only by +1";
	} else {
		if (f.selector == sig:StakingWalletCosmicSignatureNft.tryPerformMaintenance(address).selector) {
			assert (actionCounterBefore == actionCounterAfter, "Action counter must remain unchanged");
		} else {
			if (f.selector == sig:StakingWalletCosmicSignatureNft.unstakeMany(uint256[]).selector) {
				assert (actionCounterBefore + numOfCallsUnstake) == actionCounterAfter,"unstakeMany() doesn't increment actionCounter correctly";
			}
		}
	}

	satisfy true;
}
