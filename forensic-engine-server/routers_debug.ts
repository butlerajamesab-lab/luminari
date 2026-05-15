  list: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const allDocuments = await db.select().from(documents).limit(5);
        const caseDocuments = await db.select().from(documents).where(eq(documents.caseId, input.caseId));
        
        // Force debug entry into UI
        return [
          {
            id: -1,
            filename: "DEBUG_ENTRY",
            caseId: input.caseId,
            userId: ctx.user?.id,
            status: "debug",
            debug: JSON.stringify({
              inputCaseId: input.caseId,
              inputType: typeof input.caseId,
              ctxUserId: ctx.user?.id,
              allDocsCount: allDocuments.length,
              allDocs: allDocuments.map((d: any) => ({ id: d.id, caseId: d.caseId, userId: d.userId, filename: d.filename })),
              caseDocsCount: caseDocuments.length,
              caseDocs: caseDocuments.map((d: any) => ({ id: d.id, caseId: d.caseId, userId: d.userId, filename: d.filename })),
            }, null, 2),
          } as any,
          ...caseDocuments,
        ];
      } catch (err) {
        return [
          {
            id: -1,
            filename: "DEBUG_ERROR",
            caseId: input.caseId,
            userId: ctx.user?.id,
            status: "debug",
            debug: String(err),
          } as any,
        ];
      }
    }),
