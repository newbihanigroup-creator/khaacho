# Analytics & Intelligence - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Run the Migration

```bash
# Connect to your database and run the analytics migration
psql $DATABASE_URL -f prisma/migrations/022_analytics_intelligence.sql
```

This creates 8 new tables:
- `daily_sales_summary`
- `monthly_retailer_summary`
- `vendor_performance_summary`
- `credit_exposure_summary`
- `inventory_velocity_summary`
- `product_demand_forecast`
- `intelligence_actions`
- `platform_intelligence_metrics`

### Step 2: Restart Your Worker Service

```bash
# If using separate worker process
npm run start:worker

# Or restart your main server if running combined
npm start
```

The analytics worker will automatically start and schedule:
- Daily aggregations at 2:00 AM
- Monthly aggregations on 1st at 3:00 AM
- Intelligence generation every 6 hours
- Demand forecasting daily at 4:00 AM

### Step 3: Populate Initial Data

```bash
# Get your admin token first
TOKEN="your_admin_jwt_token"

# Run daily aggregation for yesterday
curl -X POST "http://localhost:3000/api/analytics/jobs/daily-aggregation" \
  -H "Authorization: Bearer $TOKEN"

# If you have historical data, run for past dates
curl -X POST "http://localhost:3000/api/analytics/jobs/daily-aggregation?date=2024-02-01" \
  -H "Authorization: Bearer $TOKEN"

# Run monthly aggregation for last month
curl -X POST "http://localhost:3000/api/analytics/jobs/monthly-aggregation?year=2024&month=1" \
  -H "Authorization: Bearer $TOKEN"
```

### Step 4: View CEO Dashboard

```bash
# Get CEO-level intelligence
curl "http://localhost:3000/api/analytics/ceo-dashboard?days=30" \
  -H "Authorization: Bearer $TOKEN" | jq
```

You'll see:
```json
{
  "platformMetrics": {
    "grossMerchandiseValue": 1250000,
    "netMargin": 187500,
    "netMarginPercentage": 15,
    "totalOrders": 450,
    "completedOrders": 380,
    "activeRetailers": 120,
    "activeVendors": 35,
    "creditExposureRatio": 45.5,
    "revenuePerRetailer": 10416.67
  },
  "revenueGrowth": {
    "firstHalfRevenue": 580000,
    "secondHalfRevenue": 670000,
    "growthRate": 15.52,
    "trend": "STRONG_GROWTH"
  },
  "riskMetrics": {
    "highRiskRetailers": 8,
    "overdueOrders": 12,
    "totalOutstanding": 250000,
    "riskLevel": "MEDIUM"
  },
  "topPerformers": {
    "topRetailers": [...],
    "topVendors": [...],
    "topProducts": [...]
  },
  "alerts": [...]
}
```

## 📊 Key Endpoints to Use

### 1. Retailer Intelligence

```bash
# Get deep insights on a specific retailer
curl "http://localhost:3000/api/analytics/intelligence/retailer/RETAILER_ID" \
  -H "Authorization: Bearer $TOKEN" | jq
```

Returns:
- Average monthly purchase
- Order frequency
- Repayment speed
- Churn risk score
- Automated recommendations (increase/reduce credit, churn prevention, etc.)

### 2. Vendor Intelligence

```bash
# Analyze vendor performance
curl "http://localhost:3000/api/analytics/intelligence/vendor/VENDOR_ID" \
  -H "Authorization: Bearer $TOKEN" | jq
```

Returns:
- Fulfillment rate
- Price competitiveness
- Delivery performance
- Automated recommendations (promote, warn, renegotiate)

### 3. Credit Intelligence

```bash
# Get credit portfolio overview
curl "http://localhost:3000/api/analytics/intelligence/credit" \
  -H "Authorization: Bearer $TOKEN" | jq
```

Returns:
- Total credit exposure
- Aging buckets (0-7, 8-15, 16-30, 30+ days)
- Expected cash inflow (7 days, 30 days)
- Risk breakdown

### 4. Demand Forecasting

```bash
# Forecast top 20 products
curl "http://localhost:3000/api/analytics/forecast/top20" \
  -H "Authorization: Bearer $TOKEN" | jq
```

Returns predicted demand for next 7 days for your top products.

### 5. Product-Specific Forecast

```bash
# Forecast specific product
curl "http://localhost:3000/api/analytics/forecast/product/PRODUCT_ID?days=7" \
  -H "Authorization: Bearer $TOKEN" | jq
```

## 🤖 Automated Intelligence Actions

The system automatically generates recommendations every 6 hours. View them:

```bash
# Query intelligence_actions table
psql $DATABASE_URL -c "
  SELECT action_type, priority, recommendation, confidence_score, created_at 
  FROM intelligence_actions 
  WHERE status = 'PENDING' 
  ORDER BY priority DESC, created_at DESC 
  LIMIT 10;
"
```

Example actions you'll see:
- `INCREASE_CREDIT_LIMIT` - For high-performing retailers
- `CHURN_PREVENTION` - For at-risk retailers
- `VENDOR_PERFORMANCE_WARNING` - For underperforming vendors
- `LOW_STOCK_ALERT` - For inventory management

