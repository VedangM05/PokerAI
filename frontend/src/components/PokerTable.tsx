"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { socket } from "@/lib/socket";
import { Card } from "./Card";
import { motion, AnimatePresence } from "framer-motion";
import { User, Cpu, Coins, MessageSquare, Terminal, X, Send } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface PlayerState {
  sid: string;
  name: string;
  chips: number;
  folded: boolean;
  all_in: boolean;
  current_bet: number;
  is_ai: boolean;
  ai_hand: string[] | null;
  connected: boolean;
  last_action: string;
  is_turn: boolean;
  win_probability: number | null;
}

interface TableState {
  players: PlayerState[];
  community: string[];
  pot: number;
  current_bet: number;
  round: string;
  logs: string[];
}

interface ChatMessage {
  name: string;
  message: string;
  timestamp: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getPlayerPositions(count: number): number[] {
  // Seat positions arranged around an oval table.
  // For 2 players: bottom-center vs top-center.
  // For 3-6 players: distributed evenly.
  const allAngles = [90, 150, 210, 270, 330, 30]; // bottom first
  return allAngles.slice(0, count);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PokerTable() {
  const [tableState, setTableState] = useState<TableState | null>(null);
  // myHand persists across round resets — only cleared on GAME_STARTING broadcast
  const [myHand, setMyHand] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState(50);
  const [showDebug, setShowDebug] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [broadcastMessages, setBroadcastMessages] = useState<string[]>([]);
  const [actionSent, setActionSent] = useState(false); // prevent double-send
  const [mySocketId, setMySocketId] = useState<string | null>(null);
  const [autoFold, setAutoFold] = useState(false);

  const logRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  // ── Socket setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    socket.connect();

    // Capture socket.id after connection (it's undefined until connected)
    socket.on("connect", () => {
      setMySocketId(socket.id ?? null);
    });

    socket.on("table_state", (state: TableState) => {
      setTableState(state);
    });

    // Server emits "your_hand" with the player's hole cards each new hand
    socket.on("your_hand", (hand: string[]) => {
      setMyHand(hand);
      setActionSent(false); // reset action guard for new hand
    });

    // Server broadcasts game-wide messages (showdown results, hand starts, etc.)
    socket.on("broadcast", (data: { message: string }) => {
      const msg = data?.message ?? "";
      setBroadcastMessages((prev) => [...prev.slice(-49), msg]);
      // Clear local hand display when a new hand starts
      if (msg.includes("GAME_STARTING")) {
        setMyHand([]);
        setActionSent(false);
      }
    });

    // Chat messages from server
    socket.on("chat", (data: { name: string; message: string }) => {
      setChatLog((prev) => [
        ...prev,
        { name: data.name, message: data.message, timestamp: new Date() },
      ]);
    });

    socket.on("error", (msg: string) => {
      console.error("Server error:", msg);
    });

    socket.on("disconnect", () => {
      setMySocketId(null);
    });

    return () => {
      socket.off("connect");
      socket.off("table_state");
      socket.off("your_hand");
      socket.off("broadcast");
      socket.off("chat");
      socket.off("error");
      socket.off("disconnect");
      socket.disconnect();
    };
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [tableState?.logs, broadcastMessages]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatLog]);

  // ── Derived state ────────────────────────────────────────────────────────────
  // Use mySocketId state (not socket.id directly) so React re-renders correctly
  const myPlayer = tableState?.players.find((p) => p.sid === mySocketId) ?? null;
  const isMyTurn = myPlayer?.is_turn === true && !actionSent;

  // How much the local player still needs to put in to call
  const callAmount =
    myPlayer && tableState
      ? Math.max(0, tableState.current_bet - myPlayer.current_bet)
      : 0;

  const canCheck = callAmount === 0;

