// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;
// todo-0 Remove all uses of this pragma. It's deprecated. Instead, configure SMTChecker in the Hardhat config file.
pragma experimental SMTChecker;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { CosmicGame} from "./CosmicGame.sol";
import { IStakingWalletCST } from "./interfaces/IStakingWalletCST.sol";

/// @dev Implements staking, unstaking, and reward distribution mechanisms for CST NFTs
contract StakingWalletCST is Ownable, IStakingWalletCST {
	// #region Data Types

	/// @notice Represents a staking action for a token
	/// @dev Stores details about each staking event
	struct StakeAction {
		uint256 tokenId;
		address nftOwner;
		uint256 stakeTime;
		uint256 unstakeTime;
		mapping(uint256 => bool) depositClaimed;
	}

	/// @notice Represents an ETH deposit for reward distribution
	/// @dev Stores details about each ETH deposit event
	struct ETHDeposit {
		uint256 depositTime;
		uint256 depositAmount;
		uint256 numStaked;
	}

	// #endregion
	// #region State

	/// @notice Mapping of stake action ID to StakeAction
	mapping(uint256 => StakeAction) public stakeActions;
	/// @notice Total number of stake actions
	uint256 public numStakeActions;
	/// @notice Mapping to track if a token has been used for staking
	mapping(uint256 => bool) public usedTokens;

	/// @notice Array of currently staked token IDs
	uint256[] public stakedTokens;
	/// @notice Mapping of token ID to its index in stakedTokens array
	mapping(uint256 => uint256) public tokenIndices;
	/// @notice Mapping of token ID to its last action ID
	mapping(uint256 => int256) public lastActionIds;

	/// @notice Mapping of deposit ID to ETHDeposit
	mapping(uint256 => ETHDeposit) public ETHDeposits;
	/// @notice Total number of ETH deposits
	uint256 public numETHDeposits;

	/// @notice Current number of staked NFTs
	uint256 public numStakedNFTs;

	/// @notice Address of the charity to receive funds when no NFTs are staked
	address public charity;
	/// @notice Accumulated modulo from deposits
	uint256 public modulo;

	/// @notice Reference to the CosmicSignature NFT contract
	CosmicSignature public nft;
	/// @notice Reference to the CosmicGame contract
	CosmicGame public game;

	/// @dev Precision factor for calculations
	uint256 private constant PRECISION = 1e18;
	/// @dev Counter for actions to replace block.timestamp
	uint256 private actionCounter;

	// #endregion

	/// @notice Initializes the StakingWalletCST contract
	/// @param nft_ Address of the CosmicSignature NFT contract
	/// @param game_ Address of the CosmicGame contract
	/// @param charity_ Address of the charity
	/// @dev ToDo-202408114-1 applies
	constructor(CosmicSignature nft_, CosmicGame game_, address charity_) Ownable(msg.sender) {
		require(address(nft_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given for the nft."));
		require(address(game_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given for the game."));
		require(charity_ != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given for charity."));
		nft = nft_;
		game = game_;
		charity = charity_;

		// SMT Checker assertions
		assert(address(nft) == address(nft_));
		assert(address(game) == address(game_));
		assert(charity == charity_);
		assert(numStakedNFTs == 0);
		assert(numStakeActions == 0);
		assert(numETHDeposits == 0);
		assert(modulo == 0);
	}

	function deposit() external payable override {
		require(
			msg.sender == address(game),
			CosmicGameErrors.DepositFromUnauthorizedSender("Only the CosmicGame contract can deposit.", msg.sender)
		);

		uint256 initialModulo = modulo;
		uint256 initialNumETHDeposits = numETHDeposits;

		if (numStakedNFTs == 0) {
			(bool success, ) = charity.call{ value: msg.value }("");
			require(
				success,
				CosmicGameErrors.FundTransferFailed("Transfer to charity contract failed.", msg.value, charity)
			);
			emit CharityDepositEvent(msg.value, charity);
			return;
		}

		if (numETHDeposits > 0 && ETHDeposits[numETHDeposits - 1].numStaked == numStakedNFTs) {
			ETHDeposits[numETHDeposits - 1].depositAmount += msg.value;
		} else {
			ETHDeposits[numETHDeposits].depositTime = actionCounter;
			ETHDeposits[numETHDeposits].depositAmount = msg.value;
			ETHDeposits[numETHDeposits].numStaked = numStakedNFTs;
			numETHDeposits += 1;
		}

		modulo += msg.value % numStakedNFTs;
		actionCounter++;
		emit EthDepositEvent(actionCounter, numETHDeposits - 1, numStakedNFTs, msg.value, modulo);

		// SMT Checker assertions
		assert(modulo >= initialModulo);
		assert(numETHDeposits >= initialNumETHDeposits);
		assert(actionCounter > 0);
	}

	function stake(uint256 _tokenId) public override {
		require(
			!usedTokens[_tokenId],
			CosmicGameErrors.OneTimeStaking("Staking/unstaking token is allowed only once", _tokenId)
		);
		usedTokens[_tokenId] = true;

		uint256 initialNumStakeActions = numStakeActions;
		uint256 initialNumStakedNFTs = numStakedNFTs;

		_insertToken(_tokenId, numStakeActions);
		stakeActions[numStakeActions].tokenId = _tokenId;
		stakeActions[numStakeActions].nftOwner = msg.sender;
		stakeActions[numStakeActions].stakeTime = actionCounter;
		numStakeActions += 1;
		numStakedNFTs += 1;

		nft.transferFrom(msg.sender, address(this), _tokenId);
		actionCounter++;
		emit StakeActionEvent(numStakeActions - 1, _tokenId, numStakedNFTs, msg.sender);

		// SMT Checker assertions
		assert(usedTokens[_tokenId]);
		assert(numStakeActions == initialNumStakeActions + 1);
		assert(numStakedNFTs == initialNumStakedNFTs + 1);
		assert(stakeActions[numStakeActions - 1].tokenId == _tokenId);
		assert(stakeActions[numStakeActions - 1].nftOwner == msg.sender);
		assert(isTokenStaked(_tokenId));
	}

	function stakeMany(uint256[] memory ids) external override {
		uint256 initialNumStakedNFTs = numStakedNFTs;
		for (uint256 i = 0; i < ids.length; i++) {
			stake(ids[i]);
		}
		// SMT Checker assertion
		assert(numStakedNFTs == initialNumStakedNFTs + ids.length);
	}

	function unstake(uint256 stakeActionId) public override {
		require(
			stakeActions[stakeActionId].unstakeTime == 0,
			CosmicGameErrors.TokenAlreadyUnstaked("Token has already been unstaked.", stakeActionId)
		);
		require(
			stakeActions[stakeActionId].nftOwner == msg.sender,
			CosmicGameErrors.AccessError("Only the owner can unstake.", stakeActionId, msg.sender)
		);
		uint256 tokenId = stakeActions[stakeActionId].tokenId;
		uint256 initialNumStakedNFTs = numStakedNFTs;

		_removeToken(tokenId);
		stakeActions[stakeActionId].unstakeTime = actionCounter;
		numStakedNFTs -= 1;

		nft.transferFrom(address(this), msg.sender, tokenId);
		actionCounter++;
		emit UnstakeActionEvent(stakeActionId, tokenId, numStakedNFTs, msg.sender);

		// SMT Checker assertions
		assert(stakeActions[stakeActionId].unstakeTime > 0);
		assert(!isTokenStaked(tokenId));
		assert(numStakedNFTs == initialNumStakedNFTs - 1);
	}

	function unstakeMany(uint256[] memory ids) external override {
		uint256 initialNumStakedNFTs = numStakedNFTs;
		for (uint256 i = 0; i < ids.length; i++) {
			unstake(ids[i]);
		}
		// SMT Checker assertion
		assert(numStakedNFTs == initialNumStakedNFTs - ids.length);
	}

	function claimManyRewards(uint256[] memory actions, uint256[] memory deposits) external override {
		require(
			actions.length == deposits.length,
			CosmicGameErrors.IncorrectArrayArguments(
				"Array arguments must be of the same length.",
				actions.length,
				deposits.length
			)
		);
		uint256 balanceBefore = address(this).balance;
		uint256 totalReward = 0;
		for (int256 i = int256(actions.length) - 1; i >= 0; i--) {
			totalReward += _calculateReward(actions[uint256(i)], deposits[uint256(i)]);
		}
		if (totalReward > 0) {
			(bool success, ) = msg.sender.call{ value: totalReward }("");
			require(success, CosmicGameErrors.FundTransferFailed("Reward transfer failed.", totalReward, msg.sender));
		}
		// SMT Checker assertion
		assert((balanceBefore - totalReward) == address(this).balance);
	}

	/// @notice Calculates the reward for a single stake action and deposit
	/// @param stakeActionId ID of the stake action
	/// @param ETHDepositId ID of the ETH deposit
	/// @return Calculated reward amount
	function _calculateReward(uint256 stakeActionId, uint256 ETHDepositId) internal returns (uint256) {
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
			stakeActions[stakeActionId].nftOwner == msg.sender,
			CosmicGameErrors.AccessError("Only the owner can claim reward.", stakeActionId, msg.sender)
		);
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
		uint256 amount = ETHDeposits[ETHDepositId].depositAmount / ETHDeposits[ETHDepositId].numStaked;
		emit ClaimRewardEvent(stakeActionId, ETHDepositId, amount, msg.sender);

		// SMT Checker assertions
		assert(amount <= ETHDeposits[ETHDepositId].depositAmount);
		assert(stakeActions[stakeActionId].depositClaimed[ETHDepositId]);

		return amount;
	}

	function setCharity(address newCharityAddress) external override onlyOwner {
		require(newCharityAddress != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		require(charity != newCharityAddress,CosmicGameErrors.AddressAlreadySet("Address  already set.",newCharityAddress));
		address oldCharity = charity;
		charity = newCharityAddress;
		emit CharityUpdatedEvent(charity);

		// SMT Checker assertions
		assert(charity == newCharityAddress);
		assert(charity != oldCharity);
	}

	function moduloToCharity() external override onlyOwner {
		uint256 amount = modulo;
		require(amount > 0, CosmicGameErrors.ModuloIsZero("Modulo is zero."));
		modulo = 0;
		(bool success, ) = charity.call{ value: amount }("");
		require(success, CosmicGameErrors.FundTransferFailed("Transfer to charity failed.", amount, charity));
		emit ModuloSentEvent(amount);

		// SMT Checker assertions
		assert(modulo == 0);
	}

	function wasTokenUsed(uint256 _tokenId) public view override returns (bool) {
		return usedTokens[_tokenId];
	}

	function isTokenStaked(uint256 tokenId) public view override returns (bool) {
		return tokenIndices[tokenId] != 0;
	}

	function numTokensStaked() public view override returns (uint256) {
		// SMT Checker assertion
		assert(stakedTokens.length == numStakedNFTs);
		return stakedTokens.length;
	}

	function lastActionIdByTokenId(uint256 tokenId) public view override returns (int256) {
		uint256 tokenIndex = tokenIndices[tokenId];
		if (tokenIndex == 0) {
			return -2;
		}
		return lastActionIds[tokenId];
	}

	function stakerByTokenId(uint256 tokenId) public view override returns (address) {
		int256 actionId = lastActionIdByTokenId(tokenId);
		if (actionId < 0) {
			return address(0);
		}
		return stakeActions[uint256(actionId)].nftOwner;
	}

	/// @notice Inserts a token into the staked tokens list
	/// @dev Internal function to manage staked tokens
	/// @param tokenId ID of the token to insert
	/// @param actionId ID of the stake action
	function _insertToken(uint256 tokenId, uint256 actionId) internal {
		require(
			!isTokenStaked(tokenId),
			CosmicGameErrors.TokenAlreadyInserted("Token already in the list.", tokenId, actionId)
		);
		uint256 initialLength = stakedTokens.length;
		stakedTokens.push(tokenId);
		tokenIndices[tokenId] = stakedTokens.length;
		lastActionIds[tokenId] = int256(actionId);

		// SMT Checker assertions
		assert(isTokenStaked(tokenId));
		assert(tokenIndices[tokenId] == stakedTokens.length);
		assert(lastActionIds[tokenId] == int256(actionId));
		assert(stakedTokens.length == initialLength + 1);
	}

	/// @notice Removes a token from the staked tokens list
	/// @dev Internal function to manage staked tokens
	/// @param tokenId ID of the token to remove
	function _removeToken(uint256 tokenId) internal {
		require(isTokenStaked(tokenId), CosmicGameErrors.TokenAlreadyDeleted("Token is not in the list.", tokenId));
		uint256 index = tokenIndices[tokenId];
		uint256 lastTokenId = stakedTokens[stakedTokens.length - 1];
		stakedTokens[index - 1] = lastTokenId;
		tokenIndices[lastTokenId] = index;
		delete tokenIndices[tokenId];
		stakedTokens.pop();
		lastActionIds[tokenId] = -1;

		// SMT Checker assertions
		assert(!isTokenStaked(tokenId));
		assert(tokenIndices[tokenId] == 0);
		assert(lastActionIds[tokenId] == -1);
	}

	function unstakeClaim(uint256 stakeActionId, uint256 ETHDepositId) public override {
		uint256 initialBalance = address(this).balance;
		unstake(stakeActionId);
		uint256 reward = _calculateReward(stakeActionId, ETHDepositId);
		if (reward > 0) {
			(bool success, ) = msg.sender.call{ value: reward }("");
			require(success, CosmicGameErrors.FundTransferFailed("Reward transfer failed.", reward, msg.sender));
		}

		// SMT Checker assertions
		assert(address(this).balance == initialBalance - reward);
		assert(!isTokenStaked(stakeActions[stakeActionId].tokenId));
	}

	function unstakeClaimMany(
		uint256[] memory unstake_actions,
		uint256[] memory claim_actions,
		uint256[] memory claim_deposits
	) external override {
		uint256 initialBalance = address(this).balance;
		uint256 initialNumStakedNFTs = numStakedNFTs;

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
		uint256 totalReward = 0;
		for (int256 i = int256(claim_actions.length) - 1; i >= 0; i--) {
			totalReward += _calculateReward(claim_actions[uint256(i)], claim_deposits[uint256(i)]);
		}
		if (totalReward > 0) {
			(bool success, ) = msg.sender.call{ value: totalReward }("");
			require(success, CosmicGameErrors.FundTransferFailed("Reward transfer failed.", totalReward, msg.sender));
		}

		// SMT Checker assertions
		assert(address(this).balance == initialBalance - totalReward);
		assert(numStakedNFTs == initialNumStakedNFTs - unstake_actions.length);
	}
}
