# Analytics & Intelligence System

## Overview

The Analytics & Intelligence layer transforms your B2B wholesale platform from reactive to **predictive and self-optimizing**. This is what separates a software product from a data company.

## What This System Does

### 🎯 Core Capabilities

1. **Predictive Analytics** - Forecast demand, identify trends, predict churn
2. **Self-Optimization** - Automated recommendations for credit, pricing, inventory
3. **Risk Intelligence** - Real-time credit exposure monitoring and alerts
4. **Margin Control** - Track profitability at every level
5. **Decision Automation** - System suggests actions based on data patterns

## Architecture

### Data Warehouse Layer

Aggregated tables that update daily/monthly via cron jobs:

- `daily_sales_summary` - Daily operational metrics
- `monthly_retailer_summary` - Retailer behavior patterns
- `vendor_performance_summary` - Vendor reliability metrics
- `credit_exposure_summary` - Credit risk tracking
- `inventory_velocity_summary` - Product movement analysis
- `product_demand_forecast` - AI-driven demand predictions
- `intelligence_actions` - Automated system recommendations
- `platform_intelligence_metrics` - CEO-level KPIs

### Intelligence Engines

#### 1. Retailer Intelligence

Tracks and analyzes:
- Average monthly purchase
- Average order value
- Order frequency
- Repayment speed
- Credit utilization rate
- Seasonal spikes
- Lifetime Value (LTV)
- Growth rate
- Churn risk

**Automated Actions:**
- Increase credit for high-value low-risk retailers
- Reduce credit for slow payers
- Churn prevention alerts
- Upsell opportunities

#### 2. Vendor Intelligence

Tracks and analyzes:
- Average margin per product
- Price variation vs market
- Fulfillment rate
- Average accept time
- Late delivery rate
- Cancellation rate

**Automated Actions:**
- Drop underperforming vendors
- Promote reliable vendors
- Price renegotiation suggestions

#### 3. Inventory Intelligence

Tracks and analyzes:
- Inventory turnover ratio
- Days of stock left
- Stockout frequency
- Fast/medium/slow moving products
- Demand trends

**Automated Actions:**
- Low stock alerts
- Stockout prevention
- Slow-moving inventory recommendations

#### 4. Credit Intelligence

Tracks and analyzes:
- Total credit exposure
- Aging buckets (0-7, 8-15, 16-30, 30+ days)
- Credit utilization %
- Default rate
- Recovery rate
- Expected cash inflow (7 days, 30 days)

**Prevents liquidity crisis** by forecasting cash flow.

#### 5. Demand Forecasting

Uses simple but effective algorithms:
- Moving average (7-day / 30-day)
- Seasonal index
- Growth trend slope

**Predicts:**
- Next week's top 20 products
- Expected credit demand
- Vendor load

## API Endpoints

### Intelligence Endpoints

```
GET /api/analytics/ceo-dashboard?days=30
```
Returns platform-level metrics for CEO view:
- GMV, Net Margin, Credit Exposure Ratio
- Active retailers/vendors
- Revenue per retailer
- Growth trends

```
GET /api/analytics/intelligence/retailer/:id
```
Returns deep intelligence on specific retailer:
- Behavioral metrics
- Automated action recommendations
- Churn risk score

```
GET /api/analytics/intelligence/vendor/:id
```
Returns vendor performance intelligence:
- Reliability metrics
- Price competitiveness
- Automated recommendations

```
GET /api/analytics/intelligence/inventory/:id
```
Returns product inventory intelligence:
- Velocity category
- Stock health
- Reorder recommendations

```
GET /api/analytics/intelligence/credit
```
Returns credit portfolio intelligence:
- Total exposure
- Aging analysis
- Expected inflows

```
GET /api/analytics/forecast/product/:id?days=7
```
Returns demand forecast for specific product

```
GET /api/analytics/forecast/top20
```
Returns forecast for top 20 products

### Aggregation Job Triggers

```
POST /api/analytics/jobs/daily-aggregation?date=2024-02-10
```
Manually trigger daily aggregation

```
POST /api/analytics/jobs/monthly-aggregation?year=2024&month=2
```
Manually trigger monthly aggregation

## Automated Jobs

### Daily Jobs (2:00 AM)

1. **Daily Sales Aggregation**
   - Aggregates previous day's orders, revenue, margins
   - Updates active retailer/vendor counts
   - Calculates credit issued and payments received

2. **Credit Exposure Aggregation**
   - Analyzes aging buckets
   - Calculates risk exposure by category
   - Forecasts expected inflows

3. **Platform Metrics Aggregation**
   - Updates CEO dashboard metrics
   - Calculates GMV, margins, ratios
   - Tracks retailer churn and vendor reliability

### Intelligence Jobs (Every 6 hours)

1. **Retailer Intelligence Analysis**
   - Analyzes top 100 active retailers
   - Generates automated action recommendations
   - Saves to `intelligence_actions` table

2. **Vendor Intelligence Analysis**
   - Analyzes all approved vendors
   - Identifies performance issues
   - Generates vendor management recommendations

### Forecasting Jobs (4:00 AM)

1. **Demand Forecasting**
   - Forecasts top 50 products for next 7 days
   - Calculates confidence levels
   - Updates `product_demand_forecast` table

### Monthly Jobs (1st of month, 3:00 AM)

1. **Monthly Retailer Summary**
   - Aggregates retailer behavior for previous month
   - Calculates growth rates
   - Updates churn risk scores

## Intelligence Actions

The system automatically generates actionable recommendations stored in `intelligence_actions` table:

### Action Types

