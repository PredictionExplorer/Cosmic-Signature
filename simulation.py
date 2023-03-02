class Simulation:

    def __init__(self):
        self.amount = 10
        self.bid = self.amount / 2000
        self.price_increase = 1.01
        self.time_extra = 1
        self.time_increase = 1.0001

    def simulate_time(self):
        num_bids = 0
        num_hours = 0
        num_days = 0
        print_target = 365
        while num_days < 36:
            num_bids += 1
            num_hours += self.time_extra
            self.time_extra *= self.time_increase
            num_days = num_hours / 24
            if num_days > print_target:
                print("num bids", num_bids, "years", num_days / 365, "time extra", time_extra)
                print_target += 365

    def simulate_bids(self, num_bids):
        for num_bids in range(num_bids):
            self.amount += self.bid
            self.bid *= self.price_increase
            prize = self.amount / 2
            ratio = self.bid / prize
            days = num_bids // 24

            print(f"days {days} num bids {num_bids:} bid size {self.bid:.2f} prize: {prize:.2f} ratio: {ratio:.2f}")
            if self.bid > 1:
                self.amount -= prize
                self.bid = self.amount / 2000

s = Simulation()
s.simulate_bids(2000)
