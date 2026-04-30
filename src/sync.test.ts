import { describe, expect, it, vi } from "vitest";
import {
  backfillGraph,
  collectRefs,
  flattenBlocks,
  saveBlock,
  syncPage,
  type LogseqBlock,
  type LogseqEditorAPI,
  type MemoryClient,
} from "./sync.js";

vi.mock("@mnemo/memory", () => ({
  Mnemo: vi.fn().mockImplementation(() => ({ add: vi.fn() })),
}));

const block = (over: Partial<LogseqBlock> = {}): LogseqBlock => ({
  uuid: "u1",
  content: "hello",
  ...over,
});

describe("flattenBlocks", () => {
  it("joins non-empty content with newlines", () => {
    expect(
      flattenBlocks([block({ content: "a" }), block({ content: "" }), block({ content: "b" })]),
    ).toBe("a\nb");
  });
});

describe("collectRefs", () => {
  it("dedupes ref names", () => {
    const refs = collectRefs([
      block({ refs: [{ id: 1, "original-name": "Alpha" }] }),
      block({ refs: [{ id: 2, "original-name": "Beta" }, { id: 3, "original-name": "Alpha" }] }),
    ]);
    expect(refs.sort()).toEqual(["Alpha", "Beta"]);
  });
});

describe("saveBlock", () => {
  it("posts block content with logseq metadata", async () => {
    const add = vi.fn().mockResolvedValue({});
    const client: MemoryClient = { add };
    await saveBlock(client, block({
      uuid: "b-1",
      content: "note body",
      page: { name: "page-name", originalName: "Page Name" },
      refs: [{ id: 9, "original-name": "Other" }],
    }));
    const [content, opts] = add.mock.calls[0];
    expect(content).toBe("note body");
    expect(opts.metadata).toMatchObject({
      source: "logseq",
      sourceId: "b-1",
      kind: "block",
      page: "Page Name",
      relations: ["Other"],
    });
  });
});

describe("syncPage", () => {
  it("fetches page blocks then pushes flattened content", async () => {
    const add = vi.fn().mockResolvedValue({});
    const client: MemoryClient = { add };
    const editor: LogseqEditorAPI = {
      getCurrentBlock: vi.fn(),
      getPageBlocksTree: vi.fn().mockResolvedValue([block({ content: "x" }), block({ content: "y" })]),
      getAllPages: vi.fn(),
    };
    await syncPage(client, editor, { uuid: "p1", name: "page", originalName: "Page" });
    expect(editor.getPageBlocksTree).toHaveBeenCalledWith("page");
    const [content, opts] = add.mock.calls[0];
    expect(content).toBe("x\ny");
    expect(opts.metadata.kind).toBe("page");
    expect(opts.metadata.title).toBe("Page");
  });

  it("skips when page has no blocks", async () => {
    const add = vi.fn();
    const editor: LogseqEditorAPI = {
      getCurrentBlock: vi.fn(),
      getPageBlocksTree: vi.fn().mockResolvedValue([]),
      getAllPages: vi.fn(),
    };
    await syncPage({ add }, editor, { uuid: "p", name: "p" });
    expect(add).not.toHaveBeenCalled();
  });
});

describe("backfillGraph", () => {
  it("counts ok and failed pages", async () => {
    const add = vi.fn().mockResolvedValue({});
    const editor: LogseqEditorAPI = {
      getCurrentBlock: vi.fn(),
      getPageBlocksTree: vi.fn()
        .mockResolvedValueOnce([block()])
        .mockRejectedValueOnce(new Error("nope")),
      getAllPages: vi.fn().mockResolvedValue([
        { uuid: "1", name: "ok" },
        { uuid: "2", name: "bad" },
      ]),
    };
    const result = await backfillGraph({ add }, editor);
    expect(result).toEqual({ ok: 1, failed: 1 });
  });
});
