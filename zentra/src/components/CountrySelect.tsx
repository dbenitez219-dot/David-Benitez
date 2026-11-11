"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { searchCountries, type CountryInfo } from "@/lib/countries-search";

/** Selector de país con buscador (nombre, código ISO o prefijo +595) y banderas. Envía el código ISO en un campo oculto. */
export function CountrySelect({ name, countries, defaultValue = "", labels, showDial = false, required = false, id }: {
  name: string; countries: CountryInfo[]; defaultValue?: string; labels: { search: string; none: string }; showDial?: boolean; required?: boolean; id?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const results = useMemo(() => searchCountries(countries, q).slice(0, 80), [countries, q]);
  const current = countries.find((c) => c.code === value);

  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);

  const pick = (c: CountryInfo) => { setValue(c.code); setOpen(false); setQ(""); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && results[active]) { e.preventDefault(); pick(results[active]); }
  };

  return (
    <div ref={box} className="relative">
      <input type="hidden" name={name} value={value} required={required} />
      <button type="button" id={id} aria-haspopup="listbox" aria-expanded={open} onClick={() => { setOpen(!open); setActive(0); }} className="input flex items-center gap-2 text-left">
        {current ? (<>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={current.flag} alt="" width={22} height={15} className="h-[15px] w-[22px] rounded-[2px] object-cover" />
          <span className="flex-1 truncate">{current.name}</span>{showDial && <span className="text-muted">{current.dial}</span>}</>) : <span className="flex-1 text-muted">—</span>}
        <span aria-hidden className="text-muted">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-64 rounded-xl border border-line bg-panel p-2 shadow-xl" onKeyDown={onKey}>
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder={labels.search} aria-label={labels.search} className="input mb-2 !py-2 !text-sm" />
          <ul role="listbox" className="max-h-64 overflow-auto">
            {results.length === 0 && <li className="px-3 py-2 text-sm text-muted">{labels.none}</li>}
            {results.map((c, i) => (
              <li key={c.code} role="option" aria-selected={c.code === value}>
                <button type="button" onClick={() => pick(c)} onMouseEnter={() => setActive(i)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${i === active ? "bg-white/10" : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.flag} alt="" width={22} height={15} loading="lazy" className="h-[15px] w-[22px] rounded-[2px] object-cover" />
                  <span className="flex-1 truncate">{c.name}</span><span className="text-xs text-muted">{c.dial}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
