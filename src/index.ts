import "@logseq/libs";
import { backfillGraph, buildClient, saveBlock, type LogseqSettings } from "./sync.js";

declare const logseq: {
  ready(cb: () => void | Promise<void>): Promise<void>;
  useSettingsSchema(schema: unknown): void;
  settings: Record<string, unknown> | undefined;
  Editor: {
    registerSlashCommand(name: string, cb: () => Promise<void>): void;
    getCurrentBlock(): Promise<unknown>;
    getPageBlocksTree(name: string): Promise<unknown[]>;
    getAllPages(): Promise<unknown[]>;
  };
  App: {
    registerCommandPalette(opts: { key: string; label: string }, cb: () => void | Promise<void>): void;
    showMsg(msg: string, kind?: "success" | "warning" | "error"): void;
  };
};

const SETTINGS_SCHEMA = [
  {
    key: "apiKey",
    type: "string",
    title: "API key",
    description: "Your LedgerMem API key (lm_live_…)",
    default: "",
  },
  {
    key: "workspaceId",
    type: "string",
    title: "Workspace ID",
    description: "Target workspace for memories.",
    default: "",
  },
];

function readSettings(): LogseqSettings {
  const s = logseq.settings ?? {};
  return {
    apiKey: String(s["apiKey"] ?? ""),
    workspaceId: String(s["workspaceId"] ?? ""),
  };
}

async function bootstrap(): Promise<void> {
  logseq.useSettingsSchema(SETTINGS_SCHEMA);

  logseq.Editor.registerSlashCommand("lm-save", async () => {
    const client = buildClient(readSettings());
    if (!client) {
      logseq.App.showMsg("LedgerMem: configure API key and workspace first.", "warning");
      return;
    }
    const block = (await logseq.Editor.getCurrentBlock()) as Parameters<typeof saveBlock>[1] | null;
    if (!block) {
      logseq.App.showMsg("LedgerMem: no active block.", "warning");
      return;
    }
    try {
      await saveBlock(client, block);
      logseq.App.showMsg("LedgerMem: block saved.", "success");
    } catch (err) {
      logseq.App.showMsg(`LedgerMem error: ${(err as Error).message}`, "error");
    }
  });

  logseq.App.registerCommandPalette(
    { key: "ledgermem-backfill", label: "LedgerMem: sync graph" },
    async () => {
      const client = buildClient(readSettings());
      if (!client) {
        logseq.App.showMsg("LedgerMem: configure API key and workspace first.", "warning");
        return;
      }
      logseq.App.showMsg("LedgerMem: backfill started…");
      const editor = {
        getCurrentBlock: () => logseq.Editor.getCurrentBlock() as never,
        getPageBlocksTree: (n: string) => logseq.Editor.getPageBlocksTree(n) as never,
        getAllPages: () => logseq.Editor.getAllPages() as never,
      };
      const { ok, failed } = await backfillGraph(client, editor);
      logseq.App.showMsg(`LedgerMem backfill: ${ok} ok, ${failed} failed.`, failed ? "warning" : "success");
    },
  );
}

logseq.ready(bootstrap).catch((err) => {
  console.error("[ledgermem] bootstrap failed", err);
});
