import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";
import { registerShortcut, isTypingTarget } from "@/lib/shortcuts-registry";

type Shortcut = { keys: string[]; label: string };
type Group = { title: string; items: Shortcut[] };

const groups: Group[] = [
  {
    title: "عمومي",
    items: [
      { keys: ["Ctrl", "K"], label: "د کمانډ پالټ او لټون" },
      { keys: ["Ctrl", "F"], label: "د فلټر/لټون ساحه فوکس" },
      { keys: ["Shift", "؟"], label: "د کیبورډ لنډیزونه ښکاره کول" },
      { keys: ["Shift", "F1"], label: "د زده‌کړې لارښود خلاصول" },
      { keys: ["["], label: "د اړخي منو د راټولولو/خلاصولو" },
      { keys: ["]"], label: "د اړخي منو د راټولولو/خلاصولو" },
      { keys: ["Esc"], label: "د دیالوګ/سکنر تړل" },
    ],
  },
  {
    title: "ناوبري (g بیا کیلي)",
    items: [
      { keys: ["g", "d"], label: "ډشبورډ" },
      { keys: ["g", "p"], label: "پلور (POS)" },
      { keys: ["g", "i"], label: "انبار" },
      { keys: ["g", "r"], label: "راپورونه" },
      { keys: ["g", "c"], label: "پیرودونکي" },
      { keys: ["g", "s"], label: "عرضه کوونکي" },
      { keys: ["g", "u"], label: "پیرودل" },
      { keys: ["g", "x"], label: "لګښتونه" },
      { keys: ["g", "a"], label: "د پېښو ثبت" },
      { keys: ["g", "z"], label: "Z راپور" },
    ],
  },
  {
    title: "POS او پلور",
    items: [
      { keys: ["F2"], label: "بارکوډ سکنر خلاصول" },
      { keys: ["F9"], label: "چټک پلور خوندي کول" },
      { keys: ["Alt", "N"], label: "نوې مسوده پیل کول" },
      { keys: ["Alt", "P"], label: "تسویه/پلور خوندي کول" },
      { keys: ["Alt", "X"], label: "سبد پاکول" },
      { keys: ["Alt", "C"], label: "د پیرودونکي انتخاب فوکس" },
      { keys: ["Alt", "R"], label: "د تېرې تېروتنې بیا هڅه" },
      { keys: ["Alt", "H"], label: "د سکن تاریخچې پټول/ښکاره کول" },
      { keys: ["Enter"], label: "د بارکوډ داخلول/پلور خوندي کول" },
    ],
  },
  {
    title: "د سبد کرښې (فوکس شوې)",
    items: [
      { keys: ["Alt", "↑"], label: "پورته کرښې ته حرکت" },
      { keys: ["Alt", "↓"], label: "لاندې کرښې ته حرکت" },
      { keys: ["+"], label: "شمیر ډېرول" },
      { keys: ["-"], label: "شمیر کمول" },
      { keys: ["Delete"], label: "کرښه لرې کول" },
    ],
  },
  {
    title: "چاپ او راپور",
    items: [
      { keys: ["Ctrl", "P"], label: "د اوسنۍ پاڼې چاپ" },
      { keys: ["Ctrl", "E"], label: "CSV صادرول (چیرې چې شتون لري)" },
    ],
  },
];

const SHORTCUTS_EVENT = "app:open-shortcuts";

export function openShortcuts() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SHORTCUTS_EVENT));
}

export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const cleanups = [
      registerShortcut({
        id: "global.export",
        combo: "Ctrl+E",
        scope: "global",
        description: "CSV صادرول",
      }),
      registerShortcut({
        id: "global.filter",
        combo: "Ctrl+F",
        scope: "global",
        description: "لټون فوکس",
      }),
      registerShortcut({
        id: "global.help",
        combo: "Shift+؟",
        scope: "global",
        description: "د لنډیزونو پاڼه",
      }),
    ];
    const onEvt = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      const typing = isTypingTarget(e.target);

      // Ctrl/Cmd+E → trigger the visible export button on the current page.
      // Skip while typing so form fields (e.g. inline edit) keep native behavior.
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        !e.altKey &&
        (e.key === "e" || e.key === "E")
      ) {
        if (typing) return;
        const btn = document.querySelector<HTMLButtonElement>(
          '[data-shortcut="export"]:not([disabled])',
        );
        if (btn) {
          e.preventDefault();
          btn.click();
          return;
        }
      }

      // Ctrl/Cmd+F → focus the page's filter/search input.
      // Allowed even while typing (browser find replacement); the input focus
      // change is intentional and doesn't disrupt the currently typed value.
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        !e.altKey &&
        (e.key === "f" || e.key === "F")
      ) {
        const input = document.querySelector<HTMLInputElement>('[data-shortcut="filter"]');
        if (input && input !== e.target) {
          e.preventDefault();
          input.focus();
          input.select?.();
          return;
        }
      }

      if (typing) return;
      // Shift+? (which is Shift+/ on US layouts) or plain "?"
      if (
        (e.key === "?" || (e.shiftKey && (e.key === "/" || e.key === "؟"))) &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener(SHORTCUTS_EVENT, onEvt);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(SHORTCUTS_EVENT, onEvt);
      window.removeEventListener("keydown", onKey);
      cleanups.forEach((c) => c());
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-lg">
            <Keyboard className="h-5 w-5 text-accent" />د کیبورډ لنډیزونه
          </DialogTitle>
          <DialogDescription>د چټک کاري روان لپاره — په هره پاڼه کې فعال.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.title} className="panel p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {g.title}
              </div>
              <ul className="space-y-1.5">
                {g.items.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-foreground/90">{s.label}</span>
                    <span className="flex items-center gap-1">
                      {s.keys.map((k, ki) => (
                        <span key={ki} className="kbd">
                          {k}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-1 text-center text-[11px] text-muted-foreground">
          <span className="kbd">Shift</span> + <span className="kbd">؟</span> د دې پاڼې د بیا
          خلاصولو لپاره
        </p>
      </DialogContent>
    </Dialog>
  );
}
