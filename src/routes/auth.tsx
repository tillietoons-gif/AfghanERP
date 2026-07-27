import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getLocalSession, registerLocalOperator, signInLocally } from "@/lib/local-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Store, Sparkles, ShieldCheck, BarChart3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import { MeshBackdrop } from "@/components/mesh-backdrop";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [{ title: "ننوتل — د افغان سوپر سټور" }],
  }),
});

function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [caps, setCaps] = useState(false);

  useEffect(() => {
    if (getLocalSession()) navigate({ to: "/" });
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signInLocally(email, password);
      toast.success("ښه راغلاست!");
      navigate({ to: "/" });
    } catch (error) {
      toast.error(
        error instanceof Error && error.message === "invalid_login"
          ? "بریښنالیک یا پټ نوم غلط دی"
          : "ننوتل ناکام شول",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await registerLocalOperator({ email, password, fullName, phone });
      toast.success("حساب مو جوړ شو.");
      navigate({ to: "/" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "signup_failed";
      toast.error(
        message === "email_already_registered"
          ? "دا بریښنالیک مخکې ثبت شوی دی"
          : message === "password_too_short"
            ? "پټ نوم باید لږ تر لږه ۶ توري ولري"
            : "حساب جوړول ناکام شول",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh w-full overflow-hidden bg-background">
      {/* Left brand panel */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden p-10 text-sidebar-foreground md:flex">
        <MeshBackdrop variant="mesh" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="relative grid h-12 w-12 place-items-center rounded-2xl gradient-gold shadow-gold-glow">
            <Store className="h-6 w-6 text-sidebar-primary-foreground" />
            <span className="absolute inset-0 rounded-2xl ring-1 ring-white/20" />
          </div>
          <div>
            <div className="font-display text-lg font-bold">{t.appName}</div>
            <div className="text-[11px] text-sidebar-foreground/60">{t.appTagline}</div>
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-sidebar-foreground/80 backdrop-blur">
            <Sparkles className="h-3 w-3 text-accent" /> نوی ERP نسل • د پښتو لومړي
          </div>
          <h2 className="font-display text-4xl font-black leading-tight tracking-tight text-white">
            د خپل سوپر سټور
            <br />
            <span className="text-gold">هوښیار مدیریت</span>
          </h2>
          <p className="mt-4 text-sm leading-6 text-sidebar-foreground/70">
            پلور، موجودي، حسابونه، او د AI مرستیال ټول په یو ځای کې. د افغانستان لپاره، په افغاني
            افغانۍ او د کابل وخت.
          </p>

          <ul className="mt-8 grid gap-3">
            {[
              { i: ShieldCheck, t: "خوندي کوونکي • RBAC + Audit Log" },
              { i: BarChart3, t: "ژوندي راپورونه • P&L، بیلانس، موجودي" },
              { i: Sparkles, t: "هوښیار مرستیال په پښتو ژبه" },
            ].map((f) => (
              <li key={f.t} className="flex items-center gap-3 text-sm text-sidebar-foreground/80">
                <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-accent">
                  <f.i className="h-4 w-4" />
                </span>
                {f.t}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 text-[11px] text-sidebar-foreground/40">
          © {new Date().getFullYear()} Afghan SuperStore ERP
        </div>
      </aside>

      {/* Right auth card */}
      <section className="relative flex w-full items-center justify-center p-6 md:w-1/2 md:p-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_400px_at_20%_0%,color-mix(in_oklab,var(--accent)_10%,transparent),transparent)]"
        />
        <div className="relative w-full max-w-md rise">
          <div className="md:hidden mb-6 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl gradient-gold shadow-gold-glow">
              <Store className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            <div>
              <div className="font-display text-base font-bold">{t.appName}</div>
              <div className="text-[11px] text-muted-foreground">{t.appTagline}</div>
            </div>
          </div>

          <div className="panel-elevated overflow-hidden">
            <div className="border-b border-border-hair bg-surface-1/50 px-6 py-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                ننوتل
              </div>
              <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">
                ښه راغلاست بېرته
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                خپل حساب ته د ننوتلو لپاره خپل بریښنالیک وکاروئ.
              </p>
            </div>

            <div className="p-6">
              <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "signup")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">{t.login}</TabsTrigger>
                  <TabsTrigger value="signup">{t.signup}</TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <form onSubmit={handleLogin} className="space-y-4 pt-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="email-l">{t.email}</Label>
                      <Input
                        id="email-l"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        dir="ltr"
                        autoComplete="email"
                        placeholder="name@example.com"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pass-l">{t.password}</Label>
                      <Input
                        id="pass-l"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => setCaps(e.getModifierState?.("CapsLock"))}
                        dir="ltr"
                        autoComplete="current-password"
                      />
                      {caps && (
                        <p className="text-[11px] text-warning-foreground">⚠︎ Caps Lock فعال دی</p>
                      )}
                    </div>
                    <Button
                      type="submit"
                      className="w-full gradient-primary text-primary-foreground shadow-elegant hover:opacity-95"
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="me-2 h-4 w-4 animate-spin" />
                          {t.loggingIn}
                        </>
                      ) : (
                        t.login
                      )}
                    </Button>
                    <p className="text-center text-[11px] text-muted-foreground">
                      لومړی حساب په اتوماتيک ډول د مالک په توګه راجستر کیږي.
                    </p>
                  </form>
                </TabsContent>

                <TabsContent value="signup">
                  <form onSubmit={handleSignup} className="space-y-4 pt-5">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="name-s">{t.fullName}</Label>
                        <Input
                          id="name-s"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="phone-s">{t.phone}</Label>
                        <Input
                          id="phone-s"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+93700000000"
                          dir="ltr"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email-s">{t.email}</Label>
                      <Input
                        id="email-s"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pass-s">{t.password}</Label>
                      <Input
                        id="pass-s"
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        dir="ltr"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full gradient-primary text-primary-foreground shadow-elegant hover:opacity-95"
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="me-2 h-4 w-4 animate-spin" />
                          {t.signingUp}
                        </>
                      ) : (
                        t.signup
                      )}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] text-muted-foreground">
            د پاسورډ اصلاح • د AFN اسعارو ملاتړ • د کابل وخت
          </p>
        </div>
      </section>
    </div>
  );
}
