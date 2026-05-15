const crypto = require('crypto');

// ============================================================================
// AGENCY REGISTRY (Externalized, Configurable)
// ============================================================================

const AGENCY_REGISTRY = {
  EEOC: {
    patterns: [/EEOC\b/gi, /Equal Employment Opportunity Commission/gi],
    aliases: ['EEOC', 'Equal Employment Opportunity Commission'],
    jurisdiction: ['Federal', 'CA', 'NY', 'TX'],
  },
  CFPB: {
    patterns: [/CFPB\b/gi, /Consumer Financial Protection Bureau/gi, /Bureau of Consumer Financial Protection/gi],
    aliases: ['CFPB', 'Consumer Financial Protection Bureau'],
    jurisdiction: ['Federal'],
  },
  FTC: {
    patterns: [/\bFTC\b/gi, /Federal Trade Commission/gi],
    aliases: ['FTC', 'Federal Trade Commission'],
    jurisdiction: ['Federal'],
  },
  DOL: {
    patterns: [/\bDOL\b/gi, /Department of Labor/gi, /US Department of Labor/gi, /U\.S\. Department of Labor/gi],
    aliases: ['DOL', 'Department of Labor'],
    jurisdiction: ['Federal'],
  },
  HUD: {
    patterns: [/\bHUD\b/gi, /Department of Housing and Urban Development/gi, /Housing and Urban Development/gi],
    aliases: ['HUD', 'Housing and Urban Development'],
    jurisdiction: ['Federal'],
  },
  SSA: {
    patterns: [/\bSSA\b/gi, /Social Security Administration/gi, /Social Security\b/gi],
    aliases: ['SSA', 'Social Security Administration'],
    jurisdiction: ['Federal'],
  },
  OSHA: {
    patterns: [/\bOSHA\b/gi, /Occupational Safety and Health Administration/gi],
    aliases: ['OSHA'],
    jurisdiction: ['Federal'],
  },
  NLRB: {
    patterns: [/\bNLRB\b/gi, /National Labor Relations Board/gi],
    aliases: ['NLRB', 'National Labor Relations Board'],
    jurisdiction: ['Federal'],
  },
  DFPI: {
    patterns: [/\bDFPI\b/gi, /Department of Financial Protection and Innovation/gi],
    aliases: ['DFPI'],
    jurisdiction: ['CA'],
  },
  CDTFA: {
    patterns: [/\bCDTFA\b/gi, /California Department of Tax and Fee Administration/gi],
    aliases: ['CDTFA'],
    jurisdiction: ['CA'],
  },
  DFEH: {
    patterns: [/\bDFEH\b/gi, /Department of Fair Employment and Housing/gi, /California Department of Fair Employment and Housing/gi],
    aliases: ['DFEH'],
    jurisdiction: ['CA'],
  },
  DLSE: {
    patterns: [/\bDLSE\b/gi, /Division of Labor Standards Enforcement/gi, /Labor Commissioner/gi],
    aliases: ['DLSE', 'Labor Commissioner'],
    jurisdiction: ['CA'],
  },
};

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

class Match {
  constructor(type, value, position) {
    this.type = type; // 'url', 'phone', 'address', 'action_keyword', 'form_indicator', 'deadline'
    this.value = value;
    this.position = position;
  }
}

class ContextBlock {
  constructor(match, text, startIdx, endIdx) {
    this.match = match;
    this.text = text;
    this.startIdx = startIdx;
    this.endIdx = endIdx;
  }

  overlap(other) {
    return !(this.endIdx < other.startIdx || this.startIdx > other.endIdx);
  }

  merge(other) {
    const mergedStart = Math.min(this.startIdx, other.startIdx);
    const mergedEnd = Math.max(this.endIdx, other.endIdx);
    const text = this.text.substring(0, other.startIdx - this.startIdx) + other.text;
    return new ContextBlock(this.match, text, mergedStart, mergedEnd);
  }
}

class WorkflowCandidate {
  constructor(workflow, score, matchedKeyword) {
    this.workflow = workflow;
    this.score = score;
    this.matched_keyword = matchedKeyword;
  }
}

