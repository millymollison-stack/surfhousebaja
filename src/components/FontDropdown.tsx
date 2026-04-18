import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface FontDropdownProps {
  value: string;
  options: string[];
  onChange: (font: string) => void;
  triggerClassName?: string;
}

export function FontDropdown({ value, options, onChange, triggerClassName }: FontDropdownProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(value);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const applyFont = (font: string) => {
    document.documentElement.style.setProperty('--font-accent', `'${font}', serif`);
    document.querySelectorAll('h1').forEach(el => {
      (el as HTMLElement).style.fontFamily = `'${font}', serif`;
    });
    document.querySelectorAll('.edit-title-input').forEach(el => {
      (el as HTMLElement).style.fontFamily = `'${font}', serif`;
    });
  };

  const handleOpen = () => {
    if (triggerRef.current) setTriggerRect(triggerRef.current.getBoundingClientRect());
    setOpen(o => !o);
  };

  const handleSelect = (font: string) => {
    onChange(font);
    setHovered(font);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        ref={triggerRef}
        onClick={(e) => { e.stopPropagation(); handleOpen(); }}
        className={triggerClassName || "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 shadow-sm bg-white hover:bg-gray-50 transition-colors"}
        style={{ fontFamily: `'${hovered}', serif` }}
      >
        <span>{hovered}</span>
        <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {open && triggerRect && (
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg z-[2147483647] max-h-56 overflow-y-auto"
          style={{
            top: triggerRect.bottom + 4,
            left: triggerRect.left,
            right: window.innerWidth - triggerRect.right,
          }}
        >
          {options.map(font => (
            <button
              key={font}
              type="button"
              onMouseEnter={() => { setHovered(font); applyFont(font); }}
              onMouseLeave={() => { setHovered(value); applyFont(value); }}
              onClick={() => handleSelect(font)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-gray-100 transition-colors ${hovered === font ? 'bg-gray-50' : ''}`}
              style={{ fontFamily: `'${font}', serif` }}
            >
              <span>{font}</span>
              {value === font && <Check className="w-3.5 h-3.5 text-[var(--brand)] flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
