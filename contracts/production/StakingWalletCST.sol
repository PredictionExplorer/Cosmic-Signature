// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;
pragma experimental SMTChecker;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGame} from "./CosmicGame.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";

/// @title StakingWalletCST - A staking wallet for Cosmic Signature Tokens
/// @author Cosmic Game Development Team
/// @notice This contract allows users to stake their Cosmic Signature Tokens (CST) and earn rewards
/// @dev Implements staking, unstaking, and reward distribution mechanisms for CST NFTs
contract StakingWalletCST is Ownable {
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

	/// @notice Emitted when a token is staked
	/// @param actionId The ID of the stake action
	/// @param tokenId The ID of the staked token
	/// @param totalNFTs Total number of staked NFTs after this action
	/// @param staker Address of the staker
	event StakeActionEvent(
		uint256 indexed actionId,
		uint256 indexed tokenId,
		uint256 totalNFTs,
		address indexed staker
	);

	/// @notice Emitted when a token is unstaked
	/// @param actionId The ID of the unstake action
	/// @param tokenId The ID of the unstaked token
	/// @param totalNFTs Total number of staked NFTs after this action
	/// @param staker Address of the staker
	event UnstakeActionEvent(
		uint256 indexed actionId,
		uint256 indexed tokenId,
		uint256 totalNFTs,
		address indexed staker
	);

	/// @notice Emitted when a reward is claimed
	/// @param actionId The ID of the stake action
	/// @param depositId The ID of the ETH deposit
	/// @param reward Amount of reward claimed
	/// @param staker Address of the staker claiming the reward
	event ClaimRewardEvent(uint256 indexed actionId, uint256 indexed depositId, uint256 reward, address indexed staker);

	/// @notice Emitted when an ETH deposit is made
	/// @param depositTime Timestamp of the deposit
	/// @param depositNum Deposit number
	/// @param numStakedNFTs Number of staked NFTs at the time of deposit
	/// @param amount Amount of ETH deposited
	/// @param modulo Accumulated modulo after this deposit
	event EthDepositEvent(
		uint256 indexed depositTime,
		uint256 depositNum,
		uint256 numStakedNFTs,
		uint256 amount,
		uint256 modulo
	);

	/// @notice Emitted when a deposit is sent to charity
	/// @param amount Amount sent to charity
	/// @param charityAddress Address of the charity
	event CharityDepositEvent(uint256 amount, address charityAddress);

	/// @notice Emitted when the charity address is updated
	/// @param newCharityAddress New address of the charity
	event CharityUpdatedEvent(address indexed newCharityAddress);

	/// @notice Emitted when accumulated modulo is sent to charity
	/// @param amount Amount of modulo sent to charity
	event ModuloSentEvent(uint256 amount);

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

	/// @notice Deposits ETH for reward distribution
	/// @dev Only callable by the CosmicGame contract
	function deposit() external payable {
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

	/// @notice Stakes a single token
	/// @param _tokenId ID of the token to stake
	function stake(uint256 _tokenId) public {
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

	/// @notice Stakes multiple tokens
	/// @param ids Array of token IDs to stake
	function stakeMany(uint256[] memory ids) external {
		uint256 initialNumStakedNFTs = numStakedNFTs;
		for (uint256 i = 0; i < ids.length; i++) {
			stake(ids[i]);
		}
		// SMT Checker assertion
		assert(numStakedNFTs == initialNumStakedNFTs + ids.length);
	}

	/// @notice Unstakes a single token
	/// @param stakeActionId ID of the stake action to unstake
	function unstake(uint256 stakeActionId) public {
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

	/// @notice Unstakes multiple tokens
	/// @param ids Array of stake action IDs to unstake
	function unstakeMany(uint256[] memory ids) external {
		uint256 initialNumStakedNFTs = numStakedNFTs;
		for (uint256 i = 0; i < ids.length; i++) {
			unstake(ids[i]);
		}
		// SMT Checker assertion
		assert(numStakedNFTs == initialNumStakedNFTs - ids.length);
	}

	/// @notice Claims rewards for multiple stake actions and deposits
	/// @param actions Array of stake action IDs
	/// @param deposits Array of deposit IDs
	function claimManyRewards(uint256[] memory actions, uint256[] memory deposits) external {
		require(
			actions.length == deposits.length,
			CosmicGameErrors.IncorrectArrayArguments(
				"Array arguments must be of the same length.",
				actions.length,
				deposits.length
			)
		);
		uint256 totalReward = 0;
		for (int256 i = int256(actions.length) - 1; i >= 0; i--) {
			totalReward += _calculateReward(actions[uint256(i)], deposits[uint256(i)]);
		}
		if (totalReward > 0) {
			(bool success, ) = msg.sender.call{ value: totalReward }("");
			require(success, CosmicGameErrors.FundTransferFailed("Reward transfer failed.", totalReward, msg.sender));
		}
		// SMT Checker assertion
		assert(totalReward <= address(this).balance);
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

	/// @notice Sets a new charity address
	/// @param newCharityAddress Address of the new charity
	function setCharity(address newCharityAddress) external onlyOwner {
		require(newCharityAddress != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		address oldCharity = charity;
		charity = newCharityAddress;
		emit CharityUpdatedEvent(charity);

		// SMT Checker assertions
		assert(charity == newCharityAddress);
		assert(charity != oldCharity);
	}

	/// @notice Sends accumulated modulo to charity
	function moduloToCharity() external onlyOwner {
		uint256 amount = modulo;
		require(amount > 0, CosmicGameErrors.ModuloIsZero("Modulo is zero."));
		modulo = 0;
		(bool success, ) = charity.call{ value: amount }("");
		require(success, CosmicGameErrors.FundTransferFailed("Transfer to charity failed.", amount, charity));
		emit ModuloSentEvent(amount);

		// SMT Checker assertions
		assert(modulo == 0);
	}

	/// @notice Checks if a token has been used for staking
	/// @param _tokenId ID of the token to check
	/// @return True if the token has been used, false otherwise
	function wasTokenUsed(uint256 _tokenId) public view returns (bool) {
		return usedTokens[_tokenId];
	}

	/// @notice Checks if a token is currently staked
	/// @param tokenId ID of the token to check
	/// @return True if the token is staked, false otherwise
	function isTokenStaked(uint256 tokenId) public view returns (bool) {
		return tokenIndices[tokenId] != 0;
	}

	/// @notice Returns the number of currently staked tokens
	/// @return Number of staked tokens
	function numTokensStaked() public view returns (uint256) {
		// SMT Checker assertion
		assert(stakedTokens.length == numStakedNFTs);
		return stakedTokens.length;
	}

	/// @notice Gets the last action ID for a given token
	/// @param tokenId ID of the token to check
	/// @return Last action ID for the token, -2 if never staked, -1 if unstaked
	function lastActionIdByTokenId(uint256 tokenId) public view returns (int256) {
		uint256 tokenIndex = tokenIndices[tokenId];
		if (tokenIndex == 0) {
			return -2;
		}
		return lastActionIds[tokenId];
	}

	/// @notice Gets the staker's address for a given token
	/// @param tokenId ID of the token to check
	/// @return Address of the staker, address(0) if not staked
	function stakerByTokenId(uint256 tokenId) public view returns (address) {
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

	/// @notice Unstakes a token and claims its reward in a single transaction
	/// @param stakeActionId ID of the stake action
	/// @param ETHDepositId ID of the ETH deposit for reward calculation
	function unstakeClaim(uint256 stakeActionId, uint256 ETHDepositId) public {
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

	/// @notice Unstakes multiple tokens and claims their rewards in a single transaction
	/// @param unstake_actions Array of stake action IDs to unstake
	/// @param claim_actions Array of stake action IDs for claiming rewards
	/// @param claim_deposits Array of deposit IDs for claiming rewards
	function unstakeClaimMany(
		uint256[] memory unstake_actions,
		uint256[] memory claim_actions,
		uint256[] memory claim_deposits
	) external {
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