class ProtoForm {
  constructor() {
    this.proto_form_id = crypto.randomUUID();
    this.form_name = null;
    this.form_name_strategy = null; // How the name was extracted
    this.submission_url = null;
    this.submission_method = 'unknown';
    this.agency_name = null;
    this.agency_candidates = [];
    this.jurisdiction = null;
    this.domain_candidates = [];
    this.workflow_candidates = [];
    this.deadline_text = null;
    this.deadline_in_days = null;
    this.deadline_raw_match = null;
    this.raw_context = null;
    this.confidence_score = 0;
    this.validation_flags = {
      missing_url: false,
      missing_agency: false,
      missing_workflow: false,
      low_confidence: false,
      multiple_domains: false,
      multiple_workflows: false,
    };
  }
}

class ExtractionResult {
  constructor() {
    this.proto_forms = [];
    this.top_forms = [];
    this.workflow_counts = {};
    this.missing_coverage = {};
    this.staging_output = {
      forms_registry_staging: [],
      agency_candidates: [],
      workflow_form_links_staging: [],
    };
    this.stats = {
      total: 0,
      avg_confidence: 0,
      by_domain: {},
      by_workflow: {},
    };
  }
}

// ============================================================================
// SCANNER MODULE (Enhanced)
// ============================================================================

class ScannerModule {
  constructor(agencyRegistry = AGENCY_REGISTRY) {
    this.agencyRegistry = agencyRegistry;
    this.actionKeywords = [
      'apply', 'file', 'submit', 'complaint', 'appeal', 'request', 'hearing',
      'petition', 'intake', 'report', 'grievance', 'claim', 'dispute',
      'challenge', 'objection', 'challenge',
    ];
    this.formIndicators = [
      'form', 'request', 'application', 'complaint', 'appeal', 'notice',
      'filing', 'petition', 'claim form', 'complaint form',
    ];

    this.jurisdictionPatterns = {
      CA: /california\b|CA\b|\bca\b|CA\s|CA\.|California/gi,
      NY: /new york\b|NY\b|\bny\b|NY\s|NY\.|New York/gi,
      TX: /texas\b|TX\b|\btx\b|TX\s|TX\.|Texas/gi,
      FL: /florida\b|FL\b|\bfl\b|FL\s|FL\.|Florida/gi,
      WA: /washington\b|WA\b|\bwa\b|WA\s|WA\.|Washington/gi,
      Federal: /federal\b|united states|u\.s\.|congress|statute|federal law/gi,
    };

    this.domainKeywords = {
      housing: [
        'eviction', 'rent', 'lease', 'foreclosure', 'housing', 'landlord',
        'tenant', 'property', 'mortgage', 'homeowners', 'habitability',
        'uninhabitable', 'housing violation', 'rent strike',
      ],
      wage: [
        'wage', 'salary', 'overtime', 'labor', 'wage theft', 'unpaid',
        'paycheck', 'employment', 'employee', 'hour', 'compensation',
        'retaliation', 'wage and hour', 'labor commissioner',
      ],
      benefits: [
        'unemployment', 'workers comp', 'disability', 'insurance', 'benefit',
        'claim', 'social security', 'medicare', 'medicaid', 'denied', 'appeal',
      ],
      insurance: [
        'insurance', 'claim', 'denied', 'coverage', 'premium', 'policy',
        'deductible', 'appeal', 'claim denied',
      ],
      healthcare: [
        'medical', 'healthcare', 'health care', 'hospital', 'doctor',
        'provider', 'treatment', 'diagnosis', 'prescription', 'denied treatment',
      ],
      legal: [
        'attorney', 'lawyer', 'court', 'lawsuit', 'litigation', 'complaint',
        'appeal', 'motion',
      ],
    };

    this.workflowKeywords = {
      insurance_denial: [
        ['insurance', 'claim denied'],
        ['claim denied', 'appeal'],
        ['coverage denied'],
        ['appeal insurance'],
      ],
      housing_violation: [
        ['eviction'],
        ['housing violation'],
        ['uninhabitable'],
        ['rent strike'],
        ['housing complaint'],
        ['housing code'],
      ],
      wage_theft: [
        ['wage theft'],
        ['unpaid wages'],
        ['wage dispute'],
        ['labor complaint'],
        ['wage and hour'],
        ['labor commissioner'],
      ],
      benefits_denial: [
        ['unemployment denied'],
        ['workers compensation'],
        ['workers comp'],
        ['benefits appeal'],
        ['benefit denial'],
        ['ui appeal'],
      ],
    };

    this.deadlinePatterns = [
      { pattern: /within\s+(\d+)\s+(?:day|business day)s?\b/gi, label: 'days' },
      { pattern: /no later than\s+(\d+)\s+(?:day|business day)s?\b/gi, label: 'days' },
      { pattern: /must\s+(?:file|submit|appeal|apply)\s+within\s+(\d+)\s+(?:day|business day)s?\b/gi, label: 'days' },
      { pattern: /deadline\s+(?:is|of|:)?\s*(\d+)\s+(?:day|business day)s?\b/gi, label: 'days' },
      { pattern: /appeal\s+within\s+(\d+)\s+(?:day|business day)s?\b/gi, label: 'days' },
      { pattern: /file\s+(?:your\s+)?(?:appeal|complaint|claim)\s+within\s+(\d+)\s+(?:day|business day)s?\b/gi, label: 'days' },
    ];
  }

