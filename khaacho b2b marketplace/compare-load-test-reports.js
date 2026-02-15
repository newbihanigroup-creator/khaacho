/**
 * Compare Load Test Reports
 * 
 * Compares multiple load test reports to track performance trends
 * 
 * Usage: node compare-load-test-reports.js report1.json report2.json report3.json
 */

const fs = require('fs');
const path = require('path');

function loadReport(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error.message);
    return null;
  }
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString();
}

function formatDelta(current, previous) {
  if (!previous) return '';
  
  const delta = current - previous;
  const percentage = ((delta / previous) * 100).toFixed(1);
  
  if (delta > 0) {
    return `📈 +${delta} (+${percentage}%)`;
  } else if (delta < 0) {
    return `📉 ${delta} (${percentage}%)`;
  } else {
    return '➡️  No change';
  }
}

function formatTimeDelta(current, previous) {
  if (!previous) return '';
  
  const delta = current - previous;
  const percentage = ((delta / previous) * 100).toFixed(1);
  
  if (delta > 0) {
    return `📈 +${delta}ms (+${percentage}%) - SLOWER`;
  } else if (delta < 0) {
    return `📉 ${delta}ms (${percentage}%) - FASTER`;
  } else {
    return '➡️  No change';
  }
}

function compareReports(reports) {
  console.log('📊 Load Test Report Comparison\n');
  console.log('='.repeat(100));
  console.log('');

  // Sort by timestamp
  reports.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Summary table
  console.log('Summary:');
  console.log('');
  console.log('| # | Date | Users | Requests | Success Rate | Avg Time | P95 | Grade |');
  console.log('|---|------|-------|----------|--------------|----------|-----|-------|');
  
  reports.forEach((report, index) => {
    const num = index + 1;
    const date = formatDate(report.timestamp);
    const users = report.config.concurrentUsers;
    const requests = report.summary.totalRequests;
    const successRate = `${report.summary.successRate}%`;
    const avgTime = `${report.responseTimes.average}ms`;
    const p95 = `${report.responseTimes.p95}ms`;
    const grade = report.performanceGrade;
    
    console.log(`| ${num} | ${date} | ${users} | ${requests} | ${successRate} | ${avgTime} | ${p95} | ${grade} |`);
  });
  
  console.log('');
  console.log('='.repeat(100));
  console.log('');

  // Detailed comparison
  console.log('Detailed Comparison:\n');

  for (let i = 0; i < reports.length; i++) {
    const report = reports[i];
    const prevReport = i > 0 ? reports[i - 1] : null;

    console.log(`Report ${i + 1}: ${formatDate(report.timestamp)}`);
    console.log('-'.repeat(100));
    
    // Overall metrics
    console.log('\nOverall Metrics:');
    console.log(`  Total Requests: ${report.summary.totalRequests} ${formatDelta(report.summary.totalRequests, prevReport?.summary.totalRequests)}`);
    console.log(`  Successful: ${report.summary.successful} ${formatDelta(report.summary.successful, prevReport?.summary.successful)}`);
    console.log(`  Failed: ${report.summary.failed} ${formatDelta(report.summary.failed, prevReport?.summary.failed)}`);
    console.log(`  Success Rate: ${report.summary.successRate}% ${formatDelta(report.summary.successRate, prevReport?.summary.successRate)}`);
    console.log(`  Requests/Second: ${report.summary.requestsPerSecond} ${formatDelta(report.summary.requestsPerSecond, prevReport?.summary.requestsPerSecond)}`);
    
    // Response times
    console.log('\nResponse Times:');
    console.log(`  Average: ${report.responseTimes.average}ms ${formatTimeDelta(report.responseTimes.average, prevReport?.responseTimes.average)}`);
    console.log(`  Median: ${report.responseTimes.median}ms ${formatTimeDelta(report.responseTimes.median, prevReport?.responseTimes.median)}`);
    console.log(`  P95: ${report.responseTimes.p95}ms ${formatTimeDelta(report.responseTimes.p95, prevReport?.responseTimes.p95)}`);
    console.log(`  P99: ${report.responseTimes.p99}ms ${formatTimeDelta(report.responseTimes.p99, prevReport?.responseTimes.p99)}`);
    
    // Performance grade
    console.log('\nPerformance:');
    console.log(`  Grade: ${report.performanceGrade}`);
    
    if (prevReport && report.performanceGrade !== prevReport.performanceGrade) {
      const grades = ['F', 'D', 'C', 'B', 'A', 'A+'];
      const currentIndex = grades.indexOf(report.performanceGrade);
      const prevIndex = grades.indexOf(prevReport.performanceGrade);
      
      if (currentIndex > prevIndex) {
        console.log(`  Change: 📈 IMPROVED from ${prevReport.performanceGrade} to ${report.performanceGrade}`);
      } else {
        console.log(`  Change: 📉 DEGRADED from ${prevReport.performanceGrade} to ${report.performanceGrade}`);
      }
    }
    
    console.log('\n');
  }

  console.log('='.repeat(100));
  console.log('');

  // Trend analysis
  if (reports.length >= 2) {
    console.log('Trend Analysis:\n');
    
    const first = reports[0];
    const last = reports[reports.length - 1];
    
    console.log('From first to last report:');
    console.log(`  Success Rate: ${first.summary.successRate}% → ${last.summary.successRate}% ${formatDelta(last.summary.successRate, first.summary.successRate)}`);
    console.log(`  Avg Response Time: ${first.responseTimes.average}ms → ${last.responseTimes.average}ms ${formatTimeDelta(last.responseTimes.average, first.responseTimes.average)}`);
    console.log(`  P95 Response Time: ${first.responseTimes.p95}ms → ${last.responseTimes.p95}ms ${formatTimeDelta(last.responseTimes.p95, first.responseTimes.p95)}`);
    console.log(`  Throughput: ${first.summary.requestsPerSecond} → ${last.summary.requestsPerSecond} req/s ${formatDelta(last.summary.requestsPerSecond, first.summary.requestsPerSecond)}`);
    console.log(`  Performance Grade: ${first.performanceGrade} → ${last.performanceGrade}`);
    console.log('');
    
    // Overall trend
    const avgTimeImproved = last.responseTimes.average < first.responseTimes.average;
    const successRateImproved = last.summary.successRate > first.summary.successRate;
    const throughputImproved = last.summary.requestsPerSecond > first.summary.requestsPerSecond;
    
    const improvements = [avgTimeImproved, successRateImproved, throughputImproved].filter(Boolean).length;
    
    if (improvements === 3) {
      console.log('Overall Trend: 🟢 EXCELLENT - All metrics improved!');
    } else if (improvements === 2) {
      console.log('Overall Trend: 🟢 GOOD - Most metrics improved');
    } else if (improvements === 1) {
      console.log('Overall Trend: 🟡 MIXED - Some improvements, some regressions');
    } else {
      console.log('Overall Trend: 🔴 CONCERNING - Performance degraded');
    }
    
    console.log('');
  }

  console.log('='.repeat(100));
  console.log('');
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node compare-load-test-reports.js <report1.json> <report2.json> ...');
    console.log('');
    console.log('Example:');
    console.log('  node compare-load-test-reports.js load-test-report-*.json');
    console.log('');
    process.exit(1);
  }

  // Load all reports
  const reports = [];
  
  for (const arg of args) {
    const report = loadReport(arg);
    if (report) {
      reports.push(report);
    }
  }

  if (reports.length === 0) {
    console.error('No valid reports found');
    process.exit(1);
  }

  if (reports.length === 1) {
    console.log('Only one report provided. Need at least 2 reports to compare.');
    process.exit(1);
  }

  // Compare reports
  compareReports(reports);
}

if (require.main === module) {
  main();
}

module.exports = { compareReports };
