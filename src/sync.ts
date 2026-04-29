import { Mnemo } from "@getmnemo/memory";

export interface MemoryClient {
  add(content: string, opts: { metadata: Record<string, unknown> }): Promise<unknown>;
}

export interface LogseqBlock {
  uuid: string;
  content: string;
  page?: { name?: string; originalName?: string };
  refs?: { id: number; "original-name"?: string }[];
  children?: LogseqBlock[];
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
  return new Mnemo({ apiKey: settings.apiKey, workspaceId: settings.workspaceId });
}

// Iterative DFS — recursion blows the stack on graphs with deeply nested
// outliner blocks (Logseq supports thousands of levels in a single page).
export function flattenBlocks(blocks: LogseqBlock[]): string {
  const lines: string[] = [];
  const stack: LogseqBlock[] = [...blocks].reverse();
  while (stack.length > 0) {
    const b = stack.pop() as LogseqBlock;
    // Trim before testing — Logseq emits blocks containing only whitespace
    // (property-only stubs, soft-breaks). Pushing those produces all-blank
    // lines that survive the page-level emptiness check downstream and burn
    // embedding tokens for zero signal.
    if (b.content && b.content.trim().length > 0) lines.push(b.content);
    const children = b.children ?? [];
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
  return lines.join("\n");
}

export function collectRefs(blocks: LogseqBlock[]): string[] {
  const acc = new Set<string>();
  const stack: LogseqBlock[] = [...blocks];
  while (stack.length > 0) {
    const b = stack.pop() as LogseqBlock;
    for (const r of b.refs ?? []) {
      const name = r["original-name"];
      if (name) acc.add(name);
    }
    for (const c of b.children ?? []) stack.push(c);
  }
  return Array.from(acc);
}

export async function saveBlock(client: MemoryClient, block: LogseqBlock): Promise<void> {
  // Empty / whitespace-only blocks add no signal to retrieval — skip them.
  if (!block.content || block.content.trim().length === 0) return;
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
  // Skip pages whose blocks are all empty (e.g. journal stubs).
  if (content.trim().length === 0) return;
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
      console.error("[getmnemo] page sync failed", page.name, err);
    }
  }
  return { ok, failed };
}
