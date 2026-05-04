import socketio
from fastapi import FastAPI
from typing import List, Optional
from poker_logic import (
    Card, PokerAI, OpponentModel, get_full_deck,
    get_best_hand, format_table_state, display_cards_ascii
)
import random
import asyncio

# ================= SETUP =================
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
app = FastAPI()
app_asgi = socketio.ASGIApp(sio, app)

SMALL_BLIND = 10
BIG_BLIND = 20
ANTE_AMOUNT = 10
MAX_PLAYERS = 4
STARTING_CHIPS = 1000


# ================= PLAYER =================
class Player:
    def __init__(self, sid, name, chips=STARTING_CHIPS, is_ai=False):
        self.sid = sid
        self.name = name
        self.chips = chips
        self.hand: List[Card] = []
        self.folded = False
        self.all_in = False
        self.current_bet = 0
        self.total_bet_in_hand = 0
        self.is_ai = is_ai
        self.is_connected = True
        self.last_action = ""
        self.win_probability = None

        # stats
        self.hands_played = 0
        self.vpip_actions = 0
        self.pfr_actions = 0

    def as_opponent_model(self):
        m = OpponentModel()
        m.hands_played = self.hands_played
        m.vpip_actions = self.vpip_actions
        m.pfr_actions = self.pfr_actions
        return m


# ================= TABLE =================
class Table:
    def __init__(self):
        self.players: List[Player] = []
        self.community_cards: List[Card] = []
        self.deck: List[Card] = []
        self.pot = 0
        self.current_bet = 0
        self.turn_index = 0

        self.round_name = "PRE-FLOP"
        self.round_number = 0

        self.is_game_active = False
        self.current_turn_sid = None

        self.move_event = asyncio.Event()
        self.pending_move = None

        self.logs = []
        self.pre_flop_raise_made = False

    def log(self, msg):
        print("[GAME]", msg)
        self.logs.append(msg)
        if len(self.logs) > 10:
            self.logs.pop(0)

    def reset_hand(self):
        self.players = [p for p in self.players if p.is_connected and p.chips > 0]

        self.community_cards = []
        self.deck = get_full_deck()
        random.shuffle(self.deck)

        self.pot = 0
        self.current_bet = 0
        self.round_name = "PRE-FLOP"
        self.round_number = 0
        self.pre_flop_raise_made = False

        for p in self.players:
            p.hand = [self.deck.pop(), self.deck.pop()]
            p.folded = False
            p.all_in = False
            p.current_bet = 0
            p.total_bet_in_hand = 0
            p.last_action = ""
            p.hands_played += 1

    def broadcast_state(self):
        return {
            "players": [{
                "sid": p.sid,
                "name": p.name,
                "chips": p.chips,
                "folded": p.folded,
                "all_in": p.all_in,
                "current_bet": p.current_bet,
                "is_ai": p.is_ai,
                "ai_hand": [str(c) for c in p.hand] if p.is_ai else None,
                "win_probability": getattr(p, 'win_probability', None),
                "connected": p.is_connected,
                "last_action": p.last_action,
                "is_turn": p.sid == self.current_turn_sid
            } for p in self.players],
            "community": [str(c) for c in self.community_cards],
            "pot": self.pot,
            "current_bet": self.current_bet,
            "round": self.round_name,
            "logs": getattr(self, 'logs', [])
        }


table = Table()
ai_logic = PokerAI()


# ================= SOCKET EVENTS =================
@sio.event
async def connect(sid, environ):
    print("Connected:", sid)


@sio.event
async def join_game(sid, data):
    if len(table.players) >= MAX_PLAYERS:
        return

    name = data.get("name", "Player")
    p = Player(sid, name)
    table.players.append(p)

    if not any(x.is_ai for x in table.players):
        table.players.append(Player("AI", "AI_Bot", is_ai=True))

    await sio.emit("table_state", table.broadcast_state())

    if len(table.players) >= 2 and not table.is_game_active:
        table.is_game_active = True
        asyncio.create_task(game_loop())


@sio.event
async def player_action(sid, data):
    if table.current_turn_sid == sid:
        table.pending_move = data
        table.move_event.set()


@sio.event
async def disconnect(sid):
    for p in table.players:
        if p.sid == sid:
            p.is_connected = False
            p.folded = True
            if table.current_turn_sid == sid:
                table.pending_move = {"type": "FOLD"}
                table.move_event.set()


