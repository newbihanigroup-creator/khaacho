# WhatsApp Webhook Load Test Guide

Complete guide for load testing the WhatsApp webhook endpoint.

## Overview

The load test simulates concurrent users sending messages to the WhatsApp webhook endpoint to measure system performance under load.

## Features

- ✅ Simulates 500 concurrent users (configurable)
- ✅ Each user sends 3 messages: greeting, order, follow-up
- ✅ Measures response time, success rate, throughput
- ✅ Generates detailed performance report
- ✅ Performance grading (A+ to F)
- ✅ Progress bar with ETA
- ✅ Saves JSON report for analysis

## Quick Start

### 1. Install Dependencies
```bash
npm install axios
```

### 2. Start Server
```bash
# In one terminal
npm start
```

### 3. Run Load Test
```bash
# In another terminal
node load-test-whatsapp.js
```

## Configuration

### Environment Variables
```bash
# .env file
BASE_URL=http://localhost:3000
```

### Custom Configuration
Edit `load-test-whatsapp.js`:

```javascript
const CONFIG = {
  baseUrl: 'http://localhost:3000',
  webhookPath: '/api/whatsapp/webhook',
  concurrentUsers: 500,      // Number of concurrent users
  requestsPerUser: 3,         // Messages per user
  timeout: 30000,             // Request timeout (ms)
  delayBetweenRequests: 100,  // Delay between messages (ms)
};
```

## Test Scenarios

### Light Load (Development)
```javascript
concurrentUsers: 10
requestsPerUser: 3
Total requests: 30
```

### Medium Load (Staging)
```javascript
concurrentUsers: 100
requestsPerUser: 3
Total requests: 300
```

### Heavy Load (Production)
```javascript
concurrentUsers: 500
requestsPerUser: 3
Total requests: 1500
```

### Stress Test
```javascript
concurrentUsers: 1000
requestsPerUser: 3
Total requests: 3000
```

## Test Messages

### Greeting Messages
- "Hi"
- "Hello"
- "Namaste"
- "Good morning"
- "Hey there"

### Order Messages
- "RICE-1KG x 10"
- "I need 10 bags of rice"
- "Rice 10 kg\nDal 5 kg"
- "10 x RICE-1KG\n5 x DAL-1KG"
- "Please send 20 kg chamal"
- "15 bags rice\n10 bags dal\n5 bottles oil"

### Follow-up Messages
- "Order #ORD260100001"
- "Status of my order"
- "Where is my delivery?"
- "Thanks"
- "When will it arrive?"

## Output

### Console Output
```
🚀 WhatsApp Webhook Load Test

================================================================================
Configuration:
  Base URL: http://localhost:3000
  Webhook: /api/whatsapp/webhook
  Concurrent Users: 500
  Requests per User: 3
  Total Requests: 1500
  Timeout: 30000ms
================================================================================

🔍 Checking server availability...
✅ Server is reachable

🏃 Starting load test...

[████████████████████████████████████████████████] 100% | 500/500 users | Elapsed: 45s | ETA: 0s

================================================================================
📊 LOAD TEST RESULTS
================================================================================

Overall Metrics:
  Total Requests: 1500
  Successful: 1485 (99%)
  Failed: 15
  Total Duration: 45s
  Requests/Second: 33

Response Time Metrics:
  Average: 125ms
  Median: 110ms
  Min: 45ms
  Max: 850ms
  P50: 110ms
  P75: 145ms
  P90: 210ms
  P95: 285ms
  P99: 520ms

Metrics by Message Type:
  greeting:
    Total: 500
    Success: 498
    Failed: 2
    Avg Time: 95ms
    Min Time: 45ms
    Max Time: 320ms
  order:
    Total: 500
    Success: 492
    Failed: 8
    Avg Time: 145ms
    Min Time: 65ms
    Max Time: 850ms
  followUp:
    Total: 500
    Success: 495
    Failed: 5
    Avg Time: 135ms
    Min Time: 55ms
    Max Time: 420ms

Error Summary:
  ECONNRESET: 8 occurrences
  Timeout: 5 occurrences
  ECONNREFUSED: 2 occurrences

Performance Assessment:
  Grade: 🟢 A

Recommendations:
  ✅ System is performing well!

================================================================================

📄 Detailed report saved to: load-test-report-1707945123456.json

✅ Load test completed successfully!
```

