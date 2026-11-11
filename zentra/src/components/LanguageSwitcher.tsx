import { LOCALES, LOCALE_NAMES } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { setLocaleAction } from "@/app/locale-actions";

/** Selector de idioma (español, inglés, portugués). `next` es la ruta a la que se vuelve. */
export async function LanguageSwitcher({ next = "" }: { next?: string }) {
  const current = await getLocale();
  return (
    <form action={setLocaleAction} className="flex items-center gap-1 text-xs" aria-label="Language">
      <input type="hidden" name="next" value={next} />
      {LOCALES.map((l) => (
        <button key={l} name="locale" value={l} aria-pressed={l === current} lang={l}
          className={`rounded-full border px-2.5 py-1 ${l === current ? "border-zred bg-zred/15 text-white" : "border-line text-muted hover:text-white"}`}>{LOCALE_NAMES[l]}</button>
      ))}
    </form>
  );
}
