const OpenAI = require('openai');
const AIAgent = require('./agent.interface');
const logger = require('../../shared/utils/logger');
const metrics = require('../../shared/utils/metrics');

class OpenAIAgent extends AIAgent {
  constructor() {
    super();
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000,
      maxRetries: 2,
    });
    this.model = process.env.OPENAI_MODEL || 'gpt-4';
  }

  async parseOrder(data) {
    const startTime = Date.now();
    
    try {
      logger.info('OpenAI: Parsing order', { dataType: typeof data });
      
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are an order parsing assistant for a B2B marketplace in Nepal.
Extract structured order data from the input text.
Return JSON with: { items: [{ productName, quantity, unit }], notes, totalAmount }
If unclear, make best guess based on context.`,
          },
          {
            role: 'user',
            content: typeof data === 'string' ? data : JSON.stringify(data),
          },
        ],
        temperature: 0.1,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });
      
      const result = JSON.parse(response.choices[0].message.content);
      
      const duration = Date.now() - startTime;
      logger.info('OpenAI: Order parsed successfully', { duration, itemCount: result.items?.length });
      metrics.histogram('ai.parse_order.duration', duration, { provider: 'openai' });
      metrics.increment('ai.parse_order.success', { provider: 'openai' });
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('OpenAI: Order parsing failed', { error: error.message, duration });
      metrics.increment('ai.parse_order.error', { provider: 'openai', error: error.code });
      throw error;
    }
  }

  async assessRisk(order) {
    const startTime = Date.now();
    
    try {
      logger.info('OpenAI: Assessing risk', { orderId: order.id });
      
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are a fraud detection assistant for a B2B marketplace.
Analyze the order and return a risk score (0-1) with reasoning.
Consider: order size, item types, customer history, unusual patterns.
Return JSON: { riskScore: 0.0-1.0, reasoning: "...", flags: [] }`,
          },
          {
            role: 'user',
            content: JSON.stringify({
              orderId: order.id,
              items: order.items,
              totalAmount: order.totalAmount,
              customerHistory: order.customerHistory,
            }),
          },
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });
      
      const result = JSON.parse(response.choices[0].message.content);
      
      const duration = Date.now() - startTime;
      logger.info('OpenAI: Risk assessed', { 
        orderId: order.id, 
        riskScore: result.riskScore,
        duration,
      });
      metrics.histogram('ai.assess_risk.duration', duration, { provider: 'openai' });
      metrics.histogram('ai.risk_score', result.riskScore, { provider: 'openai' });
      
      return result.riskScore;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('OpenAI: Risk assessment failed', { error: error.message, duration });
      metrics.increment('ai.assess_risk.error', { provider: 'openai' });
      throw error;
    }
  }

  async optimizeRouting(order, vendors) {
    const startTime = Date.now();
    
    try {
      logger.info('OpenAI: Optimizing routing', { 
        orderId: order.id, 
        vendorCount: vendors.length,
      });
      
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are a vendor routing optimizer for a B2B marketplace.
Select the best vendor based on: price, delivery time, reliability, inventory.
Return JSON: { vendorId: "...", score: 0.0-1.0, reasoning: "..." }`,
          },
          {
            role: 'user',
            content: JSON.stringify({
              order: {
                items: order.items,
                deliveryLocation: order.deliveryLocation,
              },
              vendors: vendors.map(v => ({
                id: v.id,
                name: v.name,
                pricing: v.pricing,
                deliveryTime: v.deliveryTime,
                reliability: v.reliability,
                inventory: v.inventory,
              })),
            }),
          },
        ],
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });
      
      const result = JSON.parse(response.choices[0].message.content);
      
      const duration = Date.now() - startTime;
      logger.info('OpenAI: Routing optimized', { 
        orderId: order.id,
        selectedVendor: result.vendorId,
        score: result.score,
        duration,
      });
      metrics.histogram('ai.optimize_routing.duration', duration, { provider: 'openai' });
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('OpenAI: Routing optimization failed', { error: error.message, duration });
      metrics.increment('ai.optimize_routing.error', { provider: 'openai' });
      throw error;
    }
  }

  async analyzePricing(items) {
    const startTime = Date.now();
    
    try {
      logger.info('OpenAI: Analyzing pricing', { itemCount: items.length });
      
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are a pricing intelligence analyst for a B2B marketplace.
Analyze item prices and suggest optimizations.
Return JSON: { analysis: "...", suggestions: [], potentialSavings: 0 }`,
          },
          {
            role: 'user',
            content: JSON.stringify({ items }),
          },
        ],
        temperature: 0.2,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      });
      
      const result = JSON.parse(response.choices[0].message.content);
      
      const duration = Date.now() - startTime;
      logger.info('OpenAI: Pricing analyzed', { duration });
      metrics.histogram('ai.analyze_pricing.duration', duration, { provider: 'openai' });
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('OpenAI: Pricing analysis failed', { error: error.message, duration });
      metrics.increment('ai.analyze_pricing.error', { provider: 'openai' });
      throw error;
    }
  }

  async healthCheck() {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
      });
      
      return response.choices[0].message.content !== undefined;
      
    } catch (error) {
      logger.error('OpenAI: Health check failed', { error: error.message });
      return false;
    }
  }
}

module.exports = OpenAIAgent;
