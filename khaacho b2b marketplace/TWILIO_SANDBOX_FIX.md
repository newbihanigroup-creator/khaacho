# Twilio Sandbox Number Fix

## Problem
Error 63007: "Could not find a Channel with the specified From address"

## Root Cause
Environment variable `TWILIO_WHATSAPP_NUMBER` has wrong number.

## Solution

### In Render Dashboard:

1. **Navigate to Environment Variables**
   - Go to: https://dashboard.render.com
   - Select: khaacho service
   - Click: Environment tab

2. **Update Variable**
   ```
   Variable: TWILIO_WHATSAPP_NUMBER
   Old Value: +12243396790 ❌
   New Value: +14155238886 ✅
   ```

3. **Save & Deploy**
   - Click "Save Changes"
   - Wait for auto-redeploy (~2-3 min)

## Verification

After deployment, check logs for:
```
Preparing to send WhatsApp message
from: whatsapp:+14155238886 ✅
to: whatsapp:+9779822403262 ✅
```

## Test

Send a WhatsApp message to `+14155238886` and you should get a reply!

## Important Notes

### Twilio Sandbox Rules:
- **Receiving messages**: `+14155238886` (Twilio Sandbox)
- **Sending messages**: MUST use same number `+14155238886`
- **Format**: Always include country code with `+`
- **Prefix**: Code automatically adds `whatsapp:` prefix

### Your Numbers:
- **Twilio Sandbox**: `+14155238886` (for testing)
- **Your WhatsApp**: `+9779822403262` (receives replies)

### Code Status:
✅ `twilio.service.js` - Correct (uses env var)
✅ `whatsapp.controller.js` - Correct (webhook handler)
✅ Trust proxy - Fixed
✅ Rate limiter - Fixed
❌ Environment variable - **NEEDS UPDATE IN RENDER**

## After Fix

Your bot will:
1. ✅ Receive messages on `+14155238886`
2. ✅ Reply FROM `+14155238886`
3. ✅ Send TO your number `+9779822403262`
4. ✅ No more Error 63007

## Troubleshooting

If still not working after fix:

1. **Check Render logs** for the "from" number being used
2. **Verify env var** was saved correctly in Render
3. **Restart service** manually if auto-deploy didn't trigger
4. **Check Twilio Console** that sandbox is active

## Quick Test Command

After fixing, test with:
```bash
# Send test message via API
curl -X POST https://khaacho-t0wa.onrender.com/api/v1/whatsapp/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "phoneNumber": "+9779822403262",
    "message": "Test from fixed bot!"
  }'
```

Or simply send a WhatsApp message to `+14155238886` and wait for reply!
