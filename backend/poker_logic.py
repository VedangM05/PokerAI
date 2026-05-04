import random
import itertools
from collections import Counter
from typing import List, Tuple, Dict, Optional, Set
from dataclasses import dataclass, field
import time

# ===== Constants =====
RANK_VALUES = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14
}
VALUE_TO_RANK = {v: k for k, v in RANK_VALUES.items()}

MONTE_CARLO_SIMULATIONS = 2000  # Higher = slower but smarter (matches C++ server)


@dataclass(frozen=True)
class Card:
    rank: str
    suit: str

    def __str__(self):
        """Returns ASCII-safe card string e.g. '7H', 'AS', '10D'"""
        suit_map = {'♥': 'H', '♦': 'D', '♣': 'C', '♠': 'S'}
        ascii_suit = suit_map.get(self.suit, self.suit)
        return f"{self.rank}{ascii_suit}"

    def value(self) -> int:
        return RANK_VALUES[self.rank]


@dataclass
class HandResult:
    """
    Numeric rank compatible with the C++ server's long long scoring system.
    Uses the same tier multipliers (9e12 down to 0) for direct comparison.
    """
    score: int          # alias: rank in C++ — large integer encoding hand strength
    name: str
    kickers: List[int] = field(default_factory=list)

    def __gt__(self, other: 'HandResult') -> bool:
        if self.score != other.score:
            return self.score > other.score
        return self.kickers > other.kickers

    def __eq__(self, other: 'HandResult') -> bool:
        return self.score == other.score and self.kickers == other.kickers

    def __ge__(self, other: 'HandResult') -> bool:
        return self == other or self > other


def get_full_deck() -> List[Card]:
    suits = ['H', 'D', 'C', 'S']
    ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
    return [Card(r, s) for s in suits for r in ranks]


# ===== Kicker Score (matches C++ getKickerScore) =====
def get_kicker_score(kickers: List[int]) -> int:
    """
    Encodes a list of card values into a single integer for comparison,
    using the same base-100 positional scheme as the C++ server.
    """
    score = 0
    multiplier = 100_000_000
    for v in kickers:
        score += v * multiplier
        multiplier //= 100
    return score


