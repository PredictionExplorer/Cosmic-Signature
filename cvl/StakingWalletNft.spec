methods {
	function game() external returns (address) envfree;
	function numStakedNfts() external returns (uint256) envfree;
	function actionCounter() external returns (uint256) envfree;
	function numStakedNfts() external returns (uint256) envfree;
	function getStakeActionAddr(uint256 index) external returns (address) envfree;
	function getStakeActionTokenId(uint256 index) external returns (uint256) envfree;
	function getStakeActionInitialReward(uint256 index) external returns (uint256) envfree;
	function getNftUsedStatus(uint256 index) external returns (uint256) envfree;
}
persistent ghost mathint actionCounterDiff;
persistent ghost mathint gStakeActionNftIdSet;
persistent ghost mathint gStakeActionOwnerSet;
persistent ghost mathint gStakeActionAmountSet;
persistent ghost mathint gUsedNftsChanged;
persistent ghost bytes4 currentMethodSignature;
persistent ghost mathint gNumActiveStakeActions;
persistent ghost mathint gNumStakedNfts;

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
		(currentMethodSignature == to_bytes4(sig:StakingWalletCosmicSignatureNft.unstakeMany(uint256[]).selector))
	);
	gStakeActionAmountSet = 1;
}
hook Sstore usedNfts[INDEX uint256 idx] uint256 newValue (uint256 oldValue) {
	gUsedNftsChanged = 1;
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
    }
    if (f.selector == sig:StakingWalletCosmicSignatureNft.unstake(uint256).selector) {
		// before unstake() all state variables must have some valid value
    	require currentContract.getStakeActionTokenId(acNext) > 0;
    	require currentContract.getStakeActionInitialReward(acNext) > 0;
    	require currentContract.getStakeActionAddr(acNext) != 0;
		require currentContract.numStakedNfts() > 0 ;
	}
	mathint balanceBefore = nativeBalances[currentContract];

    (e, args);		// generic method matcher like this is a requirement for 100% bug-free verification

	mathint balanceAfter = nativeBalances[currentContract];
    if (
		(f.selector == sig:StakingWalletCosmicSignatureNft.deposit(uint256).selector)
	) {
		assert (balanceBefore + e.msg.value ) == balanceAfter,"balance of the contract did not increase as it should";
	} else {
		assert balanceBefore == balanceAfter, "balance of the contract changed while it should not";
	}
}
