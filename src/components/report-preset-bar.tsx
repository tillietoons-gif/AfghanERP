import { useEffect, useState } from "react";
import { Bookmark, BookmarkPlus, Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  loadPresets,
  savePreset,
  deletePreset,
  renamePreset,
  subscribePresets,
  type ReportPreset,
} from "@/lib/report-presets";
import { toast } from "sonner";

interface Props<T> {
  presetKey: string;
  state: T;
  onLoad: (state: T) => void;
}

export function ReportPresetBar<T>({ presetKey, state, onLoad }: Props<T>) {
  const [presets, setPresets] = useState<ReportPreset<T>[]>([]);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    const refresh = () => setPresets(loadPresets<T>(presetKey));
    refresh();
    // Cross-tab + same-tab sync so saves/renames/deletes in another tab
    // appear here immediately without a manual refresh.
    return subscribePresets(presetKey, refresh);
  }, [presetKey]);

  const handleSave = () => {
    const p = savePreset<T>(presetKey, name || `تنظیم ${presets.length + 1}`, state);
    setName("");
    toast.success(`فلټر خوندي شو: ${p.name}`);
  };

  const handleDelete = (id: string, label: string) => {
    deletePreset(presetKey, id);
    toast.success(`ړنګ شو: ${label}`);
  };

  const startRename = (p: ReportPreset<T>) => {
    setEditingId(p.id);
    setEditingName(p.name);
  };

  const commitRename = () => {
    if (!editingId) return;
    const ok = renamePreset(presetKey, editingId, editingName);
    if (!ok) {
      toast.error("نوم بدلول ناکام (تش یا تکراري نوم)");
      return;
    }
    toast.success("نوم بدل شو");
    setEditingId(null);
    setEditingName("");
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingName("");
  };

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline">
            <Bookmark className="ml-1 h-4 w-4" />
            خوندي شوي فلټرونه
            {presets.length > 0 && (
              <span className="ms-1 rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">
                {presets.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 space-y-3" dir="rtl">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">نوی تنظیم خوندي کړئ</div>
            <div className="flex gap-2">
              <Input
                placeholder="نوم (مثلاً: میاشتنی راپور)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8"
              />
              <Button size="sm" onClick={handleSave}>
                <BookmarkPlus className="ml-1 h-4 w-4" />
                خوندي
              </Button>
            </div>
          </div>
          <div className="border-t pt-2">
            <div className="mb-1 text-xs font-semibold text-muted-foreground">خوندي شوي</div>
            {presets.length === 0 ? (
              <div className="py-3 text-center text-xs text-muted-foreground">
                هیڅ تنظیم نه دی خوندي شوی
              </div>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-auto">
                {presets.map((p) => {
                  const isEditing = editingId === p.id;
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-1 rounded-md border p-2 hover:bg-muted/40"
                    >
                      {isEditing ? (
                        <>
                          <Input
                            autoFocus
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename();
                              if (e.key === "Escape") cancelRename();
                            }}
                            className="h-7 flex-1"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={commitRename}
                            aria-label="ثبتول"
                          >
                            <Check className="h-3.5 w-3.5 text-success" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={cancelRename}
                            aria-label="لغوه"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="flex-1 truncate text-right text-sm"
                            onClick={() => {
                              onLoad(p.state);
                              setOpen(false);
                              toast.success(`تنظیم پلی شو: ${p.name}`);
                            }}
                            title={p.name}
                          >
                            {p.name}
                          </button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => startRename(p)}
                            aria-label="نوم بدلول"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => handleDelete(p.id, p.name)}
                            aria-label="ړنګول"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
