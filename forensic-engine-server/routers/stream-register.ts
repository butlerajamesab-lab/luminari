/**
 * Stream Registration Router
 * Register 12 public government data streams with proper parameter binding
 */

import { router, publicProcedure } from "../_core/trpc";
import { db } from "../db";
import { sql } from "drizzle-orm";

const STREAMS = [
  { id: 'nyc_housing_violations', name: 'NYC Housing Maintenance Code Violations', type: 'regulatory_enforcement', source: 'socrata', sourceUrl: 'https://data.cityofnewyork.us/resource/wvxf-dwi5.json', apiUrl: 'https://data.cityofnewyork.us/resource/wvxf-dwi5.json', freq: 'daily', weight: 92, conf: 90, jurisdiction: 'NY', domain: 'housing', cron: '0 0 9 * * *', desc: 'NYC Housing Preservation & Development maintenance code violations' },
  { id: 'chicago_building_permits', name: 'Chicago Building Permits', type: 'public_records', source: 'socrata', sourceUrl: 'https://data.cityofchicago.org/resource/ydr8-5enu.json', apiUrl: 'https://data.cityofchicago.org/resource/ydr8-5enu.json', freq: 'daily', weight: 80, conf: 85, jurisdiction: 'IL', domain: 'housing', cron: '0 30 8 * * *', desc: 'Chicago building permits issued by the City of Chicago Department of Buildings' },
  { id: 'sf_building_violations', name: 'San Francisco Building Violations', type: 'regulatory_enforcement', source: 'socrata', sourceUrl: 'https://data.sfgov.org/resource/wvxf-dwi5.json', apiUrl: 'https://data.sfgov.org/resource/wvxf-dwi5.json', freq: 'daily', weight: 85, conf: 88, jurisdiction: 'CA', domain: 'housing', cron: '0 15 9 * * *', desc: 'San Francisco Department of Building Inspection violations' },
  { id: 'la_health_violations', name: 'Los Angeles Health Code Violations', type: 'regulatory_enforcement', source: 'socrata', sourceUrl: 'https://data.lacity.gov/resource/wvxf-dwi5.json', apiUrl: 'https://data.lacity.gov/resource/wvxf-dwi5.json', freq: 'daily', weight: 88, conf: 90, jurisdiction: 'CA', domain: 'health', cron: '0 45 8 * * *', desc: 'Los Angeles County Department of Public Health violations' },
  { id: 'boston_building_violations', name: 'Boston Building Violations', type: 'regulatory_enforcement', source: 'socrata', sourceUrl: 'https://data.boston.gov/resource/wvxf-dwi5.json', apiUrl: 'https://data.boston.gov/resource/wvxf-dwi5.json', freq: 'daily', weight: 82, conf: 85, jurisdiction: 'MA', domain: 'housing', cron: '0 0 10 * * *', desc: 'Boston Inspectional Services Department violations' },
  { id: 'seattle_business_licenses', name: 'Seattle Business Licenses', type: 'public_records', source: 'socrata', sourceUrl: 'https://data.seattle.gov/resource/wvxf-dwi5.json', apiUrl: 'https://data.seattle.gov/resource/wvxf-dwi5.json', freq: 'daily', weight: 70, conf: 75, jurisdiction: 'WA', domain: 'business', cron: '0 30 9 * * *', desc: 'Seattle business license records' },
  { id: 'denver_permits', name: 'Denver Development Permits', type: 'public_records', source: 'socrata', sourceUrl: 'https://data.denvergov.org/resource/wvxf-dwi5.json', apiUrl: 'https://data.denvergov.org/resource/wvxf-dwi5.json', freq: 'daily', weight: 78, conf: 80, jurisdiction: 'CO', domain: 'housing', cron: '0 15 10 * * *', desc: 'Denver Community Planning & Development permits' },
  { id: 'miami_violations', name: 'Miami-Dade Code Violations', type: 'regulatory_enforcement', source: 'socrata', sourceUrl: 'https://data.miamidade.gov/resource/wvxf-dwi5.json', apiUrl: 'https://data.miamidade.gov/resource/wvxf-dwi5.json', freq: 'daily', weight: 85, conf: 87, jurisdiction: 'FL', domain: 'housing', cron: '0 45 9 * * *', desc: 'Miami-Dade County code violations' },
  { id: 'philadelphia_violations', name: 'Philadelphia L&I Violations', type: 'regulatory_enforcement', source: 'socrata', sourceUrl: 'https://data.phila.gov/resource/wvxf-dwi5.json', apiUrl: 'https://data.phila.gov/resource/wvxf-dwi5.json', freq: 'daily', weight: 88, conf: 90, jurisdiction: 'PA', domain: 'housing', cron: '0 0 11 * * *', desc: 'Philadelphia Department of Licenses and Inspections violations' },
  { id: 'pacer_federal_filings', name: 'PACER Federal Court Filings', type: 'federal_litigation', source: 'pacer', sourceUrl: 'https://www.pacer.gov', apiUrl: 'https://www.pacer.gov/api', freq: 'daily', weight: 95, conf: 92, jurisdiction: 'federal', domain: 'litigation', cron: '0 0 6 * * *', desc: 'Federal court filings from PACER (Public Access to Court Electronic Records)' },
  { id: 'news_api_coverage', name: 'News API Media Coverage', type: 'media_coverage', source: 'news_api', sourceUrl: 'https://newsapi.org', apiUrl: 'https://newsapi.org/v2/everything', freq: 'hourly', weight: 75, conf: 70, jurisdiction: 'US', domain: 'media', cron: '0 0 * * * *', desc: 'Real-time news coverage from major news outlets' },
  { id: 'internal_case_events', name: 'Internal Case Events', type: 'internal_signals', source: 'internal', sourceUrl: null, apiUrl: null, freq: 'real-time', weight: 60, conf: 75, jurisdiction: 'US', domain: 'system', cron: null, desc: 'Case events from the Luminari platform (documents uploaded, findings generated)' },
];

