import { makeRouteErrorComponent } from "@/components/route-error-page";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ProtectedRoute } from "@/components/protected-route";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { t } from "@/lib/i18n";
import { toast } from "sonner";
import { getScannerPrefs, setScannerPrefs, type ScannerPrefs } from "@/lib/scanner-prefs";
import { getQuickSalePrefs, setQuickSalePrefs, type QuickSalePrefs } from "@/lib/quick-sale-prefs";
import { hasAnyRole } from "@/hooks/use-auth";
import { jalaliDateTime } from "@/lib/format";
import { Download, HardDrive, Minus, Monitor, Plus, RefreshCw, RotateCcw, Upload } from "lucide-react";
import { APP_ZOOM, getAppZoom, setAppZoom } from "@/lib/app-zoom";
import { resetLocalOperatorPassword, signOutLocally } from "@/lib/local-auth";
import {
  exportLocalDatabase,
  getLocalDatabaseHealth,
  restoreLocalDatabase,
  type LocalDatabaseHealth,
} from "@/lib/local-sqlite";
import {
  getLocalStoreSettings,
  listLocalAuditPurgeLog,
  listLocalOperators,
  previewLocalAuditPurge,
  runLocalAuditPurge,
  updateLocalStoreSettings,
} from "@/lib/local-store";

const TAB_KEYS = [
  "profile",
  "store",
  "scanner",
  "quicksale",
  "printer",
  "display",
  "security",
  "backup",
  "audit",
] as const;
type TabKey = (typeof TAB_KEYS)[number];
const LAST_TAB_KEY = "settings.lastTab";

const searchSchema = z.object({
  tab: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/settings")({
  validateSearch: zodValidator(searchSchema),
  component: () => (
    <ProtectedRoute>
      <SettingsPage />
    </ProtectedRoute>
  ),

  errorComponent: makeRouteErrorComponent("تنظیمات"),
});