  scan(payload) {
    const matches = [];

    // URL scanning (enhanced patterns)
    const urlPatterns = [
      /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi,
      /www\.[^\s<>"{}|\\^`\[\]]+/gi,
      /[a-zA-Z0-9\-]+\.(?:gov|org|com|edu|net)[^\s<>"{}|\\^`\[\]]*\b/gi,
    ];

    urlPatterns.forEach(pattern => {
      let urlMatch;
      const workingPattern = new RegExp(pattern.source, pattern.flags);
      while ((urlMatch = workingPattern.exec(payload)) !== null) {
        const url = urlMatch[0];
        if (!matches.some(m => m.type === 'url' && m.value === url)) {
          matches.push(new Match('url', url, urlMatch.index));
        }
      }
    });

    // Phone number scanning
    const phoneRegex = /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
    let phoneMatch;
    while ((phoneMatch = phoneRegex.exec(payload)) !== null) {
      matches.push(new Match('phone', phoneMatch[0], phoneMatch.index));
    }

    // Address scanning
    const addressRegex = /\d+\s+[a-z\s]+(?:st|street|ave|avenue|rd|road|blvd|boulevard|ln|lane|dr|drive|ct|court|pl|place|way|walk)\b[^.\n]*/gi;
    let addressMatch;
    while ((addressMatch = addressRegex.exec(payload)) !== null) {
      matches.push(new Match('address', addressMatch[0].trim(), addressMatch.index));
    }

    // Action keyword scanning
    this.actionKeywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      let kwMatch;
      while ((kwMatch = regex.exec(payload)) !== null) {
        matches.push(new Match('action_keyword', keyword, kwMatch.index));
      }
    });

    // Form indicator scanning
    this.formIndicators.forEach(indicator => {
      const regex = new RegExp(`\\b${indicator}\\b`, 'gi');
      let fiMatch;
      while ((fiMatch = regex.exec(payload)) !== null) {
        matches.push(new Match('form_indicator', indicator, fiMatch.index));
      }
    });

    // Deadline scanning
    this.deadlinePatterns.forEach(({ pattern, label }) => {
      let deadlineMatch;
      const workingPattern = new RegExp(pattern.source, pattern.flags);
      while ((deadlineMatch = workingPattern.exec(payload)) !== null) {
        matches.push(new Match('deadline', deadlineMatch[0], deadlineMatch.index));
      }
    });

    return matches.sort((a, b) => a.position - b.position);
  }

  detectAgencies(payload) {
    const candidates = [];

    for (const [agencyName, agencyData] of Object.entries(this.agencyRegistry)) {
      for (const pattern of agencyData.patterns) {
        const regex = new RegExp(pattern.source, pattern.flags);
        if (regex.test(payload)) {
          candidates.push({
            agency_name: agencyName,
            aliases: agencyData.aliases,
            jurisdiction: agencyData.jurisdiction,
            confidence: 0.9,
          });
          break;
        }
      }
    }

    return candidates.length > 0 ? candidates : [];
  }

  detectJurisdiction(payload) {
    const matches = [];
    for (const [jurisdiction, pattern] of Object.entries(this.jurisdictionPatterns)) {
      if (pattern.test(payload)) {
        matches.push(jurisdiction);
      }
    }
    return matches.length > 0 ? matches[0] : null;
  }

