"use client";

import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CardProps {
  cardStr?: string; // e.g. "AH", "10D", "5S", "KC"
  hidden?: boolean;
  className?: string;
}

const suitColors: Record<string, string> = {
  H: "#ef4444",
  D: "#ef4444",
  C: "#1e293b",
  S: "#020617",
  "♥": "#ef4444",
  "♦": "#ef4444",
  "♣": "#1e293b",
  "♠": "#020617",
};

const SuitIcon = ({ suit, className, color }: { suit: string; className?: string; color?: string }) => {
  const fill = color || suitColors[suit] || "#000000";
  
  // Canonicalize suit (support symbols, words, or letters)
  let s = suit.trim().toUpperCase();
  if (s.includes("♥") || s.includes("HEART")) s = "H";
  if (s.includes("♦") || s.includes("DIAMOND")) s = "D";
  if (s.includes("♣") || s.includes("CLUB")) s = "C";
  if (s.includes("♠") || s.includes("SPADE")) s = "S";
  
  // Fallback for one-character symbols if not caught by includes
  if (suit === "♥") s = "H";
  if (suit === "♦") s = "D";
  if (suit === "♣") s = "C";
  if (suit === "♠") s = "S";

  switch (s) {
    case "H":
      return (
        <svg viewBox="0 0 24 24" className={className} fill={fill}>
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      );
    case "D":
      return (
        <svg viewBox="0 0 24 24" className={className} fill={fill}>
          <path d="M12 2L4.5 12 12 22l7.5-10L12 2z" />
        </svg>
      );
    case "C":
      return (
        <svg viewBox="0 0 24 24" className={className} fill={fill}>
          <path d="M12 2c1.66 0 3 1.34 3 3 0 .73-.26 1.4-.7 1.92.76-.14 1.54-.15 2.3.1.94.31 1.63 1.15 1.83 2.13.2 1-.03 2.03-.63 2.85-.6.82-1.53 1.35-2.55 1.46.12.18.23.36.33.54a4.5 4.5 0 01-7.85 4.13c.12-.11.23-.23.33-.35-1.02-.11-1.95-.64-2.55-1.46-.6-.82-.83-1.85-.63-2.85.2-.98.89-1.82 1.83-2.13.76-.25 1.54-.24 2.3-.1-.44-.52-.7-1.19-.7-1.92 0-1.66 1.34-3 3-3zm1.5 17h-3v3h3v-3z" />
        </svg>
      );
    case "S":
      return (
        <svg viewBox="0 0 24 24" className={className} fill={fill}>
          <path d="M12 2C9.5 5 4 10.5 4 14.5c0 2.5 2 4.5 4.5 4.5 1.5 0 3-1 3.5-2.5.5 1.5 2 2.5 3.5 2.5 2.5 0 4.5-2 4.5-4.5C20 10.5 14.5 5 12 2zm0 18v3h-2v-3h2z" />
        </svg>
      );
    default:
      console.error("Unknown suit received:", suit);
      return (
        <div className="text-xl font-black text-rose-500 border-2 border-rose-500 p-1 flex items-center justify-center rounded bg-rose-50">
          {suit || "?"}
        </div>
      );
  }
};

export function Card({ cardStr, hidden = false, className }: CardProps) {
  if (hidden || !cardStr) {
    return (
      <motion.div
        initial={{ rotateY: 180, scale: 0.8 }}
        animate={{ rotateY: 180, scale: 1 }}
        whileHover={{ scale: 1.05 }}
        className={cn(
          "relative w-16 h-24 sm:w-20 sm:h-28 rounded-lg shadow-xl border-2 border-slate-700 bg-slate-800 flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900 overflow-hidden",
          className
        )}
      >
        <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
        <div className="text-slate-500 font-bold opacity-30 text-2xl">♠️</div>
      </motion.div>
    );
  }

  const cleanStr = cardStr.trim();
  const suitKey = cleanStr.slice(-1);
  const rank = cleanStr.slice(0, -1);
  const color = suitColors[suitKey] || "#000000";

  return (
    <motion.div
      layout
      initial={{ y: -50, opacity: 0, rotate: -10, scale: 0.5 }}
      animate={{ y: 0, opacity: 1, rotate: 0, scale: 1 }}
      whileHover={{ y: -10, scale: 1.05, rotate: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      onViewportEnter={() => console.log("Card rendered:", cleanStr)}
      className={cn(
        "relative w-16 h-24 sm:w-24 sm:h-32 bg-white rounded-md shadow-lg flex flex-col items-center justify-between p-1.5 border border-slate-200 transition-shadow hover:shadow-2xl",
        className
      )}
    >
      {/* Top Left Corner */}
      <div className="self-start flex flex-col items-center leading-none">
        <span className="text-sm font-bold tracking-tighter" style={{ color }}>{rank}</span>
        <SuitIcon suit={suitKey} className="w-3 h-3" color={color} />
      </div>
      
      {/* Large Center Symbol */}
      <div className="flex-grow flex items-center justify-center w-full">
         <SuitIcon suit={suitKey} className="w-10 h-10 sm:w-14 sm:h-14" color={color} />
      </div>

      {/* Bottom Right Corner (Upside Down) */}
      <div className="self-end flex flex-col items-center leading-none rotate-180">
        <span className="text-sm font-bold tracking-tighter" style={{ color }}>{rank}</span>
        <SuitIcon suit={suitKey} className="w-3 h-3" color={color} />
      </div>
    </motion.div>
  );
}