## 📈 Daily Workflow

### Morning Routine (Check at 9 AM)

1. **Check CEO Dashboard**
   ```bash
   curl "http://localhost:3000/api/analytics/ceo-dashboard" -H "Authorization: Bearer $TOKEN"
   ```

2. **Review Intelligence Actions**
   ```sql
   SELECT * FROM intelligence_actions 
   WHERE status = 'PENDING' AND priority IN ('URGENT', 'HIGH')
   ORDER BY created_at DESC;
   ```

3. **Check Credit Exposure**
   ```bash
   curl "http://localhost:3000/api/analytics/intelligence/credit" -H "Authorization: Bearer $TOKEN"
   ```

### Weekly Routine (Monday Morning)

1. **Review Top Performers**
   - Check top retailers, vendors, products
   - Identify growth opportunities

2. **Analyze Churn Risk**
   ```sql
   SELECT * FROM monthly_retailer_summary 
   WHERE churn_risk_score > 60 
   ORDER BY churn_risk_score DESC;
   ```

3. **Review Vendor Performance**
   ```sql
   SELECT * FROM vendor_performance_summary 
   WHERE performance_score < 70 
   ORDER BY performance_score ASC;
   ```

### Monthly Routine (1st of Month)

1. **Review Monthly Summaries**
   - Check retailer growth rates
   - Analyze vendor performance trends
   - Review inventory velocity

2. **Act on Intelligence Recommendations**
   - Adjust credit limits
   - Renegotiate vendor contracts
   - Optimize inventory

## 🔍 Monitoring

### Check if Workers are Running

```bash
# Health check
curl http://localhost:10001/health
```

Should return:
```json
{
  "status": "healthy",
  "workers": {
    "analytics": "running"
  }
}
```

### Check Logs

```bash
# View analytics logs
tail -f logs/combined-*.log | grep -i "analytics\|aggregation\|intelligence"
```

### Verify Aggregations

```bash
# Check if daily aggregations are running
psql $DATABASE_URL -c "
  SELECT summary_date, total_orders, total_gmv, active_retailers 
  FROM daily_sales_summary 
  ORDER BY summary_date DESC 
  LIMIT 7;
"

# Check if intelligence actions are being generated
psql $DATABASE_URL -c "
  SELECT COUNT(*), action_type, priority 
  FROM intelligence_actions 
  WHERE created_at > NOW() - INTERVAL '24 hours' 
  GROUP BY action_type, priority;
"
```

## 🐛 Troubleshooting

### No Data in Aggregation Tables

**Problem:** Tables are empty after running jobs.

**Solution:**
```bash
# Manually trigger aggregation
curl -X POST "http://localhost:3000/api/analytics/jobs/daily-aggregation" \
  -H "Authorization: Bearer $TOKEN"

# Check logs for errors
tail -f logs/combined-*.log | grep ERROR
```

### Intelligence Actions Not Generated

**Problem:** No recommendations appearing.

**Cause:** Need at least 30 days of historical data.

**Solution:**
```bash
# Run aggregations for past 30 days
for i in {1..30}; do
  DATE=$(date -d "$i days ago" +%Y-%m-%d)
  curl -X POST "http://localhost:3000/api/analytics/jobs/daily-aggregation?date=$DATE" \
    -H "Authorization: Bearer $TOKEN"
done
```

### Forecasts Show Zero

**Problem:** Demand forecasts are all zero.

**Cause:** Insufficient historical order data.

**Solution:** System needs at least 7 days of order history per product. Wait for more data to accumulate.

## 📚 Next Steps

1. **Integrate with Admin Dashboard**
   - Display CEO metrics on admin panel
   - Show intelligence alerts
   - Add action buttons for recommendations

2. **Set Up Alerts**
   - Email notifications for urgent actions
   - WhatsApp alerts for high-priority items
   - Slack integration for team notifications

3. **Custom Reports**
   - Export monthly summaries to Excel
   - Generate PDF reports for stakeholders
   - Create custom dashboards

4. **Advanced Analytics**
   - Add more sophisticated forecasting models
   - Implement cohort analysis
   - Build customer segmentation

## 🎯 Success Metrics

After 30 days, you should see:
- ✅ Daily aggregations running automatically
- ✅ 50-100 intelligence actions generated
- ✅ Accurate demand forecasts (80%+ confidence)
- ✅ Credit exposure under control
- ✅ Vendor performance improving
- ✅ Retailer churn decreasing

## 💡 Pro Tips

1. **Act on High-Confidence Recommendations**
   - Actions with 85%+ confidence are usually accurate
   - Start with URGENT priority items

2. **Monitor Forecast Accuracy**
   - Compare predicted vs actual demand weekly
   - Adjust confidence thresholds as needed

3. **Review Intelligence Actions Weekly**
   - Mark actions as executed or dismissed
   - Track which recommendations work best

4. **Use CEO Dashboard Daily**
   - Make it your morning routine
   - Share with stakeholders weekly

---

**You now have a self-optimizing, predictive B2B platform. Use it wisely.**
