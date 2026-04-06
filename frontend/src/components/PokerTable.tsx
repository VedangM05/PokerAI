"use client";

import React, { useEffect, useState, useRef } from "react";
import { socket } from "@/lib/socket";
import { Card } from "./Card";
import { motion, AnimatePresence } from "framer-motion";
import { User, Cpu, Coins, MessageSquare, Terminal } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function PokerTable() {
  const [tableState, setTableState] = useState<any>(null);
  const [myHand, setMyHand] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState(50);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    socket.connect();
    socket.on("table_state", (state) => setTableState(state));
    socket.on("your_hand", (hand) => setMyHand(hand));

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [tableState?.logs]);

  const join = () => {
    if (!name) return;
    socket.emit("join_game", { name });
    setJoined(true);
  };

  const action = (type: string, amount = 0) => {
    socket.emit("player_action", { type, amount });
  };

  if (!joined) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-md w-full"
        >
          <h1 className="text-3xl font-extrabold text-emerald-400 mb-6 text-center tracking-tighter">POKER MODERN</h1>
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
            className="w-full bg-emerald-500 hover:bg-emerald-600 font-bold p-4 rounded-xl text-slate-900 transition active:scale-95 shadow-lg shadow-emerald-500/20"
          >
            ENTER THE TABLE
          </button>
        </motion.div>
      </div>
    );
  }

  const myPlayer = tableState?.players.find((p: any) => p.sid === socket.id);
  const isMyTurn = myPlayer?.is_turn;

  return (
    <div className="relative min-h-screen bg-[#020617] overflow-hidden flex flex-col font-sans">
      <div className="absolute inset-0 z-0 opacity-40 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.15)_0%,_transparent_70%)]" />
      
      <header className="relative z-50 px-6 py-4 flex justify-between items-center bg-slate-950/80 border-b border-white/5 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <Terminal size={18} className="text-emerald-400" />
          <span className="font-black text-slate-200 tracking-tighter italic">POKER MODERN</span>
        </div>
        <div className="flex gap-4">
          <div className="flex flex-col items-end">
             <span className="text-xs text-slate-500 uppercase tracking-widest font-bold">Round</span>
             <span className="text-sm font-semibold text-emerald-400">{tableState?.round || "WAITING"}</span>
          </div>
          <div className="w-px h-8 bg-slate-800 mx-2" />
          <div className="flex flex-col items-end">
             <span className="text-xs text-slate-500 uppercase tracking-widest font-bold">Total Pot</span>
             <span className="text-sm font-bold text-white flex items-center gap-1">
               <Coins size={14} className="text-yellow-500" /> {tableState?.pot || 0}
             </span>
          </div>
        </div>
      </header>

      <main className="relative flex-grow flex items-center justify-center p-8">
        <div className="relative w-full max-w-5xl aspect-[2/1] rounded-[240px] bg-[#064e3b] shadow-[inset_0_0_80px_rgba(0,0,0,0.8)] border-[12px] border-slate-900 flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
          
          <div className="flex gap-4 justify-center items-center relative z-10 min-h-[160px] w-full px-12">
            <AnimatePresence mode="popLayout">
               {tableState?.community.map((c: string, i: number) => (
                 <Card key={`${i}-${c}`} cardStr={c} className="shadow-2xl flex-shrink-0" />
               ))}
               {Array.from({ length: 5 - (tableState?.community.length || 0) }).map((_, i) => (
                 <div key={`empty-${i}`} className="w-16 h-24 sm:w-24 sm:h-32 rounded-lg border-2 border-dashed border-emerald-900/50 bg-emerald-900/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-emerald-900/30 font-black text-4xl italic">P</span>
                 </div>
               ))}
            </AnimatePresence>
          </div>

          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 text-center pointer-events-none opacity-20">
             <div className="text-4xl font-black text-emerald-300 italic tracking-[1em] ml-[1em]">TABLE</div>
          </div>
        </div>

        <div className="absolute inset-0 pointer-events-none p-12">
           {tableState?.players.map((p: any, i: number) => {
             const angles = [90, 160, 210, 270, 330, 20];
             const currentAngle = angles[i % angles.length];
             const isMe = p.sid === socket.id;
             const isTopPlayer = currentAngle > 220 && currentAngle < 320;
             
             return (
               <motion.div
                 key={p.sid || i}
                 className="absolute pointer-events-auto"
                 style={{
                    left: `${50 + 38 * Math.cos((currentAngle * Math.PI) / 180)}%`,
                    top: `${56 + 30 * Math.sin((currentAngle * Math.PI) / 180)}%`,
                    transform: "translate(-50%, -50%)"
                 }}
               >
                 <div className={cn(
                   "flex flex-col items-center gap-2 transition-all duration-500",
                   p.folded ? "opacity-30 grayscale" : "opacity-100",
                   p.is_turn ? "scale-110" : "scale-100"
                 )}>
                   {isMe && !p.folded && (
                     <div className={cn(
                        "flex gap-1 absolute z-20",
                        isTopPlayer ? "top-24" : "-top-32"
                     )}>
                        {myHand.map((c, idx) => <Card key={idx} cardStr={c} className="w-12 h-18 sm:w-20 sm:h-28" />)}
                     </div>
                   )}

                   <div className={cn(
                     "w-12 h-12 sm:w-16 sm:h-16 rounded-full border-4 flex items-center justify-center bg-slate-900 shadow-2xl relative",
                     p.is_turn ? "border-emerald-400 ring-4 ring-emerald-500/30 animate-pulse" : "border-slate-800"
                   )}>
                     {p.is_ai ? <Cpu className="text-slate-400" /> : <User className="text-emerald-400" />}
                     {p.last_action && (
                        <div className="absolute -top-10 bg-white text-slate-900 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight shadow-xl whitespace-nowrap">
                          {p.last_action}
                        </div>
                     )}
                   </div>

                   <div className="bg-slate-950/90 border border-white/10 p-2 rounded-lg text-center backdrop-blur-md shadow-xl min-w-[100px]">
                      <div className="text-[10px] sm:text-xs font-bold text-slate-300 truncate max-w-[80px] mx-auto">{p.name} {isMe && "(YOU)"}</div>
                      <div className="text-emerald-400 font-mono text-[10px] sm:text-sm leading-none mt-1">${p.chips}</div>
                      {p.current_bet > 0 && (
                        <div className="mt-1 px-2 py-0.5 bg-emerald-900/30 rounded text-[9px] font-bold text-emerald-300">
                          Bet: {p.current_bet}
                        </div>
                      )}
                   </div>
                 </div>
               </motion.div>
             );
           })}
        </div>
      </main>

      <footer className="relative z-50 flex px-8 py-6 items-end gap-6 bg-gradient-to-t from-slate-950 to-transparent">
        <div className="flex-grow max-w-sm">
           <div className="flex items-center gap-2 mb-2 text-slate-500 font-bold text-[10px] uppercase tracking-widest">
             <MessageSquare size={12} /> Live stream
           </div>
           <div ref={logRef} className="bg-slate-900/40 border border-slate-800 h-32 rounded-xl p-3 overflow-y-auto text-[11px] font-mono text-slate-400 scrollbar-hide backdrop-blur-sm">
             {tableState?.logs.map((log: string, i: number) => (
               <div key={i} className="mb-1 border-l-2 border-emerald-500/20 pl-2">
                 <span className="text-slate-600 mr-2 opacity-50">[{new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}]</span> {log}
               </div>
             ))}
           </div>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-xl border border-white/5 rounded-2xl p-4 flex flex-col gap-4 shadow-2xl">
           <div className="flex items-center gap-2 mb-1">
             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
             <span className="text-xs font-black text-slate-400 uppercase tracking-tighter">Your player controls</span>
           </div>

           <div className="flex gap-3">
             <button onClick={() => action("FOLD")} disabled={!isMyTurn} className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-black px-6 py-3 rounded-xl transition active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed text-xs uppercase">Fold</button>
             <button onClick={() => action("CHECK")} disabled={!isMyTurn} className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-black px-6 py-3 rounded-xl transition active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed text-xs uppercase">Check / Call</button>
             <div className="flex flex-col gap-2">
               <button onClick={() => action("RAISE", raiseAmount)} disabled={!isMyTurn} className="bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-extrabold px-6 py-3 rounded-xl transition active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed text-xs uppercase shadow-lg shadow-emerald-500/20">Raise {raiseAmount}</button>
               <input type="range" min="10" max="500" step="10" value={raiseAmount} onChange={(e) => setRaiseAmount(parseInt(e.target.value))} className="accent-emerald-400 w-full" />
             </div>
           </div>
        </div>
      </footer>

      <div className="fixed top-20 -left-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-20 -right-20 w-96 h-96 bg-indigo-500/10 rounded-full blur-[140px] pointer-events-none" />
    </div>
  );
}
