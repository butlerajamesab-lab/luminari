import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
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
        const [p] = await db.select().from(strategyPaths).where(eq(strategyPaths.id, String(input.strategyPathId)));
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

      return { packet_id: inserted.insertId };
      }); // end withEngineTracking
    }),

  // ─── A2: Designate Parties ──────────────────────────────────────────
  designateParties: protectedProcedure
    .input(z.object({ caseId: z.number(), packetId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const caseEntities = await db.select().from(entities).where(eq(entities.caseId, String(input.caseId)));

      if (caseEntities.length === 0) return { parties_designated: 0, message: "No entities found." };

      // Deterministic party designation — rule-based from entity type + description
      const descContains = (desc: string | null | undefined, ...words: string[]) =>
        words.some(w => (desc ?? "").toLowerCase().includes(w));

      const ENTITY_TYPE_TO_PARTY_TYPE: Record<string, string> = {
        person: "individual",
        organization: "organization",
        corporation: "corporation",
        government_agency: "government_agency",
      };

      const personEntities = caseEntities.filter((e: any) => e.type === "person");

      const parties: any[] = caseEntities.slice(0, 30).map((e: any) => {
        let partyRole: string;
        const desc = e.description ?? "";

        if (e.type === "person") {
          if (descContains(desc, "plaintiff", "complainant", "victim")) {
            partyRole = "plaintiff";
          } else if (descContains(desc, "witness")) {
            partyRole = "witness";
          } else if (personEntities.length === 1) {
            // Only one person — assume plaintiff
            partyRole = "plaintiff";
          } else {
            partyRole = "third_party";
          }
        } else if (e.type === "organization" || e.type === "corporation") {
          partyRole = "defendant";
        } else if (e.type === "government_agency") {
          partyRole = descContains(desc, "respondent") ? "respondent" : "agency";
        } else {
          partyRole = "third_party";
        }

        // If no plaintiff yet and this is the first person, make them plaintiff
        return {
          entityId: e.id,
          partyRole,
          partyName: e.name ?? "Unknown",
          partyType: ENTITY_TYPE_TO_PARTY_TYPE[e.type] ?? "organization",
          notes: null,
        };
      });

      // Ensure at least one plaintiff: if none assigned, first person becomes plaintiff
      const hasPlaintiff = parties.some(p => p.partyRole === "plaintiff" || p.partyRole === "complainant");
      if (!hasPlaintiff) {
        const firstPerson = parties.find(p => p.partyType === "individual");
        if (firstPerson) firstPerson.partyRole = "plaintiff";
      }
      // Ensure at least one defendant: if none, first org becomes defendant
      const hasDefendant = parties.some(p => p.partyRole === "defendant" || p.partyRole === "respondent");
      if (!hasDefendant) {
        const firstOrg = parties.find(p => p.partyType === "organization" || p.partyType === "corporation");
        if (firstOrg) firstOrg.partyRole = "defendant";
      }

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

      return { parties_designated: designated };
    }),

  // ─── A3: Build Exhibit Index ────────────────────────────────────────
  buildExhibitIndex: protectedProcedure
    .input(z.object({ caseId: z.number(), packetId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const caseDocs = await db.select().from(documents).where(eq(documents.caseId, input.caseId));
      const caseQuotes = await db.select().from(quotes).where(eq(quotes.caseId, String(input.caseId)));

      if (caseDocs.length === 0) return { exhibits_created: 0, message: "No documents found." };

      // Deterministic exhibit index — assign alphabetically by document ID
      const sortedDocs = [...caseDocs].sort((a: any, b: any) => a.id - b.id);

      const exhibits: any[] = sortedDocs.slice(0, 26).map((doc: any, idx: number) => {
        const label = String.fromCharCode(65 + idx); // A, B, C...
        // Collect all quotes from this document
        const docQuoteIds = caseQuotes
          .filter((q: any) => q.documentId === doc.id || q.document_id === doc.id)
          .map((q: any) => q.id);
        return {
          exhibitLabel: label,
          exhibitTitle: doc.filename ?? `Document ${doc.id}`,
          documentId: doc.id,
          quoteIds: docQuoteIds,
          description: doc.documentType ?? "Supporting document",
          relevantClaims: [], // requires analysis — leave empty
          orderIndex: idx,
        };
      });

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

      return { exhibits_created: created };
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

      if (facts.length === 0) return { blocks_created: 0, message: "No facts found. Run Strategy Engine first." };

      // Deterministic fact narrative — mechanical assembly grouped by factType
      const FACT_TYPE_TO_BLOCK_TYPE: Record<string, string> = {
        temporal: "background",
        action: "incident",
        procedural: "procedural",
        event: "incident",
        statement: "background",
        condition: "background",
        relationship: "background",
        financial: "incident",
      };

      // Build a map from sourceQuoteId/sourceDocumentId to exhibit label
      const exhibitByDocId = new Map<number, string>();
      for (const ex of exhibits) {
        if (ex.documentId) exhibitByDocId.set(ex.documentId, ex.exhibitLabel);
      }

      // Group facts by factType
      const groupedFacts = new Map<string, typeof facts>();
      for (const f of facts) {
        const ft = f.factType ?? "statement";
        if (!groupedFacts.has(ft)) groupedFacts.set(ft, []);
        groupedFacts.get(ft)!.push(f);
      }

      const blocks: any[] = [];
      let blockIdx = 0;
      for (const [factType, groupFacts] of groupedFacts) {
        const blockType = FACT_TYPE_TO_BLOCK_TYPE[factType] ?? "background";
        const factMatrixIds = groupFacts.map((f: any) => f.id).filter(Boolean);

        // Collect exhibit refs for this group
        const exhibitRefs: string[] = [];
        for (const f of groupFacts) {
          const docId = f.sourceDocumentId ?? f.sourceQuoteId;
          if (docId && exhibitByDocId.has(docId)) {
            const label = `Exhibit ${exhibitByDocId.get(docId)}`;
            if (!exhibitRefs.includes(label)) exhibitRefs.push(label);
          }
        }

        // Build narrative text by assembling fact sentences
        const sentences = groupFacts.map((f: any) => {
          const date = f.dateOccurred ? `On ${f.dateOccurred}, ` : "";
          const actor = f.actor ? `${f.actor} ` : "";
          const ref = exhibitRefs.length > 0 ? ` (See ${exhibitRefs.join(", ")}.)` : "";
          return `${date}${actor}${f.factText}${ref}`;
        });
        const narrativeText = sentences.join(" ");

        // Timeline position: use first date found in the group
        const firstDateFact = groupFacts.find((f: any) => f.dateOccurred);
        const timelinePosition = firstDateFact?.dateOccurred ?? null;

        blocks.push({
          blockType,
          orderIndex: blockIdx,
          narrativeText,
          factMatrixIds,
          exhibitRefs,
          timelinePosition,
        });
        blockIdx++;
      }

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

      return { blocks_created: created };
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

      if (candidates.length === 0) return { arguments_created: 0, message: "No claim candidates found." };

      // Fetch claim catalog for legal standards
      const { strategyClaimCatalog } = await import("../../drizzle/schema");
      const catalog = await db.select().from(strategyClaimCatalog);

      // Fetch exhibits for this packet for exhibit refs
      const packetExhibits = await db.select().from(assemblyExhibitIndex)
        .where(and(
          eq(assemblyExhibitIndex.caseId, input.caseId),
          eq(assemblyExhibitIndex.packetId, input.packetId),
        ));
      const exhibitLabels = packetExhibits.map((e: any) => `Exhibit ${e.exhibitLabel}`).join(", ") || "none";

      let argumentsCreated = 0;
      for (const cand of candidates) {
        // Deterministic legal argument — template-based
        const catalogEntry = catalog.find((c: any) =>
          c.claimType?.toLowerCase() === cand.claimType?.toLowerCase()
        );
        const legalStandard = (catalogEntry as any)?.legalStandard ?? (catalogEntry as any)?.description ?? "applicable law";
        const viabilityScore = parseFloat(String(cand.viabilityScore ?? 0.5));
        const strength = viabilityScore >= 0.7 ? "strong" : viabilityScore >= 0.4 ? "moderate" : "weak";

        const elementsSatisfied = (cand.elementsSatisfied as string[]) ?? [];
        const elementsMissing = (cand.elementsMissing as string[]) ?? [];

        const arg = {
          argumentHeading: `Argument: ${cand.claimType}`,
          argumentText: `${cand.claimType}: Based on the facts established above, the respondent violated ${legalStandard}. Supporting evidence includes ${exhibitLabels}.`,
          supportingCitations: [],
          supportingFacts: elementsSatisfied,
          elementsCovered: elementsSatisfied,
          counterarguments: [],
        };

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

      return { citations_indexed: created };
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

      // Deterministic relief requests — standard templates by domain
      const [profile] = await db.select().from(strategyMatterProfile)
        .where(eq(strategyMatterProfile.caseId, input.caseId));
      const domain = (profile?.domain ?? "general").toLowerCase();

      const DOMAIN_RELIEF: Record<string, string> = {
        employment: "Reinstatement, back pay, compensatory damages, attorney's fees",
        employment_discrimination: "Reinstatement, back pay, compensatory damages, attorney's fees",
        wage_theft: "Back pay, liquidated damages, attorney's fees, costs",
        retaliation: "Reinstatement, back pay, compensatory damages, attorney's fees",
        harassment: "Compensatory damages, injunctive relief, attorney's fees",
        wrongful_termination: "Reinstatement, back pay, compensatory damages, attorney's fees",
        housing: "Injunctive relief, damages, relocation costs",
        consumer: "Actual damages, statutory damages, attorney's fees",
      };
      const reliefText = DOMAIN_RELIEF[domain] ?? "Compensatory damages, injunctive relief, attorney's fees, costs";

      // One relief request per candidate
      const reliefs: any[] = candidates.map((cand: any) => ({
        reliefType: "compensatory_damages",
        reliefDescription: reliefText,
        legalBasis: null,
        estimatedValue: null,
        claimTypes: [cand.claimType],
      }));

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

      return { reliefs_generated: created };
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
      const template = templates.find((t: any) => t.documentType === packet.packetType) ?? templates[0];

      if (!template) return { sections_generated: 0, message: "No templates found." };

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
          generatedContent = parties.map((p: any) => `${p.partyName}, ${p.partyRole}`).join("\n");
        } else if (sectionName.toLowerCase().includes("fact")) {
          generatedContent = factBlocks.map((b: any) => b.narrativeText).join("\n\n");
        } else if (sectionName.toLowerCase().includes("argument") || sectionName.toLowerCase().includes("cause")) {
          generatedContent = argBlocks.map((a: any) => `## ${a.argumentHeading}\n\n${a.argumentText}`).join("\n\n");
        } else if (sectionName.toLowerCase().includes("relief") || sectionName.toLowerCase().includes("prayer")) {
          generatedContent = reliefs.map((r: any, i: any) => `${i + 1}. ${r.reliefDescription}`).join("\n");
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
        { item: "Statement of facts present", category: "content", passed: sections.some((s: any) => s.sectionName.toLowerCase().includes("fact")) },
        { item: "Legal arguments present", category: "content", passed: sections.some((s: any) => s.sectionName.toLowerCase().includes("argument") || s.sectionName.toLowerCase().includes("cause")) },
        { item: "Prayer for relief present", category: "content", passed: sections.some((s: any) => s.sectionName.toLowerCase().includes("relief") || s.sectionName.toLowerCase().includes("prayer")) },
        { item: "Exhibit index created", category: "exhibits", passed: exhibits.length > 0 },
        { item: "All sections generated", category: "completeness", passed: sections.every((s: any) => s.sectionStatus === "generated" || s.sectionStatus === "approved") },
        { item: "Verification/signature block", category: "formatting", passed: sections.some((s: any) => s.sectionName.toLowerCase().includes("verification") || s.sectionName.toLowerCase().includes("signature")) },
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

      return { checks_run: created, allPassed };
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