### JSON Report
```json
{
  "config": {
    "baseUrl": "http://localhost:3000",
    "webhookPath": "/api/whatsapp/webhook",
    "concurrentUsers": 500,
    "requestsPerUser": 3,
    "timeout": 30000,
    "delayBetweenRequests": 100
  },
  "timestamp": "2026-02-14T10:30:00.000Z",
  "summary": {
    "totalRequests": 1500,
    "successful": 1485,
    "failed": 15,
    "successRate": 99,
    "totalDuration": 45000,
    "requestsPerSecond": 33
  },
  "responseTimes": {
    "average": 125,
    "median": 110,
    "min": 45,
    "max": 850,
    "p50": 110,
    "p75": 145,
    "p90": 210,
    "p95": 285,
    "p99": 520
  },
  "byType": {
    "greeting": {
      "total": 500,
      "success": 498,
      "failed": 2,
      "avgTime": 95,
      "minTime": 45,
      "maxTime": 320
    },
    "order": {
      "total": 500,
      "success": 492,
      "failed": 8,
      "avgTime": 145,
      "minTime": 65,
      "maxTime": 850
    },
    "followUp": {
      "total": 500,
      "success": 495,
      "failed": 5,
      "avgTime": 135,
      "minTime": 55,
      "maxTime": 420
    }
  },
  "errors": {
    "ECONNRESET": 8,
    "Timeout": 5,
    "ECONNREFUSED": 2
  },
  "performanceGrade": "A"
}
```

## Performance Grading

### A+ (Excellent)
- Success Rate: ≥99%
- Average Response Time: <100ms
- P95 Response Time: <200ms
- 🟢 Production ready

### A (Good)
- Success Rate: ≥95%
- Average Response Time: <200ms
- P95 Response Time: <500ms
- 🟢 Production ready

### B (Acceptable)
- Success Rate: ≥90%
- Average Response Time: <500ms
- P95 Response Time: <1000ms
- 🟡 Needs optimization

### C (Poor)
- Success Rate: ≥80%
- Average Response Time: <1000ms
- P95 Response Time: <2000ms
- 🟡 Requires attention

### D (Failing)
- Success Rate: ≥70%
- Average Response Time: <2000ms
- P95 Response Time: <5000ms
- 🟠 Critical issues

### F (Critical)
- Success Rate: <70%
- Average Response Time: >2000ms
- P95 Response Time: >5000ms
- 🔴 System failure

## Metrics Explained

### Response Time
- **Average**: Mean response time across all requests
- **Median**: Middle value when sorted
- **P50**: 50% of requests faster than this
- **P75**: 75% of requests faster than this
- **P90**: 90% of requests faster than this
- **P95**: 95% of requests faster than this
- **P99**: 99% of requests faster than this

### Success Rate
Percentage of requests that completed successfully without errors.

### Requests/Second (Throughput)
Number of requests processed per second. Higher is better.

### Failed Requests
Requests that resulted in errors (timeout, connection refused, etc.)

## Optimization Tips

### If Average Response Time > 500ms
1. **Database Optimization**
   - Add indexes to frequently queried columns
   - Optimize slow queries
   - Use connection pooling

2. **Caching**
   - Cache frequently accessed data
   - Use Redis for session storage
   - Implement query result caching

3. **Code Optimization**
   - Profile slow functions
   - Reduce unnecessary database queries
   - Use async/await properly

### If P95 > 1000ms
1. **Identify Slow Queries**
   ```sql
   -- PostgreSQL slow query log
   SELECT * FROM pg_stat_statements
   ORDER BY mean_exec_time DESC
   LIMIT 10;
   ```

2. **Add Monitoring**
   - Use APM tools (New Relic, DataDog)
   - Track slow endpoints
   - Monitor database performance

3. **Optimize Hot Paths**
   - Focus on most frequently called endpoints
   - Reduce complexity
   - Add caching

### If Success Rate < 95%
1. **Check Error Logs**
   ```bash
   tail -f logs/error-*.log
   ```

2. **Common Issues**
   - Database connection pool exhausted
   - Memory leaks
   - Unhandled promise rejections
   - Timeout issues

3. **Solutions**
   - Increase connection pool size
   - Fix memory leaks
   - Add proper error handling
   - Increase timeouts if needed

### If Throughput < 50 req/s
1. **Horizontal Scaling**
   - Add more server instances
   - Use load balancer
   - Distribute load

