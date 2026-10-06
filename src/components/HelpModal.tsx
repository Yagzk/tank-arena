import React from 'react';
import { X, Crosshair, Bomb, Shield, Zap, Sparkles, Move } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <Crosshair size={20} />
            </div>
            <div>
              <h3 className="font-arcade text-lg font-bold text-slate-100">KONTROLLER & TAKTİKLER</h3>
              <p className="text-xs text-slate-400">Tank Arenasında hayatta kalma rehberi</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-4 text-sm text-slate-300">
          {/* Controls list */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
              <div className="p-2 rounded-xl bg-slate-800 text-sky-400">
                <Move size={18} />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-200">W, A, S, D / Oklar</span>
                <span className="text-[11px] text-slate-400">Tankı sür ve döndür</span>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
              <div className="p-2 rounded-xl bg-slate-800 text-sky-400">
                <Crosshair size={18} />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-200">Fare / Boşluk (Space)</span>
                <span className="text-[11px] text-slate-400">Hedefe nişan al & ateş et</span>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
              <div className="p-2 rounded-xl bg-slate-800 text-rose-400">
                <Bomb size={18} />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-200">Sağ Tık / E / Q</span>
                <span className="text-[11px] text-slate-400">Mayın döşe</span>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
              <div className="p-2 rounded-xl bg-slate-800 text-amber-400">
                <Sparkles size={18} />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-200">Mermi Sekmesi</span>
                <span className="text-[11px] text-slate-400">Mermiler 2 kez seker!</span>
              </div>
            </div>
          </div>

          {/* Tactical Tips */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
            <h4 className="font-arcade text-xs font-bold text-sky-400 uppercase tracking-wider mb-2">
              Önemli Güçlendirmeler (Kutulardan Çıkar)
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2">
                <Shield size={14} className="text-sky-400" />
                <span><strong className="text-sky-300">Kalkan:</strong> 1 ölümcül vuruşu engeller.</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-amber-400" />
                <span><strong className="text-amber-300">Turbo:</strong> %50 hız artışı sağlar.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-orange-400 font-bold">3X</span>
                <span><strong className="text-orange-300">Üçlü Atış:</strong> Aynı anda 3 mermi sıkar.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-rose-400 font-bold">⚡</span>
                <span><strong className="text-rose-300">Lazer:</strong> Işık hızında delici atış.</span>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-400 italic text-center">
            İpucu: Kendi sıktığınız mermi duvarlardan sekip size de çarpabilir! Açıları iyi hesaplayın.
          </p>
        </div>

        {/* Footer */}
        <button
          onClick={onClose}
          className="mt-5 w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-arcade font-bold text-xs transition"
        >
          ANLADIM, ARENAYA DÖN!
        </button>
      </div>
    </div>
  );
};
