// filepath: c:\Users\avsad\Storage\Programming\PitchPerfect\server.js
const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const cors = require('cors');
// Fix the node-fetch import for compatibility
const fetch = require('node-fetch');

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Check for API keys right at the start
if (!process.env.GOOGLE_API_KEY) {
    console.error('\x1b[31m%s\x1b[0m', 'ERROR: GOOGLE_API_KEY not found in .env file');
}
if (!process.env.ELEVENLABS_API_KEY) {
    console.error('\x1b[31m%s\x1b[0m', 'ERROR: ELEVENLABS_API_KEY not found in .env file');
}
if (!process.env.ELEVENLABS_VOICE_ID) {
    console.error('\x1b[31m%s\x1b[0m', 'ERROR: ELEVENLABS_VOICE_ID not found in .env file');
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));  // Increase JSON limit
app.use(express.static(path.join(__dirname)));

// Debug endpoint
app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'API is running',
        googleApiKeyPresent: !!process.env.GOOGLE_API_KEY,
        elevenLabsApiKeyPresent: !!process.env.ELEVENLABS_API_KEY,
        elevenLabsVoiceIdPresent: !!process.env.ELEVENLABS_VOICE_ID
    });
});

// API Proxy endpoints
app.post('/api/gemini', async (req, res) => {
  try {
    const { messages } = req.body;
    
    // Create a single text content from the messages
    let prompt = "";
    
    // Process messages into a conversation format
    messages.forEach(msg => {
      const roleLabel = msg.role === 'assistant' ? 'Prospect: ' : 
                         msg.role === 'system' ? 'System: ' : 'User: ';
      prompt += `${roleLabel}${msg.content}\n\n`;
    });

    // Make request to Gemini API using the correct format - now using gemini-2.0-flash
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${process.env.GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 800,
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Gemini API error: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    
    // Extract the response text
    const aiResponse = data.candidates[0].content.parts[0].text;
    
    // If the response starts with "Prospect:", remove it
    const cleanedResponse = aiResponse.startsWith("Prospect:") 
      ? aiResponse.substring("Prospect:".length).trim() 
      : aiResponse;
    
    res.json({ response: cleanedResponse });
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    res.status(500).json({ error: 'Failed to get AI response' });
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body;
    
    // Call ElevenLabs API for text-to-speech
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: text,
        model_id: "eleven_turbo_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    // Get audio as arrayBuffer
    const audioBuffer = await response.arrayBuffer();
    
    // Set appropriate headers
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.byteLength
    });
    
    // Send audio data directly to client
    res.send(Buffer.from(audioBuffer));
    
  } catch (error) {
    console.error('Error calling TTS API:', error);
    res.status(500).json({ error: 'Failed to generate speech' });
  }
});

