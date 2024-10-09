import random
import json

class BidProcessor:
    def __init__(self):
        self._prev_bid_time = None
        self._prev_bid_name = None

        self._current_endurance_champion = None
        self._previous_endurance_champion = None
        self._previous_endurance_length = None
        self._prev_prev_endurance_length = None

        self._current_chrono_warrior = None
        self._game_end_time = None

    def bid(self, name, time):
        if self._prev_bid_time is None:
            # First bid, initialize previous bid info
            self._prev_bid_time = time
            self._prev_bid_name = name
            return

        # Calculate the endurance length
        endurance_length = time - self._prev_bid_time

        if self._current_endurance_champion is None:
            # First endurance champion
            self._current_endurance_champion = {
                'endurance_start_time': self._prev_bid_time,
                'endurance_length': endurance_length,
                'name': self._prev_bid_name
            }
            self._prev_prev_endurance_length = None  # No previous endurance length
        elif endurance_length > self._current_endurance_champion['endurance_length']:
            # New endurance champion found

            # Update previous previous endurance length
            self._prev_prev_endurance_length = self._previous_endurance_length

            # Update previous endurance champion info
            self._previous_endurance_champion = self._current_endurance_champion.copy()
            self._previous_endurance_length = self._current_endurance_champion['endurance_length']

            # Update current endurance champion
            self._current_endurance_champion = {
                'endurance_start_time': self._prev_bid_time,
                'endurance_length': endurance_length,
                'name': self._prev_bid_name
            }

            # Compute chrono length for previous endurance champion
            self._update_chrono_warrior()
        else:
            # No new endurance champion
            pass

        # Update previous bid info
        self._prev_bid_time = time
        self._prev_bid_name = name

    def _update_chrono_warrior(self):
        if self._previous_endurance_champion is None:
            # There's no previous endurance champion to compute chrono warrior
            return

        # Compute chrono_start_time for the previous endurance champion
        if self._prev_prev_endurance_length is None:
            # Previous endurance champion is the first one
            chrono_start_time = self._previous_endurance_champion['endurance_start_time']
        else:
            chrono_start_time = self._previous_endurance_champion['endurance_start_time'] + self._prev_prev_endurance_length

        # Compute chrono_end_time
        # Since we have a new endurance champion, the chrono_end_time is calculated based on the current endurance champion's start time
        chrono_end_time = self._current_endurance_champion['endurance_start_time'] + self._previous_endurance_champion['endurance_length']

        # Compute chrono_length
        chrono_length = chrono_end_time - chrono_start_time

        # Update chrono warrior if necessary
        if (self._current_chrono_warrior is None) or (chrono_length > self._current_chrono_warrior['chrono_length']):
            self._current_chrono_warrior = {
                'name': self._previous_endurance_champion['name'],
                'chrono_start_time': chrono_start_time,
                'chrono_end_time': chrono_end_time,
                'chrono_length': chrono_length
            }

    def end_game(self, game_end_time):
        self._game_end_time = game_end_time

        # Calculate endurance length for the last bid
        endurance_length = game_end_time - self._prev_bid_time

        if self._current_endurance_champion is None:
            # **Case 1**: Only one bid in the game
            # The last bid is the first and only endurance champion and chrono warrior
            self._current_endurance_champion = {
                'name': self._prev_bid_name,
                'endurance_start_time': self._prev_bid_time,
                'endurance_length': endurance_length
            }
            self._current_chrono_warrior = {
                'name': self._prev_bid_name,
                'chrono_start_time': self._prev_bid_time,
                'chrono_end_time': game_end_time,
                'chrono_length': endurance_length
            }
        elif endurance_length > self._current_endurance_champion['endurance_length']:
            # **Case 2**: Last bid becomes the new endurance champion
            # Save previous endurance champion
            self._prev_prev_endurance_length = self._previous_endurance_length
            self._previous_endurance_length = self._current_endurance_champion['endurance_length']
            self._previous_endurance_champion = self._current_endurance_champion.copy()

            # Update current endurance champion
            self._current_endurance_champion = {
                'name': self._prev_bid_name,
                'endurance_start_time': self._prev_bid_time,
                'endurance_length': endurance_length
            }

            # Compute chrono warriors for previous and current endurance champions

            # For previous endurance champion
            if self._prev_prev_endurance_length is None:
                chrono_start_time_prev = self._previous_endurance_champion['endurance_start_time']
            else:
                chrono_start_time_prev = self._previous_endurance_champion['endurance_start_time'] + self._prev_prev_endurance_length

            chrono_end_time_prev = self._current_endurance_champion['endurance_start_time'] + self._previous_endurance_champion['endurance_length']
            chrono_length_prev = chrono_end_time_prev - chrono_start_time_prev

            # For current endurance champion
            chrono_start_time_curr = self._current_endurance_champion['endurance_start_time'] + self._previous_endurance_champion['endurance_length']
            chrono_end_time_curr = game_end_time
            chrono_length_curr = chrono_end_time_curr - chrono_start_time_curr

            # Update chrono warrior
            potential_chrono_warriors = [
                self._current_chrono_warrior,
                {
                    'name': self._previous_endurance_champion['name'],
                    'chrono_start_time': chrono_start_time_prev,
                    'chrono_end_time': chrono_end_time_prev,
                    'chrono_length': chrono_length_prev
                },
                {
                    'name': self._current_endurance_champion['name'],
                    'chrono_start_time': chrono_start_time_curr,
                    'chrono_end_time': chrono_end_time_curr,
                    'chrono_length': chrono_length_curr
                }
            ]
            self._current_chrono_warrior = max(
                (cw for cw in potential_chrono_warriors if cw is not None),
                key=lambda cw: cw['chrono_length']
            )
        else:
            # **Case 3**: Last bid does not become a new endurance champion
            # Compute chrono length for current endurance champion
            if self._previous_endurance_length is None:
                # Is this possible?
                chrono_start_time = self._current_endurance_champion['endurance_start_time']
            else:
                chrono_start_time = self._current_endurance_champion['endurance_start_time'] + self._previous_endurance_length

            endurance_end_time = self._current_endurance_champion['endurance_start_time'] + self._current_endurance_champion['endurance_length']
            chrono_end_time = game_end_time
            chrono_length = chrono_end_time - chrono_start_time

            # Update chrono warrior if necessary
            if (self._current_chrono_warrior is None) or (chrono_length > self._current_chrono_warrior['chrono_length']):
                self._current_chrono_warrior = {
                    'name': self._current_endurance_champion['name'],
                    'chrono_start_time': chrono_start_time,
                    'chrono_end_time': chrono_end_time,
                    'chrono_length': chrono_length
                }
            else:
                # Extend current chrono warrior's end time to game end time if necessary
                if False and self._current_chrono_warrior['chrono_end_time'] < game_end_time:
                    self._current_chrono_warrior['chrono_end_time'] = game_end_time
                    self._current_chrono_warrior['chrono_length'] = game_end_time - self._current_chrono_warrior['chrono_start_time']

    def get_endurance_champion(self):
        assert self._game_end_time is not None, "Game has not ended yet."
        return self._current_endurance_champion.copy()

    def get_chrono_warrior(self):
        assert self._game_end_time is not None, "Game has not ended yet."
        return self._current_chrono_warrior.copy()