def get_rank_name(v: int) -> str:
    names = {14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack', 10: '10'}
    return names.get(v, str(v))


# ===== 5-Card Hand Evaluator (mirrors C++ evaluate5CardHand) =====
def evaluate_5_card_hand(cards: List[Card]) -> HandResult:
    """
    Full 5-card evaluator using the same numeric scoring tiers as the C++ server:
      9e12 = Royal Flush
      8e12 = Straight Flush
      7e12 = Four of a Kind
      6e12 = Full House
      5e12 = Flush
      4e12 = Straight
      3e12 = Three of a Kind
      2e12 = Two Pair
      1e12 = Pair
      <1e12 = High Card (kicker-based)
    """
    if len(cards) != 5:
        return HandResult(0, "Invalid")

    values = sorted([c.value() for c in cards], reverse=True)
    suits = [c.suit for c in cards]

    is_flush = len(set(suits)) == 1

    # Straight check
    is_straight = False
    if len(set(values)) == 5:
        if values[0] - values[4] == 4:
            is_straight = True
        elif values == [14, 5, 4, 3, 2]:  # A-5 wheel straight
            is_straight = True
            values = [5, 4, 3, 2, 1]

    # Royal / Straight Flush
    if is_flush and is_straight:
        if values[0] == 14:
            return HandResult(int(9e12), "a Royal Flush", values)
        return HandResult(
            int(8e12) + values[0],
            f"a Straight Flush ({get_rank_name(values[0])} high)",
            values
        )

    # Count occurrences
    counts: Dict[int, int] = {}
    for v in values:
        counts[v] = counts.get(v, 0) + 1

    foak = 0    # four of a kind rank
    toak = 0    # three of a kind rank
    pairs: List[int] = []
    kickers: List[int] = []

    for rank_val, cnt in counts.items():
        if cnt == 4:
            foak = rank_val
        elif cnt == 3:
            toak = rank_val
        elif cnt == 2:
            pairs.append(rank_val)
        else:
            kickers.append(rank_val)

    pairs.sort(reverse=True)
    kickers.sort(reverse=True)

    # Four of a Kind
    if foak > 0:
        return HandResult(
            int(7e12) + foak * 100 + (kickers[0] if kickers else 0),
            f"Four of a Kind ({get_rank_name(foak)}s)",
            [foak] + kickers
        )

    # Full House
    if toak > 0 and pairs:
        return HandResult(
            int(6e12) + toak * 100 + pairs[0],
            f"a Full House ({get_rank_name(toak)}s full of {get_rank_name(pairs[0])}s)",
            [toak, pairs[0]]
        )

    # Flush
    if is_flush:
        return HandResult(
            int(5e12) + get_kicker_score(values),
            f"a Flush ({get_rank_name(values[0])} high)",
            values
        )

    # Straight
    if is_straight:
        return HandResult(
            int(4e12) + values[0],
            f"a Straight ({get_rank_name(values[0])} high)",
            values
        )

    # Three of a Kind
    if toak > 0:
        return HandResult(
            int(3e12) + toak * 10_000 + (kickers[0] * 100 if len(kickers) > 0 else 0) + (kickers[1] if len(kickers) > 1 else 0),
            f"Three of a Kind ({get_rank_name(toak)}s)",
            [toak] + kickers
        )

    # Two Pair
    if len(pairs) >= 2:
        return HandResult(
            int(2e12) + pairs[0] * 10_000 + pairs[1] * 100 + (kickers[0] if kickers else 0),
            f"Two Pair ({get_rank_name(pairs[0])}s and {get_rank_name(pairs[1])}s)",
            pairs + kickers
        )

    # Pair
    if len(pairs) == 1:
        return HandResult(
            int(1e12) + pairs[0] * 1_000_000
            + (kickers[0] * 10_000 if len(kickers) > 0 else 0)
            + (kickers[1] * 100 if len(kickers) > 1 else 0)
            + (kickers[2] if len(kickers) > 2 else 0),
            f"a Pair of {get_rank_name(pairs[0])}s",
            pairs + kickers
        )

    # High Card
    return HandResult(
        get_kicker_score(values),
        f"High Card {get_rank_name(values[0])}",
        values
    )


# ===== Best Hand from 7 Cards (mirrors C++ getFullPlayerHand) =====
def get_best_hand(hole_cards: List[Card], community_cards: List[Card]) -> HandResult:
    """
    Tries all C(n,5) combinations of available cards and returns the best HandResult.
    Falls back gracefully when fewer than 5 cards are available (pre-flop/flop simulation).
    """
    all_cards = hole_cards + community_cards

    if len(all_cards) < 5:
        # Fallback: pre-flop estimation using hole card pair/high card (matches C++ fallback)
        if not hole_cards:
            return HandResult(0, "Nothing")
        v1 = hole_cards[0].value()
        v2 = hole_cards[1].value() if len(hole_cards) > 1 else 0
        if v1 == v2:
            return HandResult(int(1e12) + v1, f"a Pair of {get_rank_name(v1)}s", [v1])
        best_val = max(v1, v2)
        return HandResult(best_val, f"High Card {get_rank_name(best_val)}", [best_val])

    best = HandResult(-1, "Nothing")
    for combo in itertools.combinations(all_cards, 5):
        result = evaluate_5_card_hand(list(combo))
        if result > best:
            best = result
    return best


# ===== Monte Carlo Simulator (mirrors C++ runMonteCarlo, MONTE_CARLO_SIMULATIONS=2000) =====
def run_monte_carlo(
    ai_hand: List[Card],
    community_cards: List[Card],
    opponents_count: int = 1,
    iterations: int = MONTE_CARLO_SIMULATIONS
) -> float:
    """
    Estimates win equity by randomly simulating complete boards and opponent hands.
    Matches the C++ server's approach: 2000 iterations by default, ties count as 0.5 wins.
    """
    wins = 0
    ties = 0

    full_deck = get_full_deck()
    known_cards = set(map(str, ai_hand + community_cards))
    sim_deck = [c for c in full_deck if str(c) not in known_cards]

    for _ in range(iterations):
        random.shuffle(sim_deck)
        sim_community = list(community_cards)
        cards_to_deal = 5 - len(sim_community)

        draw_pile = list(sim_deck)
        # Deal community cards
        for _ in range(cards_to_deal):
            if draw_pile:
                sim_community.append(draw_pile.pop())

        ai_best = get_best_hand(ai_hand, sim_community)

        is_win = True
        is_tie = False

        for _ in range(opponents_count):
            if len(draw_pile) < 2:
                break
            opp_hand = [draw_pile.pop(), draw_pile.pop()]
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

    return (wins + ties / 2.0) / iterations


# ===== Draw Detection (matches C++ AIAction draw detection) =====
def detect_draws(cards: List[Card]) -> Tuple[bool, bool, bool]:
    """
    Returns (has_flush_draw, has_oesd, has_gutshot).
    Uses the same set-based consecutive-value scanning as the C++ server.
    """
    suits = [c.suit for c in cards]
    suit_counts = Counter(suits)
    has_flush_draw = any(cnt >= 4 for cnt in suit_counts.values())

    unique_vals: Set[int] = set(c.value() for c in cards)
    if 14 in unique_vals:
        unique_vals.add(1)   # Ace-low straight consideration

    has_oesd = False
    has_gutshot = False

    # Open-Ended Straight Draw: 4 consecutive values spanning exactly 3 gaps
    for v in unique_vals:
        if v + 1 in unique_vals and v + 2 in unique_vals and v + 3 in unique_vals:
            has_oesd = True
            break

    # Gutshot: 4 values spanning 4 gaps (one gap missing inside)
    if not has_oesd:
        for v in unique_vals:
            # e.g., 5,6,_,8,9 patterns
            if ((v + 1 in unique_vals and v + 3 in unique_vals and v + 4 in unique_vals) or
                    (v == 1 and 2 in unique_vals and 3 in unique_vals and 5 in unique_vals) or   # A,2,3,_,5
                    (v == 11 and 12 in unique_vals and 13 in unique_vals and 14 in unique_vals)):  # J,Q,K,A
                has_gutshot = True
                break

    return has_flush_draw, has_oesd, has_gutshot


# ===== Opponent Model (new — ported from C++ AIAction opponent profiling) =====
class OpponentModel:
    """
    Tracks VPIP (Voluntarily Put money In Pot) and PFR (Pre-Flop Raise) statistics
    to classify an opponent as tight/loose and passive/aggressive.
    Matches the C++ server's per-player handsPlayed / vpipActions / pfrActions counters.
    """
    def __init__(self):
        self.hands_played: int = 0
        self.vpip_actions: int = 0
        self.pfr_actions: int = 0

    def record_hand(self):
        self.hands_played += 1

    def record_vpip(self):
        self.vpip_actions += 1

    def record_pfr(self):
        self.pfr_actions += 1

    @property
    def vpip(self) -> float:
        return self.vpip_actions / self.hands_played if self.hands_played > 0 else 0.0

    @property
    def pfr(self) -> float:
        return self.pfr_actions / self.hands_played if self.hands_played > 0 else 0.0

    @property
    def is_tight(self) -> bool:
        return self.hands_played > 10 and self.vpip < 0.20

    @property
    def is_aggressive(self) -> bool:
        return self.hands_played > 10 and self.pfr > 0.15


# ===== AI Logic (full port of C++ AIAction) =====
class PokerAI:
    """
    Hybrid AI combining:
      - Monte Carlo equity estimation
      - Pot-odds calculation
      - Opponent modelling (VPIP / PFR stats)
      - Bluffing (10% on turn/river when checked to)
      - Semi-bluff raising (20% with strong draw facing a bet)
      - Value raising (>85% equity, no strong draw)
      - Draw-adjusted required equity thresholds
    All logic is a direct port of C++ AIAction().
    """
    def __init__(self, name: str = "AI_Bot"):
        self.name = name
        self.hands_played: int = 0
        self.vpip_actions: int = 0
        self.pfr_actions: int = 0
        # Track per-opponent models keyed by player name
        self.opponent_models: Dict[str, OpponentModel] = {}

    def get_or_create_opponent_model(self, opponent_name: str) -> OpponentModel:
        if opponent_name not in self.opponent_models:
            self.opponent_models[opponent_name] = OpponentModel()
        return self.opponent_models[opponent_name]

    def _ai_thinking_animation(self):
        """Console thinking animation matching C++ server output."""
        import sys
        print("AI_Bot is thinking    ", end='', flush=True)
        for _ in range(3):
            for dots in ['.  ', '.. ', '...']:
                print('\b\b\b' + dots, end='', flush=True)
                time.sleep(0.2)
        print('\r' + ' ' * 30 + '\r', end='', flush=True)

    def decide_action(
        self,
        hand: List[Card],
        community: List[Card],
        current_bet: int,
        player_bet: int,
        pot: int,
        chips: int,
        round_number: int = 1,
        opponent_model: Optional[OpponentModel] = None,
        show_thinking: bool = False
    ) -> Tuple[str, float]:
        """
        Returns one of: 'FOLD', 'CHECK', 'CALL', 'RAISE <amount>', 'ALL_IN'

        Parameters
        ----------
        round_number : int
            0=Pre-Flop, 1=Flop, 2=Turn, 3=River (same as C++ bettingRound call order)
        opponent_model : OpponentModel, optional
            Stats-based profile of the human opponent. If None or <10 hands, profiling
            is skipped (same guard as C++ `if opponent->handsPlayed > 10`).
        show_thinking : bool
            Print the console thinking animation (for server/CLI mode).
        """
        call_amt = current_bet - player_bet
        total_available = chips + player_bet

        # --- Opponent Profiling (mirrors C++ AIAction) ---
        opp_is_tight = False
        opp_is_aggressive = False
        if opponent_model and opponent_model.hands_played > 10:
            opp_is_tight = opponent_model.is_tight
            opp_is_aggressive = opponent_model.is_aggressive

        pot_odds = call_amt / (pot + call_amt) if (pot + call_amt) > 0 else 0.0

        # --- Thinking Animation ---
        if show_thinking:
            self._ai_thinking_animation()

        # --- Equity via Monte Carlo ---
        equity = run_monte_carlo(hand, community)

        # --- Draw Detection ---
        all_cards = hand + community
        has_flush_draw, has_oesd, has_gutshot = detect_draws(all_cards)
        strong_draw = has_flush_draw or has_oesd

        # --- Debug Output (matches C++ debug prints) ---
        print(f"AI Debug: E={equity * 100:.1f}%|Need={pot_odds * 100:.1f}%", end='')

        # --- Required Equity Adjustment (opponent model + draw) ---
        required_equity = pot_odds
        if call_amt > 0:
            if opp_is_tight and not opp_is_aggressive:
                required_equity *= 1.25   # Tighter fold threshold vs tight-passive
            elif not opp_is_tight and opp_is_aggressive:
                required_equity *= 0.85   # More willing to call vs loose-aggressive

        if strong_draw and call_amt > 0 and call_amt < pot / 2.0:
            required_equity *= 0.75
        elif has_gutshot and call_amt > 0 and call_amt < pot / 3.0:
            required_equity *= 0.90

        print(f"|AdjNeed={required_equity * 100:.1f}%")
        if opponent_model and opponent_model.hands_played > 10:
            print(f"AI Debug: Opp VPIP={opponent_model.vpip * 100:.1f}% "
                  f"PFR={opponent_model.pfr * 100:.1f}% "
                  f"(T={opp_is_tight},A={opp_is_aggressive})")
        if strong_draw:
            print("AI Debug: Strong Draw.")
        elif has_gutshot:
            print("AI Debug: Gutshot.")

        rand = random.randint(1, 100)

        # ===== CASE 1: No bet faced (call_amt == 0) =====
        if call_amt == 0:
            # Bluff: 10% on turn or river when checked to (round 2 or 3)
            if round_number >= 2 and rand <= 10:
                b_amt = max(50, pot // 2)
                b_amt = min(b_amt, chips)
                if b_amt <= 0:
                    return "CHECK", equity
                print("AI Debug: Bluff bet.")
                if b_amt >= chips:
                    return "ALL_IN", equity
                return f"RAISE {b_amt}", equity

            # Value bet
            if equity > 0.6 or strong_draw:
                b_amt = max(50, pot // 2)
                b_amt = min(b_amt, chips)
                if b_amt <= 0:
                    return "CHECK", equity
                if b_amt >= chips:
                    return "ALL_IN", equity
                return f"RAISE {b_amt}", equity

            return "CHECK", equity

        # ===== CASE 2: Facing a bet =====
        else:
            if equity > required_equity:
                # Semi-bluff raise: 20% chance with strong draw
                if strong_draw and rand <= 20:
                    r_amt = call_amt * 2 + pot
                    r_amt = min(r_amt, chips)
                    if r_amt <= call_amt:
                        return "CALL", equity
                    print("AI Debug: Semi-bluff raise.")
                    if r_amt >= chips:
                        return "ALL_IN", equity
                    return f"RAISE {r_amt}", equity

                # Value raise: high equity, no strong draw
                if equity > 0.85 and not strong_draw:
                    r_amt = call_amt * 2 + pot
                    r_amt = min(r_amt, chips)
                    if r_amt <= call_amt:
                        return "CALL", equity
                    if r_amt >= chips:
                        return "ALL_IN", equity
                    return f"RAISE {r_amt}", equity

                if call_amt >= chips:
                    return "ALL_IN", equity
                return "CALL", equity

            else:
                print(f"AI Debug: Folding. E {equity * 100:.1f}% < Req {required_equity * 100:.1f}%.")
                return "FOLD", equity


# ===== Table Display Helper (ported from C++ showTable / displayCards) =====
def display_cards_ascii(cards: List[Card]) -> str:
    """
    Renders cards as ASCII art boxes. Matches the C++ server's displayCards output
    (without ANSI colours, which belong in the client).
    """
    if not cards:
        return ""
    lines = [""] * 5
    for card in cards:
        rank = card.rank
        suit_map = {'H': '♥', 'D': '♦', 'C': '♣', 'S': '♠'}
        suit_display = suit_map.get(card.suit, card.suit)
        pad = "    " if len(rank) == 1 else "   "
        lines[0] += "┌─────┐ "
        lines[1] += f"│{rank}{pad}│ "
        lines[2] += f"│  {suit_display}  │ "
        lines[3] += f"│{pad}{rank}│ "
        lines[4] += "└─────┘ "
    return "\n".join(lines) + "\n"


def format_table_state(players_data: list, pot: int, community_cards: List[Card]) -> str:
    """
    Renders the player table in the same box-drawing format as the C++ server's showTable().
    """
    lines = [
        "\n┌───────────────────┬──────────────┬──────────┐",
        "│ Player            │ Chips        │ Status   │",
        "├───────────────────┼──────────────┼──────────┤",
    ]
    for p in players_data:
        name = p.get('name', '?')[:17]
        chips = p.get('chips', 0)
        if not p.get('connected', True):
            status = "OFFLINE"
        elif p.get('folded', False):
            status = "FOLDED"
        elif p.get('all_in', False):
            status = "ALL-IN"
        else:
            status = "ACTIVE"
        lines.append(f"│ {name:<17} │ {chips:<12} │ {status:<8} │")
    lines.append("└───────────────────┴──────────────┴──────────┘")
    lines.append(f"Pot: {pot}")
    return "\n".join(lines)