  detectDomainCandidates(payload) {
    const candidates = [];
    for (const [domain, keywords] of Object.entries(this.domainKeywords)) {
      let matchCount = 0;
      for (const keyword of keywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(payload)) {
          matchCount++;
        }
      }
      if (matchCount > 0) {
        candidates.push({
          domain,
          match_count: matchCount,
          confidence: Math.min(matchCount / keywords.length, 1.0),
        });
      }
    }
    return candidates.sort((a, b) => b.match_count - a.match_count);
  }

  detectWorkflowCandidates(payload) {
    const candidates = [];

    for (const [workflow, keywordGroups] of Object.entries(this.workflowKeywords)) {
      for (const group of keywordGroups) {
        const allPresent = group.every(keyword =>
          new RegExp(`\\b${keyword}\\b`, 'i').test(payload)
        );
        if (allPresent) {
          candidates.push(new WorkflowCandidate(workflow, 0.9, group.join(' + ')));
        }
      }
    }

    return candidates;
  }

  extractDeadline(payload) {
    for (const { pattern } of this.deadlinePatterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      const match = regex.exec(payload);
      if (match) {
        const daysMatch = match[0].match(/\d+/);
        const days = daysMatch ? parseInt(daysMatch[0]) : null;
        return {
          deadline_text: match[0],
          deadline_in_days: days,
          deadline_raw_match: match[0],
        };
      }
    }
    return { deadline_text: null, deadline_in_days: null, deadline_raw_match: null };
  }
}

// ============================================================================
// CONTEXT EXTRACTOR MODULE (Enhanced with Merging)
// ============================================================================

class ContextExtractorModule {
  constructor(contextWindow = 500) {
    this.contextWindow = contextWindow;
  }

  extract(payload, matches) {
    const blocks = matches.map(match => {
      const startIdx = Math.max(0, match.position - this.contextWindow);
      const endIdx = Math.min(payload.length, match.position + match.value.length + this.contextWindow);
      const text = payload.substring(startIdx, endIdx);
      return new ContextBlock(match, text, startIdx, endIdx);
    });

    return this.mergeOverlapping(blocks);
  }

  mergeOverlapping(blocks) {
    if (blocks.length === 0) return [];

    const sorted = blocks.sort((a, b) => a.startIdx - b.startIdx);
    const merged = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const last = merged[merged.length - 1];
      const current = sorted[i];

      if (last.overlap(current)) {
        merged[merged.length - 1] = last.merge(current);
      } else {
        merged.push(current);
      }
    }

    return merged;
  }
}

// ============================================================================
// PROTO-FORM BUILDER MODULE (Enhanced)
// ============================================================================

class ProtoFormBuilderModule {
  constructor(scanner) {
    this.scanner = scanner;
  }

  build(contextBlocks) {
    return contextBlocks.map(block => {
      const form = new ProtoForm();
      const context = block.text;

      // Extract form name (ranked strategies)
      form.form_name = this.extractFormName(context);

      // Extract submission URL
      form.submission_url = this.extractSubmissionUrl(context);
      form.submission_method = this.determineSubmissionMethod(context);

      // Detect agencies
      form.agency_candidates = this.scanner.detectAgencies(context);
      form.agency_name = form.agency_candidates.length > 0 ? form.agency_candidates[0].agency_name : null;

      // Detect jurisdiction
      form.jurisdiction = this.scanner.detectJurisdiction(context);

      // Detect domains (allow multiple)
      const domainCandidates = this.scanner.detectDomainCandidates(context);
      form.domain_candidates = domainCandidates;
      if (domainCandidates.length > 1) {
        form.validation_flags.multiple_domains = true;
      }

      // Detect workflows (allow multiple)
      const workflowCandidates = this.scanner.detectWorkflowCandidates(context);
      form.workflow_candidates = workflowCandidates;
      if (workflowCandidates.length > 1) {
        form.validation_flags.multiple_workflows = true;
      }

      // Add jurisdiction prefix if CA
      if (form.jurisdiction === 'CA' && workflowCandidates.length > 0) {
        const prefixed = workflowCandidates.map(wf => ({
          ...wf,
          workflow: `ca_${wf.workflow}`,
        }));
        form.workflow_candidates = [...workflowCandidates, ...prefixed];
      }

      // Extract deadline
      const deadline = this.scanner.extractDeadline(context);
      form.deadline_text = deadline.deadline_text;
      form.deadline_in_days = deadline.deadline_in_days;
      form.deadline_raw_match = deadline.deadline_raw_match;

      // Store raw context
      form.raw_context = context;

      // Calculate confidence
      form.confidence_score = this.calculateConfidence(form);

      // Set validation flags
      form.validation_flags.missing_url = !form.submission_url;
      form.validation_flags.missing_agency = form.agency_candidates.length === 0;
      form.validation_flags.missing_workflow = form.workflow_candidates.length === 0;
      form.validation_flags.low_confidence = form.confidence_score < 2;

      return form;
    });
  }