def endurance_chrono(bid_times, game_end_time):
    endurance_champions = []
    num_bids = len(bid_times)

    for i, (bid_time, name) in enumerate(bid_times):
        if i == 0:
            continue
        prev_bid_time, prev_name = bid_times[i - 1]
        endurance_length = bid_time - prev_bid_time

        if len(endurance_champions) == 0 or endurance_length > endurance_champions[-1]["endurance_length"]:
            endurance_champions.append({
                "endurance_start_time": prev_bid_time,
                "endurance_length": endurance_length,
                "name": prev_name
            })

    # Handle the last bid's duration to game_end_time
    last_bid_time, last_bidder = bid_times[-1]
    last_endurance_length = game_end_time - last_bid_time

    if len(endurance_champions) == 0 or last_endurance_length > endurance_champions[-1]["endurance_length"]:
        endurance_champions.append({
            "endurance_start_time": last_bid_time,
            "endurance_length": last_endurance_length,
            "name": last_bidder
        })

    chrono_warriors = []
    for i in range(len(endurance_champions)):
        ec = endurance_champions[i]
        res = {}
        res["name"] = ec["name"]

        # Calculate chrono_start_time
        if i == 0:
            res["chrono_start_time"] = ec["endurance_start_time"]
        else:
            res["chrono_start_time"] = ec["endurance_start_time"] + endurance_champions[i - 1]["endurance_length"]

        # Calculate chrono_end_time
        if i < len(endurance_champions) - 1:
            res["chrono_end_time"] = endurance_champions[i + 1]["endurance_start_time"] + ec["endurance_length"]
        else:
            # Use game_end_time for the last endurance champion
            res["chrono_end_time"] = game_end_time
        res["chrono_length"] = res["chrono_end_time"] - res["chrono_start_time"]

        if len(chrono_warriors) == 0 or res["chrono_length"] > chrono_warriors[-1]["chrono_length"]:
            chrono_warriors.append(res)

    return endurance_champions[-1], chrono_warriors[-1]

def stream(bid_times, game_end_time):
    bp = BidProcessor()
    for bid_time, name in bid_times:
        bp.bid(name, bid_time)
    bp.end_game(game_end_time)
    return bp.get_endurance_champion(), bp.get_chrono_warrior()

def main():
    test_cases = []
    # TIME_RANGE = 1000
    TIME_RANGE = 20
    # MAX_NUM_BIDS = 100
    MAX_NUM_BIDS = 20
    NUM_TEST_CASES = 10000
    for _ in range(NUM_TEST_CASES):
        test_case = {}
        bid_times = []
        cur_time = random.randint(1, TIME_RANGE)
        # num_bids = random.randint(1, MAX_NUM_BIDS)
        num_bids = random.randint(1, random.randint(1, MAX_NUM_BIDS))
        for i in range(num_bids):
            # cur_time += random.randint(1, TIME_RANGE)
            cur_time += random.randint(0, random.randint(0, TIME_RANGE))
            # bid_times.append((cur_time, chr(ord('a') + random.randint(0, 25))))
            bid_times.append((cur_time, chr(ord('a') + random.randint(0, random.randint(0, 25)))))
        # game_end_time = cur_time + random.randint(1, TIME_RANGE)
        game_end_time = cur_time + random.randint(0, random.randint(0, TIME_RANGE))
        test_case["bid_times"] = bid_times
        test_case["game_end_time"] = game_end_time

        two_pass_result = endurance_chrono(bid_times, game_end_time)
        stream_result = stream(bid_times, game_end_time)
        test_case["result"] = {"endurance_champion": stream_result[0], "chrono_warrior": stream_result[1]}
        test_cases.append(test_case)
        if two_pass_result != stream_result:
            print(bid_times, game_end_time)
            print(two_pass_result)
            print(stream_result)
            break
    else:
        print("All tests passed")

    with open("endurance_test_cases.json", "w") as f:
        json.dump(test_cases, f, indent=4)

main()
