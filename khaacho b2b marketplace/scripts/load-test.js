import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const orderCreationTime = new Trend('order_creation_time');

// Test configuration
export let options = {
  stages: [
    { duration: '2m', target: 50 },    // Ramp up to 50 users
    { duration: '5m', target: 100 },   // Stay at 100 users
    { duration: '2m', target: 200 },   // Spike to 200 users
    { duration: '5m', target: 200 },   // Stay at 200 users
    { duration: '2m', target: 0 },     // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<2000'], // 95% of requests under 2s
    'http_req_failed': ['rate<0.01'],    // Less than 1% errors
    'errors': ['rate<0.01'],
    'order_creation_time': ['p(95)<3000'],
  },
};

// Test data
const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'test-api-key';

const products = [
  { id: 'prod-1', name: 'Rice 25kg' },
  { id: 'prod-2', name: 'Wheat Flour 10kg' },
  { id: 'prod-3', name: 'Cooking Oil 5L' },
  { id: 'prod-4', name: 'Sugar 1kg' },
  { id: 'prod-5', name: 'Salt 1kg' },
];

const vendors = [
  'vendor-1',
  'vendor-2',
  'vendor-3',
];

// Helper function to generate random order
function generateOrder() {
  const itemCount = Math.floor(Math.random() * 5) + 1;
  const items = [];
  
  for (let i = 0; i < itemCount; i++) {
    const product = products[Math.floor(Math.random() * products.length)];
    items.push({
      productId: product.id,
      quantity: Math.floor(Math.random() * 100) + 1,
    });
  }
  
  return {
    vendorId: vendors[Math.floor(Math.random() * vendors.length)],
    items,
    notes: `Load test order ${Date.now()}`,
  };
}

// Main test scenario
export default function () {
  // 1. Health check
  let healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health check status is 200': (r) => r.status === 200,
  });
  
  // 2. Create order
  const order = generateOrder();
  const createStart = Date.now();
  
  let createRes = http.post(
    `${BASE_URL}/api/v1/orders`,
    JSON.stringify(order),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
    }
  );
  
  const createDuration = Date.now() - createStart;
  orderCreationTime.add(createDuration);
  
  const createSuccess = check(createRes, {
    'order creation status is 202': (r) => r.status === 202,
    'order has jobId': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.jobId !== undefined;
      } catch (e) {
        return false;
      }
    },
  });
  
  if (!createSuccess) {
    errorRate.add(1);
    console.error(`Order creation failed: ${createRes.status} ${createRes.body}`);
  } else {
    errorRate.add(0);
    
    // 3. Check order status
    const jobId = JSON.parse(createRes.body).jobId;
    sleep(1); // Wait 1 second
    
    let statusRes = http.get(
      `${BASE_URL}/api/v1/orders/${jobId}/status`,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
        },
      }
    );
    
    check(statusRes, {
      'status check is 200': (r) => r.status === 200,
      'status has jobId': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.jobId === jobId;
        } catch (e) {
          return false;
        }
      },
    });
  }
  
  // Random sleep between 1-3 seconds
  sleep(Math.random() * 2 + 1);
}

// Setup function (runs once)
export function setup() {
  console.log('Starting load test...');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Duration: 16 minutes`);
  console.log(`Max users: 200`);
}

// Teardown function (runs once)
export function teardown(data) {
  console.log('Load test completed');
}
