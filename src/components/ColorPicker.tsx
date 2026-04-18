import ReactDOM from 'react-dom';
import { useState, useRef, useEffect } from 'react';
import { Palette, X, Check } from 'lucide-react';
import { saveBrandColor } from '../lib/brandColor';
import { FONT_OPTIONS, saveFontAccent, loadFontAccent } from '../lib/fontAccent';
import { FontDropdown } from './FontDropdown';

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
  const [fontDropdownOpen, setFontDropdownOpen] = useState(false);
  const [fontDropdownRect, setFontDropdownRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef(false);
  const [customHex, setCustomHex] = useState('#C47756');
  const [fontAccent, setFontAccent] = useState(
    (typeof window !== 'undefined' && localStorage.getItem('site-font-accent')) || 'Playfair Display'
  );
  const panelRef = useRef<HTMLDivElement>(null);

  // Load saved font accent on mount
  useEffect(() => {
    console.log('[ColorPicker useEffect] firing');
    loadFontAccent();
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (triggerRef.current) { triggerRef.current = false; return; }
      // Don't close if click is inside the panel (e.g. clicking FontDropdown trigger inside panel)
      if (panelRef.current && panelRef.current.contains(e.target as Node)) return;
      setOpen(false);
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
    <div ref={panelRef} style={{ top: "60px", fontFamily: "Inter, sans-serif" }} className="fixed right-[5px] z-[9998]">
      {open && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 min-h-[440px] bg-white rounded-xl shadow-[-8px_8px_30px_rgba(0,0,0,0.35)] border border-gray-100 animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-[var(--brand)]" />
              <span className="text-sm font-semibold text-gray-800">Brand Color</span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
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

          {/* Font accent picker — NOOP inside panel, rendered via portal instead */}
          <div className="px-4 pb-4 border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-700 mb-2">Heading Font</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                setFontDropdownRect(rect);
                setFontDropdownOpen(o => !o);
              }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 shadow-sm bg-white hover:bg-gray-50 transition-colors"
              style={{ fontFamily: `'${fontAccent}', serif` }}
            >
              <span>{fontAccent}</span>
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* FontDropdown portal — rendered outside panel so it doesn't get clipped/closed */}
      {fontDropdownOpen && fontDropdownRect && ReactDOM.createPortal(
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg z-[2147483647] max-h-56 overflow-y-auto"
          style={{
            top: fontDropdownRect.bottom + 4,
            left: fontDropdownRect.left,
            right: window.innerWidth - fontDropdownRect.right,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {FONT_OPTIONS.map(font => (
            <button
              key={font}
              onMouseEnter={() => {
                document.documentElement.style.setProperty('--font-accent', `'${font}', serif`);
                document.querySelectorAll('h1').forEach(el => { (el as HTMLElement).style.fontFamily = `'${font}', serif`; });
                document.querySelectorAll('.edit-title-input, .edit-price-input').forEach(el => { (el as HTMLElement).style.fontFamily = `'${font}', serif`; });
              }}
              onClick={() => {
                console.log('[FontDropdown onClick] font=', font);
                setFontAccent(font);
                saveFontAccent(font);
                setFontDropdownOpen(false);
              }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-gray-100 transition-colors"
              style={{ fontFamily: `'${font}', serif` }}
            >
              <span>{font}</span>
            </button>
          ))}
        </div>,
        document.body
      )}

      {/* Floating trigger button */}
      <button
        onMouseDown={(e) => { triggerRef.current = true; }}
        onClick={() => { setOpen(o => !o); setTimeout(() => { triggerRef.current = false; }, 0); }}
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
