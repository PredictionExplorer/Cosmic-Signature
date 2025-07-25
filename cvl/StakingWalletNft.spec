methods {
	function game() external returns (address) envfree;
	function numStakedNfts() external returns (uint256) envfree;
	function actionCounter() external returns (uint256) envfree;
	function numStakedNfts() external returns (uint256) envfree;
	function rewardAmountPerStakedNft() external returns (uint256) envfree;
	function getStakeActionAddr(uint256 index) external returns (address) envfree;
	function getStakeActionTokenId(uint256 index) external returns (uint256) envfree;
	function getStakeActionInitialReward(uint256 index) external returns (uint256) envfree;
	function getNftUsedStatus(uint256 index) external returns (uint256) envfree;
	function _.transferFrom(address from, address to, uint256 tokenId) external => cvlNftTransferFrom(calledContract,from,to,tokenId) expect void;
}
persistent ghost mathint actionCounterDiff;
persistent ghost mathint gStakeActionNftIdSet;
persistent ghost mathint gStakeActionOwnerSet;
persistent ghost mathint gStakeActionAmountSet;
persistent ghost mathint gUsedNftsChanged;
persistent ghost bytes4 currentMethodSignature;
persistent ghost mathint gNumActiveStakeActions;
persistent ghost mathint gNumStakedNfts;
persistent ghost mathint gBalDiffStakingWallet;
function cvlNftTransferFrom(address token,address from, address to, uint256 tokenId) {
	// doesn't do anything
}