  // C++ semantics: "RAISE <amount>" means raise BY <amount> over current bet.
  // When there is no bet (callAmount===0), this acts like a bet size.
  const minRaise = 10;
  const maxRaise =
    myPlayer && tableState
      ? Math.max(0, myPlayer.chips - callAmount) // put-in = callAmount + raiseAmount must fit in chips
      : 0;
  const effectiveRaise = Math.min(Math.max(raiseAmount, minRaise), maxRaise || raiseAmount);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const sendAction = useCallback(
    (type: string, amount = 0) => {
      if (!isMyTurn) return;
      socket.emit("player_action", { type, amount });
      setActionSent(true); // lock out further sends until next hand/turn
    },
    [isMyTurn]
  );

  const handleFold = () => sendAction("FOLD");
  const handleCallOrCheck = () => sendAction(canCheck ? "CHECK" : "CALL", callAmount);
  const handleRaise = () => sendAction("RAISE", effectiveRaise);
  const handleAllIn = () => sendAction("ALL_IN");

  // Auto-fold logic
  useEffect(() => {
    if (isMyTurn && autoFold && !actionSent) {
      handleFold();
      setAutoFold(false); // Reset auto-fold after it triggers
    }
  }, [isMyTurn, autoFold, actionSent, handleFold]);

  // Reset action lockout when our turn ends so we can act again next round
  useEffect(() => {
    if (myPlayer && !myPlayer.is_turn) {
      setActionSent(false);
    }
  }, [myPlayer?.is_turn]);

  // Also reset the action guard when the betting round (street) changes.
  // Without this, the UI can remain locked out and the server will auto-fold on timeout.
  useEffect(() => {
    setActionSent(false);
  }, [tableState?.round]);

  const sendChat = () => {
    if (!chatInput.trim()) return;
    socket.emit("chat_message", { message: chatInput.trim() });
    setChatInput("");
  };

  const join = () => {
    if (!name.trim()) return;
    socket.emit("join_game", { name: name.trim() });
    setJoined(true);
  };

