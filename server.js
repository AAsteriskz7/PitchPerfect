// Load environment variables and check for errors
const dotenvResult = require('dotenv').config(); // Use default path finding

if (dotenvResult.error) {
  console.error('Error loading .env file:', dotenvResult.error);
} else {
  console.log('.env file loaded successfully.');
  // Log the parsed variables (BE CAREFUL NOT TO COMMIT/SHARE REAL SECRETS)
  console.log('Parsed env variables:', dotenvResult.parsed);
}

// Add checks for all expected env variables
console.log('--- Environment Variable Check ---');
console.log('GOOGLE_API_KEY loaded:', process.env.GOOGLE_API_KEY ? 'Yes' : 'No');
console.log('ELEVENLABS_API_KEY loaded:', process.env.ELEVENLABS_API_KEY ? 'Yes' : 'No');
console.log('ELEVENLABS_VOICE_ID loaded:', process.env.ELEVENLABS_VOICE_ID ? 'Yes' : 'No');
console.log('PORT loaded:', process.env.PORT ? `Yes (Value: ${process.env.PORT})` : 'No');
console.log('--------------------------------');

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Middleware
app.use(express.json());
app.use(express.static('public')); // Serve static files from public directory

// Serve frontend files
app.use(express.static('frontend')); // Serve static files from frontend directory

// Optional: Explicitly serve index.html for the root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// POST /chat endpoint
app.post('/chat', async (req, res) => {
    // Destructure prompt, productInfo, and history from request body
    const { prompt: userPrompt, productInfo, history } = req.body;

    // Validate required fields
    if (!userPrompt || !productInfo) {
        return res.status(400).json({ error: 'Missing prompt or productInfo in request body' });
    }
    // Validate productInfo contents only if it's the first message (no history)
    if (!history || history.length === 0) {
        const { productName, productDescription, idealCustomer, oneLinePitch } = productInfo;
        if (!productName || !productDescription || !idealCustomer || !oneLinePitch) {
            return res.status(400).json({ error: 'Missing required fields in productInfo for initial message' });
        }
    }

    // Construct the initial system prompt (only needed conceptually for the first turn)
    const systemPromptText = `
        You are a skeptical potential customer. The user is the founder of a startup pitching their product.
        Product Name: ${productInfo.productName}
        Product Description: ${productInfo.productDescription}
        Ideal Customer: ${productInfo.idealCustomer}
        One-Line Pitch: ${productInfo.oneLinePitch}

        Challenge the founder's pitch based on the product information provided. Be critical and ask tough questions. Respond only with your dialogue as the skeptical customer. Do not include introductory phrases like "Okay, here's my response:" or similar. Just provide the customer's response directly.
    `;

    // Prepare the history for the Gemini model
    // The history from the client already contains past user/model turns
    const chatHistory = [];

    // If it's the start of the conversation (history is empty/null), add the system prompt and initial model turn
    if (!history || history.length === 0) {
        chatHistory.push({ role: 'user', parts: [{ text: systemPromptText }] });
        chatHistory.push({ role: 'model', parts: [{ text: "Okay, I'm ready. What have you got for me?" }] });
    } else {
        // If history exists, map it directly
        // The client sends history like [{sender: 'user', text: '...'}, {sender: 'ai', text: '...'}]
        // We need to map 'ai' to 'model'
        history.forEach(msg => {
            chatHistory.push({
                role: msg.role, // Client now sends 'user' or 'model'
                parts: [{ text: msg.parts[0].text }] // Assuming client sends structure matching API
            });
        });
    }

    // Note: The *current* userPrompt is NOT added to the history array passed to startChat,
    // it's sent separately via chat.sendMessage(userPrompt).

    try {
        // 1. Call Google Gemini API
        const chat = model.startChat({
            history: chatHistory, // Pass the constructed history
            generationConfig: {
                // Optional: configure generation parameters if needed
            },
        });

        const result = await chat.sendMessage(userPrompt); // Send the *current* user message
        const geminiResponse = await result.response.text();

        // 2. Call ElevenLabs Text-to-Speech API
        const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
        const voiceId = process.env.ELEVENLABS_VOICE_ID;
        const ttsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

        const ttsResponse = await axios.post(ttsUrl, {
            text: geminiResponse,
            model_id: "eleven_multilingual_v2", // Or another suitable model
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75
            }
        }, {
            headers: {
                'Accept': 'audio/mpeg',
                'xi-api-key': elevenLabsApiKey,
                'Content-Type': 'application/json',
            },
            responseType: 'arraybuffer' // Important to get binary data
        });

        // 3. Save MP3 buffer to a file
        const audioFileName = `response_${Date.now()}.mp3`;
        const audioFilePath = path.join(__dirname, 'public', audioFileName);
        fs.writeFileSync(audioFilePath, ttsResponse.data);

        // 4. Respond to the client
        const audioUrl = `/${audioFileName}`; // Relative URL for the client
        res.json({
            reply: geminiResponse,
            audioUrl: audioUrl
        });

    } catch (error) {
        console.error('Error processing chat request:', error.response ? error.response.data : error.message);
        // Send more specific error details if available from API responses
        if (error.response && error.response.data) {
             res.status(500).json({ error: 'Failed to process chat request.', details: error.response.data });
        } else {
             res.status(500).json({ error: 'Failed to process chat request.', details: error.message });
        }
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});