2. **Vertical Scaling**
   - Increase CPU/RAM
   - Upgrade database
   - Use faster storage

3. **Architecture Changes**
   - Use message queues
   - Implement async processing
   - Add caching layer

## Advanced Usage

### Custom Test Scenario
```javascript
// Create custom test
const { runLoadTest } = require('./load-test-whatsapp');

async function customTest() {
  // Override config
  process.env.BASE_URL = 'https://staging.khaacho.com';
  
  // Run test
  await runLoadTest();
}

customTest();
```

### Continuous Load Testing
```javascript
// Run tests periodically
const cron = require('node-cron');

// Run every day at 2 AM
cron.schedule('0 2 * * *', async () => {
  console.log('Running scheduled load test...');
  await runLoadTest();
});
```

### Compare Results
```bash
# Run multiple tests
node load-test-whatsapp.js  # Test 1
node load-test-whatsapp.js  # Test 2
node load-test-whatsapp.js  # Test 3

# Compare reports
node compare-reports.js load-test-report-*.json
```

## CI/CD Integration

### GitHub Actions
```yaml
name: Load Test

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm start &
      - run: sleep 10
      - run: node load-test-whatsapp.js
      - uses: actions/upload-artifact@v2
        with:
          name: load-test-report
          path: load-test-report-*.json
```

## Monitoring During Load Test

### Server Metrics
```bash
# CPU usage
top -b -n 1 | head -20

# Memory usage
free -h

# Network connections
netstat -an | grep ESTABLISHED | wc -l

# Database connections
psql -c "SELECT count(*) FROM pg_stat_activity;"
```

### Application Logs
```bash
# Watch logs during test
tail -f logs/combined-*.log

# Watch error logs
tail -f logs/error-*.log

# Watch WhatsApp logs
tail -f logs/whatsapp-*.log
```

### Database Performance
```sql
-- Active queries
SELECT pid, query, state, query_start
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY query_start;

-- Lock monitoring
SELECT * FROM pg_locks
WHERE NOT granted;

-- Connection count
SELECT count(*) FROM pg_stat_activity;
```

## Troubleshooting

### Server Not Reachable
```
❌ Server is not reachable: connect ECONNREFUSED
```
**Solution**: Ensure server is running at the configured URL

### High Failure Rate
```
Failed: 450 (30%)
```
**Solution**: 
- Check server logs for errors
- Increase timeout
- Reduce concurrent users
- Fix application bugs

### Timeout Errors
```
Error: Timeout of 30000ms exceeded
```
**Solution**:
- Increase timeout in config
- Optimize slow endpoints
- Check database performance

### Memory Issues
```
JavaScript heap out of memory
```
**Solution**:
- Reduce concurrent users
- Increase Node.js memory: `node --max-old-space-size=4096 load-test-whatsapp.js`
- Fix memory leaks in application

## Best Practices

1. **Start Small**: Begin with light load, gradually increase
2. **Monitor Resources**: Watch CPU, memory, database during test
3. **Test Regularly**: Run load tests before each deployment
4. **Set Baselines**: Establish performance baselines
5. **Track Trends**: Compare results over time
6. **Test Realistic Scenarios**: Use production-like data
7. **Clean Up**: Clear test data after tests
8. **Document Results**: Keep records of all tests

## Example Workflow

### 1. Baseline Test
```bash
# Run with 10 users
node load-test-whatsapp.js
# Record baseline metrics
```

### 2. Incremental Load
```bash
# Gradually increase load
# 10 → 50 → 100 → 250 → 500 → 1000
```

### 3. Find Breaking Point
```bash
# Keep increasing until system fails
# Note the breaking point
```

### 4. Optimize
```bash
# Fix bottlenecks
# Re-run tests
# Compare results
```

### 5. Production Readiness
```bash
# Ensure system handles expected load + 50% buffer
# Example: If expecting 300 concurrent users, test with 450
```

## Related Documentation

- [WhatsApp Intent Detection Guide](./WHATSAPP_INTENT_DETECTION_GUIDE.md)
- [Performance Optimization Guide](./PERFORMANCE_OPTIMIZATION.md)
- [Monitoring Guide](./MONITORING_IMPLEMENTATION_SUMMARY.md)

## Support

For issues or questions:
1. Check server logs
2. Review error summary in report
3. Monitor system resources
4. Contact development team

---

**Ready to test!** Run `node load-test-whatsapp.js` to start load testing. 🚀
