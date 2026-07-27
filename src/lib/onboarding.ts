import {
  Sparkles,
  LayoutDashboard,
  ShoppingCart,
  Zap,
  Package,
  Truck,
  Users,
  FileBarChart,
  Bot,
  Settings,
  type LucideIcon,
} from "lucide-react";

export const ONBOARDING_VERSION = 1;
const STORAGE_KEY = `asserp:onboarding:v${ONBOARDING_VERSION}`;
const LANG_KEY = `asserp:onboarding:lang`;
const RESUME_KEY = `asserp:onboarding:resume`;

export type OnboardingLang = "ps" | "en";

interface Localized {
  title: string;
  description: string;
  bullets: string[];
  routeLabel?: string;
}

export interface OnboardingStep {
  id: string;
  icon: LucideIcon;
  route?: string;
  /** CSS selector to focus & highlight on the target page. */
  focusSelector?: string;
  ps: Localized;
  en: Localized;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    icon: Sparkles,
    ps: {
      title: "ښه راغلاست",
      description:
        "دا د افغان سوپر سټور د مدیریت سیستم دی — یو بشپړ POS او ERP په پښتو ژبه. په دې لنډ لارښود کې به د سیستم اصلي برخې وپیژنو.",
      bullets: [
        "د چټکو لنډیزونو لپاره Shift + ؟ کیکاږئ",
        "د هرې پاڼې ګړندي لټون لپاره Ctrl + K",
        "د زده‌کړې دا لارښود د پورتنۍ کرښې د زده‌کړې تڼۍ څخه بیا خلاصیدلی شي",
      ],
    },
    en: {
      title: "Welcome",
      description:
        "This is the Afghan SuperStore management system — a complete POS and ERP. In this short tour we'll introduce every module.",
      bullets: [
        "Press Shift + ? for all keyboard shortcuts",
        "Ctrl + K opens the global command palette",
        "Reopen this tour anytime from the Help button in the top bar",
      ],
    },
  },
  {
    id: "dashboard",
    icon: LayoutDashboard,
    route: "/",
    focusSelector: "h1",
    ps: {
      title: "ډشبورډ",
      description:
        "د ډشبورډ پاڼه د ورځې کلیدي شمېرې — پلور، ګټه، مصارف او د پور شمېرې — په یوه نظر ښیي.",
      bullets: [
        "د نن ورځې پلور، ګټه او مصارف کارتونه",
        "د وروستيو پلورونو او پیرودنو لست",
        "د اونۍ د پلور چارټ او د چټک پلور کارت",
      ],
      routeLabel: "ډشبورډ ته لاړ شه",
    },
    en: {
      title: "Dashboard",
      description:
        "The dashboard shows today's key figures — sales, profit, expenses and receivables — at a glance.",
      bullets: [
        "Today's sales, profit and expense cards",
        "Latest sales and purchases feed",
        "Weekly sales chart and quick-sale summary",
      ],
      routeLabel: "Go to dashboard",
    },
  },
  {
    id: "pos",
    icon: ShoppingCart,
    route: "/pos",
    focusSelector: '[data-onboarding-focus="pos-search"], input[type="search"], input[placeholder]',
    ps: {
      title: "پلور (POS)",
      description:
        "د پلور اصلي پاڼه: محصولات د بارکوډ سکن یا لټون سره سبد ته اضافه کړئ، بیا تسویه او 80mm رسید چاپ کړئ.",
      bullets: [
        "F2 د بارکوډ سکنر خلاصوي",
        "Alt + D د خوندي شویو مسودو منو خلاصوي",
        "Alt + P تسویه او پلور خوندي کوي",
        "د پیرودونکي انتخاب او د پور په حساب پلور ملاتړ کیږي",
      ],
      routeLabel: "POS ته لاړ شه",
    },
    en: {
      title: "Point of Sale (POS)",
      description:
        "Add products to the cart via barcode scan or search, then check out and print an 80mm receipt.",
      bullets: [
        "F2 opens the barcode scanner",
        "Alt + D opens saved drafts",
        "Alt + P completes checkout",
        "Customer selection and credit sales are supported",
      ],
      routeLabel: "Go to POS",
    },
  },
  {
    id: "quick-sale",
    icon: Zap,
    route: "/z-report",
    focusSelector: "h1",
    ps: {
      title: "چټک پلور",
      description:
        "د هغو پیرودونکو لپاره چې د هر یو لپاره بشپړ رسید نه غواړئ — د لسګونو سریع خرڅلاو په یوه تختې کې ثبت کړئ.",
      bullets: [
        "F9 چټک پلور خوندي کوي",
        "د ورځې پای لپاره Z راپور جوړ کړئ",
        "هره چټکه معامله په پېښو (audit) کې ثبتیږي",
      ],
      routeLabel: "Z راپور وګورئ",
    },
    en: {
      title: "Quick Sale",
      description:
        "For walk-in customers who don't need a full receipt — record dozens of quick sales on a single tally.",
      bullets: [
        "F9 saves a quick sale",
        "Generate a Z-report at end of day",
        "Every quick sale is logged in the audit trail",
      ],
      routeLabel: "See Z-report",
    },
  },
  {
    id: "inventory",
    icon: Package,
    route: "/products",
    focusSelector: '[data-onboarding-focus="products-add"], button:has(> svg)',
    ps: {
      title: "انبار",
      description:
        "محصولات، کټګورۍ، برانډونه او د بارکوډ مدیریت. د هر محصول د ذخیرې حرکتونه په بشپړه توګه څارل کیږي.",
      bullets: [
        "محصولات، کټګورۍ او برانډونه جوړ او سم کړئ",
        "د یو محصول لپاره څو بارکوډونه (SKU) وټاکئ",
        "د ذخیرې د حرکاتو بشپړ تاریخچه وګورئ",
      ],
      routeLabel: "محصولات وګورئ",
    },
    en: {
      title: "Inventory",
      description:
        "Manage products, categories, brands and barcodes. Every stock movement is fully tracked.",
      bullets: [
        "Create and edit products, categories and brands",
        "Assign multiple barcodes (SKUs) per product",
        "See full stock movement history",
      ],
      routeLabel: "Open products",
    },
  },
  {
    id: "purchases",
    icon: Truck,
    route: "/purchases",
    focusSelector: "h1",
    ps: {
      title: "پیرودنه او بېرته راګرځول",
      description:
        "د عرضه کوونکو څخه پیرودنه ثبت کړئ، خراب مال بېرته وګرځوئ، او د هر عرضه کوونکي کتابچه وګورئ.",
      bullets: [
        "د پیرودنې د بشپړ جریان ملاتړ (پرمختګ، تصویب، تسویه)",
        "د پیرودنې بېرته راګرځول د ذخیرې اتومات تصحیح سره",
        "د هر عرضه کوونکي بشپړه کتابچه او پور",
      ],
      routeLabel: "پیرودنې ته لاړ شه",
    },
    en: {
      title: "Purchases & Returns",
      description:
        "Record supplier purchases, return defective stock, and view each supplier's ledger.",
      bullets: [
        "Full purchase workflow (draft, approve, settle)",
        "Purchase returns auto-adjust stock",
        "Complete per-supplier ledger and balance",
      ],
      routeLabel: "Go to purchases",
    },
  },
  {
    id: "customers",
    icon: Users,
    route: "/customers",
    focusSelector: "h1",
    ps: {
      title: "پیرودونکي او عرضه کوونکي",
      description:
        "د خپلو پیرودونکو او عرضه کوونکو ټول معلومات، تړونونه، پورونه او ورکړې په یوه ځای کې مدیریت کړئ.",
      bullets: [
        "د پیرودونکي/عرضه کوونکي بشپړه کتابچه (ledger)",
        "د پور او ورکړو د حساب توازن",
        "د کتابچې د CSV صادرولو ملاتړ",
      ],
      routeLabel: "پیرودونکي وګورئ",
    },
    en: {
      title: "Customers & Suppliers",
      description:
        "Manage all customer and supplier information, contracts, receivables and payments in one place.",
      bullets: [
        "Full per-entity ledger",
        "Receivable/payable running balances",
        "CSV export for every ledger",
      ],
      routeLabel: "Open customers",
    },
  },
  {
    id: "reports",
    icon: FileBarChart,
    route: "/reports",
    focusSelector: "h1",
    ps: {
      title: "راپورونه او حسابونه",
      description:
        "بشپړ مالي راپورونه: د ګټې او زیان راپور، بیلانس شیټ، د انبار ارزښت، د پور راپورونه او نور.",
      bullets: [
        "د ګټې/زیان (P&L) او بیلانس شیټ",
        "د انبار ارزښت او د پای نېټې راپور",
        "د A4 چاپ او PDF صادرولو ملاتړ",
        "د فلټر ذخیره شوي پرېسیټونه",
      ],
      routeLabel: "راپورونه وګورئ",
    },
    en: {
      title: "Reports & Accounting",
      description:
        "Full financial reports: P&L, Balance Sheet, inventory valuation, receivables and more.",
      bullets: [
        "Profit & Loss and Balance Sheet",
        "Inventory valuation and aging",
        "A4 print and PDF export",
        "Saved filter presets",
      ],
      routeLabel: "Open reports",
    },
  },
  {
    id: "assistant",
    icon: Bot,
    route: "/assistant",
    focusSelector: '[data-onboarding-focus="assistant-input"], textarea, input[type="text"]',
    ps: {
      title: "هوښیار مرستیال",
      description:
        "په پښتو ژبه AI مرستیال چې د خوندي راپورونو معلوماتو ته لاسرسی لري — د AFN او کابل وخت سره ځوابونه.",
      bullets: [
        "یوازې پښتو ژبه ځوابونه ورکوي",
        "یوازې د تعریف شویو راپورونو معلومات کاروي",
        "د خبرو تاریخچه خوندي کیږي",
      ],
      routeLabel: "مرستیال ته لاړ شه",
    },
    en: {
      title: "AI Assistant",
      description:
        "A Pashto AI assistant with safe access to your reports — answers in AFN and Kabul time.",
      bullets: [
        "Replies in Pashto only",
        "Uses only predefined report data",
        "Chat history is saved",
      ],
      routeLabel: "Open assistant",
    },
  },
  {
    id: "settings",
    icon: Settings,
    route: "/settings",
    focusSelector: "h1",
    ps: {
      title: "تنظیمات او پای",
      description:
        "د پلورنځي معلومات، د چاپګر ازموینه، د تور/رڼا موډ او د لنډیزونو بشپړ لست په تنظیماتو کې دي.",
      bullets: [
        "د پلورنځي نوم، پته او د رسید سر معلومات",
        "د 80mm چاپګر د ازموینې رسید",
        "د تور/رڼا موډ بدلول",
        "Shift + ؟ د ټولو کیبورډ لنډیزونو لپاره",
      ],
      routeLabel: "تنظیمات ته لاړ شه",
    },
    en: {
      title: "Settings & Finish",
      description:
        "Store details, printer self-test, dark/light theme and the full shortcut list live in settings.",
      bullets: [
        "Store name, address and receipt header",
        "80mm printer test receipt",
        "Toggle dark/light theme",
        "Shift + ? for the full shortcut list",
      ],
      routeLabel: "Open settings",
    },
  },
];

