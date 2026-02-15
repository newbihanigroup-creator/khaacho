const cron = require('node-cron');
const selfHealingService = require('../services/selfHealing.service');
const logger = require('../utils/logger');

/**
 * Self-Healing Worker
 * Runs every 5 minutes to detect and heal stuck orders
 */

let isRunning = false;

async function runHealingCycle() {
  if (isRunning) {
    logger.warn('Self-healing cycle already running, skipping');
    return;
  }

  isRunning = true;

  try {
    logger.info('Self-healing worker: Starting cycle');

    const result = await selfHealingService.runHealingCycle();

    logger.info('Self-healing worker: Cycle completed', {
      healed: result.healed,
      failed: result.failed,
    });

    // Update daily metrics
    await updateDailyMetrics(result);
  } catch (error) {
    logger.error('Self-healing worker: Cycle failed', {
      error: error.message,
      stack: error.stack,
    });
  } finally {
    isRunning = false;
  }
}

async function updateDailyMetrics(result) {
  try {
    const prisma = require('../config/database');
    const today = new Date().toISOString().split('T')[0];

    // Get today's stats
    const stats = await prisma.$queryRaw`
      SELECT 
        COUNT(*) FILTER (WHERE issue_type = 'STUCK_PENDING') AS stuck_pending_count,
        COUNT(*) FILTER (WHERE issue_type = 'STUCK_CONFIRMED') AS stuck_confirmed_count,
        COUNT(*) FILTER (WHERE issue_type = 'STUCK_ACCEPTED') AS stuck_accepted_count,
        COUNT(*) FILTER (WHERE issue_type = 'STUCK_PROCESSING') AS stuck_processing_count,
        COUNT(*) AS total_stuck_orders_detected,
        COUNT(*) FILTER (WHERE recovery_status = 'SUCCESS') AS successful_recoveries,
        COUNT(*) FILTER (WHERE recovery_status = 'FAILED') AS failed_recoveries,
        COUNT(*) FILTER (WHERE recovery_action = 'REASSIGN_VENDOR') AS reassign_vendor_count,
        COUNT(*) FILTER (WHERE recovery_action = 'RETRY_WORKFLOW') AS retry_workflow_count,
        COUNT(*) FILTER (WHERE recovery_action = 'CANCEL_ORDER') AS cancel_order_count,
        COUNT(*) FILTER (WHERE recovery_action = 'MANUAL_INTERVENTION') AS manual_intervention_count,
        COUNT(*) FILTER (WHERE admin_notified = TRUE) AS admin_notifications_sent,
        AVG(EXTRACT(EPOCH FROM (recovery_completed_at - recovery_attempted_at)) / 60) AS avg_recovery_time_minutes,
        AVG(stuck_duration_minutes) AS avg_stuck_duration_minutes
      FROM healing_actions
      WHERE DATE(issue_detected_at) = ${today}::DATE
    `;

    if (stats && stats.length > 0) {
      const stat = stats[0];
      const successRate = stat.total_stuck_orders_detected > 0
        ? (stat.successful_recoveries / stat.total_stuck_orders_detected) * 100
        : 0;

      await prisma.healing_metrics.upsert({
        where: { metric_date: new Date(today) },
        update: {
          total_stuck_orders_detected: parseInt(stat.total_stuck_orders_detected) || 0,
          stuck_pending_count: parseInt(stat.stuck_pending_count) || 0,
          stuck_confirmed_count: parseInt(stat.stuck_confirmed_count) || 0,
          stuck_accepted_count: parseInt(stat.stuck_accepted_count) || 0,
          stuck_processing_count: parseInt(stat.stuck_processing_count) || 0,
          total_recovery_attempts: parseInt(stat.total_stuck_orders_detected) || 0,
          successful_recoveries: parseInt(stat.successful_recoveries) || 0,
          failed_recoveries: parseInt(stat.failed_recoveries) || 0,
          reassign_vendor_count: parseInt(stat.reassign_vendor_count) || 0,
          retry_workflow_count: parseInt(stat.retry_workflow_count) || 0,
          cancel_order_count: parseInt(stat.cancel_order_count) || 0,
          manual_intervention_count: parseInt(stat.manual_intervention_count) || 0,
          admin_notifications_sent: parseInt(stat.admin_notifications_sent) || 0,
          avg_recovery_time_minutes: parseFloat(stat.avg_recovery_time_minutes) || 0,
          avg_stuck_duration_minutes: parseFloat(stat.avg_stuck_duration_minutes) || 0,
          healing_success_rate: parseFloat(successRate.toFixed(2)),
          updated_at: new Date(),
        },
        create: {
          metric_date: new Date(today),
          total_stuck_orders_detected: parseInt(stat.total_stuck_orders_detected) || 0,
          stuck_pending_count: parseInt(stat.stuck_pending_count) || 0,
          stuck_confirmed_count: parseInt(stat.stuck_confirmed_count) || 0,
          stuck_accepted_count: parseInt(stat.stuck_accepted_count) || 0,
          stuck_processing_count: parseInt(stat.stuck_processing_count) || 0,
          total_recovery_attempts: parseInt(stat.total_stuck_orders_detected) || 0,
          successful_recoveries: parseInt(stat.successful_recoveries) || 0,
          failed_recoveries: parseInt(stat.failed_recoveries) || 0,
          reassign_vendor_count: parseInt(stat.reassign_vendor_count) || 0,
          retry_workflow_count: parseInt(stat.retry_workflow_count) || 0,
          cancel_order_count: parseInt(stat.cancel_order_count) || 0,
          manual_intervention_count: parseInt(stat.manual_intervention_count) || 0,
          admin_notifications_sent: parseInt(stat.admin_notifications_sent) || 0,
          avg_recovery_time_minutes: parseFloat(stat.avg_recovery_time_minutes) || 0,
          avg_stuck_duration_minutes: parseFloat(stat.avg_stuck_duration_minutes) || 0,
          healing_success_rate: parseFloat(successRate.toFixed(2)),
        },
      });
    }
  } catch (error) {
    logger.error('Failed to update daily metrics', { error: error.message });
  }
}

function start() {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    await runHealingCycle();
  });

  logger.info('Self-healing worker started (runs every 5 minutes)');

  // Run immediately on startup
  setTimeout(() => {
    runHealingCycle();
  }, 10000); // Wait 10 seconds after startup
}

module.exports = { start };
