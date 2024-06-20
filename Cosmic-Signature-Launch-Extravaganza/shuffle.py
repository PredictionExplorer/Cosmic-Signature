import csv
import hashlib
import sys

def random_generator(init_seed):
    '''Generate random bits.'''
    if init_seed.startswith('0x'):
        init_seed = init_seed[2:]
    init_seed = bytes.fromhex(init_seed)

    seed = init_seed

    while True:
        m = hashlib.sha3_256()
        m.update(init_seed)
        m.update(seed)
        seed = m.digest()
        for b in seed:
            for i in range(8):
                yield (b >> i) & 1

def random_int(largest, gen):
    '''Generate a random integer in the range [0, largest).'''
    num = 0
    for _ in range(256):
        num = (num << 1) + next(gen)
    return num % largest

def fisher_yates_shuffle(arr, seed):
    '''Shuffle an array using the Fisher-Yates algorithm and custom random generator.'''
    n = len(arr)
    bit_gen = random_generator(seed)

    for i in range(n-1, 0, -1):
        j = random_int(i + 1, bit_gen)
        arr[i], arr[j] = arr[j], arr[i]

    return arr

def calculate_bonuses(participants, referrers, referral_bonus):
    '''Calculate bonuses based on referrals.'''
    bonus = {participant: 1 for participant in participants}

    for participant, referrer in zip(participants, referrers):
        if referrer:
            bonus[referrer] += referral_bonus  # Referrer gets a bonus
            bonus[participant] += referral_bonus  # Referred person gets a bonus

    return bonus

def read_csv(file_path):
    '''Read participants and referrers from a CSV file.'''
    participants = []
    referrers = []

    with open(file_path, newline='') as csvfile:
        reader = csv.reader(csvfile)
        next(reader)  # Skip header row
        for row in reader:
            participants.append(row[0])
            referrers.append(row[1] if len(row) > 1 else None)

    return participants, referrers

def main():
    if len(sys.argv) < 5:
        print("Usage: python script.py <seed> <csv_file> <referral_bonus> <num_winners>")
        sys.exit(1)

    seed = sys.argv[1]
    csv_file = sys.argv[2]
    referral_bonus = float(sys.argv[3])
    num_winners = int(sys.argv[4])

    # Read the CSV file
    participants, referrers = read_csv(csv_file)

    participants_set = set(participants)
    referrers = [referrer if referrer in participants_set else None for referrer in referrers]

    # Calculate bonuses
    bonuses = calculate_bonuses(participants, referrers, referral_bonus)

    # Shuffle the participants
    shuffled_participants = fisher_yates_shuffle(participants, seed)

    for participant in shuffled_participants[:num_winners]:
        print(f"{participant}: {bonuses[participant]}")

if __name__ == "__main__":
    main()