export const streamRegisterRouter = router({
  /**
   * Register all 12 public government data streams
   */
  registerAllStreams: publicProcedure
    .query(async () => {
      try {
        const now = Math.floor(Date.now());
        let registered = 0;

        for (const stream of STREAMS) {
          try {
            await db.execute(sql`
              INSERT INTO data_stream_registry 
              (stream_id_dsr, stream_name_dsr, stream_type_dsr, source_dsr, source_url_dsr, api_url_dsr, 
               update_freq_dsr, signal_weight_dsr, confidence_multiplier_dsr, enabled_dsr, description_dsr,
               jurisdiction_dsr, domain_dsr, cron_expression_dsr, post_processing_engine_name_dsr, parser_mode_dsr,
               created_at_dsr, updated_at_dsr)
              VALUES 
              (${stream.id}, ${stream.name}, ${stream.type}, ${stream.source}, ${stream.sourceUrl}, ${stream.apiUrl},
               ${stream.freq}, ${stream.weight}, ${stream.conf}, true, ${stream.desc},
               ${stream.jurisdiction}, ${stream.domain}, ${stream.cron}, 'signal-detection-engine', 'auto',
               ${now}, ${now})
              ON DUPLICATE KEY UPDATE updated_at_dsr = ${now}
            `);
            registered++;
            console.log(`[Stream Register] ✓ ${stream.id}`);
          } catch (error) {
            console.error(`[Stream Register] ✗ ${stream.id}:`, error);
          }
        }

        console.log(`[Stream Register] Registered ${registered}/${STREAMS.length} streams`);

        // Verify
        const result = await db.execute(sql`
          SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN enabled_dsr = true THEN 1 END) as enabled,
            COUNT(CASE WHEN source_dsr = 'socrata' THEN 1 END) as socrata,
            COUNT(CASE WHEN source_dsr = 'pacer' THEN 1 END) as pacer,
            COUNT(CASE WHEN source_dsr = 'news_api' THEN 1 END) as news_api,
            COUNT(CASE WHEN source_dsr = 'internal' THEN 1 END) as internal
          FROM data_stream_registry
        `);

        const stats = (result as any)[0][0];

        return {
          success: true,
          message: `Registered ${registered}/12 public government data streams`,
          registered,
          stats: {
            total: stats.total,
            enabled: stats.enabled,
            bySource: {
              socrata: stats.socrata,
              pacer: stats.pacer,
              newsApi: stats.news_api,
              internal: stats.internal,
            },
          },
        };
      } catch (error) {
        console.error('[Stream Register] Fatal error:', error);
        throw error;
      }
    }),

  /**
   * Get all registered streams
   */
  getRegisteredStreams: publicProcedure
    .query(async () => {
      const result = await db.execute(sql`
        SELECT 
          stream_id_dsr as id,
          stream_name_dsr as name,
          source_dsr as source,
          jurisdiction_dsr as jurisdiction,
          domain_dsr as domain,
          enabled_dsr as enabled,
          signal_weight_dsr as weight,
          confidence_multiplier_dsr as confidence,
          update_freq_dsr as frequency,
          last_ingested_at_dsr as lastIngested,
          records_ingested_dsr as recordsIngested,
          signals_generated_dsr as signalsGenerated
        FROM data_stream_registry
        ORDER BY source_dsr, stream_name_dsr
      `);

      return (result as any)[0];
    }),
});
