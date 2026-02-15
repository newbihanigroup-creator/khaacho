const axios = require('axios');
const logger = require('../../../shared/logger');
const { ExternalServiceError } = require('../../../shared/errors');

/**
 * OpenAI Service
 * External service for LLM operations
 */
class OpenAIService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.apiUrl = 'https://api.openai.com/v1/chat/completions';
    this.isConfigured = !!this.apiKey;

    if (this.isConfigured) {
      logger.info('OpenAI service initialized', { model: this.model });
    } else {
      logger.warn('OpenAI service not configured');
    }
  }

  /**
   * Extract structured items from text
   */
  async extractItems(rawText) {
    if (!this.isConfigured) {
      throw new ExternalServiceError(
        'OpenAI',
        'OpenAI API key not configured',
        { hint: 'Set OPENAI_API_KEY environment variable' }
      );
    }

    try {
      logger.info('Extracting items with OpenAI', {
        textLength: rawText.length,
        model: this.model,
      });

      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt(),
            },
            {
              role: 'user',
              content: this.getUserPrompt(rawText),
            },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const content = response.data.choices[0].message.content;
      const parsed = JSON.parse(content);
      const items = parsed.items || [];

      logger.info('Items extracted successfully', {
        itemCount: items.length,
        tokensUsed: response.data.usage?.total_tokens,
      });

      return items;
    } catch (error) {
      logger.error('OpenAI extraction failed', {
        error: error.message,
        status: error.response?.status,
      });

      if (error.response) {
        const status = error.response.status;
        
        if (status === 401) {
          throw new ExternalServiceError('OpenAI', 'Invalid API key');
        }
        
        if (status === 429) {
          throw new ExternalServiceError('OpenAI', 'Rate limit exceeded');
        }
        
        if (status >= 500) {
          throw new ExternalServiceError('OpenAI', 'Service temporarily unavailable');
        }
      }

      throw new ExternalServiceError('OpenAI', error.message);
    }
  }

  /**
   * Get system prompt for item extraction
   */
  getSystemPrompt() {
    return `You are a grocery order extraction engine. Return STRICT JSON array.

Each object must contain:
- name (string)
- quantity (number)
- unit (string or null)
- confidence (0-1 float)

Rules:
- Normalize units (kg, g, l, ml, pieces, dozen, etc.)
- If unit missing → null
- Remove duplicates
- Ignore noise (headers, footers, dates, totals, phone numbers, addresses)
- Do not explain anything
- Return only JSON

Output format:
{
  "items": [
    {
      "name": "Rice",
      "quantity": 10,
      "unit": "kg",
      "confidence": 0.95
    }
  ]
}`;
  }

  /**
   * Get user prompt with raw text
   */
  getUserPrompt(rawText) {
    return `Extract grocery items from this text:

"""
${rawText}
"""

Return JSON with items array. Each item must have: name, quantity, unit, confidence.`;
  }

  /**
   * Check if service is configured
   */
  isAvailable() {
    return this.isConfigured;
  }

  /**
   * Get service health status
   */
  getHealthStatus() {
    return {
      service: 'OpenAI',
      configured: this.isConfigured,
      model: this.model,
      available: this.isConfigured,
    };
  }
}

// Export singleton instance
module.exports = new OpenAIService();