- `INCREASE_CREDIT_LIMIT` - For high-performing retailers
- `REDUCE_CREDIT_LIMIT` - For high-risk retailers
- `CHURN_PREVENTION` - For at-risk retailers
- `UPSELL_OPPORTUNITY` - For growing retailers
- `VENDOR_PERFORMANCE_WARNING` - For underperforming vendors
- `PROMOTE_VENDOR` - For excellent vendors
- `PRICE_RENEGOTIATION` - For price optimization
- `LOW_STOCK_ALERT` - For inventory management
- `STOCKOUT_PREVENTION` - For stock optimization
- `SLOW_MOVING_INVENTORY` - For inventory cleanup

### Priority Levels

- `URGENT` - Requires immediate action
- `HIGH` - Action needed within 24 hours
- `MEDIUM` - Action needed within week
- `LOW` - Informational

## CEO Dashboard Metrics

### Platform Health
- Gross Merchandise Value (GMV)
- Net Margin & Margin %
- Total Orders & Completion Rate
- Active Retailers & Vendors
- Revenue Per Retailer

### Growth Metrics
- Revenue Growth Rate
- Retailer Growth Trend
- Order Frequency
- Retailer Churn Rate

### Risk Metrics
- Credit Exposure Ratio
- High Risk Retailers Count
- Overdue Orders
- Total Outstanding Debt
- Risk Level (LOW/MEDIUM/HIGH)

### Top Performers
- Top 5 Retailers by Spend
- Top 5 Vendors by Sales
- Top 5 Products by Revenue

### Intelligence Alerts
- Pending high-priority actions
- System recommendations
- Risk warnings

## Setup & Configuration

### 1. Run Migration

```bash
# Apply analytics tables
psql $DATABASE_URL -f prisma/migrations/022_analytics_intelligence.sql
```

### 2. Start Analytics Worker

The analytics worker is automatically started with your application. It runs scheduled jobs for:
- Daily aggregations
- Monthly summaries
- Intelligence generation
- Demand forecasting

### 3. Initial Data Population

```bash
# Manually trigger aggregation for historical data
curl -X POST http://localhost:3000/api/analytics/jobs/daily-aggregation \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Run for specific date
curl -X POST "http://localhost:3000/api/analytics/jobs/daily-aggregation?date=2024-02-10" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### 4. Verify Setup

```bash
# Check CEO dashboard
curl http://localhost:3000/api/analytics/ceo-dashboard \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Check intelligence actions
curl http://localhost:3000/api/analytics/intelligence/credit \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## Integration with Existing Systems

### Credit Control Integration

Intelligence actions automatically feed into credit control:
- Credit limit adjustments based on behavior
- Risk alerts trigger credit blocks
- Payment patterns influence credit scoring

### Order Routing Integration

Demand forecasts inform order routing:
- Predict vendor load
- Optimize inventory allocation
- Prevent stockouts

### Risk Management Integration

Credit intelligence enhances risk management:
- Real-time exposure monitoring
- Aging analysis for collections
- Default prediction

## Performance Considerations

### Aggregation Performance

- Daily jobs process previous day only (fast)
- Monthly jobs run once per month (acceptable)
- Intelligence jobs process in batches of 100

### Query Performance

All aggregation tables have proper indexes:
- Date-based indexes for time-series queries
- Entity-based indexes for drill-downs
- Score-based indexes for rankings

### Scaling Strategy

For larger scale (1000+ retailers):
1. Move aggregations to separate worker process
2. Use message queue for intelligence generation
3. Implement caching for CEO dashboard
4. Consider dedicated analytics database

## What You Now Have

✅ Predictive demand forecasting
✅ Automated credit recommendations
✅ Vendor performance tracking
✅ Inventory optimization alerts
✅ CEO-level intelligence dashboard
✅ Self-optimizing system
✅ Bank-ready financial metrics
✅ Expansion-ready architecture

## Next Steps

### For Surkhet Scale (300 vendors, 1500 retailers)
This system is sufficient. Focus on:
1. Training team on intelligence dashboard
2. Acting on automated recommendations
3. Monitoring key metrics daily

### For National Scale
You will need:
1. Microservices architecture
2. Dedicated analytics database
3. Event-driven architecture
4. Message queues (RabbitMQ/Kafka)
5. Real-time streaming analytics
6. Advanced ML models

## Monitoring

### Key Metrics to Watch

1. **Aggregation Job Success Rate** - Should be 100%
2. **Intelligence Action Generation** - Should generate 10-50 actions per run
3. **Forecast Accuracy** - Track actual vs predicted
4. **Action Execution Rate** - % of recommendations acted upon

### Logs

All analytics operations are logged:
```javascript
logger.info('Daily aggregation completed');
logger.error('Intelligence generation failed');
```

Check logs at: `logs/combined-*.log`

## Troubleshooting

### Aggregation Jobs Not Running

Check cron schedule:
```javascript
// In src/workers/analytics.worker.js
cron.schedule('0 2 * * *', ...) // 2 AM daily
```

### Intelligence Actions Not Generated

1. Check if retailers/vendors exist
2. Verify sufficient historical data (30+ days)
3. Check `intelligence_actions` table for errors

### Forecasts Inaccurate

1. Requires 30+ days of data for accuracy
2. Seasonal products need full year of data
3. New products have low confidence scores

## Support

For issues or questions:
1. Check logs in `logs/` directory
2. Review `intelligence_actions` table for system recommendations
3. Monitor CEO dashboard for anomalies

---

**You are no longer just processing orders. You are forecasting demand, controlling margins, and automating decisions.**

This is what makes your system bank-ready and expansion-ready.
