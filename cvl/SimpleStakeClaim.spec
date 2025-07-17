methods {
	function getStakerDeposit(address staker) external returns (uint256) envfree;
}

rule balancesAreCorrect {

	method f; env e; calldataarg args;

	require currentContract != e.msg.sender;
	require e.msg.sender != 0;
	require e.msg.value < 10000000000000000;
	require nativeBalances[currentContract] < 10000000000000000;
	if (f.selector == sig:SimpleStakeClaim.stake().selector) {
		require currentContract.getStakerDeposit(e.msg.sender) == 0;
	}
	mathint balanceBefore = nativeBalances[currentContract];
	mathint stakerDepositBefore = currentContract.getStakerDeposit(e.msg.sender);
	f(e,args);
	mathint stakerDepositAfter = currentContract.getStakerDeposit(e.msg.sender);
	mathint balanceAfter = nativeBalances[currentContract];

	if (f.selector == sig:SimpleStakeClaim.stake().selector) {
		assert (balanceBefore + e.msg.value) == balanceAfter,"Staking contract balance after stake() is invalid";
		assert (stakerDepositBefore + e.msg.value) == stakerDepositAfter,"stakerDeposit after stake() is invalid";
	} else if (f.selector == sig:SimpleStakeClaim.unstake().selector) {
		assert (balanceAfter + stakerDepositBefore) == balanceBefore,"Staking contract balance after unstake() is invalid";
		assert (stakerDepositAfter == 0),"stakerDeposit after unstake() is not 0";
	} else {
		assert balanceBefore == balanceAfter;
	}
}

