import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Guards against regressions where Pashto/Arabic UI text is added directly
// to the sidebar or scan-history panel instead of going through `t.*`.
// If this test fails, move the offending strings into src/lib/i18n.ts and
// reference them via `t.<key>` in the component.

const FILES = ["src/components/app-shell.tsx", "src/components/scan-history-panel.tsx"];

// Arabic script block covers Pashto letters used across this app.
const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("i18n guard: sidebar & scan-history use only t.* strings", () => {
  for (const rel of FILES) {
    it(`${rel} contains no hardcoded Pashto/Arabic literals`, () => {
      const src = stripComments(readFileSync(resolve(process.cwd(), rel), "utf8"));
      const offenders: string[] = [];
      src.split(/\r?\n/).forEach((line, i) => {
        if (ARABIC_SCRIPT_RE.test(line)) {
          offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
        }
      });
      expect(
        offenders,
        `Hardcoded UI text found. Move to src/lib/i18n.ts and use t.*:\n${offenders.join("\n")}`,
      ).toEqual([]);
    });
  }
});