interface Progress {
  lastStep: number;
  dismissed: boolean;
}

function readProgress(): Progress {
  if (typeof window === "undefined") return { lastStep: 0, dismissed: false };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { lastStep: 0, dismissed: false };
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return {
      lastStep: Math.min(Math.max(parsed.lastStep ?? 0, 0), ONBOARDING_STEPS.length - 1),
      dismissed: Boolean(parsed.dismissed),
    };
  } catch {
    return { lastStep: 0, dismissed: false };
  }
}

function writeProgress(p: Progress) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

export function getLastStep(): number {
  return readProgress().lastStep;
}

export function setLastStep(step: number) {
  const cur = readProgress();
  writeProgress({ ...cur, lastStep: step });
}

export function markDismissed(dismissed: boolean) {
  const cur = readProgress();
  writeProgress({ ...cur, dismissed });
}

export function isDismissed(): boolean {
  return readProgress().dismissed;
}

export function resetProgress() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(RESUME_KEY);
  } catch {
    // ignore
  }
}

// ---------- Language ----------

export function getLang(): OnboardingLang {
  if (typeof window === "undefined") return "ps";
  try {
    const v = window.localStorage.getItem(LANG_KEY);
    return v === "en" ? "en" : "ps";
  } catch {
    return "ps";
  }
}

export function setLang(lang: OnboardingLang) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LANG_KEY, lang);
  } catch {
    // ignore
  }
}

// ---------- Resume-on-return ----------

export interface ResumeState {
  stepIndex: number;
  route: string;
  ts: number;
}

export function markResume(stepIndex: number, route: string) {
  if (typeof window === "undefined") return;
  try {
    const s: ResumeState = { stepIndex, route, ts: Date.now() };
    window.localStorage.setItem(RESUME_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

export function readResume(): ResumeState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ResumeState;
  } catch {
    return null;
  }
}

export function clearResume() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RESUME_KEY);
  } catch {
    // ignore
  }
}

export function findStepByRoute(pathname: string): number {
  return ONBOARDING_STEPS.findIndex((s) => s.route && s.route === pathname);
}