function SettingsPage() {
  const { user, roles } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/settings" });
  const isAdmin = hasAnyRole(roles, ["owner", "admin"]);
  const availableTabs = TAB_KEYS.filter(
    (key) => (key !== "audit" && key !== "backup" && key !== "security") || isAdmin,
  );
  const resolveTab = (raw: string): TabKey => {
    if ((availableTabs as readonly string[]).includes(raw)) return raw as TabKey;
    return "profile";
  };

  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (search.tab) return resolveTab(search.tab);
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(LAST_TAB_KEY) ?? "";
      if (saved) return resolveTab(saved);
    }
    return "profile";
  });

  // If URL tab param changes (deep link / back button), reflect it.
  useEffect(() => {
    if (search.tab) {
      const t2 = resolveTab(search.tab);
      if (t2 !== activeTab) setActiveTab(t2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.tab]);

  // Ensure URL reflects current tab (deep-linkable) on first mount.
  useEffect(() => {
    if (search.tab !== activeTab) {
      navigate({ search: { tab: activeTab }, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTabChange = (v: string) => {
    const t2 = resolveTab(v);
    setActiveTab(t2);
    try {
      localStorage.setItem(LAST_TAB_KEY, t2);
    } catch {
      /* ignore */
    }
    navigate({ search: { tab: t2 }, replace: true });
  };

  const [store, setStore] = useState({
    store_name: "",
    address: "",
    phone: "",
    receipt_footer: "",
  });
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<ScannerPrefs>(() => getScannerPrefs());
  const [qsPrefs, setQsPrefs] = useState<QuickSalePrefs>(() => getQuickSalePrefs());
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);

  const updatePref = (patch: Partial<ScannerPrefs>) => setPrefs(setScannerPrefs(patch));
  const updateQs = (patch: Partial<QuickSalePrefs>) => setQsPrefs(setQuickSalePrefs(patch));

  const loadCameras = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      // request permission so labels populate
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        s.getTracks().forEach((t) => t.stop());
      } catch {
        /* permission may be denied */
      }
      const list = await navigator.mediaDevices.enumerateDevices();
      setCameras(list.filter((d) => d.kind === "videoinput"));
    } catch (e) {
      toast.error((e as Error).message || "کیمرې نه شي کشف کیدی");
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await getLocalStoreSettings();
        setStore({
          store_name: data.store_name,
          address: data.address ?? "",
          phone: data.phone ?? "",
          receipt_footer: data.receipt_footer ?? "",
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "تنظیمات نه شي لوستل کېدی");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    try {
      await updateLocalStoreSettings(store);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "د خوندي کولو تېروتنه");
      return;
    }
    toast.success("خوندي شو");
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-bold">{t.settings}</h1>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList className="inline-flex h-auto w-max min-w-full justify-start gap-1 md:flex md:w-full md:flex-wrap">
            <TabsTrigger value="profile" className="shrink-0 data-[state=active]:shadow-sm">
              {t.profile}
            </TabsTrigger>
            <TabsTrigger value="store" className="shrink-0 data-[state=active]:shadow-sm">
              پلورنځی
            </TabsTrigger>
            <TabsTrigger value="scanner" className="shrink-0 data-[state=active]:shadow-sm">
              سکینر
            </TabsTrigger>
            <TabsTrigger value="quicksale" className="shrink-0 data-[state=active]:shadow-sm">
              {t.quickSaleSettings}
            </TabsTrigger>
            <TabsTrigger value="printer" className="shrink-0 data-[state=active]:shadow-sm">
              {t.printerSelfTest}
            </TabsTrigger>
            <TabsTrigger value="display" className="shrink-0 data-[state=active]:shadow-sm">
              ښودنه
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="security" className="shrink-0 data-[state=active]:shadow-sm">
                امنیت
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="backup" className="shrink-0 data-[state=active]:shadow-sm">
                بیک اپ
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="audit" className="shrink-0 data-[state=active]:shadow-sm">
                پلټنه
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.profile}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">{t.email}: </span>
                {user?.email}
              </div>
              <div>
                <span className="text-muted-foreground">رول: </span>
                {roles.map((r) => t.roles[r] ?? r).join("، ") || "—"}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="store" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">د پلورنځي معلومات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="text-muted-foreground">{t.loading}</div>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label>د پلورنځي نوم</Label>
                    <Input
                      value={store.store_name}
                      onChange={(e) => setStore({ ...store, store_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t.address}</Label>
                    <Input
                      value={store.address}
                      onChange={(e) => setStore({ ...store, address: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t.phone}</Label>
                    <Input
                      dir="ltr"
                      value={store.phone}
                      onChange={(e) => setStore({ ...store, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>د بیل لاندنۍ لیکنه</Label>
                    <Textarea
                      value={store.receipt_footer}
                      onChange={(e) => setStore({ ...store, receipt_footer: e.target.value })}
                    />
                  </div>
                  <Button onClick={save}>{t.save}</Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scanner" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">د بارکوډ سکینر غوره توبونه</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <PrefRow
                label="د سکن غږ (Beep)"
                desc="د بریالي/ناکام سکن پر مهال د غږ چلول"
                checked={prefs.beep}
                onChange={(v) => updatePref({ beep: v })}
              />
              <PrefRow
                label="د موبایل ښورېدل (Vibrate)"
                desc="د پرلپسې سکن پر مهال د لمس ښورېدل"
                checked={prefs.vibrate}
                onChange={(v) => updatePref({ vibrate: v })}
              />
              <PrefRow
                label="د شنه/سره پوښ (Overlay)"
                desc="د سکن پایلې د لیدلو لپاره رنګه پوښ"
                checked={prefs.overlay}
                onChange={(v) => updatePref({ overlay: v })}
              />
              <PrefRow
                label="پرله پسې سکن (Continuous)"
                desc="د دیالوګ خلاصیدو پر مهال به دا حالت یاد وي"
                checked={prefs.continuous}
                onChange={(v) => updatePref({ continuous: v })}
              />
              <PrefRow
                label="په پلور کې خپلکار پرانستل"
                desc="د POS پاڼې خلاصیدو سره سم د سکینر پرانستل"
                checked={prefs.autoOpenPos}
                onChange={(v) => updatePref({ autoOpenPos: v })}
              />
              <PrefRow
                label="په پېرود کې خپلکار پرانستل"
                desc="د نوي پېرود دیالوګ خلاصیدو سره سم د سکینر پرانستل"
                checked={prefs.autoOpenPurchase}
                onChange={(v) => updatePref({ autoOpenPurchase: v })}
              />
              <div className="rounded-md border p-2">
                <Label className="text-xs">د تکرار سکن حالت</Label>
                <select
                  className="mt-1 w-full rounded border bg-background p-1 text-xs"
                  value={prefs.repeatScanMode}
                  onChange={(e) =>
                    updatePref({ repeatScanMode: e.target.value as "increment" | "pack" })
                  }
                >
                  <option value="pack">هره ځل د بستې اندازه زیاته کړه (pack_size)</option>
                  <option value="increment">هره ځل یوازې یو دانه زیاته کړه</option>
                </select>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  کله چې ورته بارکوډ بیا سکن شي، شمېر څنګه زیات شي
                </div>
              </div>
              <PrefRow
                label="د سکن تاریخچه وساتئ"
                desc="د پاڼې تازه کیدو وروسته به سکن شوي کوډونه پاتې وي"
                checked={prefs.scanHistoryPersist}
                onChange={(v) => updatePref({ scanHistoryPersist: v })}
              />
              <div className="rounded-md border p-2">
                <Label className="text-xs">د تاریخچې حد (شمېر)</Label>
                <Input
                  type="number"
                  min={5}
                  max={500}
                  step={5}
                  dir="ltr"
                  value={prefs.scanHistoryLimit}
                  onChange={(e) =>
                    updatePref({
                      scanHistoryLimit: Math.max(5, Math.min(500, Number(e.target.value) || 50)),
                    })
                  }
                  disabled={!prefs.scanHistoryPersist}
                />
                <div className="mt-1 text-[11px] text-muted-foreground">
                  د ساتل شوو سکنونو اعظمي شمېر — له دې زیات به تر ټولو زوړ لیرې شي
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-2">
                  <Label className="text-xs">د سکن ترمنځ ځنډ (ms)</Label>
                  <Input
                    type="number"
                    min={200}
                    step={50}
                    dir="ltr"
                    value={prefs.cooldownMs}
                    onChange={(e) =>
                      updatePref({ cooldownMs: Math.max(200, Number(e.target.value) || 900) })
                    }
                  />
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    په پرله پسې سکن کې د دوو سکنونو ترمنځ لږ ځنډ — د نقل مخنیوی
                  </div>
                </div>
                <div className="rounded-md border p-2">
                  <Label className="text-xs">غوره کیمره</Label>
                  <select
                    className="mt-1 w-full rounded border bg-background p-1 text-xs"
                    dir="ltr"
                    value={prefs.preferredCameraId}
                    onChange={(e) => updatePref({ preferredCameraId: e.target.value })}
                  >
                    <option value="">خپلکار (شاته کیمره لومړیتوب)</option>
                    {cameras.map((c, i) => (
                      <option key={c.deviceId} value={c.deviceId}>
                        {c.label || `کیمره ${i + 1}`}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>موجود: {cameras.length}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      onClick={loadCameras}
                    >
                      تازه کول
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quicksale" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.quickSaleSettings}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <PrefRow
                label={t.qsAllowDiscounts}
                desc={t.qsAllowDiscountsDesc}
                checked={qsPrefs.allowDiscounts}
                onChange={(v) => updateQs({ allowDiscounts: v })}
              />
              <PrefRow
                label={t.qsForceCash}
                desc={t.qsForceCashDesc}
                checked={qsPrefs.forceCash}
                onChange={(v) => updateQs({ forceCash: v })}
              />
              <PrefRow
                label={t.qsShowPreview}
                desc={t.qsShowPreviewDesc}
                checked={qsPrefs.showPreviewLater}
                onChange={(v) => updateQs({ showPreviewLater: v })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-2">
                  <Label className="text-xs">{t.qsAutoCommitMinutes}</Label>
                  <Input
                    type="number"
                    min={0}
                    dir="ltr"
                    value={qsPrefs.autoCommitMinutes}
                    onChange={(e) =>
                      updateQs({ autoCommitMinutes: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {t.qsAutoCommitMinutesDesc}
                  </div>
                </div>
                <div className="rounded-md border p-2">
                  <Label className="text-xs">{t.qsAutoCommitCount}</Label>
                  <Input
                    type="number"
                    min={0}
                    dir="ltr"
                    value={qsPrefs.autoCommitItemCount}
                    onChange={(e) =>
                      updateQs({ autoCommitItemCount: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {t.qsAutoCommitCountDesc}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="printer" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.printerSelfTest}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="text-xs text-muted-foreground">{t.printerSelfTestDesc}</div>
              <Button onClick={runPrinterSelfTest}>{t.printerSelfTest}</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="display" className="mt-4">
          <DisplayZoomCard />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="security" className="mt-4">
            <PasswordResetCard />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="backup" className="mt-4">
            <BackupRestoreCard />
          </TabsContent>
        )}

        {hasAnyRole(roles, ["owner", "admin"]) && (
          <TabsContent value="audit" className="mt-4">
            <AuditRetentionCard />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function DisplayZoomCard() {
  const [zoom, setZoom] = useState(() => getAppZoom());

  useEffect(() => {
    const onZoomChange = (event: Event) => setZoom((event as CustomEvent<number>).detail);
    window.addEventListener(APP_ZOOM.ZOOM_EVENT, onZoomChange);
    return () => window.removeEventListener(APP_ZOOM.ZOOM_EVENT, onZoomChange);
  }, []);

  const updateZoom = (value: number) => setZoom(setAppZoom(value));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Monitor className="h-4 w-4" />د اپلیکیشن ښودنه
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          د اپلیکیشن د متن او برخو اندازه بدله کړئ. دا غوره توب په دې وسیله کې خوندي کیږي.
        </p>
        <div className="flex items-center gap-2" dir="ltr">
          <Button
            size="icon"
            variant="outline"
            onClick={() => updateZoom(zoom - APP_ZOOM.ZOOM_STEP)}
            disabled={zoom <= APP_ZOOM.MIN_ZOOM}
            title="Zoom out"
          >
            <Minus className="h-4 w-4" />
            <span className="sr-only">Zoom out</span>
          </Button>
          <div className="min-w-20 text-center text-lg font-semibold tabular-nums">{zoom}%</div>
          <Button
            size="icon"
            variant="outline"
            onClick={() => updateZoom(zoom + APP_ZOOM.ZOOM_STEP)}
            disabled={zoom >= APP_ZOOM.MAX_ZOOM}
            title="Zoom in"
          >
            <Plus className="h-4 w-4" />
            <span className="sr-only">Zoom in</span>
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => updateZoom(APP_ZOOM.DEFAULT_ZOOM)}
            disabled={zoom === APP_ZOOM.DEFAULT_ZOOM}
            title="Reset zoom"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="sr-only">Reset zoom</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground" dir="ltr">
          Ctrl + / Ctrl - to zoom, Ctrl 0 to reset
        </p>
      </CardContent>
    </Card>
  );
}

function PasswordResetCard() {
  const { roles } = useAuth();
  const [operatorId, setOperatorId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const operators = useQuery({ queryKey: ["local-operators"], queryFn: listLocalOperators });

  const resetPassword = async () => {
    if (!operatorId) {
      toast.error("کارونکی وټاکئ");
      return;
    }
    if (password.length < 6) {
      toast.error("پټ نوم باید لږ تر لږه ۶ توري ولري");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("پټ نومونه یو شان نه دي");
      return;
    }
    setSaving(true);
    try {
      await resetLocalOperatorPassword(operatorId, password);
      setPassword("");
      setConfirmPassword("");
      toast.success("پټ نوم بدل شو");
    } catch (error) {
      const message = error instanceof Error ? error.message : "پټ نوم بدل نه شو";
      toast.error(
        message === "owner_password_reset_requires_owner"
          ? "یوازې مالک د مالک پټ نوم بدلولی شي"
          : message,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">د کاروونکي پټ نوم بدلول</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          دا عمل پخوانی پټ نوم نه ښيي. بدلون د پلټنې په ثبت کې ساتل کیږي.
          {!roles.includes("owner") && " یوازې غیر مالک کارونکي بدلولی شئ."}
        </p>
        <div className="space-y-1">
          <Label>کارونکی</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={operatorId}
            onChange={(event) => setOperatorId(event.target.value)}
          >
            <option value="">کارونکی وټاکئ</option>
            {(operators.data ?? []).map((operator) => (
              <option key={operator.id} value={operator.id}>
                {operator.full_name} ({operator.email})
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>نوی پټ نوم</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>پټ نوم بیا ولیکئ</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
        </div>
        <Button onClick={resetPassword} disabled={saving || operators.isLoading}>
          {saving ? "…" : "پټ نوم بدل کړه"}
        </Button>
      </CardContent>
    </Card>
  );
}

function BackupRestoreCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [health, setHealth] = useState<LocalDatabaseHealth | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(true);

  const refreshHealth = async () => {
    setLoadingHealth(true);
    try {
      setHealth(await getLocalDatabaseHealth());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "د معلوماتو حالت نه لوستل کیږي");
    } finally {
      setLoadingHealth(false);
    }
  };

  useEffect(() => {
    void refreshHealth();
  }, []);

  const downloadBackup = async () => {
    setExporting(true);
    try {
      const bytes = await exportLocalDatabase();
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const url = URL.createObjectURL(new Blob([copy.buffer], { type: "application/x-sqlite3" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `erp-backup-${new Date().toISOString().replaceAll(":", "-")}.sqlite`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      await refreshHealth();
      toast.success("بیک اپ ډاونلوډ شو");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بیک اپ جوړ نه شو");
    } finally {
      setExporting(false);
    }
  };

  const restoreBackup = async () => {
    if (!restoreFile) return;
    setRestoring(true);
    try {
      await restoreLocalDatabase(new Uint8Array(await restoreFile.arrayBuffer()));
      signOutLocally();
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بیک اپ بېرته راونه ګرځېد");
      setRestoring(false);
      setRestoreFile(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">د معلوماتو بیک اپ او بېرته راوستل</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          بیک اپ ټول محلي معلومات، کارونکي، پلور، سټاک او تنظیمات په یوه SQLite فایل کې ساتي.
        </p>
        <div className="rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-medium">
              <HardDrive className="h-4 w-4" />د محلي زېرمتون حالت
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => void refreshHealth()}
              disabled={loadingHealth}
            >
              <RefreshCw className={`h-4 w-4 ${loadingHealth ? "animate-spin" : ""}`} />
              <span className="sr-only">تازه کول</span>
            </Button>
          </div>
          {health && (
            <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
              <div>
                <div className="text-muted-foreground">د معلوماتو اندازه</div>
                <div className="font-medium">{formatBytes(health.databaseBytes)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">وروستی بیک اپ</div>
                <div
                  className={health.lastBackupAt ? "font-medium" : "font-medium text-destructive"}
                >
                  {health.lastBackupAt
                    ? new Date(health.lastBackupAt).toLocaleString()
                    : "تر اوسه نشته"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">د براوزر کارونه</div>
                <div className="font-medium">
                  {health.storageUsageBytes === null || health.storageQuotaBytes === null
                    ? "معلوم نه دی"
                    : `${formatBytes(health.storageUsageBytes)} / ${formatBytes(health.storageQuotaBytes)}`}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={downloadBackup} disabled={exporting}>
            <Download className="ml-1 h-4 w-4" />
            {exporting ? "…" : "بیک اپ ډاونلوډ"}
          </Button>
          <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={restoring}>
            <Upload className="ml-1 h-4 w-4" />
            بیک اپ غوره کړئ
          </Button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".sqlite,application/x-sqlite3,application/octet-stream"
            onChange={(event) => {
              setRestoreFile(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
        </div>
        {restoreFile && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <div className="font-medium">د بیک اپ بدلول</div>
            <div className="mt-1 text-xs text-muted-foreground" dir="ltr">
              {restoreFile.name} ({Math.ceil(restoreFile.size / 1024).toLocaleString()} KB)
            </div>
            <div className="mt-2 text-xs text-destructive">
              اوسني ټول معلومات به بدل شي او اپلیکیشن به بیا پرانستل شي.
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="mt-3" variant="destructive">
                  بېرته راوستل
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>بیک اپ بېرته راوستل؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    اوسني ټول محلي معلومات به د ټاکل شوي بیک اپ په معلوماتو بدل شي. دا عمل بېرته نه
                    ګرځي.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>لغوه</AlertDialogCancel>
                  <AlertDialogAction onClick={restoreBackup} disabled={restoring}>
                    {restoring ? "…" : "هو، بېرته یې راوړه"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function runPrinterSelfTest() {
  try {
    const html = `<!doctype html><html lang="ps-AF" dir="rtl"><head><meta charset="utf-8"/><title>Printer Test</title>
<style>@page{size:80mm auto;margin:0} body{font-family:'Vazirmatn','Noto Naskh Arabic',sans-serif;width:80mm;padding:8px;color:#000}
.c{text-align:center} .b{border-top:1px dashed #000;margin:6px 0} .row{display:flex;justify-content:space-between;font-size:11px}
h1{font-size:14px;margin:0} .small{font-size:10px}</style></head><body>
<div class="c"><h1>د چاپګر ازموینه</h1><div class="small">Printer Self-Test</div></div>
<div class="b"></div>
<div class="row"><span>نېټه</span><span>${new Date().toLocaleString("en-GB")}</span></div>
<div class="row"><span>پاڼه</span><span>80mm</span></div>
<div class="row"><span>ټکی نمونه</span><span>ABC ابج ۰۱۲۳۴۵۶۷۸۹</span></div>
<div class="b"></div>
<div class="c small">که دا لیک په ښه ډول چاپ شو، ستاسو چاپګر سم کار کوي.</div>
<script>window.onload=function(){setTimeout(function(){window.print();},300);}</script>
</body></html>`;
    const w = window.open("", "_blank", "width=420,height=640");
    if (!w) {
      toast.error(t.printerTestFailed);
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    toast.success(t.printerTestSent);
  } catch (err) {
    toast.error(`${t.printerTestFailed}: ${(err as Error).message}`);
  }
}

function PrefRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border p-2">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/**
 * Admin/owner-only card for `store_settings.audit_retention_days`.
 *
 * Features:
 *  - Live preview of rows that would be purged for a candidate retention window
 *    (SECURITY DEFINER RPC `preview_audit_purge`).
 *  - Confirmation step that re-runs the preview before saving OR purging so the
 *    user always sees the actual impact right before committing.
 *  - "Purge now" action (RPC `run_audit_purge_now`) for immediate cleanup.
 *  - History of previous purge runs (auto + manual) with rows deleted, duration,
 *    and error message when applicable.
 */
function AuditRetentionCard() {
  const qc = useQueryClient();
  const [savedDays, setSavedDays] = useState<number | null>(null);
  const [days, setDays] = useState<number>(180);
  const [preview, setPreview] = useState<{
    to_purge: number;
    total: number;
    oldest: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [purging, setPurging] = useState(false);
  const [confirm, setConfirm] = useState<null | {
    mode: "save" | "purge";
    preview: { to_purge: number; total: number; oldest: string | null };
  }>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await getLocalStoreSettings();
      if (data) {
        const d = Number(data.audit_retention_days ?? 180);
        setSavedDays(d);
        setDays(d);
      } else {
        setSavedDays(180);
      }
    })();
  }, []);

  const purgeHistory = useQuery({
    queryKey: ["audit-purge-log"],
    queryFn: listLocalAuditPurgeLog,
  });

  const fetchPreview = (daysToKeep: number) => previewLocalAuditPurge(daysToKeep);

  const runPreview = async () => {
    setLoading(true);
    try {
      setPreview(await fetchPreview(days));
    } catch (e) {
      toast.error((e as Error).message || "د مخکتنې تېروتنه");
    } finally {
      setLoading(false);
    }
  };

  // Save/purge both open the confirmation with a FRESH preview so what the
  // user sees at commit time reflects the current DB, not a stale local view.
  const openConfirm = async (mode: "save" | "purge") => {
    if (!Number.isFinite(days) || days < 1) {
      toast.error("لږ تر لږه ۱ ورځ اړینه ده");
      return;
    }
    setConfirmLoading(true);
    try {
      const p = await fetchPreview(days);
      setPreview(p);
      setConfirm({ mode, preview: p });
    } catch (e) {
      toast.error((e as Error).message || "د مخکتنې تېروتنه");
    } finally {
      setConfirmLoading(false);
    }
  };

  const doSave = async () => {
    setSaving(true);
    try {
      await updateLocalStoreSettings({ audit_retention_days: days });
      setSavedDays(days);
      toast.success("خوندي شو");
      setConfirm(null);
    } catch (e) {
      toast.error((e as Error).message || "د خوندي کولو تېروتنه");
    } finally {
      setSaving(false);
    }
  };

  const doPurge = async () => {
    setPurging(true);
    try {
      const deleted = await runLocalAuditPurge(days);
      toast.success(`${deleted.toLocaleString()} ثبتونه لیرې شول`);
      setConfirm(null);
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["audit-purge-log"] });
    } catch (e) {
      toast.error((e as Error).message || "د پاکولو تېروتنه");
    } finally {
      setPurging(false);
    }
  };

  const dirty = savedDays !== null && days !== savedDays;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">د پلټنې د ثبت ساتنه (Audit Log Retention)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="text-xs text-muted-foreground">
          له دې زیاتې زړې ثبتونه به هره ورځ په خپلکاره توګه لیرې شي. د خوندي کولو یا پاکولو نه مخکې
          د اغیزې تایید ښکاره کیږي.
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
          <div className="space-y-1">
            <Label className="text-xs">د ساتنې ورځې</Label>
            <Input
              type="number"
              min={1}
              max={3650}
              dir="ltr"
              value={days}
              onChange={(e) => {
                setDays(Math.max(1, Number(e.target.value) || 1));
                setPreview(null);
              }}
            />
            {savedDays !== null && (
              <div className="text-[11px] text-muted-foreground">اوسنی ارزښت: {savedDays} ورځې</div>
            )}
          </div>
          <Button variant="outline" onClick={runPreview} disabled={loading}>
            {loading ? "…" : "مخکتنه"}
          </Button>
          <Button onClick={() => openConfirm("save")} disabled={saving || !dirty || confirmLoading}>
            {saving ? "…" : t.save}
          </Button>
          <Button
            variant="destructive"
            onClick={() => openConfirm("purge")}
            disabled={purging || confirmLoading}
          >
            {purging ? "…" : "همدا اوس پاک کړه"}
          </Button>
        </div>

        {preview && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <div className="mb-1 font-semibold">
              د مخکتنې پایله (
              {preview.total > 0 ? Math.round((preview.to_purge / preview.total) * 100) : 0}%)
            </div>
            <div className="grid gap-1 sm:grid-cols-3">
              <div>
                <div className="text-muted-foreground">لیرې کیدونکي</div>
                <div className="text-base font-bold text-destructive">
                  {preview.to_purge.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">ټول ثبتونه</div>
                <div className="text-base font-bold">{preview.total.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-muted-foreground">تر ټولو زوړ ثبت</div>
                <div className="text-sm">
                  {preview.oldest ? jalaliDateTime(preview.oldest) : "—"}
                </div>
              </div>
            </div>
            {dirty && (
              <div className="mt-2 text-[11px] text-warning">
                * دا مخکتنه ده — کوم بدلون نه دی خوندي شوی.
              </div>
            )}
          </div>
        )}

        <div>
          <div className="mb-2 text-xs font-semibold text-muted-foreground">
            د پاکولو تاریخچه (وروستي ۲۰)
          </div>
          <div className="max-h-72 overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-2 text-right">نېټه</th>
                  <th className="p-2 text-right">سرچینه</th>
                  <th className="p-2 text-right">ورځې</th>
                  <th className="p-2 text-right">لیرې شوي</th>
                  <th className="p-2 text-right">وخت (ms)</th>
                  <th className="p-2 text-right">حالت</th>
                </tr>
              </thead>
              <tbody>
                {(purgeHistory.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-3 text-center text-muted-foreground">
                      {t.noData}
                    </td>
                  </tr>
                ) : (
                  (purgeHistory.data ?? []).map(
                    (r: {
                      id: string;
                      created_at: string;
                      trigger_source: string;
                      retention_days: number;
                      rows_deleted: number;
                      duration_ms: number;
                      status: string;
                      error_message: string | null;
                    }) => (
                      <tr key={r.id} className="border-t align-top">
                        <td className="p-2 whitespace-nowrap">{jalaliDateTime(r.created_at)}</td>
                        <td className="p-2">{r.trigger_source === "manual" ? "لاسي" : "خپلکار"}</td>
                        <td className="p-2" dir="ltr">
                          {r.retention_days}
                        </td>
                        <td className="p-2 font-semibold" dir="ltr">
                          {r.rows_deleted.toLocaleString()}
                        </td>
                        <td className="p-2" dir="ltr">
                          {r.duration_ms}
                        </td>
                        <td className="p-2">
                          {r.status === "success" ? (
                            <span className="text-success">✓ بریالی</span>
                          ) : (
                            <span className="text-destructive" title={r.error_message ?? ""}>
                              ✗ ناکام{r.error_message ? ` — ${r.error_message}` : ""}
                            </span>
                          )}
                        </td>
                      </tr>
                    ),
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>

        <AlertDialog
          open={!!confirm}
          onOpenChange={(o: boolean) => {
            if (!o) setConfirm(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirm?.mode === "purge" ? "پاکول تایید کړئ" : "خوندي کول تایید کړئ"}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-xs">
                  <div>
                    د ساتنې کړکۍ: <strong dir="ltr">{days}</strong> ورځې
                  </div>
                  {confirm && (
                    <div className="grid gap-1 rounded-md border bg-muted/30 p-2 sm:grid-cols-3">
                      <div>
                        <div className="text-muted-foreground">لیرې کیدونکي</div>
                        <div className="text-base font-bold text-destructive">
                          {confirm.preview.to_purge.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">ټول</div>
                        <div className="text-base font-bold">
                          {confirm.preview.total.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">تر ټولو زوړ</div>
                        <div className="text-sm">
                          {confirm.preview.oldest ? jalaliDateTime(confirm.preview.oldest) : "—"}
                        </div>
                      </div>
                    </div>
                  )}
                  {confirm?.mode === "purge" ? (
                    <div className="text-destructive">دا کړنه بیرته نه ګرځېدونکې ده.</div>
                  ) : (
                    <div>
                      د خوندي کولو وروسته به هره ورځ خپلکاره پاکونه له دې کړکۍ سره سم پرمخ ولاړه شي.
                    </div>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving || purging}>{t.cancel}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e: MouseEvent) => {
                  e.preventDefault();
                  if (confirm?.mode === "purge") doPurge();
                  else doSave();
                }}
                disabled={saving || purging}
                className={
                  confirm?.mode === "purge"
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : ""
                }
              >
                {confirm?.mode === "purge" ? (purging ? "…" : "پاک کړه") : saving ? "…" : t.save}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