  extractFormName(context) {
    // Strategy 1: Explicit form/complaint/appeal heading
    const explicitPattern = /(?:Form|Request|Application|Complaint|Appeal|Notice|Filing|Petition)\s+(?:No\.|#)?([A-Z0-9\-\s]+?)(?:\n|$|\.)/i;
    const match1 = context.match(explicitPattern);
    if (match1) {
      return { name: match1[1].trim(), strategy: 'explicit_form_heading' };
    }

    // Strategy 2: Uppercase heading near URL
    const lines = context.split('\n');
    const urlLineIdx = lines.findIndex(line => /https?:\/\/|www\./.test(line));
    if (urlLineIdx !== -1) {
      for (let i = Math.max(0, urlLineIdx - 3); i <= Math.min(lines.length - 1, urlLineIdx + 1); i++) {
        const line = lines[i].trim();
        if (/^[A-Z][A-Za-z\s\-]{2,}$/.test(line) && line.length < 80) {
          return { name: line, strategy: 'uppercase_near_url' };
        }
      }
    }

    // Strategy 3: Nearest label line before action block
    const actionKeywords = ['apply', 'file', 'submit', 'complaint', 'appeal'];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (actionKeywords.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(line))) {
        for (let j = Math.max(0, i - 5); j < i; j++) {
          const prevLine = lines[j].trim();
          if (/^[A-Z]/.test(prevLine) && prevLine.length > 5 && prevLine.length < 100) {
            return { name: prevLine, strategy: 'label_before_action' };
          }
        }
      }
    }

    // Fallback: deterministic key from context hash
    return null;
  }

  extractSubmissionUrl(context) {
    const urlMatch = context.match(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/);
    return urlMatch ? urlMatch[0] : null;
  }

  determineSubmissionMethod(context) {
    if (/https?:\/\/|www\./.test(context)) return 'online';
    if (/(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/.test(context)) return 'phone';
    if (/\d+\s+[a-z\s]+(?:st|street|ave|avenue|rd|road|blvd|boulevard|ln|lane|dr|drive|ct|court|pl|place|way|walk)\b/i.test(context)) return 'mail';
    return 'unknown';
  }

  calculateConfidence(form) {
    let score = 0;

    if (form.submission_url) score += 1;
    if (form.workflow_candidates.length > 0) score += 1;
    if (form.agency_candidates.length > 0) score += 1;
    if (form.domain_candidates.length > 0) score += 1;
    if (form.form_name) score += 1;

    return score;
  }
}

// ============================================================================
// DEDUPLICATION MODULE (Enhanced with Composite Keys)
// ============================================================================

class DeduplicationModule {
  deduplicate(forms) {
    const groups = new Map();

    forms.forEach(form => {
      const key = this.generateCompositeKey(form);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(form);
    });

    const deduped = [];

    groups.forEach((groupForms) => {
      if (groupForms.length === 1) {
        deduped.push(groupForms[0]);
      } else {
        // Merge forms, keep highest confidence
        const sorted = groupForms.sort((a, b) => b.confidence_score - a.confidence_score);
        const primary = sorted[0];

        // Aggregate candidate arrays
        const allWorkflows = new Map();
        const allDomains = new Map();
        const allAgencies = new Map();

        groupForms.forEach(form => {
          form.workflow_candidates.forEach(wf => {
            const key = wf.workflow;
            if (!allWorkflows.has(key)) {
              allWorkflows.set(key, wf);
            }
          });

          form.domain_candidates.forEach(d => {
            const key = d.domain;
            if (!allDomains.has(key)) {
              allDomains.set(key, d);
            }
          });

          form.agency_candidates.forEach(a => {
            const key = a.agency_name;
            if (!allAgencies.has(key)) {
              allAgencies.set(key, a);
            }
          });
        });

        primary.workflow_candidates = Array.from(allWorkflows.values());
        primary.domain_candidates = Array.from(allDomains.values());
        primary.agency_candidates = Array.from(allAgencies.values());

        deduped.push(primary);
      }
    });

    return deduped;
  }

