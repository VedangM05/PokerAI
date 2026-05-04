"use client";

import { motion } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CardProps {
  cardStr?: string;
  hidden?: boolean;
  className?: string;
}

const suitColors: Record<string, string> = {
  H: "#dc2626",
  D: "#dc2626",
  C: "#111827",
  S: "#111827",
};

function normalizeSuit(suit: string): string {
  let s = suit.trim().toUpperCase();
  if (s === "♥") return "H";
  if (s === "♦") return "D";
  if (s === "♣") return "C";
  if (s === "♠") return "S";
  return s;
}

// ================= SUIT ICON =================
const SuitIcon = ({ suit, className, color }: any) => {
  const fill = color;

  switch (suit) {
    case "H":
      return <svg viewBox="0 0 24 24" className={className} fill={fill}><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>;
    case "D":
      return <svg viewBox="0 0 24 24" className={className} fill={fill}><path d="M12 2L4.5 12 12 22l7.5-10L12 2z"/></svg>;
    case "C":
      return <svg viewBox="0 0 100 100" className={className} fill={fill}><circle cx="50" cy="30" r="18"/><circle cx="28" cy="58" r="18"/><circle cx="72" cy="58" r="18"/><rect x="44" y="68" width="12" height="20" rx="4"/><rect x="32" y="84" width="36" height="8" rx="4"/></svg>;
    case "S":
      return <svg viewBox="0 0 24 24" className={className} fill={fill}><path d="M12 2C9.5 5 4 10.5 4 14.5c0 2.5 2 4.5 4.5 4.5 1.5 0 3-1 3.5-2.5.5 1.5 2 2.5 3.5 2.5 2.5 0 4.5-2 4.5-4.5C20 10.5 14.5 5 12 2z"/></svg>;
    default:
      return null;
  }
};

// ================= CORNER =================
function Corner({ rank, suit, color, flip = false }: any) {
  return (
    <div
      className={cn(
        "flex flex-col items-center font-bold leading-none",
        "text-[9px] sm:text-[11px]",
        flip && "rotate-180"
      )}
    >
      <span style={{ color }}>{rank}</span>
    </div>
  );
}

// ================= FACE =================
function FaceCenter({ rank, suit, color }: any) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5">
      <span className="font-serif font-extrabold text-2xl sm:text-3xl" style={{ color }}>
        {rank}
      </span>
      <SuitIcon suit={suit} color={color} className="w-6 h-6 sm:w-8 sm:h-8" />
    </div>
  );
}

// ================= MAIN CARD =================
export function Card({ cardStr, hidden = false, className }: CardProps) {
  if (hidden || !cardStr) {
    return (
      <motion.div
        className={cn(
          "relative overflow-hidden rounded-2xl shadow-lg border border-white/10",
          "aspect-[5/7] w-16 sm:w-24",
          className
        )}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-950" />
        <div className="absolute inset-0 flex items-center justify-center opacity-30">
          <SuitIcon suit="S" className="w-10 h-10 text-white" />
        </div>
      </motion.div>
    );
  }

  const suit = normalizeSuit(cardStr.slice(-1));
  const rank = cardStr.slice(0, -1);
  const color = suitColors[suit];

  return (
    <motion.div
      whileHover={{ y: -6, scale: 1.05 }}
      className={cn(
        "relative bg-white rounded-2xl shadow-md border border-black/10",
        "aspect-[5/7] w-16 sm:w-24",
        "flex flex-col overflow-hidden select-none",
        className
      )}
    >
      {/* corners */}
      <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2">
        <Corner rank={rank} suit={suit} color={color} />
      </div>
      <div className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2">
        <Corner rank={rank} suit={suit} color={color} flip />
      </div>

      {/* center */}
      <div className="flex-1 flex items-center justify-center">
        <FaceCenter rank={rank} suit={suit} color={color} />
      </div>
    </motion.div>
  );
}