/**
 * Slack Alerts Integration
 * 
 * Sends real-time Slack notifications for high-severity (alert) activations.
 * Minimal, fire-and-forget implementation with duplicate prevention via alertedAt.
 */

export interface SlackAlertPayload {
  clusterId: string;
  procedureType: "alert" | "track" | "record";
  steps: string[];
}

/**
 * Format activation into Slack message
 */
export function formatSlackMessage(activation: SlackAlertPayload): string {
  const stepsText = activation.steps.map((step) => `• ${step}`).join("\n");

  return `🚨 *Luminari Alert*
*Cluster:* ${activation.clusterId}
*Type:* ${activation.procedureType}
*Steps:*
${stepsText}`;
}

/**
 * Send alert to Slack via webhook
 * Fails silently - logs errors but does not crash system
 */
export async function sendSlackAlert(
  activation: SlackAlertPayload
): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn("[Slack] SLACK_WEBHOOK_URL not configured, skipping alert");
    return false;
  }

  try {
    const message = formatSlackMessage(activation);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: message,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: message,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `_Sent at ${new Date().toISOString()}_`,
              },
            ],
          },
        ],
      }),
      timeout: 5000, // 5 second timeout
    });

    if (!response.ok) {
      console.error(
        `[Slack] Failed to send alert: ${response.status} ${response.statusText}`
      );
      return false;
    }

    console.log(`[Slack] Alert sent for cluster ${activation.clusterId}`);
    return true;
  } catch (error) {
    console.error("[Slack] Error sending alert:", error);
    return false;
  }
}

/**
 * Send alert only if not already alerted
 * Updates alertedAt timestamp in database after sending
 */
export async function sendSlackAlertIfNotAlerted(
  dbInstance: any,
  activation: any
): Promise<boolean> {
  // Check if already alerted
  if (activation.alertedAt !== null && activation.alertedAt !== undefined) {
    console.log(
      `[Slack] Skipping duplicate alert for cluster ${activation.clusterId}`
    );
    return false;
  }

  // Only send for "alert" procedure type
  if (activation.procedureType !== "alert") {
    console.log(
      `[Slack] Skipping non-alert procedure: ${activation.procedureType}`
    );
    return false;
  }

  // Send alert
  const sent = await sendSlackAlert({
    clusterId: activation.clusterId,
    procedureType: activation.procedureType,
    steps: activation.steps,
  });

  if (sent) {
    // Update alertedAt timestamp
    try {
      const now = Date.now();
      await dbInstance.execute(
        `UPDATE activation_outputs SET alerted_at = ? WHERE cluster_id = ?`,
        [now, activation.clusterId]
      );
      console.log(
        `[Slack] Updated alertedAt for cluster ${activation.clusterId}`
      );
    } catch (error) {
      console.error(
        `[Slack] Error updating alertedAt for cluster ${activation.clusterId}:`,
        error
      );
    }
  }

  return sent;
}
