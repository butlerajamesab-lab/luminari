/**
 * DOCUMENT MODE CLASSIFIER
 * 
 * Classifies documents as INGESTION or BACKBONE
 * - INGESTION: Real claims/forms → extract signals + create cases
 * - BACKBONE: Reference documents → store as reference only
 */

export type DocumentMode = 'INGESTION' | 'BACKBONE';

interface ClassificationResult {
  mode: DocumentMode;
  confidence: number;
  reasoning: string;
  keywords: string[];
}

/**
 * INGESTION markers: Real claims, forms, complaints, appeals
 */
const INGESTION_MARKERS = {
  CLAIM: ['wage claim', 'complaint', 'appeal', 'petition', 'request', 'application'],
  PARTY: ['claimant', 'plaintiff', 'appellant', 'complainant', 'applicant', 'petitioner'],
  ACTION: ['filed', 'submitted', 'alleged', 'seeks', 'demands', 'requests relief'],
  DATES: ['date of claim', 'date of injury', 'date of loss', 'effective date', 'incident date'],
  AMOUNTS: ['damages', 'benefits owed', 'compensation', 'award', 'relief sought'],
  REGULATORY: ['RCW', 'WAC', 'CFR', 'USC', 'statute', 'regulation', 'code section'],
};

/**
 * BACKBONE markers: Reference, meta-analysis, catalogs, guides
 */
const BACKBONE_MARKERS = {
  CATALOG: ['registry', 'catalog', 'index', 'directory', 'master', 'compendium'],
  ANALYSIS: ['analysis', 'matrix', 'framework', 'guide', 'handbook', 'manual'],
  REFERENCE: ['reference', 'overview', 'summary', 'comparison', 'interaction', 'collision'],
  META: ['cascade', 'mapping', 'flowchart', 'diagram', 'architecture', 'structure'],
  PROCEDURAL: ['procedure', 'process', 'workflow', 'step', 'sequence', 'timeline'],
};

/**
 * Classify document as INGESTION or BACKBONE
 */
export function classifyDocumentMode(content: string, filename: string): ClassificationResult {
  const text = (content + ' ' + filename).toLowerCase();

  // Count markers
  let ingestionScore = 0;
  let backboneScore = 0;
  const detectedKeywords: string[] = [];

  // Check INGESTION markers
  for (const [category, markers] of Object.entries(INGESTION_MARKERS)) {
    for (const marker of markers) {
      if (text.includes(marker)) {
        ingestionScore += 2;
        detectedKeywords.push(marker);
      }
    }
  }

  // Check BACKBONE markers
  for (const [category, markers] of Object.entries(BACKBONE_MARKERS)) {
    for (const marker of markers) {
      if (text.includes(marker)) {
        backboneScore += 2;
        detectedKeywords.push(marker);
      }
    }
  }

  // Determine mode
  let mode: DocumentMode;
  let confidence: number;
  let reasoning: string;

  if (ingestionScore > backboneScore) {
    mode = 'INGESTION';
    confidence = Math.min(100, (ingestionScore / (ingestionScore + backboneScore)) * 100);
    reasoning = `Real claim/form detected. INGESTION markers: ${ingestionScore}, BACKBONE markers: ${backboneScore}`;
  } else if (backboneScore > ingestionScore) {
    mode = 'BACKBONE';
    confidence = Math.min(100, (backboneScore / (ingestionScore + backboneScore)) * 100);
    reasoning = `Reference document detected. BACKBONE markers: ${backboneScore}, INGESTION markers: ${ingestionScore}`;
  } else {
    // Default to INGESTION if unclear (safer to process)
    mode = 'INGESTION';
    confidence = 50;
    reasoning = 'Unclear classification. Defaulting to INGESTION for processing.';
  }

  return {
    mode,
    confidence: Math.round(confidence),
    reasoning,
    keywords: [...new Set(detectedKeywords)],
  };
}

/**
 * Test the classifier
 */
async function runTests() {
  const testCases = [
    {
      filename: 'wage-claim-2024.txt',
      content: `WAGE CLAIM FORM
Claimant: John Smith
Date of Claim: 03/15/2024
Employer: ABC Corp
Wages Owed: $5,000
Allegation: Unpaid overtime and wage theft
Seeks: Full compensation plus penalties
RCW 49.52.050 - Wage payment requirements`,
    },
    {
      filename: 'luminari-benefits-cascade.docx',
      content: `LUMINARI BENEFITS CASCADE ANALYSIS
Benefit interaction matrix showing how different federal and state benefits interact, stack, or conflict.
Includes income thresholds, asset limits, work incentives, and clawback provisions.
Analyzes cascading effects of benefit changes on household income and eligibility.`,
    },
    {
      filename: 'housing-complaint.txt',
      content: `HOUSING COMPLAINT FORM
Complainant: Maria Garcia
Property: 456 Oak Street, Tacoma WA
Date of Complaint: 02/20/2024
Landlord: Robert Property Management
Alleged Violations: Habitability violations, mold, broken heating
RCW 59.18.060 - Landlord duties`,
    },
    {
      filename: 'luminari-sol-collision.docx',
      content: `STATUTE OF LIMITATIONS COLLISION ANALYSIS
Analysis of overlapping statutes of limitations across different claim types.
Identifies conflicts, ambiguities, and optimization strategies.
Federal, state, and local SOL provisions framework.`,
    },
  ];

  console.log('[Classifier] Testing document mode classification...\n');

  for (const test of testCases) {
    const result = classifyDocumentMode(test.content, test.filename);
    console.log(`📄 ${test.filename}`);
    console.log(`   Mode: ${result.mode} (${result.confidence}% confidence)`);
    console.log(`   Reasoning: ${result.reasoning}`);
    console.log(`   Keywords: ${result.keywords.slice(0, 5).join(', ')}`);
    console.log();
  }
}

runTests();
