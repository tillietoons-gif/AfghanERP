import { forwardRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileStack, Pencil, Plus, Trash2, Check, Copy } from "lucide-react";
import {
  listDrafts,
  subscribe,
  setActive,
  renameDraft,
  deleteDraft,
  duplicateDraft,
  type PosDraft,
} from "@/lib/pos-drafts";
import { announce } from "@/lib/announce";

type Props = {
  activeId: string | null;
  onSwitch: (id: string | null) => void;
  onNewDraft: () => void;
  currentCartCount: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const PosDraftsMenu = forwardRef<HTMLButtonElement, Props>(function PosDraftsMenu(
  { activeId, onSwitch, onNewDraft, currentCartCount, open, onOpenChange }: Props,
  ref,
) {
  const [drafts, setDrafts] = useState<PosDraft[]>(() => listDrafts());
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<PosDraft | null>(null);

  useEffect(() => subscribe(() => setDrafts(listDrafts())), []);

  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            ref={ref}
            type="button"
            variant="outline"
            size="sm"
            title="د پلور مسودې (Alt+D)"
            aria-label={`د پلور مسودې — ${drafts.length} ذخیره شوې`}
            aria-keyshortcuts="Alt+D"
            aria-haspopup="menu"
            aria-expanded={open ?? false}
          >
            <FileStack className="ml-1 h-4 w-4" />
            مسودې
            {drafts.length > 0 && (
              <span
                aria-hidden="true"
                className="ml-1 rounded bg-primary/15 px-1.5 text-[10px] font-semibold text-primary"
              >
                {drafts.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel className="text-xs">ذخیره شوې مسودې</DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onNewDraft();
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            <span>نوې مسوده (اوسنی سبد وساتئ)</span>
            {currentCartCount > 0 && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                {currentCartCount} توکي
              </span>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {drafts.length === 0 && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              هیڅ ذخیره شوې مسوده نشته
            </div>
          )}
          {drafts.map((d, idx) => {
            const isActive = d.id === activeId;
            const count = d.data.cart.reduce((s, l) => s + l.quantity, 0);
            const shortcut = idx < 9 ? `Alt+${idx + 1}` : null;
            return (
              <div
                key={d.id}
                className={`group flex items-center gap-1 px-1 py-0.5 ${isActive ? "bg-accent/40 rounded" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActive(d.id);
                    onSwitch(d.id);
                  }}
                  className="flex flex-1 items-center gap-2 rounded px-2 py-1.5 text-right hover:bg-accent"
                >
                  {isActive ? (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <span className="w-3.5" />
                  )}
                  <div className="flex-1 truncate">
                    <div className="flex items-center gap-1 truncate text-sm">
                      <span className="truncate">{d.name}</span>
                      {shortcut && (
                        <kbd className="ml-auto shrink-0 rounded border border-border-hair bg-surface-2 px-1 text-[9px] font-mono text-muted-foreground">
                          {shortcut}
                        </kbd>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {count} توکي · {new Date(d.updatedAt).toLocaleTimeString()}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newId = duplicateDraft(d.id);
                    if (newId) {
                      announce(`مسوده "${d.name}" دوه چنده شوه`);
                      onSwitch(newId);
                    }
                  }}
                  className="rounded p-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring hover:bg-accent"
                  aria-label={`مسوده "${d.name}" دوه چنده کړئ`}
                  title="دوه چنده کړئ"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenaming({ id: d.id, name: d.name });
                  }}
                  className="rounded p-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring hover:bg-accent"
                  aria-label={`د "${d.name}" نوم بدل کړئ`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDel(d);
                  }}
                  className="rounded p-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring hover:bg-destructive/20"
                  aria-label={`مسوده "${d.name}" ړنګ کړئ`}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>نوم بدل کړئ</AlertDialogTitle>
            <AlertDialogDescription>د دې مسودې لپاره نوی نوم دننه کړئ.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={renaming?.name ?? ""}
            onChange={(e) => setRenaming((r) => (r ? { ...r, name: e.target.value } : r))}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && renaming) {
                renameDraft(renaming.id, renaming.name);
                setRenaming(null);
              }
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>لغوه</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (renaming) {
                  renameDraft(renaming.id, renaming.name);
                  setRenaming(null);
                }
              }}
            >
              خوندي کړئ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>مسوده ړنګه شي؟</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDel?.name}" به د تل لپاره ړنګه شي.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>لغوه</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDel) {
                  const wasActive = confirmDel.id === activeId;
                  deleteDraft(confirmDel.id);
                  if (wasActive) onSwitch(null);
                  setConfirmDel(null);
                }
              }}
            >
              ړنګ کړئ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
