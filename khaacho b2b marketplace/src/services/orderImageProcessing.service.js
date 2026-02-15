const prisma = require('../config/database');
const logger = require('../utils/logger');
const axios = require('axios');
const visionOCRService = require('./visionOCR.service');

/**
 * Order Image Processing Service
 * Handles OCR extraction and LLM-based order parsing from uploaded images
 */

class OrderImageProcessingService {
  constructor() {
    // OCR is now handled by dedicated visionOCR.service
  }

  /**
   * Main processing function
   * @param {string} uploadedOrderId - ID of the uploaded order to process
   */
  async processUploadedOrder(uploadedOrderId) {
    logger.info('🔄 Starting order image processing', { uploadedOrderId });

    try {
      // Step 1: Fetch uploaded order from database
      const uploadedOrder = await this.fetchUploadedOrder(uploadedOrderId);
      
      if (!uploadedOrder) {
        throw new Error(`UploadedOrder not found: ${uploadedOrderId}`);
      }

      logger.info('✅ Step 1: Fetched uploaded order', {
        uploadedOrderId,
        imageUrl: uploadedOrder.imageUrl,
        retailerId: uploadedOrder.retailerId,
      });

      // Step 2: Extract text from image using Google Vision API
      const rawText = await this.extractTextFromImage(uploadedOrder.imageUrl);
      
      logger.info('✅ Step 2: Text extracted from image', {
        uploadedOrderId,
        textLength: rawText?.length || 0,
        preview: rawText?.substring(0, 200),
      });

      // Step 3: Store raw extracted text in database
      await this.storeRawText(uploadedOrderId, rawText);
      
      logger.info('✅ Step 3: Raw text stored in database', {
        uploadedOrderId,
      });

      // Step 4: Extract structured order data using LLM
      const extractedData = await this.extractOrderDataWithLLM(rawText, uploadedOrder);
      
      logger.info('✅ Step 4: Order data extracted with LLM', {
        uploadedOrderId,
        itemsCount: extractedData.items?.length || 0,
        confidence: extractedData.confidence,
      });

      // Step 5: Update status based on extraction results
      await this.updateOrderStatus(uploadedOrderId, extractedData);
      
      logger.info('✅ Step 5: Order status updated', {
        uploadedOrderId,
        status: extractedData.items?.length > 0 ? 'COMPLETED' : 'FAILED',
      });

      return {
        success: true,
        uploadedOrderId,
        rawText,
        extractedData,
        status: extractedData.items?.length > 0 ? 'COMPLETED' : 'FAILED',
      };

    } catch (error) {
      logger.error('❌ Order image processing failed', {
        uploadedOrderId,
        error: error.message,
        stack: error.stack,
      });

      // Update status to FAILED
      await this.updateOrderStatus(uploadedOrderId, {
        items: [],
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Step 1: Fetch uploaded order from database
   */
  async fetchUploadedOrder(uploadedOrderId) {
    try {
      const uploadedOrder = await prisma.uploadedOrder.findUnique({
        where: { id: uploadedOrderId },
        include: {
          retailer: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  phoneNumber: true,
                },
              },
            },
          },
        },
      });

      return uploadedOrder;
    } catch (error) {
      logger.error('Failed to fetch uploaded order', {
        uploadedOrderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Step 2: Extract text from image using Google Vision API
   */
  async extractTextFromImage(imageUrl) {
    logger.info('📸 Extracting text from image', { imageUrl });

    try {
      // Use dedicated Vision OCR service
      const rawText = await visionOCRService.runOCRFromGCS(imageUrl);

      logger.info('Text extraction successful', {
        imageUrl,
        textLength: rawText.length,
      });

      return rawText;

    } catch (error) {
      logger.error('OCR extraction error', {
        imageUrl,
        errorCode: error.code,
        errorMessage: error.message,
      });

      // If OCR service not initialized, use fallback
      if (error.code === 'VISION_NOT_INITIALIZED') {
        logger.warn('Vision API not initialized, using fallback');
        return await this.fallbackOCR(imageUrl);
      }

      // For other errors, re-throw
      throw error;
    }
  }

  /**
   * Fallback OCR method (placeholder)
   */
  async fallbackOCR(imageUrl) {
    logger.warn('Using fallback OCR (placeholder)', { imageUrl });
    
    // TODO: Implement fallback OCR using Tesseract.js or other service
    // For now, return placeholder text
    return `[Fallback OCR - Google Vision not configured]
Image URL: ${imageUrl}
Please configure Google Vision API for actual text extraction.`;
  }

  /**
   * Step 3: Store raw extracted text in database
   */
  async storeRawText(uploadedOrderId, rawText) {
    try {
      await prisma.uploadedOrder.update({
        where: { id: uploadedOrderId },
        data: {
          extractedText: rawText,
          updatedAt: new Date(),
        },
      });

      logger.info('Raw text stored successfully', {
        uploadedOrderId,
        textLength: rawText?.length || 0,
      });
    } catch (error) {
      logger.error('Failed to store raw text', {
        uploadedOrderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Step 4: Extract structured order data using LLM
   */
  async extractOrderDataWithLLM(rawText, uploadedOrder) {
    logger.info('🤖 Extracting order data with LLM', {
      uploadedOrderId: uploadedOrder.id,
      textLength: rawText?.length || 0,
    });

    try {
      // Choose LLM provider based on configuration
      const llmProvider = process.env.LLM_PROVIDER || 'openai'; // 'openai', 'anthropic', 'gemini'

      if (llmProvider === 'openai') {
        return await this.extractWithOpenAI(rawText, uploadedOrder);
      } else if (llmProvider === 'anthropic') {
        return await this.extractWithAnthropic(rawText, uploadedOrder);
      } else if (llmProvider === 'gemini') {
        return await this.extractWithGemini(rawText, uploadedOrder);
      } else {
        // Fallback to rule-based extraction
        return await this.extractWithRules(rawText, uploadedOrder);
      }

    } catch (error) {
      logger.error('LLM extraction failed', {
        uploadedOrderId: uploadedOrder.id,
        error: error.message,
      });

      // Fallback to rule-based extraction
      return await this.extractWithRules(rawText, uploadedOrder);
    }
  }

  /**
   * Extract order data using OpenAI GPT
   */
  async extractWithOpenAI(rawText, uploadedOrder) {
    if (!process.env.OPENAI_API_KEY) {
      logger.warn('OpenAI API key not configured');
      return await this.extractWithRules(rawText, uploadedOrder);
    }

    try {
      const prompt = this.buildExtractionPrompt(rawText, uploadedOrder);

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an expert at extracting structured order data from text. Always respond with valid JSON.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.choices[0].message.content;
      const extractedData = JSON.parse(content);

      logger.info('OpenAI extraction successful', {
        uploadedOrderId: uploadedOrder.id,
        itemsCount: extractedData.items?.length || 0,
      });

      return {
        ...extractedData,
        extractionMethod: 'openai',
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      };

    } catch (error) {
      logger.error('OpenAI extraction failed', {
        error: error.message,
        response: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * Extract order data using Anthropic Claude
   */
  async extractWithAnthropic(rawText, uploadedOrder) {
    if (!process.env.ANTHROPIC_API_KEY) {
      logger.warn('Anthropic API key not configured');
      return await this.extractWithRules(rawText, uploadedOrder);
    }

    try {
      const prompt = this.buildExtractionPrompt(rawText, uploadedOrder);

      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
          max_tokens: 2000,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        },
        {
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.content[0].text;
      const extractedData = JSON.parse(content);

      logger.info('Anthropic extraction successful', {
        uploadedOrderId: uploadedOrder.id,
        itemsCount: extractedData.items?.length || 0,
      });

      return {
        ...extractedData,
        extractionMethod: 'anthropic',
        model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
      };

    } catch (error) {
      logger.error('Anthropic extraction failed', {
        error: error.message,
        response: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * Extract order data using Google Gemini
   */
  async extractWithGemini(rawText, uploadedOrder) {
    if (!process.env.GEMINI_API_KEY) {
      logger.warn('Gemini API key not configured');
      return await this.extractWithRules(rawText, uploadedOrder);
    }

    try {
      const prompt = this.buildExtractionPrompt(rawText, uploadedOrder);

      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-pro'}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2000,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.candidates[0].content.parts[0].text;
      const extractedData = JSON.parse(content);

      logger.info('Gemini extraction successful', {
        uploadedOrderId: uploadedOrder.id,
        itemsCount: extractedData.items?.length || 0,
      });

      return {
        ...extractedData,
        extractionMethod: 'gemini',
        model: process.env.GEMINI_MODEL || 'gemini-pro',
      };

    } catch (error) {
      logger.error('Gemini extraction failed', {
        error: error.message,
        response: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * Build extraction prompt for LLM
   */
  buildExtractionPrompt(rawText, uploadedOrder) {
    return `Extract order information from the following text and return it as JSON.

Text extracted from order image:
"""
${rawText}
"""

Context:
- Retailer: ${uploadedOrder.retailer?.user?.name || 'Unknown'}
- Shop: ${uploadedOrder.retailer?.shopName || 'Unknown'}
- Phone: ${uploadedOrder.retailer?.user?.phoneNumber || 'Unknown'}

Extract the following information:
1. List of items with: productName, quantity, unit, price (per unit)
2. Total amount (if mentioned)
3. Order date (if mentioned)
4. Any special notes or instructions
5. Confidence score (0-1) for the extraction quality

Return JSON in this exact format:
{
  "items": [
    {
      "productName": "string",
      "quantity": number,
      "unit": "string (kg, L, pieces, etc.)",
      "price": number
    }
  ],
  "total": number,
  "orderDate": "YYYY-MM-DD or null",
  "notes": "string or null",
  "confidence": number (0-1)
}

Rules:
- Extract ALL items mentioned
- If price is not mentioned, set to 0
- If unit is not clear, use "pieces"
- Calculate total if not mentioned
- Be conservative with confidence score
- Return empty items array if no items found`;
  }

  /**
   * Fallback: Rule-based extraction (simple regex patterns)
   */
  async extractWithRules(rawText, uploadedOrder) {
    logger.info('Using rule-based extraction (fallback)', {
      uploadedOrderId: uploadedOrder.id,
    });

    const items = [];
    const lines = rawText.split('\n');

    // Simple pattern matching for common formats
    // Pattern: "10kg rice" or "5 coke" or "2L oil"
    const itemPattern = /(\d+(?:\.\d+)?)\s*([a-zA-Z]*)\s+([a-zA-Z\s]+?)(?:\s*[-–]\s*(?:Rs\.?|₹)?\s*(\d+(?:\.\d+)?))?$/i;

    for (const line of lines) {
      const match = line.trim().match(itemPattern);
      if (match) {
        const [, quantity, unit, productName, price] = match;
        items.push({
          productName: productName.trim(),
          quantity: parseFloat(quantity),
          unit: unit || 'pieces',
          price: price ? parseFloat(price) : 0,
        });
      }
    }

    // Try to find total
    const totalPattern = /total[:\s]*(?:Rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i;
    const totalMatch = rawText.match(totalPattern);
    const total = totalMatch ? parseFloat(totalMatch[1]) : 
                  items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    logger.info('Rule-based extraction completed', {
      uploadedOrderId: uploadedOrder.id,
      itemsFound: items.length,
      total,
    });

    return {
      items,
      total,
      orderDate: null,
      notes: 'Extracted using rule-based fallback',
      confidence: items.length > 0 ? 0.5 : 0.1,
      extractionMethod: 'rules',
    };
  }

  /**
   * Step 5: Update order status based on extraction results
   */
  async updateOrderStatus(uploadedOrderId, extractedData) {
    try {
      const hasItems = extractedData.items && extractedData.items.length > 0;
      const status = hasItems ? 'COMPLETED' : 'FAILED';
      const errorMessage = extractedData.error || 
                          (!hasItems ? 'No items could be extracted from image' : null);

      await prisma.uploadedOrder.update({
        where: { id: uploadedOrderId },
        data: {
          status,
          parsedData: extractedData,
          errorMessage,
          processedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      logger.info('Order status updated', {
        uploadedOrderId,
        status,
        itemsCount: extractedData.items?.length || 0,
        confidence: extractedData.confidence,
      });

    } catch (error) {
      logger.error('Failed to update order status', {
        uploadedOrderId,
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = new OrderImageProcessingService();
