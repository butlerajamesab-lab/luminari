import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLMInteractive } from "../_core/llm";
import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import {
  cases, documents, quotes, claims, entities, findings,
  strategyMatterProfile, strategyClaimCandidates, strategyPaths,
  strategyFactMatrix, strategyElementFactLinks,
  assemblyDocumentTemplates, assemblySectionLibrary,
  assemblyExhibitIndex, assemblyFilingPackets,
  assemblyGeneratedSections, assemblyCitationIndex,
  assemblyFactNarrativeBlocks, assemblyLegalArgumentBlocks,
  assemblyReliefRequests, assemblyPartyDesignations,
  assemblyComplianceChecklist, assemblyVersionHistory,
  assemblyOutputRegistry,
  engineRuns,
} from "../../drizzle/schema";
import { withEngineTracking, ENGINE_IDS } from "../engine-entrypoint-wrapper";

// ═══════════════════════════════════════════════════════════════════════════
// CASE ASSEMBLY GENERATOR — Document Generation Pipeline
//
// A1. Initialize Filing Packet (select template, strategy path)
// A2. Designate Parties (from entities)
// A3. Build Exhibit Index (from documents/quotes)
// A4. Generate Fact Narrative Blocks (from fact matrix)
// A5. Generate Legal Argument Blocks (from claim candidates)
// A6. Build Citation Index
// A7. Generate Relief Requests
// A8. Generate Document Sections (from templates)
// A9. Run Compliance Checklist
// ═══════════════════════════════════════════════════════════════════════════

