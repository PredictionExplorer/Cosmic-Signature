// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGame } from "./CosmicGame.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { CosmicGameConstants } from "./Constants.sol";
import { CosmicGameErrors } from "./Errors.sol";

// [ToDo-202408067-1]
// Some todos might apply to `StakingWalletRWalk` as well. I need to review it better.
// [/ToDo-202408067-1]
//
// todo-1 This contract needs improvement. See todos below.
//
// todo-1 Should we give the owner an option to sell a staked NFT together with unrealized rewards?
contract StakingWalletCST is Ownable {
	struct StakeAction {
		uint256 tokenId;
		// todo-1 Rename to `NFTOwner`.
		// todo-1 I would really name this `nftOwner` (and if `NFT` ws in the midle of the name, it would be `Nft`),
		// todo-1 but that's not how things are named in this project.
		address owner;
		uint256 stakeTime;
		uint256 unstakeTime;
		mapping(uint256 => bool) depositClaimed;
	}

	struct ETHDeposit {
		uint256 depositTime;
		uint256 depositAmount;
		uint256 numStaked;
	}

	mapping(uint256 => StakeAction) public stakeActions;
	uint256 public numStakeActions;
	mapping(uint256 => bool) public usedTokens; // tokens can be staked only once, and then they become 'used'

	// Variables to manage uniquneness of tokens and pick random winner
	uint256[] public stakedTokens;
	mapping(uint256 => uint256) public tokenIndices; // tokenId -> tokenIndex
	mapping(uint256 => int256) public lastActionIds; // tokenId -> actionId

	mapping(uint256 => ETHDeposit) public ETHDeposits;
	uint256 public numETHDeposits;

	uint256 public numStakedNFTs;

	address public charity;
	// TODO: figure out the invariant that is always true that includes the modulo.
	//       It would be useful for testing.
	uint256 public modulo;

	CosmicSignature public nft;
	CosmicGame public game;

	event StakeActionEvent(
		uint256 indexed actionId,
		uint256 indexed tokenId,
		uint256 totalNFTs,
		address indexed staker
	);
	event UnstakeActionEvent(
		uint256 indexed actionId,
		uint256 indexed tokenId,
		uint256 totalNFTs,
		address indexed staker
	);
	event ClaimRewardEvent(uint256 indexed actionId, uint256 indexed depositId, uint256 reward, address indexed staker);
	event EthDepositEvent(
		uint256 indexed depositTime,
		uint256 depositNum,
		uint256 numStakedNFTs,
		uint256 amount,
		uint256 modulo
	);
	event CharityDepositEvent(uint256 amount, address charityAddress); // emitted when numStakedNFTs = 0
	event CharityUpdatedEvent(address indexed newCharityAddress);
	event ModuloSentEvent(uint256 amount);

	constructor(CosmicSignature nft_, CosmicGame game_, address charity_) {
		require(address(nft_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given for the nft."));
		require(address(game_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given for the game."));
		require(charity_ != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given for charity."));
		nft = nft_;
		game = game_;
		charity = charity_;
	}

	// todo-1 We probably aren't going to make multiple deposits within a single block.
	// todo-1 But if we did so, would the behavior still be correct?
	function deposit() external payable {
		// We don't let anybody to donate money to us because someone would be able to DoS us by making a zillion deposits.
		require(
			msg.sender == address(game),
			CosmicGameErrors.DepositFromUnauthorizedSender("Only the CosmicGame contract can deposit.", msg.sender)
		);

		// [Comment-202408074/]
		if (numStakedNFTs == 0) {
			// todo-1 Should we send our whole balance to charity, not only `msg.value`?
			// todo-1 Maybe better in this case reject the deposit? The funds will stay in `CosmicGame`.
			// todo-1 But the admin should be somehow notified about the error.
			// todo-1 This kind of logic doesn't seem to exist in `StakingWalletRWalk`. But take another look.
			(bool success, ) = charity.call{ value: msg.value }("");
			require(
				success,
				CosmicGameErrors.FundTransferFailed("Transfer to charity contract failed.", msg.value, charity)
			);
			emit CharityDepositEvent(msg.value, charity);
			return;
		}
		// todo-1 Here and possibly in some other places throughout the codebase,
		// todo-1 the use of `block.timestamp` could be a bad option.
		// todo-1 The use of timestamps if often a bad option in regular apps too, not only in smart contract.
		// todo-1 Consider using an ever increasing counter variable instead.
		// todo-1 The current logic would not necessarily work correct if someone stakes or unstakes
		// todo-1 within the block in which we deposit funds.
		// todo-1 In such a case, this contract will pocket and lock forever the staker's money.
		//
		// todo-1 I feel that it could be unnecesary to create another `ETHDeposits` item
		// todo-1 if there have been no staking and/or unstaking action since the previous deposit.
		// todo-1 But event listeners would need to be aware of this logic and use only the last event data for a particular ETH deposit ID.
		ETHDeposits[numETHDeposits].depositTime = block.timestamp;
		// todo-1 Is it guaranteed that this is a nonzero? Write a comment? Cross-ref with where we validated who is the sender.
		ETHDeposits[numETHDeposits].depositAmount = msg.value;
		ETHDeposits[numETHDeposits].numStaked = numStakedNFTs;
		numETHDeposits += 1;
		// todo: add comment
		modulo += msg.value % numStakedNFTs;
		emit EthDepositEvent(block.timestamp, numETHDeposits - 1, numStakedNFTs, msg.value, modulo);
	}

	function stake(uint256 _tokenId) public {
		require(
			usedTokens[_tokenId] != true,
			CosmicGameErrors.OneTimeStaking("Staking/unstaking token is allowed only once", _tokenId)
		);
		usedTokens[_tokenId] = true;
		// [ToDo-202408068-1]
		// Would it be more secure to make this external call after making all state updates?
		// Although this is our own NFT contract, so maybe it doesn't matter.
		// But at least comment.
		// We can get by without locking public/external methods in `StakingWalletCST`, right?
		// [/ToDo-202408068-1]
		nft.transferFrom(msg.sender, address(this), _tokenId);
		_insertToken(_tokenId, numStakeActions);
		stakeActions[numStakeActions].tokenId = _tokenId;
		stakeActions[numStakeActions].owner = msg.sender;
		stakeActions[numStakeActions].stakeTime = block.timestamp;
		numStakeActions += 1;
		numStakedNFTs += 1;
		emit StakeActionEvent(numStakeActions - 1, _tokenId, numStakedNFTs, msg.sender);
	}

	function stakeMany(uint256[] memory ids) external {
		for (uint256 i = 0; i < ids.length; i++) {
			stake(ids[i]);
		}
	}

	function unstake(uint256 stakeActionId) public {
		require(
			stakeActions[stakeActionId].unstakeTime == 0,
			CosmicGameErrors.TokenAlreadyUnstaked("Token has already been unstaked.", stakeActionId)
		);
		require(
			stakeActions[stakeActionId].owner == msg.sender,
			CosmicGameErrors.AccessError("Only the owner can unstake.", stakeActionId, msg.sender)
		);
		uint256 tokenId = stakeActions[stakeActionId].tokenId;
		_removeToken(tokenId);
		// ToDo-202408068-1 applies.
		nft.transferFrom(address(this), msg.sender, stakeActions[stakeActionId].tokenId);
		stakeActions[stakeActionId].unstakeTime = block.timestamp;
		numStakedNFTs -= 1;
		emit UnstakeActionEvent(stakeActionId, tokenId, numStakedNFTs, msg.sender);
	}

	function unstakeMany(uint256[] memory ids) external {
		for (uint256 i = 0; i < ids.length; i++) {
			unstake(ids[i]);
		}
	}

	// todo: Remove this function and combine it with `claimManyRewards`.
	// todo: Refactor the front-end if needed.
	// todo-1 See https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1722601107544849
	// todo-1 There is now a new similar method that unstakes and claims reward in one shot.
	// todo-1 Revisit it as well.
	function claimReward(uint256 stakeActionId, uint256 ETHDepositId) public {
		// todo: Are we checking everything needed? Any more require statements needed?
		require(
			stakeActionId < numStakeActions,
			CosmicGameErrors.InvalidActionId("Invalid stakeActionId.", stakeActionId)
		);
		require(
			ETHDepositId < numETHDeposits,
			CosmicGameErrors.InvalidDepositId("Invalid ETHDepositId.", ETHDepositId)
		);
		require(
			stakeActions[stakeActionId].unstakeTime > 0,
			CosmicGameErrors.TokenNotUnstaked("Token has not been unstaked.", stakeActionId)
		);
		require(
			!stakeActions[stakeActionId].depositClaimed[ETHDepositId],
			CosmicGameErrors.DepositAlreadyClaimed("This deposit was claimed already.", stakeActionId, ETHDepositId)
		);
		require(
			stakeActions[stakeActionId].owner == msg.sender,
			CosmicGameErrors.AccessError("Only the owner can claim reward.", stakeActionId, msg.sender)
		);
		// depositTime is compared without '=' operator to prevent frontrunning (sending stake
		// operation within the same block as claimPrize transaction)
		// todo-1 That won't be a concern if we used an ever increasing counter variable to populate `stakeTime`, right?
		require(
			stakeActions[stakeActionId].stakeTime < ETHDeposits[ETHDepositId].depositTime,
			CosmicGameErrors.DepositOutsideStakingWindow(
				"You were not staked yet.",
				stakeActionId,
				ETHDepositId,
				stakeActions[stakeActionId].unstakeTime,
				stakeActions[stakeActionId].stakeTime,
				ETHDeposits[ETHDepositId].depositTime
			)
		);
		require(
			stakeActions[stakeActionId].unstakeTime > ETHDeposits[ETHDepositId].depositTime,
			CosmicGameErrors.DepositOutsideStakingWindow(
				"You were already unstaked.",
				stakeActionId,
				ETHDepositId,
				stakeActions[stakeActionId].unstakeTime,
				stakeActions[stakeActionId].stakeTime,
				ETHDeposits[ETHDepositId].depositTime
			)
		);
		stakeActions[stakeActionId].depositClaimed[ETHDepositId] = true;
		// todo-1 Is it guaranteed that we won't divide by zero here?
		// todo-1 Is it guaranteed that `amount` is a nonzero?
		// todo-1 Make sense to explain why in comments?
		uint256 amount = ETHDeposits[ETHDepositId].depositAmount / ETHDeposits[ETHDepositId].numStaked;
		(bool success, ) = stakeActions[stakeActionId].owner.call{ value: amount }("");
		require(success, CosmicGameErrors.FundTransferFailed("Reward transfer failed.", amount, msg.sender));
		emit ClaimRewardEvent(stakeActionId, ETHDepositId, amount, msg.sender);
	}

	// todo-1 Maybe comment here and near `claimReward` (but it's to be eliminated)
	// todo-1 that unstaking and claiming the reward are separate transactions.
	// todo-1 Actually we now also support the two actions in a single transaction.
	function claimManyRewards(uint256[] memory actions, uint256[] memory deposits) external {
		require(
			actions.length == deposits.length,
			CosmicGameErrors.IncorrectArrayArguments(
				"Array arguments must be of the same length.",
				actions.length,
				deposits.length
			)
		);
		// todo-1 Likely a more gas-efficient loop: for (int256 i = int256(actions.length); ( -- i ) >= int256(0);)
		// todo-1 In addition, eliminate overflow check.
		for (uint256 i = 0; i < actions.length; i++) {
			// todo: make this more efficent. We don't want to send funds on each iteration of this loop
			// todo-1 It's probably going to be safe to eliminate array bounds check here.
			claimReward(actions[i], deposits[i]);
		}
	}

	function setCharity(address newCharityAddress) external onlyOwner {
		require(newCharityAddress != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		charity = newCharityAddress;
		emit CharityUpdatedEvent(charity);
	}

	function moduloToCharity() external onlyOwner {
		uint256 amount;
		amount = modulo;
		require(amount > 0, CosmicGameErrors.ModuloIsZero("Modulo is zero."));
		modulo = 0;
		(bool success, ) = charity.call{ value: amount }("");
		require(success, CosmicGameErrors.FundTransferFailed("Transfer to charity failed.", amount, charity));
		emit ModuloSentEvent(amount);
	}

	function wasTokenUsed(uint256 _tokenId) public view returns (bool) {
		return (usedTokens[_tokenId] == true);
	}

	function isTokenStaked(uint256 tokenId) public view returns (bool) {
		return tokenIndices[tokenId] != 0;
	}

	function numTokensStaked() public view returns (uint256) {
		return stakedTokens.length;
	}

	// todo-1 We don't really need this method, given that `stakedTokens` is `public`.
	function tokenByIndex(uint256 tokenIndex) public view returns (uint256) {
		return stakedTokens[tokenIndex];
	}

	function lastActionIdByTokenId(uint256 tokenId) public view returns (int256) {
		uint256 tokenIndex = tokenIndices[tokenId];
		if (tokenIndex == 0) {
			return -2;
		}
		int256 lastActionId = lastActionIds[tokenId];
		return lastActionId; // will return -1 if token is not staked, > -1 if there is an ID
	}

	function stakerByTokenId(uint256 tokenId) public view returns (address) {
		int256 actionId;
		actionId = lastActionIdByTokenId(tokenId);
		if (actionId < 0) {
			return address(0);
		}
		address staker = stakeActions[uint256(actionId)].owner;
		return staker;
	}

	function _insertToken(uint256 tokenId, uint256 actionId) internal {
		require(
			!isTokenStaked(tokenId),
			CosmicGameErrors.TokenAlreadyInserted("Token already in the list.", tokenId, actionId)
		);
		stakedTokens.push(tokenId);
		tokenIndices[tokenId] = stakedTokens.length;
		lastActionIds[tokenId] = int256(actionId);
	}

	function _removeToken(uint256 tokenId) internal {
		require(isTokenStaked(tokenId), CosmicGameErrors.TokenAlreadyDeleted("Token is not in the list.", tokenId));
		uint256 index = tokenIndices[tokenId];
		uint256 lastTokenId = stakedTokens[stakedTokens.length - 1];
		stakedTokens[index - 1] = lastTokenId;
		tokenIndices[lastTokenId] = index;
		delete tokenIndices[tokenId];
		stakedTokens.pop();
		lastActionIds[tokenId] = -1;
	}
	function unstakeClaim(uint256 stakeActionId, uint256 ETHDepositId) public {
		// executes 2 actions in a single pass
		//      1:      unstakes token using action [stakeActionId]
		//      2:      claims reward corresponding to the deposit [ETHDepositId]
		unstake(stakeActionId);
		claimReward(stakeActionId, ETHDepositId);
	} 
	function unstakeClaimMany(
		uint256[] memory unstake_actions,
		uint256[] memory claim_actions,
		uint256[] memory claim_deposits
	) external {
		for (uint256 i = 0; i < unstake_actions.length; i++) {
			unstake(unstake_actions[i]);
		}
		require(
			claim_actions.length == claim_deposits.length,
			CosmicGameErrors.IncorrectArrayArguments(
				"Claim array arguments must be of the same length.",
				claim_actions.length,
				claim_deposits.length
			)
		);
		for (uint256 i = 0; i < claim_actions.length; i++) {
			claimReward(claim_actions[i], claim_deposits[i]);
		}
	} 

}
