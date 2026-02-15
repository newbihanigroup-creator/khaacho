# Self-Healing System - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Apply Migration
```bash
# The migration will be applied automatically on server start
# Or apply manually:
npx prisma migrate deploy
```

### Step 2: Start Server
```bash
npm start
```

The self-healing worker starts automatically and runs every 5 minutes.

### Step 3: Verify It's Working
```bash
# Check logs
tail -f logs/combined-*.log | grep "Self-healing"

# Expected output:
# Self-healing worker started (runs every 5 minutes)
# Self-healing worker: Starting cycle
# Self-healing worker: Cycle completed
```

## 📊 Quick Test

### Detect Stuck Orders
```bash
curl http://localhost:3000/api/v1/self-healing/stuck-orders
```

### Run Healing Cycle
```bash
curl -X POST http://localhost:3000/api/v1/self-healing/run-cycle
```

### View Statistics
```bash
curl http://localhost:3000/api/v1/self-healing/statistics?days=7
```

## 🎯 How It Works

### Automatic Detection
The system checks every 5 minutes for:
- **Pending orders** stuck > 30 minutes → Reassign vendor
- **Confirmed orders** stuck > 60 minutes → Retry workflow
- **Accepted orders** stuck > 120 minutes → Reassign vendor
- **Processing orders** stuck > 180 minutes → Retry workflow

### Automatic Recovery
1. **First attempt**: Reassign vendor or retry workflow
2. **Second attempt**: Retry with different strategy
3. **Third attempt**: Notify admin for manual intervention

### Admin Notifications
You're notified ONLY when:
- Automatic recovery fails after 3 attempts
- Manual intervention is required
- Critical system issues detected

## 📈 Monitor Performance

### Check Today's Metrics
```sql
SELECT * FROM healing_metrics
WHERE metric_date = CURRENT_DATE;
```

### View Active Healing
```sql
SELECT * FROM healing_actions
WHERE recovery_status = 'IN_PROGRESS';
```

### See Stuck Orders
```sql
SELECT * FROM stuck_orders_view;
```

## 🔔 Admin Notifications

### View Pending Notifications
```bash
curl http://localhost:3000/api/v1/self-healing/notifications
```

### Acknowledge Notification
```bash
curl -X POST http://localhost:3000/api/v1/self-healing/notifications/1/acknowledge
```

## ⚙️ Configuration

### Adjust Detection Thresholds
Edit `prisma/migrations/045_self_healing_system.sql`:
```sql
-- Change stuck duration thresholds
WHEN o.status = 'PENDING' AND ... > 30 THEN 'STUCK_PENDING'  -- Change 30 to your value
WHEN o.status = 'CONFIRMED' AND ... > 60 THEN 'STUCK_CONFIRMED'  -- Change 60
```

### Adjust Worker Frequency
Edit `src/workers/selfHealing.worker.js`:
```javascript
// Change from every 5 minutes to every 10 minutes
cron.schedule('*/10 * * * *', async () => {
  await runHealingCycle();
});
```

## 🧪 Testing

### Run Full Test Suite
```bash
node test-self-healing.js
```

### Manual Healing Test
```bash
# Get stuck order ID
curl http://localhost:3000/api/v1/self-healing/stuck-orders

# Heal specific order
curl -X POST http://localhost:3000/api/v1/self-healing/heal/123 \
  -H "Content-Type: application/json" \
  -d '{
    "issueType": "STUCK_PENDING",
    "recoveryAction": "REASSIGN_VENDOR"
  }'
```

## 📊 Key Metrics

Monitor these KPIs:
- **Healing Success Rate**: Target > 90%
- **Average Recovery Time**: Target < 5 minutes
- **Manual Intervention Rate**: Target < 10%
- **Admin Notification Rate**: Target < 5%

## 🎯 Expected Results

### Week 1
- 10-20 stuck orders detected
- 90%+ automatic recovery
- 1-2 admin notifications

### Month 1
- 50-100 stuck orders detected
- 95%+ automatic recovery
- < 5 admin notifications

### Steady State
- Continuous monitoring
- Proactive recovery
- Minimal admin intervention
- Improved order success rate

## ✅ Success Checklist

- [ ] Migration applied
- [ ] Server started
- [ ] Worker running (check logs)
- [ ] Test endpoints working
- [ ] Statistics being collected
- [ ] Admin notifications configured

## 🚨 Troubleshooting

### Worker Not Running
```bash
# Check if worker initialized
grep "Self-healing worker initialized" logs/combined-*.log

# Restart server
npm restart
```

### No Stuck Orders Detected
```bash
# Check if orders exist
SELECT COUNT(*) FROM orders 
WHERE status IN ('PENDING', 'CONFIRMED', 'ACCEPTED', 'PROCESSING');

# Check stuck orders view
SELECT * FROM stuck_orders_view;
```

### Healing Not Working
```bash
# Check healing actions
SELECT * FROM healing_actions 
ORDER BY created_at DESC LIMIT 10;

# Check error logs
tail -f logs/error-*.log
```

## 📚 Next Steps

1. ✅ System is running automatically
2. Monitor daily metrics
3. Review admin notifications
4. Adjust thresholds if needed
5. Integrate with monitoring dashboard

---

**Your self-healing system is now operational!** 🎉

Orders will automatically recover from stuck states, and you'll only be notified when manual intervention is truly needed.