  generateCompositeKey(form) {
    const normalizedUrl = form.submission_url ? form.submission_url.toLowerCase().replace(/\/$/, '') : 'no_url';
    const normalizedName = form.form_name ? form.form_name.name.toLowerCase() : 'no_name';
    const agency = form.agency_name || 'no_agency';
    const workflow = form.workflow_candidates.length > 0 ? form.workflow_candidates[0].workflow : 'no_workflow';

    return `${normalizedUrl}|${normalizedName}|${agency}|${workflow}`;
  }
}

// ============================================================================
// STAGING OUTPUT MODULE
// ============================================================================

class StagingOutputModule {
  generateStagingOutput(forms) {
    const formsRegistryStaging = [];
    const agencyCandidates = [];
    const workflowFormLinks = [];

    forms.forEach(form => {
      // 1. forms_registry_staging entry
      formsRegistryStaging.push({
        proto_form_id: form.proto_form_id,
        form_name: form.form_name ? form.form_name.name : null,
        form_name_strategy: form.form_name ? form.form_name.strategy : null,
        submission_url: form.submission_url,
        submission_method: form.submission_method,
        agency_name: form.agency_name,
        jurisdiction: form.jurisdiction,
        primary_domain: form.domain_candidates.length > 0 ? form.domain_candidates[0].domain : null,
        deadline_in_days: form.deadline_in_days,
        deadline_raw_match: form.deadline_raw_match,
        confidence_score: form.confidence_score,
        validation_flags: form.validation_flags,
        raw_context: form.raw_context,
        ingestion_timestamp: new Date().toISOString(),
        enrichment_status: form.confidence_score >= 3 ? 'pending_review' : 'pending_enrichment',
      });

      // 2. agency_candidates entries
      form.agency_candidates.forEach(agency => {
        agencyCandidates.push({
          proto_form_id: form.proto_form_id,
          agency_name: agency.agency_name,
          aliases: agency.aliases,
          jurisdiction: agency.jurisdiction,
          confidence: agency.confidence,
        });
      });

      // 3. workflow_form_links_staging entries
      form.workflow_candidates.forEach(workflow => {
        workflowFormLinks.push({
          proto_form_id: form.proto_form_id,
          workflow_hint: workflow.workflow,
          matched_keyword: workflow.matched_keyword,
          confidence: workflow.score,
          is_ca_prefixed: workflow.workflow.startsWith('ca_'),
        });
      });
    });

    return {
      forms_registry_staging: formsRegistryStaging,
      agency_candidates: agencyCandidates,
      workflow_form_links_staging: workflowFormLinks,
    };
  }
}

// ============================================================================
// MAIN EXTRACTION ENGINE
// ============================================================================

class FormSignalExtractionEngine {
  constructor(agencyRegistry = AGENCY_REGISTRY) {
    this.scanner = new ScannerModule(agencyRegistry);
    this.contextExtractor = new ContextExtractorModule();
    this.protoFormBuilder = new ProtoFormBuilderModule(this.scanner);
    this.deduplicator = new DeduplicationModule();
    this.stagingOutput = new StagingOutputModule();
  }

  extract(payload) {
    // Step 1: Scan for matches
    const matches = this.scanner.scan(payload);

    // Step 2: Extract and merge context blocks
    const contextBlocks = this.contextExtractor.extract(payload, matches);

    // Step 3: Build proto-forms
    let protoForms = this.protoFormBuilder.build(contextBlocks);

    // Step 4: Deduplicate (composite keys)
    protoForms = this.deduplicator.deduplicate(protoForms);

    // Step 5: Filter to top forms
    const topForms = protoForms.filter(form => form.confidence_score >= 3);

    // Step 6: Generate staging output
    const stagingOutput = this.stagingOutput.generateStagingOutput(protoForms);

    // Step 7: Calculate stats
    const stats = this.calculateStats(protoForms);

    // Step 8: Detect missing coverage
    const missingCoverage = this.detectMissingCoverage(protoForms);

    const result = new ExtractionResult();
    result.proto_forms = protoForms;
    result.top_forms = topForms;
    result.workflow_counts = stats.workflow_counts;
    result.missing_coverage = missingCoverage;
    result.staging_output = stagingOutput;
    result.stats = {
      total: protoForms.length,
      avg_confidence: protoForms.length > 0
        ? protoForms.reduce((sum, form) => sum + form.confidence_score, 0) / protoForms.length
        : 0,
      by_domain: stats.by_domain,
      by_workflow: stats.by_workflow,
    };

    return result;
  }

