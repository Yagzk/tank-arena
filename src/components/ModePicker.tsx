import React from 'react';
import { MODES, MODE_IDS } from '../game/modes';
import type { BrawlGameMode } from '../types/brawl';

interface ModePickerProps {
  value: BrawlGameMode;
  onChange: (mode: BrawlGameMode) => void;
}

/** Every mode the game has, from the one table that defines them. */
export const ModePicker: React.FC<ModePickerProps> = ({ value, onChange }) => (
  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
    {MODE_IDS.map(id => {
      const mode = MODES[id];
      const selected = value === id;
      return (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`p-3 rounded-2xl border-2 flex items-center gap-2.5 transition cursor-pointer text-left ${
            selected
              ? 'border-amber-500 bg-amber-500/20 text-amber-300'
              : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600'
          }`}
        >
          <span className="text-2xl shrink-0">{mode.icon}</span>
          <div className="flex flex-col min-w-0">
            <span className="font-arcade text-[11px] font-bold leading-tight">{mode.name}</span>
            <span className="text-[10px] opacity-75 leading-tight">{mode.tagline}</span>
          </div>
        </button>
      );
    })}
  </div>
);
