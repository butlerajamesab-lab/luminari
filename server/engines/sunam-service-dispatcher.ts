/**
 * Sunam Service Layer Tool Dispatcher
 * 
 * Routes Sunam service tool calls to backend services
 * No direct SQL - all operations through service layer
 */

import * as registryService from "../services/registryService";
import * as caseService from "../services/caseService";
import * as matchingService from "../services/matchingService";
import * as luminariContextService from "../services/luminariContextService";

export interface DispatchResult {
  success: boolean;
  result?: any;
  error?: string;
}

/**
 * Dispatch a service layer tool call
 */
export async function dispatchServiceTool(
  toolName: string,
  args: Record<string, any>
): Promise<DispatchResult> {
  try {
    switch (toolName) {
      // ── Case Context (Read) ──
      case "get_case_context": {
        const context = await luminariContextService.getCaseContext(args.case_id);
        return { success: true, result: context };
      }

      // ── Case Data (Read) ──
      case "get_case": {
        const caseData = await caseService.getCaseById(args.case_id);
        if (!caseData) {
          return { success: false, error: `Case ${args.case_id} not found` };
        }
        // Enrich with registry context
        const context = await matchingService.getCaseWithContext(args.case_id);
        return { success: true, result: context };
      }

      // ── Case Timeline (Read) ──
      case "get_case_timeline": {
        const timeline = await caseService.getCaseTimeline(args.case_id);
        return { success: true, result: timeline };
      }

      // ── Case Notes (Read) ──
      case "get_case_notes": {
        const notes = await caseService.getCaseNotes(args.case_id);
        return { success: true, result: notes };
      }

      // ── Registry Data (Read) ──
      case "get_jurisdiction": {
        const jurisdiction = await registryService.getJurisdictionById(
          args.jurisdiction_id
        );
        if (!jurisdiction) {
          return {
            success: false,
            error: `Jurisdiction ${args.jurisdiction_id} not found`,
          };
        }
        return { success: true, result: jurisdiction };
      }

      case "get_workflows": {
        const workflows = await registryService.getWorkflows(
          args.jurisdiction_id
        );
        return { success: true, result: workflows };
      }

      case "get_programs": {
        const programs = await registryService.getPrograms(
          args.jurisdiction_id
        );
        return { success: true, result: programs };
      }

      case "get_entities": {
        const entities = await registryService.getEntities(
          args.jurisdiction_id
        );
        return { success: true, result: entities };
      }

      case "get_signals": {
        const signals = await registryService.getSignals(args.jurisdiction_id);
        return { success: true, result: signals };
      }

      // ── Validation (Write) ──
      case "record_validation": {
        await luminariContextService.recordValidationResult(args.case_id, {
          validation_type: args.validation_type,
          result: args.result,
          confidence_score: args.confidence_score,
          notes: args.notes,
        });
        return {
          success: true,
          result: {
            case_id: args.case_id,
            validation_type: args.validation_type,
            result: args.result,
            recorded_at: Date.now(),
          },
        };
      }

      // ── Reconciliation (Write) ──
      case "record_reconciliation": {
        await luminariContextService.recordReconciliation(args.case_id, {
          run_id: args.run_id,
          total_rows: args.total_rows,
          discrepancy_count: args.discrepancy_count,
          status: args.status,
          notes: args.notes,
        });
        return {
          success: true,
          result: {
            case_id: args.case_id,
            run_id: args.run_id,
            status: args.status,
            recorded_at: Date.now(),
          },
        };
      }

      // ── Case Actions (Write) ──
      case "record_case_action": {
        await caseService.recordCaseAction(args.case_id, args.action_type, {
          ...args.details,
          executed_by: "Sunam",
        });
        return {
          success: true,
          result: {
            case_id: args.case_id,
            action_type: args.action_type,
            recorded_at: Date.now(),
          },
        };
      }

      case "add_case_note": {
        await caseService.addCaseNote(args.case_id, args.note);
        return {
          success: true,
          result: {
            case_id: args.case_id,
            note_added: true,
            recorded_at: Date.now(),
          },
        };
      }

      case "update_case_status": {
        await caseService.updateCaseStatus(args.case_id, args.status);
        return {
          success: true,
          result: {
            case_id: args.case_id,
            status: args.status,
            updated_at: Date.now(),
          },
        };
      }

      // ── System State (Read) ──
      case "get_system_state": {
        // Return basic system state
        return {
          success: true,
          result: {
            timestamp: Date.now(),
            sunam_connected: true,
            service_layer_active: true,
            sql_access_disabled: true,
          },
        };
      }

      default:
        return {
          success: false,
          error: `Unknown service tool: ${toolName}`,
        };
    }
  } catch (err: any) {
    console.error(`[Sunam Service Tool] Error in ${toolName}:`, err);
    return {
      success: false,
      error: err.message || `Failed to execute ${toolName}`,
    };
  }
}
