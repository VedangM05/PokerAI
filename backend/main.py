import socketio
from fastapi import FastAPI
from typing import List, Dict, Any, Optional
from poker_logic import Card, PokerAI, get_full_deck, get_best_hand, evaluate_5_card_hand
import random
import asyncio
import time

sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
app = FastAPI()
app_asgi = socketio.ASGIApp(sio, app)

class Player:
    def __init__(self, sid, name, chips=1000, is_ai=False):
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

    def __str__(self):
        return f"{self.name} ({self.chips})"

class Table:
    def __init__(self):
        self.players: List[Player] = []
        self.community_cards: List[Card] = []
        self.deck = []
        self.pot = 0
        self.current_bet = 0
        self.turn_index = 0
        self.round_name = "PRE-FLOP"
        self.is_game_active = False
        self.current_turn_sid = None
        self.move_event = asyncio.Event()
        self.pending_move = None
        self.logs = []

    def log(self, msg):
        self.logs.append(msg)
        if len(self.logs) > 10:
            self.logs.pop(0)

    def reset_hand(self):
        self.community_cards = []
        self.deck = get_full_deck()
        random.shuffle(self.deck)
        self.pot = 0
        self.current_bet = 0
        self.round_name = "PRE-FLOP"
        for p in self.players:
            p.hand = [self.deck.pop(), self.deck.pop()]
            p.folded = False
            p.all_in = False
            p.current_bet = 0
            p.total_bet_in_hand = 0
            p.last_action = ""

    def broadcast_state(self):
        return {
            "players": [
                {
                    "sid": p.sid,
                    "name": p.name,
                    "chips": p.chips,
                    "folded": p.folded,
                    "all_in": p.all_in,
                    "current_bet": p.current_bet,
                    "is_ai": p.is_ai,
                    "connected": p.is_connected,
                    "last_action": p.last_action,
                    "is_turn": p.sid == self.current_turn_sid if self.current_turn_sid else False
                } for p in self.players
            ],
            "community": [str(c) for c in self.community_cards],
            "pot": self.pot,
            "current_bet": self.current_bet,
            "round": self.round_name,
            "logs": self.logs
        }

table = Table()
ai_logic = PokerAI()

@sio.event
async def connect(sid, environ):
    print(f"Player {sid} connected")

@sio.event
async def join_game(sid, data):
    name = data.get("name", f"Player_{sid[:4]}")
    p = Player(sid, name)
    table.players.append(p)
    
    # Ensure there's at least one AI
    if not any(pl.is_ai for pl in table.players):
        ai_player = Player(f"AI_{random.randint(100,999)}", "AI_Bot", is_ai=True)
        table.players.append(ai_player)
    
    await sio.emit("table_state", table.broadcast_state())
    table.log(f"{name} joined the game.")
    
    if len(table.players) >= 2 and not table.is_game_active:
        table.is_game_active = True
        asyncio.create_task(game_loop())

@sio.event
async def player_action(sid, data):
    if table.current_turn_sid == sid:
        action_type = data.get("type", "").upper()
        amount = int(data.get("amount", 0))
        table.pending_move = {"type": action_type, "amount": amount}
        table.move_event.set()

async def game_loop():
    while table.is_game_active:
        table.reset_hand()
        table.log("New hand starting!")
        
        # 1. Pre-Flop
        await deal_hand()
        if not await run_betting_round("Waiting for Pre-Flop bets..."): continue

        # 2. Flop
        table.round_name = "FLOP"
        table.community_cards = [table.deck.pop() for _ in range(3)]
        if not await run_betting_round("Dealing Flop..."): continue

        # 3. Turn
        table.round_name = "TURN"
        table.community_cards.append(table.deck.pop())
        if not await run_betting_round("Dealing Turn..."): continue

        # 4. River
        table.round_name = "RIVER"
        table.community_cards.append(table.deck.pop())
        if not await run_betting_round("Dealing River..."): continue

        # 5. Showdown
        await handle_showdown()
        
        await asyncio.sleep(5) # Pause before next hand

async def deal_hand():
    for p in table.players:
        if not p.is_ai:
            try:
                await sio.emit("your_hand", [str(c) for c in p.hand], room=p.sid)
            except: pass
    await sio.emit("table_state", table.broadcast_state())

