const CircuitBreaker = require('opossum');
const OpenAIAgent = require('./openai.agent');
const LocalAgent = require('./local.agent');
const logger = require('../../shared/utils/logger');
const metrics = require('../../shared/utils/metrics');

/**
 * AI Agent Factory with Circuit Breaker
 * Manages multiple AI providers with automatic fallback
 */
class AIAgentFactory {
  constructor() {
    this.agents = {
      openai: new OpenAIAgent(),
      local: new LocalAgent(),
    };
    
    this.primary = process.env.AI_AGENT_PRIMARY || 'openai';
    this.fallback = process.env.AI_AGENT_FALLBACK || 'local';
    
    logger.info('AIAgentFactory initialized', {
      primary: this.primary,
      fallback: this.fallback,
    });
    
    // Create circuit breakers for each method
    this.breakers = {
      parseOrder: this.createBreaker('parseOrder'),
      assessRisk: this.createBreaker('assessRisk'),
      optimizeRouting: this.createBreaker('optimizeRouting'),
      analyzePricing: this.createBreaker('analyzePricing'),
    };
  }

  createBreaker(methodName) {
    const breaker = new CircuitBreaker(
      async (...args) => {
        return await this.agents[this.primary][methodName](...args);
      },
      {
        timeout: 30000,                    // 30s timeout
        errorThresholdPercentage: 50,      // Open at 50% failure rate
        resetTimeout: 60000,               // Try again after 60s
        rollingCountTimeout: 10000,        // 10s window
        rollingCountBuckets: 10,           // 10 buckets
        name: `ai-${methodName}`,
      }
    );
    
    // Fallback to local agent
    breaker.fallback(async (...args) => {
      logger.warn(`Circuit breaker open for ${methodName}, using fallback`, {
        primary: this.primary,
        fallback: this.fallback,
      });
      metrics.increment('ai.circuit_breaker.fallback', { method: methodName });
      
      return await this.agents[this.fallback][methodName](...args);
    });
    
    // Event handlers
    breaker.on('open', () => {
      logger.error(`Circuit breaker opened for ${methodName}`, {
        agent: this.primary,
      });
      metrics.increment('ai.circuit_breaker.open', { method: methodName });
    });
    
    breaker.on('halfOpen', () => {
      logger.warn(`Circuit breaker half-open for ${methodName}`, {
        agent: this.primary,
      });
      metrics.increment('ai.circuit_breaker.half_open', { method: methodName });
    });
    
    breaker.on('close', () => {
      logger.info(`Circuit breaker closed for ${methodName}`, {
        agent: this.primary,
      });
      metrics.increment('ai.circuit_breaker.close', { method: methodName });
    });
    
    breaker.on('success', () => {
      metrics.increment('ai.circuit_breaker.success', { method: methodName });
    });
    
    breaker.on('failure', (error) => {
      metrics.increment('ai.circuit_breaker.failure', { 
        method: methodName,
        error: error.code || 'unknown',
      });
    });
    
    breaker.on('timeout', () => {
      logger.warn(`Circuit breaker timeout for ${methodName}`);
      metrics.increment('ai.circuit_breaker.timeout', { method: methodName });
    });
    
    return breaker;
  }

  async parseOrder(data) {
    return await this.breakers.parseOrder.fire(data);
  }

  async assessRisk(order) {
    return await this.breakers.assessRisk.fire(order);
  }

  async optimizeRouting(order, vendors) {
    return await this.breakers.optimizeRouting.fire(order, vendors);
  }

  async analyzePricing(items) {
    return await this.breakers.analyzePricing.fire(items);
  }

  async healthCheck() {
    const results = {};
    
    for (const [name, agent] of Object.entries(this.agents)) {
      try {
        results[name] = await agent.healthCheck();
      } catch (error) {
        logger.error(`Health check failed for ${name}`, { error: error.message });
        results[name] = false;
      }
    }
    
    return results;
  }

  getStats() {
    const stats = {};
    
    for (const [method, breaker] of Object.entries(this.breakers)) {
      stats[method] = {
        state: breaker.opened ? 'open' : breaker.halfOpen ? 'half-open' : 'closed',
        stats: breaker.stats,
      };
    }
    
    return stats;
  }
}

// Export singleton instance
module.exports = new AIAgentFactory();
