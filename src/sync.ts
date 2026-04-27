import { LedgerMem } from "@ledgermem/memory";

export interface MemoryClient {
  add(content: string, opts: { metadata: Record<string, unknown> }): Promise<unknown>;
}

export interface LogseqBlock {
  uuid: string;
  content: string;
  page?: { name?: string; originalName?: string };
  refs?: { id: number; "original-name"?: string }[];
}

export interface LogseqPage {
  uuid: string;
  name: string;
  originalName?: string;
}

export interface LogseqEditorAPI {
  getCurrentBlock(): Promise<LogseqBlock | null>;
  getPageBlocksTree(name: string): Promise<LogseqBlock[]>;
  getAllPages(): Promise<LogseqPage[]>;
}

export interface LogseqSettings {
  apiKey: string;
  workspaceId: string;
}

export function buildClient(settings: LogseqSettings): MemoryClient | null {
  if (!settings.apiKey || !settings.workspaceId) return null;
  return new LedgerMem({ apiKey: settings.apiKey, workspaceId: settings.workspaceId });
}

export function flattenBlocks(blocks: LogseqBlock[]): string {
  return blocks.map((b) => b.content).filter((c) => c && c.length > 0).join("\n");
}

export function collectRefs(blocks: LogseqBlock[]): string[] {
  const acc = new Set<string>();
  for (const b of blocks) {
    for (const r of b.refs ?? []) {
      const name = r["original-name"];
      if (name) acc.add(name);
    }
  }
  return Array.from(acc);
}

export async function saveBlock(client: MemoryClient, block: LogseqBlock): Promise<void> {
  await client.add(block.content, {
    metadata: {
      source: "logseq",
      sourceId: block.uuid,
      kind: "block",
      page: block.page?.originalName ?? block.page?.name ?? null,
      relations: (block.refs ?? []).map((r) => r["original-name"]).filter((n): n is string => Boolean(n)),
      syncedAt: new Date().toISOString(),
    },
  });
}

export async function syncPage(
  client: MemoryClient,
  editor: LogseqEditorAPI,
  page: LogseqPage,
): Promise<void> {
  const blocks = await editor.getPageBlocksTree(page.name);
  if (blocks.length === 0) return;
  const content = flattenBlocks(blocks);
  await client.add(content, {
    metadata: {
      source: "logseq",
      sourceId: page.uuid,
      kind: "page",
      title: page.originalName ?? page.name,
      relations: collectRefs(blocks),
      syncedAt: new Date().toISOString(),
    },
  });
}

export async function backfillGraph(
  client: MemoryClient,
  editor: LogseqEditorAPI,
): Promise<{ ok: number; failed: number }> {
  const pages = await editor.getAllPages();
  let ok = 0;
  let failed = 0;
  for (const page of pages) {
    try {
      await syncPage(client, editor, page);
      ok += 1;
    } catch (err) {
      failed += 1;
      console.error("[ledgermem] page sync failed", page.name, err);
    }
  }
  return { ok, failed };
}