async def run_betting_round(msg):
    table.log(msg)
    table.current_bet = 0
    for p in table.players: p.current_bet = 0
    
    finished = False
    while not finished:
        active_players = [p for p in table.players if not p.folded and not p.all_in and p.is_connected]
        if len([p for p in table.players if not p.folded]) <= 1:
            return False # Someone won by folding

        for p in table.players:
            if p.folded or p.all_in or not p.is_connected: continue
            
            # Check if round is finished (everyone called current bet)
            all_called = True
            for pl in table.players:
                if not pl.folded and pl.current_bet != table.current_bet and not pl.all_in:
                    all_called = False
                    break
            
            # If everyone called and we've gone at least one full turn
            # (Simplified for now, actually needs to track who started/ended)
            
            table.current_turn_sid = p.sid
            await sio.emit("table_state", table.broadcast_state())
            
            action = None
            if p.is_ai:
                await asyncio.sleep(1) # AI thinking time
                action_str = ai_logic.decide_action(p.hand, table.community_cards, table.current_bet, p.current_bet, table.pot, p.chips)
                if action_str.startswith("RAISE"):
                    parts = action_str.split()
                    action = {"type": "RAISE", "amount": int(parts[1])}
                else:
                    action = {"type": action_str}
            else:
                table.move_event.clear()
                try:
                    await asyncio.wait_for(table.move_event.wait(), timeout=30.0)
                    action = table.pending_move
                except asyncio.TimeoutError:
                    action = {"type": "FOLD"}
            
            await process_action(p, action)
            
            # Re-check if round is finished
            unfolded = [pl for pl in table.players if not pl.folded]
            if len(unfolded) <= 1: return False
            
            still_need_to_call = False
            for pl in table.players:
                if not pl.folded and not pl.all_in and pl.current_bet < table.current_bet:
                    still_need_to_call = True
                    break
            
            if not still_need_to_call and p == table.players[-1]:
                finished = True
                break
        
        # Guard for infinite loops
        if all(pl.folded or pl.all_in or pl.current_bet == table.current_bet for pl in table.players if pl.is_connected):
            finished = True

    table.current_turn_sid = None
    return True

async def process_action(player, action):
    atype = action["type"]
    p_call_amt = table.current_bet - player.current_bet
    
    if atype == "FOLD":
        player.folded = True
        player.last_action = "Fold"
        table.log(f"{player.name} folds.")
    elif atype == "CHECK":
        if p_call_amt == 0:
            player.last_action = "Check"
            table.log(f"{player.name} checks.")
        else:
            player.folded = True
            player.last_action = "Fold"
            table.log(f"{player.name} folds (on check).")
    elif atype == "CALL":
        amt = min(p_call_amt, player.chips)
        player.chips -= amt
        table.pot += amt
        player.current_bet += amt
        if player.chips == 0: player.all_in = True
        player.last_action = "Call"
        table.log(f"{player.name} calls.")
    elif atype == "RAISE":
        r_amt = action["amount"]
        total_put_in = (table.current_bet + r_amt) - player.current_bet
        actual_put_in = min(total_put_in, player.chips)
        player.chips -= actual_put_in
        table.pot += actual_put_in
        player.current_bet += actual_put_in
        table.current_bet = player.current_bet
        if player.chips == 0: player.all_in = True
        player.last_action = f"Raise {r_amt}"
        table.log(f"{player.name} raises {r_amt}.")

async def handle_showdown():
    table.log("Showdown!")
    active_players = [p for p in table.players if not p.folded]
    
    if len(active_players) == 1:
        winner = active_players[0]
        winner.chips += table.pot
        table.log(f"{winner.name} wins {table.pot}!")
        table.pot = 0
    else:
        results = []
        for p in active_players:
            best = get_best_hand(p.hand, table.community_cards)
            results.append((p, best))
        
        # Sort results by score and kickers
        results.sort(key=lambda x: (x[1].score, x[1].kickers), reverse=True)
        
        # Handle ties (simplified: first one wins for now, but should split)
        winner, best_hand = results[0]
        winner.chips += table.pot
        table.log(f"{winner.name} wins {table.pot} with {best_hand.name}!")
        table.pot = 0
        
    await sio.emit("table_state", table.broadcast_state())

@sio.event
async def disconnect(sid):
    print(f"Player {sid} disconnected")
    for p in table.players:
        if p.sid == sid:
            p.is_connected = False
            p.folded = True
            # table.players.remove(p) # Better to just mark as disconnected
            break
    await sio.emit("table_state", table.broadcast_state())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app_asgi, host="0.0.0.0", port=8000)
