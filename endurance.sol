pragma solidity ^0.8.0;

contract BidProcessor {
    struct EnduranceChampion {
        uint256 enduranceStartTime;
        uint256 enduranceLength;
        address name;
    }

    struct ChronoWarrior {
        address name;
        uint256 chronoStartTime;
        uint256 chronoEndTime;
        uint256 chronoLength;
    }

    uint256 private prevBidTime;
    address private prevBidName;

    EnduranceChampion private currentEnduranceChampion;
    EnduranceChampion private previousEnduranceChampion;
    uint256 private previousEnduranceLength;
    uint256 private prevPrevEnduranceLength;

    ChronoWarrior private currentChronoWarrior;
    uint256 private gameEndTime;

    // Function to process a new bid
    function bid(address name, uint256 time) public {
        if (prevBidTime == 0) {
            // First bid, initialize previous bid info
            prevBidTime = time;
            prevBidName = name;
            return;
        }

        // Calculate the endurance length
        uint256 enduranceLength = time - prevBidTime;

        if (currentEnduranceChampion.name == address(0)) {
            // First endurance champion
            currentEnduranceChampion = EnduranceChampion({
                enduranceStartTime: prevBidTime,
                enduranceLength: enduranceLength,
                name: prevBidName
            });
            prevPrevEnduranceLength = 0; // No previous endurance length
        } else if (enduranceLength > currentEnduranceChampion.enduranceLength) {
            // New endurance champion found

            // Update previous previous endurance length
            prevPrevEnduranceLength = previousEnduranceLength;

            // Update previous endurance champion info
            previousEnduranceChampion = currentEnduranceChampion;
            previousEnduranceLength = currentEnduranceChampion.enduranceLength;

            // Update current endurance champion
            currentEnduranceChampion = EnduranceChampion({
                enduranceStartTime: prevBidTime,
                enduranceLength: enduranceLength,
                name: prevBidName
            });

            // Compute chrono length for previous endurance champion
            updateChronoWarrior();
        }

        // Update previous bid info
        prevBidTime = time;
        prevBidName = name;
    }

    // Function to update the chrono warrior
    function updateChronoWarrior() private {
        if (previousEnduranceChampion.name == address(0)) {
            // There's no previous endurance champion to compute chrono warrior
            return;
        }

        // Compute chrono_start_time for the previous endurance champion
        uint256 chronoStartTime;
        if (prevPrevEnduranceLength == 0) {
            // Previous endurance champion is the first one
            chronoStartTime = previousEnduranceChampion.enduranceStartTime;
        } else {
            chronoStartTime = previousEnduranceChampion.enduranceStartTime + prevPrevEnduranceLength;
        }

        // Compute chrono_end_time
        uint256 chronoEndTime = currentEnduranceChampion.enduranceStartTime + previousEnduranceChampion.enduranceLength;

        // Compute chrono_length
        uint256 chronoLength = chronoEndTime - chronoStartTime;

        // Update chrono warrior if necessary
        if (currentChronoWarrior.name == address(0) || chronoLength > currentChronoWarrior.chronoLength) {
            currentChronoWarrior = ChronoWarrior({
                name: previousEnduranceChampion.name,
                chronoStartTime: chronoStartTime,
                chronoEndTime: chronoEndTime,
                chronoLength: chronoLength
            });
        }
    }

    // Function to end the game
    function endGame(uint256 _gameEndTime) public {
        gameEndTime = _gameEndTime;

        // Calculate endurance length for the last bid
        uint256 enduranceLength = gameEndTime - prevBidTime;

        if (currentEnduranceChampion.name == address(0)) {
            // Case 1: Only one bid in the game
            currentEnduranceChampion = EnduranceChampion({
                name: prevBidName,
                enduranceStartTime: prevBidTime,
                enduranceLength: enduranceLength
            });
            currentChronoWarrior = ChronoWarrior({
                name: prevBidName,
                chronoStartTime: prevBidTime,
                chronoEndTime: gameEndTime,
                chronoLength: enduranceLength
            });
        } else if (enduranceLength > currentEnduranceChampion.enduranceLength) {
            // Case 2: Last bid becomes the new endurance champion
            // Save previous endurance champion
            prevPrevEnduranceLength = previousEnduranceLength;
            previousEnduranceLength = currentEnduranceChampion.enduranceLength;
            previousEnduranceChampion = currentEnduranceChampion;

            // Update current endurance champion
            currentEnduranceChampion = EnduranceChampion({
                name: prevBidName,
                enduranceStartTime: prevBidTime,
                enduranceLength: enduranceLength
            });

            // Compute chrono warriors for previous and current endurance champions
            uint256 chronoStartTimePrev = prevPrevEnduranceLength == 0 ?
                previousEnduranceChampion.enduranceStartTime :
                previousEnduranceChampion.enduranceStartTime + prevPrevEnduranceLength;

            uint256 chronoEndTimePrev = currentEnduranceChampion.enduranceStartTime + previousEnduranceChampion.enduranceLength;
            uint256 chronoLengthPrev = chronoEndTimePrev - chronoStartTimePrev;

            uint256 chronoStartTimeCurr = currentEnduranceChampion.enduranceStartTime + previousEnduranceChampion.enduranceLength;
            uint256 chronoEndTimeCurr = gameEndTime;
            uint256 chronoLengthCurr = chronoEndTimeCurr - chronoStartTimeCurr;

            // Update chrono warrior
            if (chronoLengthPrev > currentChronoWarrior.chronoLength && chronoLengthPrev > chronoLengthCurr) {
                currentChronoWarrior = ChronoWarrior({
                    name: previousEnduranceChampion.name,
                    chronoStartTime: chronoStartTimePrev,
                    chronoEndTime: chronoEndTimePrev,
                    chronoLength: chronoLengthPrev
                });
            } else if (chronoLengthCurr > currentChronoWarrior.chronoLength && chronoLengthCurr >= chronoLengthPrev) {
                currentChronoWarrior = ChronoWarrior({
                    name: currentEnduranceChampion.name,
                    chronoStartTime: chronoStartTimeCurr,
                    chronoEndTime: chronoEndTimeCurr,
                    chronoLength: chronoLengthCurr
                });
            }
        } else {
            // Case 3: Last bid does not become a new endurance champion
            uint256 chronoStartTime = previousEnduranceLength == 0 ?
                currentEnduranceChampion.enduranceStartTime :
                currentEnduranceChampion.enduranceStartTime + previousEnduranceLength;

            uint256 chronoEndTime = gameEndTime;
            uint256 chronoLength = chronoEndTime - chronoStartTime;

            // Update chrono warrior if necessary
            if (currentChronoWarrior.name == address(0) || chronoLength > currentChronoWarrior.chronoLength) {
                currentChronoWarrior = ChronoWarrior({
                    name: currentEnduranceChampion.name,
                    chronoStartTime: chronoStartTime,
                    chronoEndTime: chronoEndTime,
                    chronoLength: chronoLength
                });
            }
        }
    }

    // Function to get the endurance champion
    function getEnduranceChampion() public view returns (address, uint256, uint256) {
        return (
            currentEnduranceChampion.name,
            currentEnduranceChampion.enduranceStartTime,
            currentEnduranceChampion.enduranceLength
        );
    }

    // Function to get the chrono warrior
    function getChronoWarrior() public view returns (address, uint256, uint256, uint256) {
        return (
            currentChronoWarrior.name,
            currentChronoWarrior.chronoStartTime,
            currentChronoWarrior.chronoEndTime,
            currentChronoWarrior.chronoLength
        );
    }
}
