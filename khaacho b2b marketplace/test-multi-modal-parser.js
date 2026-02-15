/**
 * Multi-Modal Order Parser Test
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'your-auth-token';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

async function testMultiModalParser() {
  console.log('🧪 Testing Multi-Modal Order Parser\n');

  try {
    // Test 1: Parse text order
    console.log('1️⃣ Parsing text order...');
    const textOrder = `rice 5 kg
dal 2 kg
coke x 12 pieces
cooking oil - 2 litre`;

    const textResult = await api.post('/api/v1/order-parser/parse', {
      inputType: 'TEXT',
      rawInput: textOrder,
      retailerId: 'test-retailer-id',
    });
    
    console.log('✅ Text parsing result:', JSON.stringify(textResult.data, null, 2));
    console.log('');

    // Test 2: Parse with product aliases
    console.log('2️⃣ Testing product normalization...');
    const aliasOrder = `coca cola x 6
pepsi 12 pieces
sprite - 6`;

    const aliasResult = await api.post('/api/v1/order-parser/parse', {
      inputType: 'TEXT',
      rawInput: aliasOrder,
      retailerId: 'test-retailer-id',
    });
    
    console.log('✅ Alias normalization:', JSON.stringify(aliasResult.data, null, 2));
    console.log('');

    // Test 3: Parse with different units
    console.log('3️⃣ Testing unit normalization...');
    const unitOrder = `sugar 500 grams
milk 2 litres
eggs 2 dozen
biscuits 5 packets`;

    const unitResult = await api.post('/api/v1/order-parser/parse', {
      inputType: 'TEXT',
      rawInput: unitOrder,
      retailerId: 'test-retailer-id',
    });
    
    console.log('✅ Unit normalization:', JSON.stringify(unitResult.data, null, 2));
    console.log('');

    // Test 4: Parse incomplete order (needs clarification)
    console.log('4️⃣ Testing incomplete order handling...');
    const incompleteOrder = `rice
dal 2
cooking oil`;

    const incompleteResult = await api.post('/api/v1/order-parser/parse', {
      inputType: 'TEXT',
      rawInput: incompleteOrder,
      retailerId: 'test-retailer-id',
    });
    
    console.log('✅ Incomplete order result:', JSON.stringify(incompleteResult.data, null, 2));
    
    if (incompleteResult.data.needsClarification) {
      console.log('\n📋 Clarifications needed:');
      incompleteResult.data.clarifications.forEach((c, i) => {
        console.log(`${i + 1}. ${c.question}`);
      });
    }
    console.log('');

    // Test 5: Submit clarifications
    if (incompleteResult.data.needsClarification) {
      console.log('5️⃣ Submitting clarifications...');
      
      const clarificationResponses = incompleteResult.data.clarifications.map((c, i) => ({
        itemIndex: c.itemIndex,
        type: c.type,
        answer: c.type === 'MISSING_QUANTITY' ? '5' : 
                c.type === 'INVALID_UNIT' ? 'kg' : 'rice',
      }));

      const clarifyResult = await api.post(
        `/api/v1/order-parser/sessions/${incompleteResult.data.sessionId}/clarify`,
        { responses: clarificationResponses }
      );
      
      console.log('✅ After clarification:', JSON.stringify(clarifyResult.data, null, 2));
      console.log('');
    }

    // Test 6: Parse OCR output
    console.log('6️⃣ Testing OCR/Image order parsing...');
    const ocrText = `RICE | 10 | KG
DAL | 5 | KG
OIL | 2 | LITRE`;

    const ocrResult = await api.post('/api/v1/order-parser/parse', {
      inputType: 'OCR',
      rawInput: ocrText,
      retailerId: 'test-retailer-id',
      inputMetadata: { imageUrl: 'https://example.com/order.jpg' },
    });
    
    console.log('✅ OCR parsing result:', JSON.stringify(ocrResult.data, null, 2));
    console.log('');

    console.log('✅ All multi-modal parser tests completed!\n');

    // Summary
    console.log('📊 Multi-Modal Order Parser Features:');
    console.log('');
    console.log('Input Types Supported:');
    console.log('- TEXT: Plain text orders');
    console.log('- VOICE: Transcribed voice messages (future-ready)');
    console.log('- IMAGE/OCR: Orders from images');
    console.log('');
    console.log('Product Normalization:');
    console.log('- "coke", "coca cola", "cola" → Same product');
    console.log('- Alias learning and tracking');
    console.log('- Confidence scoring');
    console.log('');
    console.log('Unit Detection & Conversion:');
    console.log('- kg, kgs, kilogram, kilo → kg');
    console.log('- litre, liter, l → litre');
    console.log('- piece, pieces, pc, pcs → piece');
    console.log('- Automatic conversion (500 grams → 0.5 kg)');
    console.log('');
    console.log('Incomplete Order Handling:');
    console.log('- Detects missing quantities');
    console.log('- Identifies ambiguous products');
    console.log('- Asks for unit clarification');
    console.log('- Automatic clarification questions');
    console.log('');

    console.log('📝 API Endpoints:');
    console.log('POST /api/v1/order-parser/parse');
    console.log('POST /api/v1/order-parser/sessions/:sessionId/clarify');
    console.log('GET  /api/v1/order-parser/sessions/:sessionId');
    console.log('POST /api/v1/order-parser/aliases');
    console.log('');

  } catch (error) {
    console.error('❌ Test failed:', error.message);

    if (error.response) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }

    process.exit(1);
  }
}

// Run tests
testMultiModalParser();
