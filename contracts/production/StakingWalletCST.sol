// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

// import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { CosmicGameEvents } from "./libraries/CosmicGameEvents.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { IStakingWalletCST } from "./interfaces/IStakingWalletCST.sol";

/// @dev Implements staking, unstaking, and reward distribution mechanisms for CST NFTs
/// todo-1 There is no word "NFT" in this contract name, while the word "CST" doesn't appear to be very relevant
/// todo-1 ("ETH" would be more relevant). Rename?
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

	/// @notice Reference to the CosmicSignature NFT contract
	CosmicSignature public nft;

	/// @notice Reference to the CosmicGame contract
	address public game;

	/// @notice Mapping of stake action ID to StakeAction
	mapping(uint256 => StakeAction) public stakeActions;

	/// @notice Total number of stake actions
	uint256 public numStakeActions;

	/// @notice Mapping to track if a token has been used for staking
	mapping(uint256 => bool) public usedTokens;

	/// @notice Array of currently staked token IDs
	uint256[] public stakedTokens;

	/// @notice Current number of staked NFTs
	uint256 public numStakedNFTs;

	/// @notice Mapping of token ID to its index in stakedTokens array
	mapping(uint256 => uint256) public tokenIndices;

	/// @notice Mapping of token ID to its last action ID
	mapping(uint256 => int256) public lastActionIds;

	/// @notice Mapping of deposit ID to ETHDeposit
	mapping(uint256 => ETHDeposit) public ETHDeposits;

	/// @notice Total number of ETH deposits
	uint256 public numETHDeposits;

	// /// @notice Accumulated modulo from ETH deposits
	// /// @dev
	// /// [Comment-202409208]
	// /// Issue. This is questionable.
	// /// Relevant logic counts and tries to handle correctly orders of magnitude less money than it costs gas-wise.
	// /// So I have eliminated `modulo`.
	// /// I also eliminated `charity` because it would rarely, if ever, be used, but would cost us some gas to update.
	// /// Consequently, I eliminated `moduloToCharity`, `setCharity`, and some other entities, such as related events.
	// /// Instead, I added the `transferRemainingBalanceToCharity` function, as a minimalistic replacement for all of the above.
	// /// Comment-202409213 relates.
	// /// [/Comment-202409208]
	// uint256 public modulo;

	// /// @notice Address of the charity to receive funds when no NFTs are staked
	// /// @dev Comment-202409208 relates and/or applies.
	// address public charity;

	/// @dev Counter for actions to replace block.timestamp
	uint256 private _actionCounter;

	// /// @dev Precision factor for calculations
	// /// Was this intended to be somethig similar to `CosmicGameConstants.STARTING_BID_PRICE_CST_HARD_MIN_LIMIT`?
	// uint256 private constant PRECISION = 1 ether;

	// #endregion

	/// @notice Initializes the StakingWalletCST contract
	/// @param nft_ Reference to the CosmicSignature NFT contract
	/// @param game_ Address of the CosmicGame contract
	/// // param charity_ Address of the charity
	/// @dev ToDo-202408114-1 applies
	constructor(CosmicSignature nft_, address game_ /* , address charity_ */) Ownable(msg.sender) {
		require(address(nft_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given for the nft."));
		require(game_ != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given for the game."));
		// require(charity_ != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given for charity."));
		nft = nft_;
		game = game_;
		// charity = charity_;

		// #region Assertions
		// #enable_asserts assert(address(nft) == address(nft_));
		// #enable_asserts assert(game == game_);
		// #enable_asserts assert(numStakeActions == 0);
		// #enable_asserts assert(numStakedNFTs == 0);
		// #enable_asserts assert(numETHDeposits == 0);
		// // #enable_asserts assert(modulo == 0);
		// // #enable_asserts assert(charity == charity_);
		// #enable_asserts assert(_actionCounter == 0);
		// #endregion
	}

	function stake(uint256 _tokenId) public override {
		require(
			!usedTokens[_tokenId],
			CosmicGameErrors.OneTimeStaking("Staking/unstaking token is allowed only once", _tokenId)
		);

		// #enable_asserts uint256 initialNumStakeActions = numStakeActions;
		// #enable_asserts uint256 initialNumStakedNFTs = numStakedNFTs;

		usedTokens[_tokenId] = true;
		_insertToken(_tokenId, numStakeActions);
		stakeActions[numStakeActions].tokenId = _tokenId;
		stakeActions[numStakeActions].nftOwner = msg.sender;
		stakeActions[numStakeActions].stakeTime = _actionCounter;
		++ numStakeActions;
		++ numStakedNFTs;

		nft.transferFrom(msg.sender, address(this), _tokenId);
		++ _actionCounter;
		emit StakeActionEvent(numStakeActions - 1, _tokenId, numStakedNFTs, msg.sender);

		// #region Assertions
		// #enable_asserts assert(usedTokens[_tokenId]);
		// #enable_asserts assert(numStakeActions == initialNumStakeActions + 1);
		// #enable_asserts assert(numStakedNFTs == initialNumStakedNFTs + 1);
		// #enable_asserts assert(stakeActions[numStakeActions - 1].tokenId == _tokenId);
		// #enable_asserts assert(stakeActions[numStakeActions - 1].nftOwner == msg.sender);
		// #enable_asserts assert(isTokenStaked(_tokenId));
		// #endregion
	}

	function stakeMany(uint256[] memory ids) external override {
		// #enable_asserts uint256 initialNumStakedNFTs = numStakedNFTs;

		for (uint256 i = 0; i < ids.length; i++) {
			stake(ids[i]);
		}

		// #region Assertions
		// #enable_asserts assert(numStakedNFTs == initialNumStakedNFTs + ids.length);
		// #endregion
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

		// #enable_asserts uint256 initialNumStakedNFTs = numStakedNFTs;

		uint256 tokenId = stakeActions[stakeActionId].tokenId;
		_removeToken(tokenId);
		stakeActions[stakeActionId].unstakeTime = _actionCounter;
		-- numStakedNFTs;

		nft.transferFrom(address(this), msg.sender, tokenId);
		++ _actionCounter;
		emit UnstakeActionEvent(stakeActionId, tokenId, numStakedNFTs, msg.sender);

		// #region Assertions
		// #enable_asserts assert(stakeActions[stakeActionId].unstakeTime > 0);
		// #enable_asserts assert(!isTokenStaked(tokenId));
		// #enable_asserts assert(numStakedNFTs == initialNumStakedNFTs - 1);
		// #endregion
	}

	function unstakeMany(uint256[] memory ids) external override {
		// #enable_asserts uint256 initialNumStakedNFTs = numStakedNFTs;

		for (uint256 i = 0; i < ids.length; i++) {
			unstake(ids[i]);
		}

		// #region Assertions
		// #enable_asserts assert(numStakedNFTs == initialNumStakedNFTs - ids.length);
		// #endregion
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
		// #enable_asserts uint256 initialBalance = address(this).balance;
		uint256 totalReward = 0;
		for (int256 i = int256(actions.length) - 1; i >= 0; i--) {
			totalReward += _calculateReward(actions[uint256(i)], deposits[uint256(i)]);
		}
		if (totalReward > 0) {
			(bool success, ) = msg.sender.call{ value: totalReward }("");
			require(success, CosmicGameErrors.FundTransferFailed("Reward transfer failed.", totalReward, msg.sender));
		}

		// #region Assertions
		// #enable_asserts assert((initialBalance - totalReward) == address(this).balance);
		// #endregion
	}

	function unstakeClaim(uint256 stakeActionId, uint256 ETHDepositId) public override {
		// #enable_asserts uint256 initialBalance = address(this).balance;
		unstake(stakeActionId);
		uint256 reward = _calculateReward(stakeActionId, ETHDepositId);
		if (reward > 0) {
			(bool success, ) = msg.sender.call{ value: reward }("");
			require(success, CosmicGameErrors.FundTransferFailed("Reward transfer failed.", reward, msg.sender));
		}

		// #region Assertions
		// #enable_asserts assert(address(this).balance == initialBalance - reward);
		// #enable_asserts assert(!isTokenStaked(stakeActions[stakeActionId].tokenId));
		// #endregion
	}

	function unstakeClaimMany(
		uint256[] memory unstake_actions,
		uint256[] memory claim_actions,
		uint256[] memory claim_deposits
	) external override {
		// #enable_asserts uint256 initialBalance = address(this).balance;
		// #enable_asserts uint256 initialNumStakedNFTs = numStakedNFTs;

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

		// #region Assertions
		// #enable_asserts assert(address(this).balance == initialBalance - totalReward);
		// #enable_asserts assert(numStakedNFTs == initialNumStakedNFTs - unstake_actions.length);
		// #endregion
	}

	function wasTokenUsed(uint256 _tokenId) public view override returns (bool) {
		return usedTokens[_tokenId];
	}

	function isTokenStaked(uint256 tokenId) public view override returns (bool) {
		return tokenIndices[tokenId] != 0;
	}

	function numTokensStaked() public view override returns (uint256) {
		// #region Assertions
		// #enable_asserts assert(stakedTokens.length == numStakedNFTs);
		// #endregion

		// todo-1 Would it be more efficient to return `numStakedNFTs`?
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

	/// @dev todo-1 Here and elsewhere, consider replacing functions like this with `receive`.
	/// todo-1 It would probably be cheaper gas-wise.
	function depositIfPossible() external payable override {
		require(
			msg.sender == game,
			CosmicGameErrors.DepositFromUnauthorizedSender("Only the CosmicGame contract can deposit.", msg.sender)
		);

		// // #enable_asserts uint256 initialModulo = modulo;
		// #enable_asserts uint256 initialNumETHDeposits = numETHDeposits;

		if (numStakedNFTs == 0) {
			// (bool success_, ) = charity.call{ value: msg.value }("");
			// if (success_) {
			// 	emit CosmicGameEvents.FundsTransferredToCharityEvent(msg.value, charity);
			// } else {
			// 	emit CosmicGameEvents.FundTransferFailed("Transfer to charity failed.", msg.value, charity);
			// 	modulo += msg.value;
			// }
			// // todo-9 It would be nice to not skip at least some asserts in this case.
			// return;

			revert CosmicGameErrors.InvalidOperationInCurrentState();
		}

		if (numETHDeposits > 0 && ETHDeposits[numETHDeposits - 1].numStaked == numStakedNFTs) {
			ETHDeposits[numETHDeposits - 1].depositAmount += msg.value;
		} else {
			ETHDeposits[numETHDeposits].depositTime = _actionCounter;
			ETHDeposits[numETHDeposits].depositAmount = msg.value;
			ETHDeposits[numETHDeposits].numStaked = numStakedNFTs;
			++ numETHDeposits;
		}

		// modulo += msg.value % numStakedNFTs;
		++ _actionCounter;
		emit EthDepositEvent(_actionCounter, numETHDeposits - 1, numStakedNFTs, msg.value /* , modulo */);

		// #region Assertions
		// // #enable_asserts assert(modulo >= initialModulo);
		// #enable_asserts assert(numETHDeposits >= initialNumETHDeposits);
		// #enable_asserts assert(_actionCounter > 0);
		// #endregion
	}

	// function setCharity(address newCharityAddress) external override onlyOwner {
	// 	require(newCharityAddress != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
	//
	//		// todo-9 Is it really necessary to validate this?
	//		// todo-9 We don't normally validate similar things.
	//		// todo-9 If you eliminate this validation, remember to also eliminate respective `assert`.
	// 	require(charity != newCharityAddress, CosmicGameErrors.AddressAlreadySet("Address already set.", newCharityAddress));
	//
	// 	// #enable_asserts address oldCharityAddress = charity;
	// 	charity = newCharityAddress;
	// 	emit CharityUpdatedEvent(charity);
	//
	// 	// #region Assertions
	// 	// #enable_asserts assert(charity == newCharityAddress);
	// 	// #enable_asserts assert(charity != oldCharityAddress);
	// 	// #endregion
	// }

	// // todo-9 Does this really have to be `onlyOwner`?
	// function moduloToCharity() external override onlyOwner {
	// 	uint256 amount_ = modulo;
	//
	//		// // Comment-202409215 applies.
	// 	// require(amount_ > 0, CosmicGameErrors.ModuloIsZero("Modulo is zero."));
	//
	// 	modulo = 0;
	//
	//		// Comment-202409214 applies.
	// 	(bool success_, ) = charity.call{ value: amount_ }("");
	//
	// 	require(success_, CosmicGameErrors.FundTransferFailed("Transfer to charity failed.", amount_, charity));
	// 	emit ModuloSentToCharityEvent(amount_);
	//
	// 	// #region Assertions
	// 	// #enable_asserts assert(modulo == 0);
	// 	// #endregion
	// }

	function transferRemainingBalanceToCharity(address charityAddress_) external override onlyOwner {
		// [Comment-202409213]
		// The caller shall wait until everybody withdraws their NFTs.
		// Although it's unlikely to ever happen.
		// But, as mentioned in Comment-202409208, any better solution wouldn't be worth the gas.
		// [/Comment-202409213]
		require(numStakedNFTs == 0, CosmicGameErrors.InvalidOperationInCurrentState());

		require(charityAddress_ != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		uint256 amount_ = address(this).balance;

		// // [Comment-202409215]
		// // It's unnecessary to spend gas to validate this.
		// // [/Comment-202409215]
		// require(amount_ > 0, CosmicGameErrors.InvalidOperationInCurrentState());

		// [Comment-202409214]
		// It appears to be no reentrancy vulnerability here.
		// [/Comment-202409214]
		(bool success_, ) = charityAddress_.call{ value: amount_ }("");

		require(success_, CosmicGameErrors.FundTransferFailed("Transfer to charity failed.", amount_, charityAddress_));
		emit CosmicGameEvents.FundsTransferredToCharityEvent(amount_, charityAddress_);

		// #region Assertions
		// #enable_asserts assert(address(this).balance == 0);
		// #endregion
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
		// #enable_asserts uint256 stakedTokensInitialLength = stakedTokens.length;
		stakedTokens.push(tokenId);
		tokenIndices[tokenId] = stakedTokens.length;
		lastActionIds[tokenId] = int256(actionId);

		// #region Assertions
		// #enable_asserts assert(isTokenStaked(tokenId));
		// #enable_asserts assert(tokenIndices[tokenId] == stakedTokens.length);
		// #enable_asserts assert(lastActionIds[tokenId] == int256(actionId));
		// #enable_asserts assert(stakedTokens.length == stakedTokensInitialLength + 1);
		// #endregion
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

		// #region Assertions
		// #enable_asserts assert(!isTokenStaked(tokenId));
		// #enable_asserts assert(tokenIndices[tokenId] == 0);
		// #enable_asserts assert(lastActionIds[tokenId] == -1);
		// #endregion
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

		// #region Assertions
		// #enable_asserts assert(amount <= ETHDeposits[ETHDepositId].depositAmount);
		// #enable_asserts assert(stakeActions[stakeActionId].depositClaimed[ETHDepositId]);
		// #endregion

		return amount;
	}
}
