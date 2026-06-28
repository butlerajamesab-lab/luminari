import crypto from 'crypto';
import { getPool } from './db';

interface Signal {
  signalType: string;
  subtype: string;
  entity: string;
  title: string;
}

function detectMissingInvoice(records: any[], datasetId: string, streamId: string): Signal[] {
  const signals: Signal[] = [];
  for (const record of records) {
    if (record.invoice_id && !record.invoice_date) {
      signals.push({
        signalType: 'MISSING_DATA',
        subtype: 'missing_invoice_date',
        entity: record.invoice_id,
        title: `Missing invoice date for ${record.invoice_id}`,
      });
    }
  }
  return signals;
}

function detectDuplicateInvoice(records: any[], datasetId: string, streamId: string): Signal[] {
  const signals: Signal[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    if (record.invoice_id) {
      if (seen.has(record.invoice_id)) {
        signals.push({
          signalType: 'DUPLICATE',
          subtype: 'duplicate_invoice',
          entity: record.invoice_id,
          title: `Duplicate invoice ${record.invoice_id}`,
        });
      }
      seen.add(record.invoice_id);
    }
  }
  return signals;
}

function detectOverdueInvoice(records: any[], datasetId: string, streamId: string): Signal[] {
  const signals: Signal[] = [];
  const now = new Date();
  for (const record of records) {
    if (record.due_date) {
      const dueDate = new Date(record.due_date);
      if (dueDate < now && !record.paid_date) {
        signals.push({
          signalType: 'OVERDUE',
          subtype: 'overdue_invoice',
          entity: record.invoice_id || 'unknown',
          title: `Overdue invoice ${record.invoice_id}`,
        });
      }
    }
  }
  return signals;
}

function detectROIDrop(records: any[], datasetId: string, streamId: string): Signal[] {
  const signals: Signal[] = [];
  let previousROI = 0;
  for (const record of records) {
    if (record.roi) {
      if (previousROI > 0 && record.roi < previousROI * 0.8) {
        signals.push({
          signalType: 'PERFORMANCE_DROP',
          subtype: 'roi_drop',
          entity: record.campaign_id || 'unknown',
          title: `ROI drop detected: ${previousROI} → ${record.roi}`,
        });
      }
      previousROI = record.roi;
    }
  }
  return signals;
}

function detectAdSpendSpike(records: any[], datasetId: string, streamId: string): Signal[] {
  const signals: Signal[] = [];
  let previousSpend = 0;
  for (const record of records) {
    if (record.ad_spend) {
      if (previousSpend > 0 && record.ad_spend > previousSpend * 1.5) {
        signals.push({
          signalType: 'ANOMALY',
          subtype: 'ad_spend_spike',
          entity: record.campaign_id || 'unknown',
          title: `Ad spend spike: ${previousSpend} → ${record.ad_spend}`,
        });
      }
      previousSpend = record.ad_spend;
    }
  }
  return signals;
}

export async function detectBusinessSignals(records: any[], datasetId: string, streamId: string) {
  const pool = getPool();
  const signals: Signal[] = [];

  signals.push(...detectMissingInvoice(records, datasetId, streamId));
  signals.push(...detectDuplicateInvoice(records, datasetId, streamId));
  signals.push(...detectOverdueInvoice(records, datasetId, streamId));
  signals.push(...detectROIDrop(records, datasetId, streamId));
  signals.push(...detectAdSpendSpike(records, datasetId, streamId));

  for (const sig of signals) {
    const fingerprint = `${sig.signalType}|${sig.subtype}|${sig.entity}|${datasetId}`;
    const hash = crypto.createHash('sha256').update(fingerprint).digest('hex');

    try {
      await pool.query(`
        INSERT INTO live_signals (
          signal_type,
          subtype,
          entity,
          title,
          signal_fingerprint,
          active,
          extraction_timestamp
        )
        VALUES ($1,$2,$3,$4,$5,true,NOW())
        ON CONFLICT (signal_fingerprint)
        DO UPDATE SET active=true, extraction_timestamp=NOW();
      `, [
        sig.signalType,
        sig.subtype,
        sig.entity,
        sig.title,
        hash
      ]);
    } catch (error) {
      console.error(`Error inserting signal ${hash}:`, error);
    }
  }

  return signals;
}