  calculateStats(forms) {
    const workflowCounts = {};
    const byDomain = {};
    const byWorkflow = {};

    forms.forEach(form => {
      form.workflow_candidates.forEach(wf => {
        workflowCounts[wf.workflow] = (workflowCounts[wf.workflow] || 0) + 1;
        byWorkflow[wf.workflow] = (byWorkflow[wf.workflow] || 0) + 1;
      });

      form.domain_candidates.forEach(d => {
        byDomain[d.domain] = (byDomain[d.domain] || 0) + 1;
      });
    });

    return { workflow_counts: workflowCounts, by_domain: byDomain, by_workflow: byWorkflow };
  }

  detectMissingCoverage(forms) {
    const workflows = [
      'insurance_denial', 'housing_violation', 'wage_theft', 'benefits_denial',
      'ca_insurance_denial', 'ca_housing_violation', 'ca_wage_theft', 'ca_benefits_denial',
    ];
    const missing = {};

    workflows.forEach(workflow => {
      const forms_with_workflow = forms.filter(f =>
        f.workflow_candidates.some(wf => wf.workflow === workflow)
      );

      const hasIntake = forms_with_workflow.some(f => f.domain_candidates.length > 0);
      const hasAppeal = forms_with_workflow.some(f =>
        f.form_name && f.form_name.name.toLowerCase().includes('appeal')
      );
      const hasEscalation = forms_with_workflow.some(f =>
        f.form_name && f.form_name.name.toLowerCase().includes('hearing')
      );

      missing[workflow] = [];
      if (!hasIntake) missing[workflow].push('no_intake_form');
      if (!hasAppeal) missing[workflow].push('no_appeal_form');
      if (!hasEscalation) missing[workflow].push('no_escalation_path');
    });

    return missing;
  }
}

// ============================================================================
// TEST HARNESS
// ============================================================================

const testCases = [
  {
    name: 'Overlapping Context Windows - California Wage Theft',
    payload: `
CALIFORNIA WAGE THEFT COMPLAINT

You have the right to file a wage theft complaint with the California Labor Commissioner.

Method 1: Online filing
Visit: https://www.dir.ca.gov/dlse/

Method 2: In person
Address: 235 South Beaudry Avenue, Los Angeles, CA 90012

Method 3: Phone
Call: (888) 866-4886

You must file your complaint within 3 years of the wage violation.
Deadline: No later than 3 years from the date of the violation.

To appeal a wage determination:
https://www.dir.ca.gov/dlse/appeals
Phone for appeal: (415) 703-4810
`,
  },
  {
    name: 'Multiple Workflows - CA + Federal',
    payload: `
FEDERAL AND STATE COMPLAINT OPTIONS

If you have been discriminated against based on protected characteristics:

Federal EEOC Complaint
File online: https://www.eeoc.gov/filing-charge-discrimination
Phone: (800) 669-4000
Deadline: within 180 days or 300 days (CA extended)

California DFEH Complaint
Same facts can be filed with: https://www.dfeh.ca.gov/
California law provides protection for additional categories.

Workers Compensation Appeal
If your workers comp claim was denied:
Appeal online: https://www.dir.ca.gov/dwc/
Phone: (888) 996-4992
Appeal deadline: within 1 year
`,
  },
  {
    name: 'Bare Domain URLs - No Protocol',
    payload: `
FILE YOUR COMPLAINT

You can submit your complaint to:

- Online via our website: www.labor.gov
- Or at the federal portal: labor.gov
- California specific: dir.ca.gov/dlse
- Or to the agency: dfpinet.ca.gov

For urgent matters, call the hotline.
For legal aid, contact your local bar association.
`,
  },
  {
    name: 'Duplicate URLs - Different Forms',
    payload: `
HOUSING DISPUTE RESOLUTION

Initial Complaint Form
Submit your housing complaint: https://www.sf.gov/landlord-tenant
Tel: (415) 558-6088

Appeals and Hearings
If your initial complaint is denied: https://www.sf.gov/landlord-tenant
Appeals phone: (415) 558-6100
Address: 49 South Van Ness Ave, San Francisco, CA

Escalation
For superior court filings, contact the court directly.
`,
  },
  {
    name: 'Deadline Extraction - Multiple Formats',
    payload: `
APPEAL YOUR UNEMPLOYMENT CLAIM

You must file your appeal within 30 days of receiving the notice of determination.
The deadline is: No later than 30 days from the notice date.
Do not delay - you must appeal within 30 business days.

For appeals filed late, you may request a late-filing exception within 10 days.

Next, contact the California EDD:
https://www.edd.ca.gov/unemployment-appeal
Phone: (888) 353-1545
`,
  },
];

