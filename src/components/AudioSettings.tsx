import React, { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { brawlAudio, type AudioSettings as Settings } from '../audio/brawlAudio';

const CHANNELS: Array<{ key: 'master' | 'sfx' | 'music' | 'voice'; label: string }> = [
  { key: 'master', label: 'Genel' },
  { key: 'sfx', label: 'Efektler' },
  { key: 'music', label: 'Müzik' },
  { key: 'voice', label: 'Anons' },
];

/**
 * Volume per channel, in a small popover.
 *
 * One mute button is not enough once there is music: people want the fight
 * without the loop, or the loop without the announcer, and they want it to be
 * remembered the next time they come back.
 */
export const AudioSettings: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => brawlAudio.getSettings());

  const change = (key: 'master' | 'sfx' | 'music' | 'voice', value: number) => {
    brawlAudio.setVolume(key, value);
    setSettings(brawlAudio.getSettings());
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Ses ayarları"
        aria-expanded={open}
        className="p-3 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition shadow-lg cursor-pointer"
      >
        <SlidersHorizontal size={18} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 p-3.5 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl flex flex-col gap-3 z-30">
          {CHANNELS.map(({ key, label }) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="flex justify-between text-[11px] font-bold text-slate-300">
                <span>{label}</span>
                <span className="tabular-nums text-slate-500">{Math.round(settings[key] * 100)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings[key]}
                onChange={e => change(key, Number(e.target.value))}
                className="accent-amber-400"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
};