export const assemblyEngineRouter = router({

  // ─── A1: Initialize Filing Packet ───────────────────────────────────
  initializePacket: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      strategyPathId: z.number().optional(),
      packetType: z.string().default("complaint"),
      packetName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.ASSEMBLY, caseId: input.caseId, runType: "assembly_only" }, async () => {
      const now = Date.now();
      const [caseRow] = await db.select().from(cases).where(eq(cases.id, input.caseId));
      if (!caseRow) throw new Error("Case not found");

      // Get strategy path if provided
      let pathRow: any = null;
      if (input.strategyPathId) {
        const [p] = await db.select().from(strategyPaths).where(eq(strategyPaths.id, input.strategyPathId));
        pathRow = p;
      }

      const [inserted] = await db.insert(assemblyFilingPackets).values({
        caseId: input.caseId,
        strategyPathId: input.strategyPathId ?? null,
        packetName: input.packetName ?? `${input.packetType} — ${caseRow.name}`,
        packetType: input.packetType,
        forum: pathRow?.recommendedForum ?? null,
        jurisdiction: pathRow ? null : null,
        claimTypes: pathRow?.claimCandidateIds ?? [],
        packetStatus: "draft",
        createdAt: now,
        updatedAt: now,
      });

      return { packetId: inserted.insertId };
      }); // end withEngineTracking
    }),

  // ─── A2: Designate Parties ──────────────────────────────────────────
  designateParties: protectedProcedure
    .input(z.object({ caseId: z.number(), packetId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const caseEntities = await db.select().from(entities).where(eq(entities.caseId, input.caseId));

      if (caseEntities.length === 0) return { partiesDesignated: 0, message: "No entities found." };

      const entitySummary = caseEntities.slice(0, 30).map(e =>
        `${e.id}. ${e.name} (type: ${e.type}, desc: ${e.description?.slice(0, 80) ?? "none"})`
      ).join("\n");

      const response = await invokeLLMInteractive({
        messages: [
          {
            role: "system",
            content: `You are a legal document drafter. Given case entities, designate parties for a legal filing. Return JSON:
{"parties":[{
  "entityId": number,
  "partyRole": "plaintiff|defendant|respondent|complainant|third_party|witness|agency",
  "partyName": "formal name for filing",
  "partyType": "individual|corporation|government_agency|organization",
  "notes": "brief note on role"
}]}
Identify at least a plaintiff/complainant and defendant/respondent.`
          },
          { role: "user", content: `Entities:\n${entitySummary}` }
        ],
        response_format: { type: "json_object" },
      });

      const content = typeof response.choices[0]?.message?.content === "string"
        ? response.choices[0].message.content : "";
      let parties: any[];
      try {
        const parsed = JSON.parse(content);
        parties = Array.isArray(parsed) ? parsed : (parsed.parties ?? []);
      } catch { parties = []; }

      let designated = 0;
      for (const p of parties) {
        await db.insert(assemblyPartyDesignations).values({
          caseId: input.caseId,
          packetId: input.packetId,
          partyRole: p.partyRole ?? "witness",
          partyName: p.partyName ?? "Unknown",
          entityId: p.entityId ?? null,
          partyType: p.partyType ?? null,
          notes: p.notes ?? null,
          createdAt: now,
        });
        designated++;
      }

      return { partiesDesignated: designated };
    }),

  // ─── A3: Build Exhibit Index ────────────────────────────────────────
  buildExhibitIndex: protectedProcedure
    .input(z.object({ caseId: z.number(), packetId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const caseDocs = await db.select().from(documents).where(eq(documents.caseId, input.caseId));
      const caseQuotes = await db.select().from(quotes).where(eq(quotes.caseId, input.caseId));

      if (caseDocs.length === 0) return { exhibitsCreated: 0, message: "No documents found." };

      const docSummary = caseDocs.slice(0, 30).map(d =>
        `${d.id}. ${d.filename} (type: ${d.documentType ?? "unknown"})`
      ).join("\n");

      const response = await invokeLLMInteractive({
        messages: [
          {
            role: "system",
            content: `You are a legal document organizer. Create an exhibit index for a legal filing. Return JSON:
{"exhibits":[{
  "exhibitLabel": "A|B|C|1|2|3 etc.",
  "exhibitTitle": "descriptive title",
  "documentId": number,
  "quoteIds": [relevant quote IDs],
  "description": "brief description of exhibit",
  "relevantClaims": ["claim types this supports"],
  "orderIndex": number
}]}
Label exhibits sequentially. Include only relevant documents.`
          },
          { role: "user", content: `Documents:\n${docSummary}\n\nQuotes available: ${caseQuotes.length}` }
        ],
        response_format: { type: "json_object" },
      });

      const content = typeof response.choices[0]?.message?.content === "string"
        ? response.choices[0].message.content : "";
      let exhibits: any[];
      try {
        const parsed = JSON.parse(content);
        exhibits = Array.isArray(parsed) ? parsed : (parsed.exhibits ?? []);
      } catch { exhibits = []; }

      let created = 0;
      for (const ex of exhibits) {
        await db.insert(assemblyExhibitIndex).values({
          caseId: input.caseId,
          packetId: input.packetId,
          exhibitLabel: ex.exhibitLabel ?? String.fromCharCode(65 + created),
          exhibitTitle: ex.exhibitTitle ?? "Untitled Exhibit",
          documentId: ex.documentId ?? null,
          quoteIds: ex.quoteIds ?? [],
          description: ex.description ?? null,
          relevantClaims: ex.relevantClaims ?? [],
          relevantElements: [],
          orderIndex: ex.orderIndex ?? created,
          exhibitStatus: "draft",
          createdAt: now,
        });
        created++;
      }

      return { exhibitsCreated: created };
    }),

  // ─── A4: Generate Fact Narrative Blocks ─────────────────────────────
  generateFactNarrative: protectedProcedure
    .input(z.object({ caseId: z.number(), packetId: z.number(), matterProfileId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const facts = await db.select().from(strategyFactMatrix)
        .where(and(
          eq(strategyFactMatrix.caseId, input.caseId),
          eq(strategyFactMatrix.matterProfileId, input.matterProfileId),
        ));

      const exhibits = await db.select().from(assemblyExhibitIndex)
        .where(and(
          eq(assemblyExhibitIndex.caseId, input.caseId),
          eq(assemblyExhibitIndex.packetId, input.packetId),
        ));

      if (facts.length === 0) return { blocksCreated: 0, message: "No facts found. Run Strategy Engine first." };

      const factText = facts.slice(0, 40).map(f =>
        `[${f.id}] (${f.factType}) ${f.factText} — Actor: ${f.actor ?? "?"}, Date: ${f.dateOccurred ?? "?"}`
      ).join("\n");

      const exhibitRef = exhibits.map(e => `Exhibit ${e.exhibitLabel}: ${e.exhibitTitle}`).join(", ");

      const response = await invokeLLMInteractive({
        messages: [
          {
            role: "system",
            content: `You are a legal narrative writer. Create fact narrative blocks for a legal filing's statement of facts. Return JSON:
{"blocks":[{
  "blockType": "background|incident|aftermath|pattern|procedural",
  "orderIndex": number,
  "narrativeText": "formal legal narrative paragraph",
  "factMatrixIds": [IDs of facts used],
  "exhibitRefs": ["Exhibit A", "Exhibit B"],
  "timelinePosition": "YYYY-MM or descriptive"
}]}
Write in formal legal style. Reference exhibits where applicable. Maintain chronological order.`
          },
          {
            role: "user",
            content: `Facts:\n${factText}\n\nAvailable Exhibits: ${exhibitRef}`
          }
        ],
        response_format: { type: "json_object" },
      });

      const content = typeof response.choices[0]?.message?.content === "string"
        ? response.choices[0].message.content : "";
      let blocks: any[];
      try {
        const parsed = JSON.parse(content);
        blocks = Array.isArray(parsed) ? parsed : (parsed.blocks ?? []);
      } catch { blocks = []; }

      let created = 0;
      for (const block of blocks) {
        await db.insert(assemblyFactNarrativeBlocks).values({
          caseId: input.caseId,
          packetId: input.packetId,
          blockType: block.blockType ?? "background",
          orderIndex: block.orderIndex ?? created,
          narrativeText: block.narrativeText ?? "",
          factMatrixIds: block.factMatrixIds ?? [],
          quoteIds: [],
          exhibitRefs: block.exhibitRefs ?? [],
          timelinePosition: block.timelinePosition ?? null,
          createdAt: now,
        });
        created++;
      }

      return { blocksCreated: created };
    }),

  // ─── A5: Generate Legal Argument Blocks ─────────────────────────────
  generateLegalArguments: protectedProcedure
    .input(z.object({ caseId: z.number(), packetId: z.number(), matterProfileId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const candidates = await db.select().from(strategyClaimCandidates)
        .where(and(
          eq(strategyClaimCandidates.caseId, input.caseId),
          eq(strategyClaimCandidates.matterProfileId, input.matterProfileId),
        ));

      if (candidates.length === 0) return { argumentsCreated: 0, message: "No claim candidates found." };

      let argumentsCreated = 0;
      for (const cand of candidates) {
        const response = await invokeLLMInteractive({
          messages: [
            {
              role: "system",
              content: `You are a legal argument drafter. Draft a legal argument block for this claim. Return JSON:
{
  "argumentHeading": "formal heading for this argument section",
  "argumentText": "formal legal argument paragraph(s)",
  "supportingCitations": ["case law or statute citations"],
  "supportingFacts": ["fact references"],
  "elementsCovered": ["legal elements addressed"],
  "counterarguments": ["anticipated opposing arguments with rebuttals"]
}`
            },
            {
              role: "user",
              content: `Claim: ${cand.claimType}\nElements Satisfied: ${JSON.stringify(cand.elementsSatisfied)}\nElements Missing: ${JSON.stringify(cand.elementsMissing)}\nSOL Status: ${cand.solStatus}`
            }
          ],
          response_format: { type: "json_object" },
        });

        const content = typeof response.choices[0]?.message?.content === "string"
          ? response.choices[0].message.content : "";
        let arg: any;
        try { arg = JSON.parse(content); } catch { arg = {}; }

        await db.insert(assemblyLegalArgumentBlocks).values({
          caseId: input.caseId,
          packetId: input.packetId,
          claimType: cand.claimType,
          argumentHeading: arg.argumentHeading ?? `Argument: ${cand.claimType}`,
          orderIndex: argumentsCreated,
          argumentText: arg.argumentText ?? "",
          supportingCitations: arg.supportingCitations ?? [],
          supportingFacts: arg.supportingFacts ?? [],
          elementsCovered: arg.elementsCovered ?? [],
          counterarguments: arg.counterarguments ?? [],
          createdAt: now,
        });
        argumentsCreated++;
      }

      return { argumentsCreated };
    }),

  // ─── A6: Build Citation Index ───────────────────────────────────────
  buildCitationIndex: protectedProcedure
    .input(z.object({ caseId: z.number(), packetId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const args = await db.select().from(assemblyLegalArgumentBlocks)
        .where(and(
          eq(assemblyLegalArgumentBlocks.caseId, input.caseId),
          eq(assemblyLegalArgumentBlocks.packetId, input.packetId),
        ));

      // Collect all citations from argument blocks
      const allCitations = new Set<string>();
      for (const arg of args) {
        const cites = (arg.supportingCitations as string[]) ?? [];
        cites.forEach(c => allCitations.add(c));
      }

      let created = 0;
      for (const cite of allCitations) {
        const isStatute = /§|U\.S\.C|C\.F\.R|Stat\./.test(cite);
        const isCaseLaw = /v\.|vs\./.test(cite);

        await db.insert(assemblyCitationIndex).values({
          caseId: input.caseId,
          packetId: input.packetId,
          citationType: isStatute ? "statute" : isCaseLaw ? "case_law" : "other",
          citationText: cite,
          bluebookFormat: cite, // LLM already formats in Bluebook style
          relevantClaims: [],
          sectionIds: [],
          createdAt: now,
        });
        created++;
      }

      return { citationsIndexed: created };
    }),

  // ─── A7: Generate Relief Requests ───────────────────────────────────
  generateReliefRequests: protectedProcedure
    .input(z.object({ caseId: z.number(), packetId: z.number(), matterProfileId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const candidates = await db.select().from(strategyClaimCandidates)
        .where(and(
          eq(strategyClaimCandidates.caseId, input.caseId),
          eq(strategyClaimCandidates.matterProfileId, input.matterProfileId),
        ));

      const claimSummary = candidates.map(c => `${c.claimType} (viability: ${c.viabilityScore})`).join(", ");

      const response = await invokeLLMInteractive({
        messages: [
          {
            role: "system",
            content: `You are a legal relief drafter. Generate appropriate relief requests for these claims. Return JSON:
{"reliefs":[{
  "reliefType": "compensatory_damages|punitive_damages|injunctive_relief|declaratory_relief|reinstatement|back_pay|front_pay|attorneys_fees|costs|equitable_relief",
  "reliefDescription": "formal description of relief sought",
  "legalBasis": "statutory or case law basis",
  "estimatedValue": "dollar range or N/A",
  "claimTypes": ["which claims support this relief"]
}]}`
          },
          { role: "user", content: `Claims: ${claimSummary}` }
        ],
        response_format: { type: "json_object" },
      });

      const content = typeof response.choices[0]?.message?.content === "string"
        ? response.choices[0].message.content : "";
      let reliefs: any[];
      try {
        const parsed = JSON.parse(content);
        reliefs = Array.isArray(parsed) ? parsed : (parsed.reliefs ?? []);
      } catch { reliefs = []; }

      let created = 0;
      for (const r of reliefs) {
        await db.insert(assemblyReliefRequests).values({
          caseId: input.caseId,
          packetId: input.packetId,
          reliefType: r.reliefType ?? "compensatory_damages",
          reliefDescription: r.reliefDescription ?? "",
          legalBasis: r.legalBasis ?? null,
          estimatedValue: r.estimatedValue ?? null,
          claimTypes: r.claimTypes ?? [],
          orderIndex: created,
          createdAt: now,
        });
        created++;
      }

      return { reliefsGenerated: created };
    }),

  // ─── A8: Generate Document Sections ─────────────────────────────────
  generateSections: protectedProcedure
    .input(z.object({ caseId: z.number(), packetId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const [packet] = await db.select().from(assemblyFilingPackets)
        .where(eq(assemblyFilingPackets.id, input.packetId));
      if (!packet) throw new Error("Packet not found");

      // Find matching template
      const templates = await db.select().from(assemblyDocumentTemplates);
      const template = templates.find(t => t.documentType === packet.packetType) ?? templates[0];

      if (!template) return { sectionsGenerated: 0, message: "No templates found." };

      const requiredSections = (template.requiredSections as string[]) ?? [];
      const parties = await db.select().from(assemblyPartyDesignations)
        .where(and(eq(assemblyPartyDesignations.caseId, input.caseId), eq(assemblyPartyDesignations.packetId, input.packetId)));
      const factBlocks = await db.select().from(assemblyFactNarrativeBlocks)
        .where(and(eq(assemblyFactNarrativeBlocks.caseId, input.caseId), eq(assemblyFactNarrativeBlocks.packetId, input.packetId)));
      const argBlocks = await db.select().from(assemblyLegalArgumentBlocks)
        .where(and(eq(assemblyLegalArgumentBlocks.caseId, input.caseId), eq(assemblyLegalArgumentBlocks.packetId, input.packetId)));
      const reliefs = await db.select().from(assemblyReliefRequests)
        .where(and(eq(assemblyReliefRequests.caseId, input.caseId), eq(assemblyReliefRequests.packetId, input.packetId)));

      let sectionsGenerated = 0;
      for (const sectionName of requiredSections) {
        let generatedContent = "";

        if (sectionName.toLowerCase().includes("caption") || sectionName.toLowerCase().includes("parties")) {
          generatedContent = parties.map(p => `${p.partyName}, ${p.partyRole}`).join("\n");
        } else if (sectionName.toLowerCase().includes("fact")) {
          generatedContent = factBlocks.map(b => b.narrativeText).join("\n\n");
        } else if (sectionName.toLowerCase().includes("argument") || sectionName.toLowerCase().includes("cause")) {
          generatedContent = argBlocks.map(a => `## ${a.argumentHeading}\n\n${a.argumentText}`).join("\n\n");
        } else if (sectionName.toLowerCase().includes("relief") || sectionName.toLowerCase().includes("prayer")) {
          generatedContent = reliefs.map((r, i) => `${i + 1}. ${r.reliefDescription}`).join("\n");
        } else {
          generatedContent = `[Section: ${sectionName} — content to be generated]`;
        }

        await db.insert(assemblyGeneratedSections).values({
          caseId: input.caseId,
          packetId: input.packetId,
          sectionName,
          orderIndex: sectionsGenerated,
          generatedContent,
          sectionStatus: "generated",
          createdAt: now,
          updatedAt: now,
        });
        sectionsGenerated++;
      }

      // Update packet status
      await db.update(assemblyFilingPackets).set({
        packetStatus: "in_progress",
        updatedAt: now,
      }).where(eq(assemblyFilingPackets.id, input.packetId));

      return { sectionsGenerated };
    }),

  // ─── A9: Run Compliance Checklist ───────────────────────────────────
  runComplianceCheck: protectedProcedure
    .input(z.object({ caseId: z.number(), packetId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const sections = await db.select().from(assemblyGeneratedSections)
        .where(and(
          eq(assemblyGeneratedSections.caseId, input.caseId),
          eq(assemblyGeneratedSections.packetId, input.packetId),
        ));
      const parties = await db.select().from(assemblyPartyDesignations)
        .where(and(eq(assemblyPartyDesignations.caseId, input.caseId), eq(assemblyPartyDesignations.packetId, input.packetId)));
      const exhibits = await db.select().from(assemblyExhibitIndex)
        .where(and(eq(assemblyExhibitIndex.caseId, input.caseId), eq(assemblyExhibitIndex.packetId, input.packetId)));

      const checks = [
        { item: "Caption includes all parties", category: "formatting", passed: parties.length >= 2 },
        { item: "Statement of facts present", category: "content", passed: sections.some(s => s.sectionName.toLowerCase().includes("fact")) },
        { item: "Legal arguments present", category: "content", passed: sections.some(s => s.sectionName.toLowerCase().includes("argument") || s.sectionName.toLowerCase().includes("cause")) },
        { item: "Prayer for relief present", category: "content", passed: sections.some(s => s.sectionName.toLowerCase().includes("relief") || s.sectionName.toLowerCase().includes("prayer")) },
        { item: "Exhibit index created", category: "exhibits", passed: exhibits.length > 0 },
        { item: "All sections generated", category: "completeness", passed: sections.every(s => s.sectionStatus === "generated" || s.sectionStatus === "approved") },
        { item: "Verification/signature block", category: "formatting", passed: sections.some(s => s.sectionName.toLowerCase().includes("verification") || s.sectionName.toLowerCase().includes("signature")) },
      ];

      let created = 0;
      for (const check of checks) {
        await db.insert(assemblyComplianceChecklist).values({
          caseId: input.caseId,
          packetId: input.packetId,
          checkItem: check.item,
          category: check.category,
          checkStatus: check.passed ? "passed" : "pending",
          createdAt: now,
        });
        created++;
      }

      const allPassed = checks.every(c => c.passed);
      if (allPassed) {
        await db.update(assemblyFilingPackets).set({
          packetStatus: "review",
          updatedAt: now,
        }).where(eq(assemblyFilingPackets.id, input.packetId));
      }

      return { checksRun: created, allPassed };
    }),

  // ─── Read Endpoints ─────────────────────────────────────────────────
  getPackets: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(assemblyFilingPackets)
        .where(eq(assemblyFilingPackets.caseId, input.caseId))
        .orderBy(desc(assemblyFilingPackets.createdAt));
    }),

  getPacketDetail: protectedProcedure
    .input(z.object({ packetId: z.number() }))
    .query(async ({ input }) => {
      const [packet] = await db.select().from(assemblyFilingPackets)
        .where(eq(assemblyFilingPackets.id, input.packetId));
      if (!packet) return null;

      const sections = await db.select().from(assemblyGeneratedSections)
        .where(eq(assemblyGeneratedSections.packetId, input.packetId));
      const parties = await db.select().from(assemblyPartyDesignations)
        .where(eq(assemblyPartyDesignations.packetId, input.packetId));
      const exhibits = await db.select().from(assemblyExhibitIndex)
        .where(eq(assemblyExhibitIndex.packetId, input.packetId));
      const factBlocks = await db.select().from(assemblyFactNarrativeBlocks)
        .where(eq(assemblyFactNarrativeBlocks.packetId, input.packetId));
      const argBlocks = await db.select().from(assemblyLegalArgumentBlocks)
        .where(eq(assemblyLegalArgumentBlocks.packetId, input.packetId));
      const reliefs = await db.select().from(assemblyReliefRequests)
        .where(eq(assemblyReliefRequests.packetId, input.packetId));
      const citations = await db.select().from(assemblyCitationIndex)
        .where(eq(assemblyCitationIndex.packetId, input.packetId));
      const compliance = await db.select().from(assemblyComplianceChecklist)
        .where(eq(assemblyComplianceChecklist.packetId, input.packetId));

      return { packet, sections, parties, exhibits, factBlocks, argBlocks, reliefs, citations, compliance };
    }),

  getTemplates: protectedProcedure
    .query(async () => {
      return db.select().from(assemblyDocumentTemplates);
    }),

  getSectionLibrary: protectedProcedure
    .input(z.object({ templateId: z.number().optional() }))
    .query(async ({ input }) => {
      if (input.templateId) {
        return db.select().from(assemblySectionLibrary)
          .where(eq(assemblySectionLibrary.templateId, input.templateId));
      }
      return db.select().from(assemblySectionLibrary);
    }),

  getVersionHistory: protectedProcedure
    .input(z.object({ packetId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(assemblyVersionHistory)
        .where(eq(assemblyVersionHistory.packetId, input.packetId))
        .orderBy(desc(assemblyVersionHistory.createdAt));
    }),

  getOutputs: protectedProcedure
    .input(z.object({ packetId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(assemblyOutputRegistry)
        .where(eq(assemblyOutputRegistry.packetId, input.packetId));
    }),

  // ─── Update Endpoints ──────────────────────────────────────────────
  updateSectionContent: protectedProcedure
    .input(z.object({
      sectionId: z.number(),
      content: z.string(),
      status: z.enum(["generated", "reviewed", "approved", "needs_revision"]).optional(),
    }))
    .mutation(async ({ input }) => {
      await db.update(assemblyGeneratedSections).set({
        generatedContent: input.content,
        sectionStatus: input.status,
        updatedAt: Date.now(),
      }).where(eq(assemblyGeneratedSections.id, input.sectionId));
      return { success: true };
    }),

  updatePacketStatus: protectedProcedure
    .input(z.object({
      packetId: z.number(),
      status: z.enum(["draft", "in_progress", "review", "finalized", "filed"]),
    }))
    .mutation(async ({ input }) => {
      await db.update(assemblyFilingPackets).set({
        packetStatus: input.status,
        updatedAt: Date.now(),
      }).where(eq(assemblyFilingPackets.id, input.packetId));
      return { success: true };
    }),

  updateExhibitStatus: protectedProcedure
    .input(z.object({
      exhibitId: z.number(),
      status: z.enum(["draft", "included", "excluded", "pending_review"]),
    }))
    .mutation(async ({ input }) => {
      await db.update(assemblyExhibitIndex).set({
        exhibitStatus: input.status,
      }).where(eq(assemblyExhibitIndex.id, input.exhibitId));
      return { success: true };
    }),
});