hook Sstore currentContract.actionCounter uint256 newVal (uint256 oldVal) {
	actionCounterDiff = actionCounterDiff  + (newVal - oldVal);
}
hook Sstore stakeActions[INDEX uint256 idx].nftId uint256 newValue (uint256 oldValue) {
	assert (
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.stake(uint256).selector)) ||
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.unstake(uint256).selector)) ||
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.stakeMany(uint256[]).selector)) ||
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.unstakeMany(uint256[]).selector))
	);
	gStakeActionNftIdSet = 1;
}
hook Sstore stakeActions[INDEX uint256 idx].nftOwnerAddress address newValue (address oldValue) {
	assert (
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.stake(uint256).selector)) ||
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.unstake(uint256).selector)) ||
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.stakeMany(uint256[]).selector)) ||
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.unstakeMany(uint256[]).selector))
	);
	gStakeActionOwnerSet = 1;
	if (newValue == oldValue) {
		assert false,"stakeActions[].address was updated to the same value , impossible condition";
	} { 
		if (newValue == 0) { //address(0)
			gNumActiveStakeActions = gNumActiveStakeActions - 1;
		} else {
			if (oldValue == 0) {
				gNumActiveStakeActions = gNumActiveStakeActions + 1;
			} else {
				assert false, "stakeAction[].address changed from one value to another, impossible condition";
			}
		}
	}				
}
hook Sstore currentContract.numStakedNfts uint256 newValue (uint256 oldValue) {
	if (newValue == oldValue ) {
		assert false, "numStakedNfts was updated to the same value";
	} else {
		if (newValue > oldValue) {
			gNumStakedNfts = gNumStakedNfts + newValue - oldValue;
			assert newValue == (oldValue + 1), "numStakedNfts wasn't incremented by +1";
		} else {
			gNumStakedNfts = gNumStakedNfts - oldValue + newValue;
			assert oldValue == (newValue + 1) , "numStakedNfts wasn't decremented by -1";
		}
	}
}
hook Sstore stakeActions[INDEX uint256 idx].initialRewardAmountPerStakedNft uint256 newValue (uint256 oldValue) {
	assert (
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.stake(uint256).selector)) ||
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.unstake(uint256).selector)) ||
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.stakeMany(uint256[]).selector)) ||
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.unstakeMany(uint256[]).selector)),
		"variable currentMethodSignature is not set"
	);
	gStakeActionAmountSet = 1;
}
hook Sstore usedNfts[INDEX uint256 idx] uint256 newValue (uint256 oldValue) {
	gUsedNftsChanged = 1;
}
function genericFunctionMatcher(method f,env e,address charity,uint256 round,uint256 nftId,uint256 actionId,uint256[] manyActionIds) returns bool {

    if (f.selector == sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector) {
		deposit(e,round);
	} else if (f.selector == sig:StakingWalletCosmicSignatureNft.stake(uint256).selector) {
		stake(e,nftId);
	} else if (f.selector == sig:StakingWalletCosmicSignatureNft.unstake(uint256).selector) {
		unstake(e,actionId);
	} else if (f.selector == sig:StakingWalletCosmicSignatureNft.stakeMany(uint256[]).selector) {
		stakeMany(e,manyActionIds);
	} else if (f.selector == sig:StakingWalletCosmicSignatureNft.unstakeMany(uint256[]).selector) {
		unstakeMany(e,manyActionIds);
	} else if (f.selector == sig:StakingWalletCosmicSignatureNft.tryPerformMaintenance(address).selector) {
		bool success = tryPerformMaintenance(e,charity);
		return success;
	} else {
		calldataarg args;
		f(e,args);
	}
	return false;
}
rule actionCounterValidation() 
{	
	// verification policy:
	//		- One state variable per rule
	//		- Uses generic method matcher (i.e.: f(e,args) also called "Parametric rules" ) construct to prove that 
	//				no other method touches our state variable unless explicitly stated in the rule logic
	uint256 ac = currentContract.actionCounter();
	require actionCounterDiff == 0;

    method f; env e; calldataarg args;
    if (f.selector != sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector) {
		require f.isPayable == false;
	}
    require currentContract != e.msg.sender;
	require e.msg.sender != 0;
    if (f.selector == sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector) {
    	require currentContract.game() == e.msg.sender;
    }
	mathint actionCounterBefore = currentContract.actionCounter();	

    f(e, args);		// generic method matcher like this is a requirement for 100% bug-free verification

	mathint actionCounterAfter = currentContract.actionCounter();

    if (
		(f.selector == sig:StakingWalletCosmicSignatureNft.stake(uint256).selector) ||
		(f.selector == sig:StakingWalletCosmicSignatureNft.unstake(uint256).selector) ||
		(f.selector == sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector)
	) {
		assert ((actionCounterBefore + 1)== actionCounterAfter),"Action counter must be increemented only by +1";
	} else {
		if (
			(f.selector == sig:StakingWalletCosmicSignatureNft.unstakeMany(uint256[]).selector) ||
			(f.selector == sig:StakingWalletCosmicSignatureNft.stakeMany(uint256[]).selector)
		) {
			assert ((actionCounterBefore + actionCounterDiff) == actionCounterAfter),"...Many() method doesn't increment actionCounter correctly";
		} else {
			assert (actionCounterBefore == actionCounterAfter), "Action counter must remain unchanged";
		}
	}
}
rule onlyStakeUnstakeOperationsCanChangeStakeActions() 
{	

	require gStakeActionNftIdSet == 0;
	require gStakeActionOwnerSet == 0;
	require gStakeActionAmountSet == 0;
    method f; env e; calldataarg args;
    if (f.selector != sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector) {
		require f.isPayable == false;
	}
    require currentContract != e.msg.sender;
	require e.msg.sender != 0;
    if (f.selector == sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector) {
    	require currentContract.game() == e.msg.sender;
    }
	currentMethodSignature = to_bytes4(f.selector);
    f(e, args);		// generic method matcher like this is a requirement for 100% bug-free verification

    if (
		(f.selector == sig:StakingWalletCosmicSignatureNft.stake(uint256).selector) ||
		(f.selector == sig:StakingWalletCosmicSignatureNft.unstake(uint256).selector) ||
		(f.selector == sig:StakingWalletCosmicSignatureNft.unstakeMany(uint256[]).selector) ||
		(f.selector == sig:StakingWalletCosmicSignatureNft.stakeMany(uint256[]).selector)
	) {
		assert (
			(gStakeActionNftIdSet == 1) &&
			(gStakeActionOwnerSet == 1) &&
			(gStakeActionAmountSet == 1)
		), "stakeActions[] element was partially modified";
	} else {
		assert (
			(gStakeActionNftIdSet == 0) &&
			(gStakeActionOwnerSet == 0) &&
			(gStakeActionAmountSet == 0)
		), "stakeActions[] element was modified by method that does't have permissions to do that";
	}
}
rule numStakedNftsIsMatchingStakeActions() 
{	
	// Pending stuff:
	//		- the stakeMany()/unstakeMany() methods have to be revised when Yuriy fixes the multi functionality
	//		- for stakeMany()/unstakeMany() we need to populate the data with require statements, this can be
	//				done by adding a new method , for example unstake3tokens() and write using the style of 'many' functions,
	//				this way it will be possible to populate 3-value arguments (3 tokens) and escape Certoras limitation
	//				of inhability to extract arguments from `calldataarg` type
    method f; env e; calldataarg args;
    if (f.selector != sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector) {
		require f.isPayable == false;
	}
    require currentContract != e.msg.sender;
	require e.msg.sender != 0;
    if (f.selector == sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector) {
    	require currentContract.game() == e.msg.sender;
    }
	currentMethodSignature = to_bytes4(f.selector);
	uint256 ac = currentContract.actionCounter();
	uint256 acNext;
	require acNext == (ac + 1);
    if (f.selector == sig:StakingWalletCosmicSignatureNft.stake(uint256).selector) {
		// before stake() all state variables must have 0-values
    	require currentContract.getStakeActionTokenId(acNext) == 0;
    	require currentContract.getStakeActionInitialReward(acNext) == 0;
    	require currentContract.getStakeActionAddr(acNext) == 0;
    }
    if (f.selector == sig:StakingWalletCosmicSignatureNft.unstake(uint256).selector) {
		// before unstake() all state variables must have some valid value
    	require currentContract.getStakeActionTokenId(acNext) > 0;
    	require currentContract.getStakeActionInitialReward(acNext) > 0;
    	require currentContract.getStakeActionAddr(acNext) != 0;
		require currentContract.numStakedNfts() > 0 ;
	}
	require currentContract.numStakedNfts() == gNumStakedNfts;
	require currentContract.numStakedNfts() == gNumActiveStakeActions;

    f(e, args);		// generic method matcher like this is a requirement for 100% bug-free verification

	assert currentContract.numStakedNfts() == gNumStakedNfts, "numStakedNfts() doesn't match accumulated (mirrored) ghost";
	assert currentContract.numStakedNfts() == gNumActiveStakeActions, "numStakedNfts() doesn't match number of active stake actions";
}
rule usedNftsIsSetCorrectly() 
{	
    method f; env e; calldataarg args;
    require currentContract != e.msg.sender;
	require e.msg.sender != 0;
    if (f.selector == sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector) {
    	require currentContract.game() == e.msg.sender;
		require f.isPayable == true;
    }
	currentMethodSignature = to_bytes4(f.selector);
	uint256 ac = currentContract.actionCounter();
	uint256 acNext;
	require acNext == (ac + 1);
    if (f.selector == sig:StakingWalletCosmicSignatureNft.stake(uint256).selector) {
		// before stake() all state variables must have 0-values
    	require currentContract.getStakeActionTokenId(acNext) == 0;
    	require currentContract.getStakeActionInitialReward(acNext) == 0;
    	require currentContract.getStakeActionAddr(acNext) == 0;
		require currentContract.getNftUsedStatus(acNext) == 0;
    }
    if (f.selector == sig:StakingWalletCosmicSignatureNft.unstake(uint256).selector) {
		// before unstake() all state variables must have some valid value
    	require currentContract.getStakeActionTokenId(acNext) > 0;
    	require currentContract.getStakeActionInitialReward(acNext) > 0;
    	require currentContract.getStakeActionAddr(acNext) != 0;
		require currentContract.numStakedNfts() > 0 ;
	}
	require gUsedNftsChanged == 0;

    f(e, args);		// generic method matcher like this is a requirement for 100% bug-free verification

    if (
		(f.selector == sig:StakingWalletCosmicSignatureNft.stake(uint256).selector) ||
		(f.selector == sig:StakingWalletCosmicSignatureNft.stakeMany(uint256[]).selector)
	) {
		assert gUsedNftsChanged > 0 , "usedNfts[] state variable didn't change while it should have been";
		uint256 tokenId = currentContract.getStakeActionTokenId(acNext);
		assert currentContract.getNftUsedStatus(tokenId) == 1,"usedNfts[] was not set to 1";
	} else {
		assert gUsedNftsChanged == 0 ,"usedNfts[] was changed while it shouldn't have been";
	}
}
rule rewardPerTokenIsSetCorrectly() 
{	
    method f; env e; calldataarg args;
    require currentContract != e.msg.sender;
	require e.msg.sender != 0;
    if (f.selector == sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector) {
    	require currentContract.game() == e.msg.sender;
		require f.isPayable == true;
		require e.msg.value > 0;
    }
	currentMethodSignature = to_bytes4(f.selector);
	uint256 ac = currentContract.actionCounter();
	uint256 acNext;
	require acNext == (ac + 1);
    if (f.selector == sig:StakingWalletCosmicSignatureNft.stake(uint256).selector) {
		// before stake() all state variables must have 0-values
    	require currentContract.getStakeActionTokenId(acNext) == 0;
    	require currentContract.getStakeActionInitialReward(acNext) == 0;
    	require currentContract.getStakeActionAddr(acNext) == 0;
		require currentContract.getNftUsedStatus(acNext) == 0;
    } else if (f.selector == sig:StakingWalletCosmicSignatureNft.stakeMany(uint256[]).selector) {
		// before stake() all state variables must have 0-values
    	require currentContract.getStakeActionTokenId(acNext) == 0;
    	require currentContract.getStakeActionInitialReward(acNext) == 0;
    	require currentContract.getStakeActionAddr(acNext) == 0;
		require currentContract.getNftUsedStatus(acNext) == 0;
		uint256 acNext2;
		require acNext2 == (ac + 2);
    	require currentContract.getStakeActionTokenId(acNext2) == 0;
    	require currentContract.getStakeActionInitialReward(acNext2) == 0;
    	require currentContract.getStakeActionAddr(acNext2) == 0;
		require currentContract.getNftUsedStatus(acNext2) == 0;
		uint256 acNext3;
		require acNext3 == (ac + 3);
    	require currentContract.getStakeActionTokenId(acNext3) == 0;
    	require currentContract.getStakeActionInitialReward(acNext3) == 0;
    	require currentContract.getStakeActionAddr(acNext3) == 0;
		require currentContract.getNftUsedStatus(acNext3) == 0;
    }
	address charity;
	require charity != currentContract;
	require charity != 0;

	mathint balanceBefore;
	require balanceBefore == nativeBalances[currentContract];
	mathint winnerBalanceBefore = nativeBalances[e.msg.sender];
	mathint balanceCharityBefore = nativeBalances[charity];
	mathint initialReward;
	uint256 tokenId;
	uint256 actionId;
	uint256[] manyActionIds;
	uint256 round;
    if (f.selector == sig:StakingWalletCosmicSignatureNft.unstake(uint256).selector) {
		require currentContract.numStakedNfts() > 0 ;
    	require currentContract.getStakeActionTokenId(actionId) > 0;
    	require currentContract.getStakeActionInitialReward(actionId) > 0;
    	require currentContract.getStakeActionAddr(actionId) != 0;
		require (actionId > 0) && (actionId < currentContract.actionCounter());
		require initialReward == currentContract.getStakeActionInitialReward(actionId);
	} else if (f.selector == sig:StakingWalletCosmicSignatureNft.unstakeMany(uint256[]).selector) {
		require manyActionIds.length == 3;
	} else if (f.selector == sig:StakingWalletCosmicSignatureNft.stakeMany(uint256[]).selector) {
		require manyActionIds.length == 3;
	} else if (f.selector == sig:StakingWalletCosmicSignatureNft.tryPerformMaintenance(address).selector) {
		require nativeBalances[currentContract] > 0;
	}
	bool maintenanceSuccess = genericFunctionMatcher(f,e,charity,round,tokenId,actionId,manyActionIds);

	mathint balanceAfter = nativeBalances[currentContract];
	mathint currentReward = currentContract.rewardAmountPerStakedNft();
	mathint winnerBalanceAfter = nativeBalances[e.msg.sender];
	mathint balanceCharityAfter = nativeBalances[charity];
	mathint amountToPay = currentReward - initialReward;
	mathint amountToPayMany;
	if (f.selector == sig:StakingWalletCosmicSignatureNft.unstakeMany(uint256[]).selector) {
		require amountToPayMany == 3 * amountToPay;
	} else {
		require amountToPayMany == amountToPay;	// value does not matter really
	}
    if (
		(f.selector == sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector)
	) {
		assert (balanceBefore + e.msg.value ) == balanceAfter,"balance of the contract did not increase as it should";
	} else if (f.selector == sig:StakingWalletCosmicSignatureNft.unstake(uint256).selector) {
		assert (currentReward >= initialReward) ,"Current reward per NFT staked must be always greater (or equal) than initial reward";
		assert (winnerBalanceBefore + amountToPay) == winnerBalanceAfter, "Balance of the winner didn't increase by correct amount after unstake()";
		assert (balanceBefore - balanceAfter) == (winnerBalanceAfter - winnerBalanceBefore), "Amount withdrawn after unstake() doesn't match balances";
	} else if (f.selector == sig:StakingWalletCosmicSignatureNft.unstakeMany(uint256[]).selector) {
//		assert (winnerBalanceBefore + (amountToPayMany)) == winnerBalanceAfter, "Balance of the winner didn't increase by correct amount after unstakeMany()";
		assert (balanceBefore - balanceAfter) == (winnerBalanceAfter - winnerBalanceBefore), "Amount withdrawn after unstakeMany() doesn't match balances";
	} else if (f.selector == sig:StakingWalletCosmicSignatureNft.tryPerformMaintenance(address).selector) {
		if (maintenanceSuccess) {
			assert balanceAfter  == 0, "balance after tryPerformMaintenance() is not 0";
			assert balanceCharityAfter == (balanceCharityBefore+balanceBefore),"charity balance after tryPerformMaintenance() is not equal to balanceBefore";
		} else {
			assert balanceAfter == balanceBefore,"balance after tryPerformance() should be the same as before after unsuccessful operation";
		}
	} else {
		assert balanceBefore == balanceAfter, "balance of the contract changed while it should not";
	}
}
rule payoutOnUnstakeIsCorrectOneStaker() 
{	
	currentMethodSignature = to_bytes4(sig:StakingWalletCosmicSignatureNft.stake(uint256).selector);
    env e_stake;

	uint256 ac = currentContract.actionCounter();
	require ac == 0;
	uint256 acNext;
	require acNext == (ac + 1);
   	require currentContract.getStakeActionTokenId(acNext) == 0;
   	require currentContract.getStakeActionInitialReward(acNext) == 0;
   	require currentContract.getStakeActionAddr(acNext) == 0;
	require currentContract.getNftUsedStatus(acNext) == 0;
	require currentContract.numStakedNfts() == 0 ;
	require nativeBalances[currentContract] == 0;
    require currentContract != e_stake.msg.sender;
	require e_stake.msg.sender != 0;
	require e_stake.msg.value == 0;
	uint256 tokenId;
	stake(e_stake,tokenId);

 	env e_deposit;
	require e_deposit.msg.sender != 0;
    require currentContract != e_deposit.msg.sender;
   	require currentContract.game() == e_deposit.msg.sender;
	require e_deposit.msg.value > 0;
	uint256 round;
	deposit(e_deposit,round);

	mathint balanceAfterDeposit = nativeBalances[currentContract];

	mathint balanceBeforeUnstake = nativeBalances[e_stake.msg.sender];
	unstake(e_stake,acNext);
	mathint balanceAfterUnstake = nativeBalances[e_stake.msg.sender];

	assert (nativeBalances[currentContract]+e_deposit.msg.value)==(balanceAfterUnstake-balanceBeforeUnstake),"balance of staker after unstake() is incorrect";
	assert (nativeBalances[currentContract] < balanceAfterDeposit),"stakingWallet contract balance is larger than after unstake() operation";

}
rule payoutOnUnstakeIsCorrectTwoStakers() 
{	
	// we need a two-stake rule because we want to test the use case where modulo is not 0
	currentMethodSignature = to_bytes4(sig:StakingWalletCosmicSignatureNft.stake(uint256).selector);

    env e_stake1;
	require currentContract.actionCounter() == 0;
	uint256 acNext1 = 1;
   	require currentContract.getStakeActionTokenId(acNext1) == 0;
   	require currentContract.getStakeActionInitialReward(acNext1) == 0;
   	require currentContract.getStakeActionAddr(acNext1) == 0;
	require currentContract.getNftUsedStatus(acNext1) == 0;
	require currentContract.numStakedNfts() == 0 ;
	require nativeBalances[currentContract] == 0;
    require currentContract != e_stake1.msg.sender;
	require e_stake1.msg.sender != 0;
	require e_stake1.msg.value == 0;
	uint256 tokenId1;

    env e_stake2;
	uint256 acNext2 = 2;
   	require currentContract.getStakeActionTokenId(acNext2) == 0;
   	require currentContract.getStakeActionInitialReward(acNext2) == 0;
   	require currentContract.getStakeActionAddr(acNext2) == 0;
	require currentContract.getNftUsedStatus(acNext2) == 0;
    require currentContract != e_stake2.msg.sender;
	require e_stake2.msg.sender != 0;
	require e_stake2.msg.sender != e_stake1.msg.sender;
	require e_stake2.msg.value == 0;
	uint256 tokenId2;

	stake(e_stake1,tokenId1);
	stake(e_stake2,tokenId2);

 	env e_deposit;
	require e_deposit.msg.sender != 0;
    require currentContract != e_deposit.msg.sender;
   	require currentContract.game() == e_deposit.msg.sender;
	require e_deposit.msg.value > 0;
	mathint rem = e_deposit.msg.value % 2;
	require rem != 0;
	uint256 round;
	deposit(e_deposit,round);


	mathint balanceBeforeUnstake1 = nativeBalances[e_stake1.msg.sender];
	unstake(e_stake1,acNext1);
	mathint balanceAfterUnstake1 = nativeBalances[e_stake1.msg.sender];
	mathint balanceBeforeUnstake2 = nativeBalances[e_stake2.msg.sender];
	unstake(e_stake2,acNext2);
	mathint balanceAfterUnstake2 = nativeBalances[e_stake2.msg.sender];
	mathint balanceSWAtTheEnd = nativeBalances[currentContract];
	mathint rewardStaker1 = balanceAfterUnstake1-balanceBeforeUnstake1;
	mathint rewardStaker2 = balanceAfterUnstake2-balanceBeforeUnstake2;
	mathint allOfIt = rewardStaker1 + rewardStaker2 + balanceSWAtTheEnd;
	assert (e_deposit.msg.value==allOfIt),"fund distribution match the rule in multi-token stake-deposit-unstake sequence";
	mathint remAtTheEnd = nativeBalances[currentContract] % 2;
	assert (remAtTheEnd != 0),"reminder at the end in StakingWallet is zero";
}