app.post('/api/feedback', async (req, res) => {
  try {
    const { conversation, scenario } = req.body;
    
    // Create an improved prompt for feedback analysis
    const feedbackPrompt = `
      Analyze this sales pitch conversation between a salesperson and a prospect.
      
      CONTEXT:
      Product/Service: ${scenario.product}
      Prospect Type: ${scenario.prospectType}
      Salesperson's Goal: ${scenario.goal}
      
      CONVERSATION TRANSCRIPT:
      ${conversation}
      
      Please provide detailed, actionable feedback on the salesperson's performance.
      Format your analysis as clean HTML with clear sections, using <div>, <h4>, <p>, <ul>, and <li> tags for structure.
      
      Include the following sections:
      
      1. PERFORMANCE METRICS:
         - Rate each area on a scale of 1-10 and provide specific examples from the conversation:
         - Opening/Rapport Building: How well did the salesperson establish rapport and set the tone?
         - Needs Discovery: How effectively did they uncover the prospect's needs through questions?
         - Value Proposition: How clearly did they communicate the product's benefits?
         - Objection Handling: How skillfully did they address concerns or resistance?
         - Active Listening: Did they truly listen and adapt to the prospect's responses?
         - Closing Technique: How effectively did they move towards their stated goal?
      
      2. KEY MOMENTS:
         - Identify 3-5 pivotal moments in the conversation that significantly impacted the outcome.
         - For each moment, explain what happened, why it was important, and what the salesperson did right or could have done better.
      
      3. STRENGTHS AND AREAS FOR IMPROVEMENT:
         - List 2-3 specific things the salesperson did well, with examples.
         - Identify 2-3 areas where they could improve, with specific examples.
      
      4. ACTIONABLE RECOMMENDATIONS:
         - Provide 3-5 specific, practical techniques or approaches the salesperson could use next time.
         - Include exact phrasing examples where appropriate.
         - Make recommendations relevant to both this specific scenario and general sales skills.
      
      Make your feedback constructive, specific, and actionable. Use a professional, coaching tone.
    `;
    
    // Call Gemini API for feedback generation - now using gemini-2.0-flash
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${process.env.GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: feedbackPrompt }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2500, // Increased for more detailed feedback
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Gemini API error: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    const feedbackText = data.candidates[0].content.parts[0].text;
    
    // Parse feedback sections with improved regex patterns
    const metricsMatch = feedbackText.match(/<h4>.*?Performance Metrics.*?<\/h4>([\s\S]*?)(?=<h4>|$)/i) || 
                        feedbackText.match(/<div[^>]*>.*?Performance Metrics.*?([\s\S]*?)(?=<div[^>]*>|$)/i);
    
    const keyMomentsMatch = feedbackText.match(/<h4>.*?Key Moments.*?<\/h4>([\s\S]*?)(?=<h4>|$)/i) || 
                           feedbackText.match(/<div[^>]*>.*?Key Moments.*?([\s\S]*?)(?=<div[^>]*>|$)/i);
    
    const strengthsMatch = feedbackText.match(/<h4>.*?Strengths.*?<\/h4>([\s\S]*?)(?=<h4>|$)/i) || 
                          feedbackText.match(/<div[^>]*>.*?Strengths.*?([\s\S]*?)(?=<div[^>]*>|$)/i);
    
    const recommendationsMatch = feedbackText.match(/<h4>.*?Recommendations.*?<\/h4>([\s\S]*?)(?=<h4>|$)/i) || 
                               feedbackText.match(/<div[^>]*>.*?Recommendations.*?([\s\S]*?)(?=<div[^>]*>|$)/i);
    
    // Add some visual styling to the feedback
    const enhancedFeedback = {
      transcript: conversation,
      metrics: metricsMatch ? 
        `<div class="feedback-section-content">${metricsMatch[1].trim()}</div>` : 
        '<p>Performance analysis not available.</p>',
      
      keyMoments: keyMomentsMatch ? 
        `<div class="feedback-section-content">${keyMomentsMatch[1].trim()}</div>` : 
        '<p>Key moments analysis not available.</p>',
      
      feedback: strengthsMatch ? 
        `<div class="feedback-section-content">${strengthsMatch[1].trim()}</div>` : 
        '<p>Strengths and areas for improvement not available.</p>',
      
      recommendations: recommendationsMatch ? 
        `<div class="feedback-section-content">${recommendationsMatch[1].trim()}</div>` : 
        '<p>Recommendations not available.</p>'
    };
    
    // Send structured feedback to client
    res.json(enhancedFeedback);
    
  } catch (error) {
    console.error('Error generating feedback:', error);
    res.status(500).json({ error: 'Failed to generate feedback' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  
  // Check if API keys are set
  if (!process.env.GOOGLE_API_KEY) {
    console.warn('\x1b[33m%s\x1b[0m', 'Warning: GOOGLE_API_KEY is not set in .env file');
  }
  if (!process.env.ELEVENLABS_API_KEY) {
    console.warn('\x1b[33m%s\x1b[0m', 'Warning: ELEVENLABS_API_KEY is not set in .env file');
  }
  if (!process.env.ELEVENLABS_VOICE_ID) {
    console.warn('\x1b[33m%s\x1b[0m', 'Warning: ELEVENLABS_VOICE_ID is not set in .env file');
  }
});