  // ── Join Screen ───────────────────────────────────────────────────────────────
  if (!joined) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-md w-full"
        >
          <h1 className="text-3xl font-extrabold text-emerald-400 mb-6 text-center tracking-tighter uppercase italic">
            Poker Modern
          </h1>
          <p className="text-slate-400 mb-6 text-center text-sm leading-relaxed">
            Welcome to the Time Complexity Optimal, Multiplayer Poker Experience.
          </p>
          <input
            type="text"
            placeholder="Enter your name..."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-white mb-4 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && join()}
          />
          <button
            onClick={join}
            disabled={!name.trim()}
            className="w-full bg-emerald-500 hover:bg-emerald-600 font-bold p-4 rounded-xl text-slate-900 transition active:scale-95 shadow-lg shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ENTER THE TABLE
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Player seat positions ─────────────────────────────────────────────────────
  const playerCount = tableState?.players.length ?? 0;
  const angles = getPlayerPositions(Math.max(playerCount, 2));

  // ── Main Table UI ─────────────────────────────────────────────────────────────
  return (
    <div className="relative h-screen bg-[#020617] overflow-hidden flex flex-col font-sans">
      {/* Ambient glow */}
      <div className="absolute inset-0 z-0 opacity-40 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.15)_0%,_transparent_70%)]" />

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <header className="relative z-50 px-6 py-3 flex justify-between items-center bg-slate-950/80 border-b border-white/5 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Terminal size={18} className="text-emerald-400" />
            <span className="font-black text-slate-200 tracking-tighter italic">POKER MODERN</span>
          </div>
          <button
            onClick={() => setShowDebug((s) => !s)}
            className={cn(
              "px-4 py-1.5 rounded-full text-[10px] font-bold transition flex items-center gap-2 border shadow-lg",
              showDebug
                ? "bg-emerald-500 text-slate-950 border-emerald-400"
                : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10 hover:text-white"
            )}
          >
            <Cpu size={12} /> {showDebug ? "DEBUG ON" : "AI DASHBOARD"}
          </button>
        </div>

        <div className="flex gap-4 items-center">
          {/* Connection status indicator */}
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                mySocketId ? "bg-emerald-400 animate-pulse" : "bg-red-500"
              )}
            />
            <span className="text-[9px] text-slate-500 font-bold uppercase">
              {mySocketId ? "Connected" : "Offline"}
            </span>
          </div>
          <div className="w-px h-8 bg-slate-800" />
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Round</span>
            <span className="text-sm font-semibold text-emerald-400">
              {tableState?.round || "WAITING"}
            </span>
          </div>
          <div className="w-px h-8 bg-slate-800 mx-2" />
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Total Pot</span>
            <span className="text-sm font-bold text-white flex items-center gap-1">
              <Coins size={14} className="text-yellow-500" /> {tableState?.pot ?? 0}
            </span>
          </div>
        </div>
      </header>

      {/* ── Main Table Area ─────────────────────────────────────────────────────── */}
      <main className="relative flex-grow flex items-center justify-center p-4 min-h-0">
        {/* Felt oval */}
        <div className="relative w-full max-w-[min(85vw,100vh*1.8)] aspect-[2.2/1] rounded-[240px] bg-[#064e3b] shadow-[inset_0_0_100px_rgba(0,0,0,0.9)] border-[14px] border-slate-900 flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 opacity-15 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />

          {/* Community cards */}
          <div className="flex gap-2 sm:gap-4 justify-center items-center relative z-10 min-h-[100px] w-full px-6">
            <AnimatePresence mode="popLayout">
              {tableState?.community.map((c, i) => (
                <motion.div
                  key={`${i}-${c}`}
                  initial={{ opacity: 0, y: -20, rotateY: 90 }}
                  animate={{ opacity: 1, y: 0, rotateY: 0 }}
                  transition={{ delay: i * 0.08 }}
                >
                  <Card cardStr={c} className="shadow-2xl flex-shrink-0 w-10 sm:w-20" />
                </motion.div>
              ))}
              {Array.from({ length: 5 - (tableState?.community.length ?? 0) }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="w-10 sm:w-20 aspect-[5/7] rounded-lg border-2 border-dashed border-emerald-900/50 bg-emerald-900/10 flex items-center justify-center flex-shrink-0"
                >
                  <span className="text-emerald-900/20 font-black text-xl sm:text-4xl italic">P</span>
                </div>
              ))}
            </AnimatePresence>
          </div>

          {/* Watermark */}
          <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 text-center pointer-events-none opacity-5">
            <div className="text-6xl font-black text-emerald-300 italic tracking-[1.5em] ml-[1.5em]">POKER</div>
          </div>
        </div>

        {/* ── Player Seats ──────────────────────────────────────────────────────── */}
        <div className="absolute inset-0 pointer-events-none p-4 sm:p-24">
          {tableState?.players.map((p, i) => {
            const angle = angles[i % angles.length];
            const isMe = p.sid === mySocketId;
            // Cards appear above for top-half seats, below for bottom-half
            const isTopSeat = angle > 180 && angle < 360;

            return (
              <motion.div
                key={p.sid || i}
                className="absolute pointer-events-auto"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                  left: `${50 + 38 * Math.cos((angle * Math.PI) / 180)}%`,
                  top: `${50 + 32 * Math.sin((angle * Math.PI) / 180)}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div
                  className={cn(
                    "flex flex-col items-center gap-1 transition-all duration-500",
                    p.folded ? "opacity-30 grayscale" : "opacity-100",
                    p.is_turn ? "scale-110" : "scale-100"
                  )}
                >
                  {/* Hole cards — shown only for "me" when not folded */}
                  {isMe && !p.folded && myHand.length > 0 && (
                    <div
                      className={cn(
                        "flex gap-1 absolute z-20",
                        isTopSeat ? "top-16" : "-top-20"
                      )}
                    >
                      {myHand.map((c, idx) => (
                        <Card
                          key={idx}
                          cardStr={c}
                          className="w-8 sm:w-14 shadow-2xl ring-2 ring-emerald-500/50"
                        />
                      ))}
                    </div>
                  )}

                  {/* Avatar bubble */}
                  <div
                    className={cn(
                      "w-10 h-10 sm:w-14 sm:h-14 rounded-full border-4 flex items-center justify-center bg-slate-900 shadow-2xl relative",
                      p.is_turn
                        ? "border-emerald-400 ring-4 ring-emerald-500/30 animate-pulse bg-emerald-950"
                        : "border-slate-800"
                    )}
                  >
                    {p.is_ai ? (
                      <Cpu className="text-slate-400 w-4 h-4 sm:w-6 sm:h-6" />
                    ) : (
                      <User className="text-emerald-400 w-4 h-4 sm:w-6 sm:h-6" />
                    )}

                    {/* Last action badge */}
                    {p.last_action && (
                      <div className="absolute -top-7 sm:-top-9 bg-white text-slate-900 px-2 py-0.5 sm:px-3 sm:py-0.5 rounded-full text-[7px] sm:text-[9px] font-black uppercase tracking-tight shadow-xl whitespace-nowrap z-30">
                        {p.last_action}
                      </div>
                    )}

                    {/* "YOUR TURN" glow label */}
                    {isMe && p.is_turn && (
                      <div className="absolute -bottom-6 bg-emerald-500 text-slate-900 px-2 py-0.5 rounded-full text-[7px] font-black uppercase whitespace-nowrap shadow-lg shadow-emerald-500/40 z-30">
                        YOUR TURN
                      </div>
                    )}
                  </div>

                  {/* Player info card */}
                  <div className="bg-slate-950/95 border border-white/10 p-1 sm:p-1.5 rounded-lg text-center backdrop-blur-md shadow-xl min-w-[70px] sm:min-w-[90px]">
                    <div className="text-[7px] sm:text-[10px] font-bold text-slate-300 truncate max-w-[50px] sm:max-w-[70px] mx-auto">
                      {p.name} {isMe && "★"}
                    </div>
                    <div className="text-emerald-400 font-mono text-[8px] sm:text-xs leading-none mt-1">
                      ${p.chips}
                    </div>
                    {p.current_bet > 0 && (
                      <div className="mt-1 px-1 py-0.5 bg-emerald-900/40 rounded text-[6px] sm:text-[8px] font-bold text-emerald-200">
                        Bet: ${p.current_bet}
                      </div>
                    )}
                    {p.all_in && (
                      <div className="mt-1 px-1 py-0.5 bg-yellow-500/20 rounded text-[6px] sm:text-[8px] font-bold text-yellow-300">
                        ALL-IN
                      </div>
                    )}
                    {!p.connected && (
                      <div className="mt-1 px-1 py-0.5 bg-red-500/20 rounded text-[6px] sm:text-[8px] font-bold text-red-400">
                        OFFLINE
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ── AI Debug Panel ─────────────────────────────────────────────────────── */}
        <AnimatePresence>
          {showDebug && (
            <motion.div
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              className="absolute right-4 top-4 bottom-4 w-72 bg-slate-950/95 border border-emerald-500/20 backdrop-blur-3xl z-[100] shadow-[0_0_50px_rgba(16,185,129,0.15)] p-6 overflow-y-auto pointer-events-auto rounded-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-500/20 rounded-lg">
                    <Cpu size={16} className="text-emerald-400" />
                  </div>
                  <h2 className="text-white font-black text-sm uppercase tracking-tighter">AI Dashboard</h2>
                </div>
                <button onClick={() => setShowDebug(false)} className="text-slate-500 hover:text-white transition">
                  <X size={14} />
                </button>
              </div>

              <div className="space-y-4">
                {tableState?.players.filter((p) => p.is_ai).map((ai) => (
                  <div
                    key={ai.sid}
                    className="bg-white/5 rounded-xl p-3 border border-white/5 hover:border-emerald-500/20 transition"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="text-xs font-bold text-slate-200">{ai.name}</div>
                        <div className="text-[10px] text-emerald-400 font-mono">${ai.chips}</div>
                      </div>
                      <div className="bg-emerald-500/10 text-emerald-500 text-[8px] px-2 py-0.5 rounded-full font-bold uppercase">
                        BOT
                      </div>
                    </div>

                    {ai.ai_hand && ai.ai_hand.length > 0 ? (
                      <div className="flex gap-1.5">
                        {ai.ai_hand.map((c, idx) => (
                          <Card key={idx} cardStr={c} className="w-10 ring-1 ring-white/10" />
                        ))}
                      </div>
                    ) : (
                      <div className="text-[9px] text-slate-600 italic">No hand dealt</div>
                    )}

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="bg-black/40 p-1.5 rounded-lg border border-white/5">
                        <div className="text-[6px] text-slate-500 uppercase font-black">Status</div>
                        <div className="text-[9px] text-slate-300 font-bold uppercase truncate">
                          {ai.last_action || "Idle"}
                        </div>
                      </div>
                      <div className="bg-black/40 p-1.5 rounded-lg border border-white/5">
                        <div className="text-[6px] text-slate-500 uppercase font-black">Pot Contribution</div>
                        <div className="text-[9px] text-slate-300 font-bold">${ai.current_bet}</div>
                      </div>
                    </div>
                    {ai.win_probability !== null && ai.win_probability !== undefined && (
                      <div className="mt-2 bg-black/40 p-2 rounded-lg border border-white/5">
                        <div className="flex justify-between items-center mb-1">
                           <div className="text-[6px] text-slate-500 uppercase font-black">Win Probability (Expected)</div>
                           <div className="text-[9px] text-emerald-400 font-bold">{(ai.win_probability * 100).toFixed(1)}%</div>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
                          <div className="bg-emerald-500 h-1 rounded-full transition-all duration-500" style={{ width: `${ai.win_probability * 100}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {!tableState?.players.some((p) => p.is_ai) && (
                  <div className="text-center py-12 text-slate-600 text-xs italic">No AI bots active</div>
                )}
              </div>

              {/* Broadcast messages log */}
              <div className="mt-6">
                <div className="text-[9px] text-slate-500 uppercase font-black mb-2">Server Messages</div>
                <div className="h-40 overflow-y-auto space-y-1 scrollbar-hide">
                  {broadcastMessages.slice(-20).map((m, i) => (
                    <div key={i} className="text-[8px] font-mono text-slate-400 border-l border-emerald-500/20 pl-2 leading-relaxed">
                      {m}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Chat Panel ────────────────────────────────────────────────────────── */}
        <AnimatePresence>
          {showChat && (
            <motion.div
              initial={{ opacity: 0, x: -100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              className="absolute left-4 top-4 bottom-4 w-64 bg-slate-950/95 border border-slate-700/40 backdrop-blur-3xl z-[100] shadow-2xl p-4 flex flex-col pointer-events-auto rounded-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <MessageSquare size={14} className="text-emerald-400" />
                  <span className="text-white font-black text-xs uppercase">Table Chat</span>
                </div>
                <button onClick={() => setShowChat(false)} className="text-slate-500 hover:text-white transition">
                  <X size={14} />
                </button>
              </div>
              <div ref={chatRef} className="flex-grow overflow-y-auto space-y-2 scrollbar-hide mb-3">
                {chatLog.length === 0 && (
                  <div className="text-[9px] text-slate-600 italic text-center pt-8">No messages yet</div>
                )}
                {chatLog.map((m, i) => (
                  <div key={i} className="text-[10px]">
                    <span className="text-emerald-400 font-bold">{m.name}: </span>
                    <span className="text-slate-300">{m.message}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-grow bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="Say something..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChat()}
                />
                <button
                  onClick={sendChat}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-lg p-2 transition active:scale-95"
                >
                  <Send size={12} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Footer Controls ────────────────────────────────────────────────────── */}
      <footer className="relative z-50 flex px-8 py-3 items-end gap-6 bg-gradient-to-t from-slate-950 to-transparent shrink-0">
        {/* Live log + chat toggle */}
        <div className="flex-grow max-w-sm">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2 text-slate-500 font-bold text-[9px] uppercase tracking-widest">
              <MessageSquare size={10} /> Live Logs
            </div>
            <button
              onClick={() => setShowChat((s) => !s)}
              className={cn(
                "text-[9px] font-bold px-2 py-0.5 rounded-full transition border",
                showChat
                  ? "bg-emerald-500 text-slate-900 border-emerald-400"
                  : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10"
              )}
            >
              💬 Chat
            </button>
          </div>
          <div
            ref={logRef}
            className="bg-slate-900/60 border border-slate-800 h-20 rounded-xl p-3 overflow-y-auto text-[10px] font-mono text-slate-400 scrollbar-hide backdrop-blur-sm"
          >
            {(tableState?.logs ?? []).map((log, i) => (
              <div key={i} className="mb-0.5 border-l-2 border-emerald-500/20 pl-2">
                <span className="text-slate-600 mr-2 opacity-50">
                  [{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}]
                </span>{" "}
                {log}
              </div>
            ))}
          </div>
        </div>

        {/* Action Controls */}
        <div className="bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 flex flex-col gap-3 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full shadow-[0_0_5px_theme(colors.emerald.500)]",
                  isMyTurn ? "bg-emerald-500 animate-pulse" : "bg-slate-700"
                )}
              />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                {isMyTurn ? "YOUR TURN — ACT NOW" : "Table Controls"}
              </span>
            </div>
            
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input 
                type="checkbox" 
                checked={autoFold} 
                onChange={(e) => setAutoFold(e.target.checked)}
                className="accent-emerald-500 cursor-pointer w-3 h-3"
              />
              <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Auto Fold</span>
            </label>
          </div>

          <div className="flex gap-3">
            {/* Fold */}
            <button
              onClick={handleFold}
              disabled={!isMyTurn}
              className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/40 text-red-400 font-black px-6 py-3 rounded-xl transition active:scale-95 disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed text-xs uppercase tracking-tight"
            >
              Fold
            </button>

            {/* Call / Check */}
            <button
              onClick={handleCallOrCheck}
              disabled={!isMyTurn}
              className="bg-slate-800 hover:bg-slate-700 text-slate-100 font-black px-8 py-3 rounded-xl transition active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed text-xs uppercase tracking-tight shadow-lg border border-white/5"
            >
              {canCheck
                ? "Check"
                : `Call $${callAmount}`}
            </button>

            {/* Raise */}
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-1.5">
                <button
                  onClick={handleRaise}
                  disabled={!isMyTurn}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-6 py-3 rounded-xl transition active:scale-95 disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed text-xs uppercase shadow-xl shadow-emerald-500/20"
                >
                  {canCheck ? `Bet $${effectiveRaise}` : `Raise +$${effectiveRaise}`}
                </button>
                {/* All-In shortcut */}
                <button
                  onClick={handleAllIn}
                  disabled={!isMyTurn}
                  className="bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 font-black px-3 py-3 rounded-xl transition active:scale-95 disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed text-[10px] uppercase"
                >
                  ALL IN
                </button>
              </div>
              <input
                type="range"
                min={minRaise}
                max={maxRaise || (myPlayer?.chips ?? 1000)}
                step={10}
                value={effectiveRaise}
                onChange={(e) => setRaiseAmount(parseInt(e.target.value))}
                className="accent-emerald-400 h-1 rounded-full cursor-pointer"
              />
              <div className="flex justify-between text-[8px] text-slate-600 font-mono">
                <span>Min +${minRaise}</span>
                <span>Max +${maxRaise || "—"}</span>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Decorative blobs */}
      <div className="fixed top-20 -left-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-20 -right-20 w-96 h-96 bg-indigo-500/10 rounded-full blur-[140px] pointer-events-none" />
    </div>
  );
}