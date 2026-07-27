import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, resolved, setTheme } = useTheme();
  const Icon = resolved === "dark" ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size={compact ? "icon" : "sm"}
          variant="ghost"
          className={compact ? "h-8 w-8" : "h-8 gap-1.5 px-2 text-xs"}
          aria-label="د رنګ حالت"
          title="د رنګ حالت (روښانه/تیاره)"
        >
          <Icon className="h-4 w-4" />
          {!compact && (
            <span>{theme === "system" ? "سیستم" : resolved === "dark" ? "تیاره" : "روښانه"}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        <DropdownMenuItem onClick={() => setTheme("light")} className="gap-2">
          <Sun className="h-4 w-4" /> روښانه
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")} className="gap-2">
          <Moon className="h-4 w-4" /> تیاره
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")} className="gap-2">
          <Monitor className="h-4 w-4" /> د سیستم پر اساس
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
