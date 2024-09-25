import random

class BidProcessor:
    def __init__(self):
        self._prev_bid_time = None
        self._prev_bid_name = None

        self._endurance_champion = None
        self._chrono_warrior = None

        self._prev_endurance_champion = None
        self._prev_prev_endurance_length = None

        self._game_ended = False
        self._game_end_time = None

    def bid(self, name, time):
        if self._game_ended:
            raise Exception("Cannot accept new bids after the game has ended.")

        if self._prev_bid_time is None:
            # First bid
            self._prev_bid_time = time
            self._prev_bid_name = name
            return

        # Calculate endurance length of previous bid
        endurance_length = time - self._prev_bid_time

        # Update endurance champion if necessary
        if (self._endurance_champion is None) or (endurance_length > self._endurance_champion['endurance_length']):
            # Before updating, handle chrono warrior for the previous endurance champion
            self._update_chrono_warrior()

            # Update previous endurance length
            self._prev_prev_endurance_length = self._endurance_champion['endurance_length'] if self._endurance_champion else None

            # Update previous endurance champion
            self._prev_endurance_champion = self._endurance_champion

            # Set new endurance champion
            self._endurance_champion = {
                'endurance_start_time': self._prev_bid_time,
                'endurance_length': endurance_length,
                'name': self._prev_bid_name
            }

        # Update previous bid
        self._prev_bid_time = time
        self._prev_bid_name = name

    def end_game(self, game_end_time):
        if self._game_ended:
            raise Exception("Game has already ended.")

        self._game_ended = True
        self._game_end_time = game_end_time

        if self._prev_bid_time is None:
            # No bids
            return

        # Calculate endurance length of last bid
        endurance_length = game_end_time - self._prev_bid_time

        # Update endurance champion if necessary
        if (self._endurance_champion is None) or (endurance_length > self._endurance_champion['endurance_length']):
            # Before updating, handle chrono warrior for the previous endurance champion
            self._update_chrono_warrior(final=True)

            # Update previous endurance length
            self._prev_prev_endurance_length = self._endurance_champion['endurance_length'] if self._endurance_champion else None

            # Update previous endurance champion
            self._prev_endurance_champion = self._endurance_champion

            # Set new endurance champion
            self._endurance_champion = {
                'name': self._prev_bid_name,
                'endurance_start_time': self._prev_bid_time,
                'endurance_length': endurance_length
            }

            # Handle chrono warrior for the last endurance champion
            self._update_chrono_warrior(final=True)
        else:
            # Finalize the chrono warrior calculation
            self._update_chrono_warrior(final=True)

    def _update_chrono_warrior(self, final=False):
        # If there's no previous endurance champion, use the current one
        if self._prev_endurance_champion is None and self._endurance_champion is not None:
            # Only one endurance champion so far
            ec = self._endurance_champion

            # Compute chrono_start_time
            chrono_start_time = ec['endurance_start_time']

            # Compute chrono_end_time
            chrono_end_time = self._game_end_time if final else self._prev_bid_time + ec['endurance_length']

            # Compute chrono_length
            chrono_length = chrono_end_time - chrono_start_time

            # Update chrono warrior
            self._chrono_warrior = {
                'name': ec['name'],
                'chrono_start_time': chrono_start_time,
                'chrono_end_time': chrono_end_time,
                'chrono_length': chrono_length
            }
        elif self._prev_endurance_champion is not None:
            # Compute chrono_start_time
            if self._prev_prev_endurance_length is None:
                # First endurance champion
                chrono_start_time = self._prev_endurance_champion['endurance_start_time']
            else:
                chrono_start_time = self._prev_endurance_champion['endurance_start_time'] + self._prev_prev_endurance_length

            # Compute chrono_end_time
            chrono_end_time = self._game_end_time if final else self._prev_bid_time + self._prev_endurance_champion['endurance_length']

            # Compute chrono_length
            chrono_length = chrono_end_time - chrono_start_time

            # Update chrono warrior if necessary
            if (self._chrono_warrior is None) or (chrono_length > self._chrono_warrior['chrono_length']):
                self._chrono_warrior = {
                    'name': self._prev_endurance_champion['name'],
                    'chrono_start_time': chrono_start_time,
                    'chrono_end_time': chrono_end_time,
                    'chrono_length': chrono_length
                }

    def get_endurance_champion(self):
        if not self._game_ended:
            raise Exception("Game has not ended yet.")
        return self._endurance_champion.copy() if self._endurance_champion else None

    def get_chrono_warrior(self):
        if not self._game_ended:
            raise Exception("Game has not ended yet.")
        return self._chrono_warrior.copy() if self._chrono_warrior else None

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
    TIME_RANGE = 10
    NUM_BIDS = 3
    for _ in range(10):
        bid_times = []
        cur_time = random.randint(1, TIME_RANGE)
        for i in range(NUM_BIDS):
            cur_time += random.randint(1, TIME_RANGE)
            bid_times.append((cur_time, chr(ord('a') + i)))
        game_end_time = cur_time + random.randint(1, TIME_RANGE)
        print(bid_times, game_end_time)

        two_pass_result = endurance_chrono(bid_times, game_end_time)
        stream_result = stream(bid_times, game_end_time)
        print(two_pass_result)
        print(stream_result)
        assert(two_pass_result == stream_result)

main()
