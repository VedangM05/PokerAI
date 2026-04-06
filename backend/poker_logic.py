import random
import itertools
from typing import List, Tuple, Dict, Optional, Set
from dataclasses import dataclass, field

# Constants
RANK_VALUES = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14
}
VALUE_TO_RANK = {v: k for k, v in RANK_VALUES.items()}

@dataclass(frozen=True)
class Card:
    rank: str
    suit: str

    def __str__(self):
        return f"{self.rank}{self.suit[0].upper()}"

    def value(self):
        return RANK_VALUES[self.rank]

@dataclass
class HandResult:
    score: int
    name: str
    kickers: List[int] = field(default_factory=list)

    def __gt__(self, other):
        if self.score != other.score:
            return self.score > other.score
        return self.kickers > other.kickers

    def __eq__(self, other):
        return self.score == other.score and self.kickers == other.kickers

def get_full_deck() -> List[Card]:
    suits = ['H', 'D', 'C', 'S']
    ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
    return [Card(r, s) for s in suits for r in ranks]

def evaluate_5_card_hand(cards: List[Card]) -> HandResult:
    values = sorted([c.value() for c in cards], reverse=True)
    suits = [c.suit for c in cards]
    is_flush = len(set(suits)) == 1
    
    # Check for straight
    is_straight = False
    unique_values = sorted(list(set(values)), reverse=True)
    if len(unique_values) == 5:
        if unique_values[0] - unique_values[4] == 4:
            is_straight = True
        elif unique_values == [14, 5, 4, 3, 2]: # A-5 straight
            is_straight = True
            values = [5, 4, 3, 2, 1]

    counts = {}
    for v in values:
        counts[v] = counts.get(v, 0) + 1
    
    freq = sorted([(cnt, val) for val, cnt in counts.items()], reverse=True)
    
    # Royal Flush / Straight Flush
    if is_flush and is_straight:
        if values[0] == 14:
            return HandResult(9, "Royal Flush", values)
        return HandResult(8, f"Straight Flush ({VALUE_TO_RANK[values[0]]} High)", values)
    
    # Four of a Kind
    if freq[0][0] == 4:
        return HandResult(7, f"Four of a Kind ({VALUE_TO_RANK[freq[0][1]]}s)", [freq[0][1], freq[1][1]])
    
    # Full House
    if freq[0][0] == 3 and freq[1][0] == 2:
        return HandResult(6, f"Full House ({VALUE_TO_RANK[freq[0][1]]}s full of {VALUE_TO_RANK[freq[1][1]]}s)", [freq[0][1], freq[1][1]])
    
    # Flush
    if is_flush:
        return HandResult(5, f"Flush ({VALUE_TO_RANK[values[0]]} High)", values)
    
    # Straight
    if is_straight:
        return HandResult(4, f"Straight ({VALUE_TO_RANK[values[0]]} High)", values)
    
    # Three of a Kind
    if freq[0][0] == 3:
        kickers = [f[1] for f in freq[1:]]
        return HandResult(3, f"Three of a Kind ({VALUE_TO_RANK[freq[0][1]]}s)", [freq[0][1]] + sorted(kickers, reverse=True))
    
    # Two Pair
    if freq[0][0] == 2 and freq[1][0] == 2:
        pairs = sorted([freq[0][1], freq[1][1]], reverse=True)
        kicker = freq[2][1]
        return HandResult(2, f"Two Pair ({VALUE_TO_RANK[pairs[0]]}s and {VALUE_TO_RANK[pairs[1]]}s)", pairs + [kicker])
    
    # Pair
    if freq[0][0] == 2:
        pair_val = freq[0][1]
        kickers = sorted([f[1] for f in freq[1:]], reverse=True)
        return HandResult(1, f"Pair of {VALUE_TO_RANK[pair_val]}s", [pair_val] + kickers)
    
    # High Card
    return HandResult(0, f"High Card {VALUE_TO_RANK[values[0]]}", values)

def get_best_hand(hole_cards: List[Card], community_cards: List[Card]) -> HandResult:
    all_cards = hole_cards + community_cards
    if len(all_cards) < 5:
        # Fallback for pre-flop or flop with fewer than 5 cards (e.g., during simulation)
        # We'll just return a placeholder or do something simple.
        # But for Monte Carlo, we always extend to 5.
        return evaluate_5_card_hand(all_cards) if len(all_cards) == 5 else HandResult(-1, "Incomplete")
    
    best_hand = HandResult(-2, "None")
    for combo in itertools.combinations(all_cards, 5):
        current_hand = evaluate_5_card_hand(list(combo))
        if current_hand > best_hand:
            best_hand = current_hand
    return best_hand

def run_monte_carlo(ai_hand: List[Card], community_cards: List[Card], opponents_count: int = 1, iterations: int = 1000) -> float:
    wins = 0
    ties = 0
    
    deck = get_full_deck()
    # Remove known cards
    known_cards = ai_hand + community_cards
    deck = [c for c in deck if c not in known_cards]
    
    for _ in range(iterations):
        random.shuffle(deck)
        sim_community = list(community_cards)
        cards_to_deal = 5 - len(sim_community)
        
        sim_deck = list(deck)
        sim_community.extend([sim_deck.pop() for _ in range(cards_to_deal)])
        
        ai_best = get_best_hand(ai_hand, sim_community)
        
        is_win = True
        is_tie = False
        
        for _ in range(opponents_count):
            opp_hand = [sim_deck.pop(), sim_deck.pop()]
            opp_best = get_best_hand(opp_hand, sim_community)
            
            if opp_best > ai_best:
                is_win = False
                break
            elif opp_best == ai_best:
                is_tie = True
        
        if is_win:
            if is_tie:
                ties += 1
            else:
                wins += 1
                
    return (wins + (ties / 2.0)) / iterations

class PokerAI:
    def __init__(self, name="AI_Bot"):
        self.name = name
        self.vpip_actions = 0
        self.pfr_actions = 0
        self.hands_played = 0

    def decide_action(self, hand: List[Card], community: List[Card], current_bet: int, player_bet: int, pot: int, chips: int) -> str:
        call_amt = current_bet - player_bet
        pot_odds = call_amt / (pot + call_amt) if (pot + call_amt) > 0 else 0
        
        # Reduced iterations for web responsiveness, can be increased
        equity = run_monte_carlo(hand, community, iterations=500)
        
        # Simple threshold logic mimicking the C++ code
        if call_amt == 0:
            if equity > 0.6:
                raise_amt = max(50, pot // 2)
                raise_amt = min(raise_amt, chips)
                return f"RAISE {raise_amt}"
            return "CHECK"
        else:
            if equity > pot_odds:
                if equity > 0.85:
                    raise_amt = max(50, call_amt * 2 + pot)
                    raise_amt = min(raise_amt, chips)
                    return f"RAISE {raise_amt}"
                return "CALL"
            return "FOLD"
