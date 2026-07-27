import { makeRouteErrorComponent } from "@/components/route-error-page";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/protected-route";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Send, Bot, User, Sparkles } from "lucide-react";
import { t } from "@/lib/i18n";
import { toast } from "sonner";
import { getLocalAssistantReply } from "@/lib/local-assistant";

export const Route = createFileRoute("/assistant")({
  component: () => (
    <ProtectedRoute>
      <AssistantPage />
    </ProtectedRoute>
  ),

  errorComponent: makeRouteErrorComponent("مرستیال"),
});

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const EXAMPLES = [
  "نن ورځ ټول پلور څومره و؟",
  "کوم توکي کم شوي دي؟",
  "کوم محصولات د ختمېدو نېټې ته نږدې دي؟",
  "د دې میاشتې ګټه وښایه",
  "کوم شیان باید بیا وپېرل شي؟",
];

function AssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: t.aiIntro }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const ask = async (q: string) => {
    if (!q.trim() || loading) return;
    const next = [...messages, { role: "user" as const, content: q.trim() }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const reply = await getLocalAssistantReply(q);
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطا رامنځته شوه";
      toast.error(msg);
      setMessages([
        ...next,
        { role: "assistant", content: "بښنه غواړم، اوس مهال د ځواب په ورکولو کې ستونزه ده." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-[calc(100vh-4rem)] flex-col p-4 md:p-6" dir="rtl">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">هوښیار مرستیال</h1>
      </div>

      {messages.length <= 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => ask(ex)}
              className="rounded-full border bg-card px-3 py-1.5 text-sm hover:bg-muted"
              disabled={loading}
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardContent className="flex flex-1 flex-col p-0">
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                >
                  {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm leading-relaxed ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground">
                  {t.thinking}
                </div>
              </div>
            )}
          </div>
          <form
            className="flex gap-2 border-t bg-card p-3"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.askQuestion}
              disabled={loading}
              dir="rtl"
            />
            <Button type="submit" disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
