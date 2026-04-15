import { useState, useRef, useEffect } from 'react';
import { Palette, X, Check } from 'lucide-react';
import { saveBrandColor } from '../lib/brandColor';

const PRESET_COLORS = [
  { hex: '#C47756', label: 'Terracotta' },
  { hex: '#2563eb', label: 'Royal Blue' },
  { hex: '#16a34a', label: 'Forest Green' },
  { hex: '#9333ea', label: 'Violet' },
  { hex: '#dc2626', label: 'Crimson' },
  { hex: '#0891b2', label: 'Teal' },
  { hex: '#d97706', label: 'Amber' },
  { hex: '#374151', label: 'Slate' },
  { hex: '#ffffff', label: 'White' },
  { hex: '#111111', label: 'Onyx' },
];

export default function ColorPicker({ isEditing }: { isEditing?: boolean }) {
  const [open, setOpen] = useState(false);
  const [customHex, setCustomHex] = useState('#C47756');
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const applyColor = (hex: string) => {
    saveBrandColor(hex);
    setCustomHex(hex);
  };

  const handleCustomChange = (val: string) => {
    setCustomHex(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      applyColor(val);
    }
  };

  if (!isEditing) return null;

  return (
    <div ref={panelRef} className="fixed top-[60px] right-[5px] z-[9998] font-['Inter',sans-serif]">
      {open && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 bg-white rounded-xl shadow-[-8px_8px_30px_rgba(0,0,0,0.35)] border border-gray-100 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-[var(--brand)]" />
              <span className="text-sm font-semibold text-gray-800">Brand Color</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          </div>

          {/* Preset swatches */}
          <div className="px-4 py-3">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Presets</p>
            <div className="grid grid-cols-5 gap-2">
              {PRESET_COLORS.map(({ hex, label }) => {
                const active = customHex.toLowerCase() === hex.toLowerCase();
                return (
                  <button
                    key={hex}
                    title={label}
                    onClick={() => applyColor(hex)}
                    className="w-9 h-9 rounded-lg border-2 transition-all hover:scale-110 relative"
                    style={{
                      backgroundColor: hex,
                      borderColor: active ? 'var(--brand)' : 'transparent',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                    }}
                  >
                    {active && (
                      <Check
                        className="absolute inset-0 m-auto h-3.5 w-3.5"
                        style={{ color: isLight(hex) ? '#111' : '#fff' }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom hex input */}
          <div className="px-4 pb-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Custom</p>
            <div className="flex items-center gap-2">
              <div
                className="w-9 h-9 rounded-lg border border-gray-200 flex-shrink-0"
                style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(customHex) ? customHex : '#C47756' }}
              />
              <input
                type="text"
                value={customHex}
                onChange={(e) => handleCustomChange(e.target.value)}
                placeholder="#C47756"
                maxLength={7}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 shadow-sm focus:outline-none focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand)] transition-colors uppercase"
              />
            </div>
            {customHex.length > 0 && !/^#[0-9a-fA-F]{6}$/.test(customHex) && (
              <p className="text-xs text-red-400 mt-1">Enter a valid hex (#rrggbb)</p>
            )}
          </div>

          {/* Current brand vars */}
          <div className="px-4 pb-3">
            <p className="text-xs text-gray-400 mb-1">Brand CSS vars active:</p>
            <div className="flex gap-1.5 flex-wrap">
              {['--brand', '--brand-hover', '--brand-disabled'].map((v) => (
                <span
                  key={v}
                  className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-mono"
                >
                  {v}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Floating trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-12 h-12 rounded-full shadow-[-4px_4px_12px_rgba(0,0,0,0.3)] bg-[var(--brand)] hover:bg-[var(--brand-hover)] flex items-center justify-center transition-all hover:scale-105"
        title="Change brand color"
      >
        {open ? (
          <X className="h-5 w-5 text-white" />
        ) : (
          <Palette className="h-5 w-5 text-white" />
        )}
      </button>
    </div>
  );
}

function isLight(hex: string): boolean {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = num >> 16;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}
