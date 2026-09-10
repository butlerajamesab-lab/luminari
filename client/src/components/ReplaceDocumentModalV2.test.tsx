import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({}),
  documents: {
    list: { useQuery: state.list },
    replaceDocument: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
  },
} }));
// A stale global picker must never decide which case supplies replacement candidates.
vi.mock("@/contexts/CaseContext", () => ({ useCase: () => ({ currentCaseId: 999 }) }));
vi.mock("@/lib/replacementUpload", () => ({ uploadReplacementDocument: vi.fn() }));
vi.mock("@/components/ui/dialog", () => {
  const Part = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return { Dialog: Part, DialogContent: Part, DialogHeader: Part, DialogTitle: Part, DialogDescription: Part, DialogFooter: Part, useDialogComposition: () => null };
});

import ReplaceDocumentModalV2 from "./ReplaceDocumentModalV2";

beforeEach(() => {
  vi.clearAllMocks();
  state.list.mockReturnValue({ data: [] });
});

describe("replacement dialog entry points", () => {
  const props = { open: true, onClose: vi.fn(), documentId: 41, caseId: 44, documentName: "original.xml" };

  it("opens an Upload Replacement action directly on its file picker", () => {
    const html = renderToStaticMarkup(<ReplaceDocumentModalV2 {...props} initialMode="upload" />);
    expect(html).toContain("Click to select a replacement file");
    expect(html).toContain("Upload &amp; Replace");
    expect(html).not.toContain("Select Replacement Document");
  });

  it("retains Select Existing as the default for generic replacement actions", () => {
    const html = renderToStaticMarkup(<ReplaceDocumentModalV2 {...props} />);
    expect(html).toContain("Select Replacement Document");
    expect(html).not.toContain("Click to select a replacement file");
  });

  it("queries candidates using the original document case even when the global picker differs", () => {
    renderToStaticMarkup(<ReplaceDocumentModalV2 {...props} />);
    expect(state.list).toHaveBeenCalledWith({ caseId: 44 }, { enabled: true });
  });

  it("does not query replacement candidates without a known original case", () => {
    renderToStaticMarkup(<ReplaceDocumentModalV2 {...props} caseId={null} open={false} />);
    expect(state.list.mock.lastCall?.[1]).toEqual({ enabled: false });
  });
});