// Run all tests
console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║    FORM SIGNAL EXTRACTION ENGINE - PRODUCTION TEST SUITE    ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

const engine = new FormSignalExtractionEngine();

testCases.forEach((testCase, idx) => {
  console.log(`\n${'='.repeat(65)}`);
  console.log(`TEST ${idx + 1}: ${testCase.name}`);
  console.log('='.repeat(65));

  const result = engine.extract(testCase.payload);

  console.log(`\n📊 EXTRACTION RESULTS`);
  console.log(`   Forms Extracted: ${result.stats.total}`);
  console.log(`   High-Confidence: ${result.top_forms.length} (score ≥ 3)`);
  console.log(`   Average Confidence: ${result.stats.avg_confidence.toFixed(2)}/5`);

  if (result.top_forms.length > 0) {
    console.log(`\n📋 TOP FORMS`);
    result.top_forms.forEach((form, fIdx) => {
      console.log(`\n   [${fIdx + 1}] ${form.form_name ? form.form_name.name : '(unnamed)'}`);
      console.log(`       Confidence: ${form.confidence_score}/5`);
      console.log(`       URL: ${form.submission_url || '(none)'}`);
      console.log(`       Method: ${form.submission_method}`);
      if (form.agency_name) console.log(`       Agency: ${form.agency_name}`);
      if (form.jurisdiction) console.log(`       Jurisdiction: ${form.jurisdiction}`);
      if (form.domain_candidates.length > 0) {
        console.log(`       Domains: ${form.domain_candidates.map(d => d.domain).join(', ')}`);
      }
      if (form.workflow_candidates.length > 0) {
        console.log(`       Workflows: ${form.workflow_candidates.map(w => w.workflow).join(', ')}`);
      }
      if (form.deadline_in_days) {
        console.log(`       Deadline: ${form.deadline_in_days} days ("${form.deadline_raw_match}")`);
      }
      if (Object.values(form.validation_flags).some(f => f)) {
        const flags = Object.entries(form.validation_flags)
          .filter(([_, v]) => v)
          .map(([k]) => k);
        console.log(`       ⚠️  Flags: ${flags.join(', ')}`);
      }
    });
  }

  console.log(`\n🔗 WORKFLOW DISTRIBUTION`);
  const workflows = Object.entries(result.workflow_counts).sort((a, b) => b[1] - a[1]);
  if (workflows.length === 0) {
    console.log(`   (No workflows detected)`);
  } else {
    workflows.forEach(([workflow, count]) => {
      console.log(`   • ${workflow}: ${count}`);
    });
  }

  console.log(`\n🏢 DOMAIN DISTRIBUTION`);
  const domains = Object.entries(result.stats.by_domain).sort((a, b) => b[1] - a[1]);
  if (domains.length === 0) {
    console.log(`   (No domains detected)`);
  } else {
    domains.forEach(([domain, count]) => {
      console.log(`   • ${domain}: ${count}`);
    });
  }

  console.log(`\n📦 STAGING OUTPUT SUMMARY`);
  console.log(`   forms_registry_staging: ${result.staging_output.forms_registry_staging.length} entries`);
  console.log(`   agency_candidates: ${result.staging_output.agency_candidates.length} entries`);
  console.log(`   workflow_form_links: ${result.staging_output.workflow_form_links_staging.length} entries`);

  if (result.top_forms.length > 0) {
    console.log(`\n💾 SAMPLE STAGING OUTPUT`);
    const sample = result.staging_output.forms_registry_staging[0];
    console.log(JSON.stringify(sample, null, 2));
  }
});

console.log(`\n${'='.repeat(65)}`);
console.log(`✅ PRODUCTION TEST SUITE COMPLETE`);
console.log('='.repeat(65) + '\n');

module.exports = { FormSignalExtractionEngine };