# ================= GAME LOOP =================
async def game_loop():
    while True:
        if len(table.players) < 2:
            break

        table.reset_hand()

        # ANTE
        for p in table.players:
            amt = min(p.chips, ANTE_AMOUNT)
            p.chips -= amt
            table.pot += amt

        # BLINDS
        sb = table.players[0]
        bb = table.players[1]

        sb_amt = min(sb.chips, SMALL_BLIND)
        bb_amt = min(bb.chips, BIG_BLIND)

        sb.chips -= sb_amt
        bb.chips -= bb_amt

        sb.current_bet = sb_amt
        bb.current_bet = bb_amt

        table.current_bet = BIG_BLIND
        table.pot += sb_amt + bb_amt

        await deal()

        if not await betting_round():
            await end_hand()
            continue

        await asyncio.sleep(1)
        # FLOP
        table.round_number = 1
        table.community_cards = [table.deck.pop() for _ in range(3)]
        await sio.emit("table_state", table.broadcast_state())

        if not await betting_round():
            await end_hand()
            continue

        await asyncio.sleep(1)
        # TURN
        table.round_number = 2
        table.community_cards.append(table.deck.pop())
        await sio.emit("table_state", table.broadcast_state())

        if not await betting_round():
            await end_hand()
            continue

        # RIVER
        table.round_number = 3
        table.community_cards.append(table.deck.pop())
        await sio.emit("table_state", table.broadcast_state())

        if not await betting_round():
            await end_hand()
            continue

        await asyncio.sleep(1)
        await showdown()


# ================= BETTING =================
async def betting_round():
    if table.round_number != 0:
        table.current_bet = 0
        for p in table.players:
            p.current_bet = 0

    turn = table.turn_index % len(table.players)

    while True:
        active = [p for p in table.players if not p.folded and p.is_connected]
        if len(active) <= 1:
            return False

        p = table.players[turn % len(table.players)]

        if not p.folded and not p.all_in and p.is_connected:
            table.current_turn_sid = p.sid
            await sio.emit("table_state", table.broadcast_state())

            if p.is_ai:
                await asyncio.sleep(1)  # small ai thinking pause
                loop = asyncio.get_running_loop()
                import functools
                action_str, equity = await loop.run_in_executor(
                    None,
                    functools.partial(
                        ai_logic.decide_action,
                        hand=list(p.hand),
                        community=list(table.community_cards),
                        current_bet=table.current_bet,
                        player_bet=p.current_bet,
                        pot=table.pot,
                        chips=p.chips,
                        round_number=table.round_number
                    )
                )
                p.win_probability = equity

                if action_str.startswith("RAISE"):
                    action = {"type": "RAISE", "amount": int(action_str.split()[1])}
                else:
                    action = {"type": action_str}

            else:
                table.move_event.clear()
                try:
                    await asyncio.wait_for(table.move_event.wait(), timeout=15)
                    action = table.pending_move
                except:
                    action = {"type": "FOLD"}

            _, is_raise = await apply_action(p, action)
            await sio.emit("table_state", table.broadcast_state())

            if is_raise:
                turn = 0
                continue

        turn += 1

        all_matched = all(
            pl.folded or pl.all_in or pl.current_bet == table.current_bet
            for pl in table.players
        )

        if all_matched and turn >= len(table.players):
            break

    table.turn_index = turn
    return True


async def apply_action(player, action):
    atype = action.get("type", "FOLD").upper()
    call_amt = table.current_bet - player.current_bet

    if atype == "CHECK" and call_amt > 0:
        atype = "CALL"

    if atype == "FOLD":
        player.folded = True
        player.last_action = "Fold"

    elif atype == "CALL":
        amt = min(call_amt, player.chips)
        player.chips -= amt
        player.current_bet += amt
        table.pot += amt
        player.last_action = "Check" if amt == 0 else "Call"

    elif atype == "RAISE":
        total = action.get("amount", 50)
        put = total - player.current_bet

        if put >= player.chips:
            put = player.chips
            player.all_in = True
            player.last_action = "All-In"
        else:
            player.last_action = f"Raise {total}"

        player.chips -= put
        player.current_bet += put
        table.pot += put

        if player.current_bet > table.current_bet:
            table.current_bet = player.current_bet

        return True, True

    elif atype == "ALL_IN":
        amt = player.chips
        player.chips = 0
        player.current_bet += amt
        table.pot += amt
        player.all_in = True
        player.last_action = "All-In"

        if player.current_bet > table.current_bet:
            table.current_bet = player.current_bet

        return True, True

    return True, False


# ================= HELPERS =================
async def deal():
    for p in table.players:
        if not p.is_ai:
            await sio.emit("your_hand", [str(c) for c in p.hand], room=p.sid)
    await sio.emit("table_state", table.broadcast_state())


async def end_hand():
    winner = next((p for p in table.players if not p.folded), None)
    if winner:
        winner.chips += table.pot
    table.pot = 0
    await sio.emit("table_state", table.broadcast_state())
    await asyncio.sleep(3)


async def showdown():
    active = [p for p in table.players if not p.folded]
    if active:
        results = [(p, get_best_hand(p.hand, table.community_cards)) for p in active]

        best = max(r[1].score for r in results)
        winners = [p for p, r in results if r.score == best]

        split = table.pot // len(winners)
        for w in winners:
            w.chips += split

    table.pot = 0
    await sio.emit("table_state", table.broadcast_state())
    await asyncio.sleep(4)


# ================= RUN =================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app_asgi, host="0.0.0.0", port=8000)