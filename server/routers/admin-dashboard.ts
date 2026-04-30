    // Count findings by severity across all cases
    const severityCounts = await db
      .select({ severity: findings.confidence, cnt: count() })
      .from(findings)
      .groupBy(findings.confidence);

    // Count findings by category
    const categoryCounts = await db
      .select({ category: findings.findingType, cnt: count() })
      .from(findings)
      .groupBy(findings.findingType);

    // Recent high-severity findings
    const criticalFindings = await db
      .select({
        id: findings.id,
        caseId: findings.caseId,
        title: findings.title,
        severity: findings.confidence,
        category: findings.findingType,
        createdAt: findings.createdAt,
      })
      .from(findings)
      .where(eq(findings.confidence, "strong"))
      .orderBy(desc(findings.createdAt))
      .limit(10);

    return {
      bySeverity: severityCounts.map((s) => ({ severity: s.severity, count: s.cnt })),
      byCategory: categoryCounts.map((c) => ({ category: c.category, count: c.cnt })),
      criticalFindings,
      totalFindings: severityCounts.reduce((sum, s) => sum + s.cnt, 0),
    };
  }),

  /* ── Panel 5: Work Queue ── */
  workQueue: adminProcedure2.query(async () => {
    // Pending/running engine runs
    const pendingRuns = await db
      .select({
        id: engineRuns.id,
        caseId: engineRuns.caseId,
        runType: engineRuns.runType,
        runStatus: engineRuns.runStatus,
        createdAt: engineRuns.createdAt,
      })
      .from(engineRuns)
      .where(eq(engineRuns.runStatus, "running"))
      .orderBy(desc(engineRuns.createdAt))
      .limit(20);

    // Recently failed runs
    const failedRuns = await db
      .select({
        id: engineRuns.id,