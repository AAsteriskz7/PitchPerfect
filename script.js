// PitchPerfect - Main JavaScript file

// DOM Elements
const scenarioSetup = document.getElementById('scenario-setup');
const conversationInterface = document.getElementById('conversation-interface');
const feedbackDisplay = document.getElementById('feedback-display');
const transcriptContainer = document.getElementById('transcript');
const aiStatus = document.getElementById('ai-status');
const micButton = document.getElementById('mic-button');
const micStatus = document.getElementById('mic-status');
const finalTranscriptElement = document.getElementById('final-transcript');

// Scenario Elements
const scenarioSelect = document.getElementById('scenario-select');
const randomScenarioButton = document.getElementById('random-scenario-button');
const productNameInput = document.getElementById('product-name');
const prospectTypeInput = document.getElementById('prospect-type');
const scenarioGoalInput = document.getElementById('scenario-goal');
const startSessionButton = document.getElementById('start-session-button');
const endSessionButton = document.getElementById('end-session-button');
const newSessionButton = document.getElementById('new-session-button');

// Speech Recognition
let recognition;
let isRecognizing = false;
let conversationHistory = [];
let fullConversationText = '';
let isAISpeaking = false;

// Add this function near the top of the file
function checkApiStatus() {
    fetch('/api/status')
        .then(response => response.json())
        .then(data => {
            if (!data.googleApiKeyPresent || !data.elevenLabsApiKeyPresent || !data.elevenLabsVoiceIdPresent) {
                const missingKeys = [];
                if (!data.googleApiKeyPresent) missingKeys.push("Google API Key");
                if (!data.elevenLabsApiKeyPresent) missingKeys.push("ElevenLabs API Key");
                if (!data.elevenLabsVoiceIdPresent) missingKeys.push("ElevenLabs Voice ID");
                
                alert(`Missing API key(s): ${missingKeys.join(", ")}. Please check your .env file.`);
            }
        })
        .catch(error => {
            console.error('Error checking API status:', error);
        });
}

// Initialize the application
function init() {
    // Check API status first
    checkApiStatus();
    
    // Setup event listeners
    startSessionButton.addEventListener('click', startSession);
    endSessionButton.addEventListener('click', endSession);
    newSessionButton.addEventListener('click', resetApp);
    micButton.addEventListener('click', toggleListening);
    randomScenarioButton.addEventListener('click', generateRandomScenario);
    scenarioSelect.addEventListener('change', handleScenarioChange);

    // Initialize Web Speech API
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        // Increased timeout for ending speech recognition
        recognition.interimResults = true;
        
        // Extend the speech detection timeout to be more forgiving of pauses
        recognition.maxAlternatives = 1;
        
        recognition.onstart = () => {
            isRecognizing = true;
            micButton.classList.add('listening');
            updateStatus('Listening...');
        };
        
        recognition.onresult = handleSpeechResult;
        
        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            updateStatus('Error: ' + event.error);
            isRecognizing = false;
            micButton.classList.remove('listening', 'speaking');
        };
        
        recognition.onend = () => {
            // Only update status if we're not in the middle of processing speech
            if (!window.speechTimeout) {
                isRecognizing = false;
                if (!isAISpeaking) {
                    micButton.classList.remove('listening', 'speaking');
                    updateStatus('Idle - Click mic to speak');
                }
            } else {
                // If there's a pending speech processing, restart recognition
                // This helps with longer pauses
                if (!isAISpeaking) {
                    recognition.start();
                }
            }
        };
    } else {
        alert('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
        micButton.disabled = true;
    }

    // Initialize with custom scenario selected
    handleScenarioChange();
}

// Handle scenario selection change
function handleScenarioChange() {
    const customInputs = document.getElementById('custom-scenario-inputs');
    if (scenarioSelect.value === 'custom') {
        customInputs.style.display = 'block';
    } else {
        customInputs.style.display = 'none';
        loadPredefinedScenario(scenarioSelect.value);
    }
}

// Load a predefined scenario
function loadPredefinedScenario(scenarioType) {
    switch (scenarioType) {
        case 'product_launch':
            productNameInput.value = 'FlexiDesk Pro';
            prospectTypeInput.value = 'Office Manager at a growing tech startup';
            scenarioGoalInput.value = 'Schedule a product demo with the decision maker.';
            break;
        case 'cold_outreach':
            productNameInput.value = 'CyberShield Enterprise';
            prospectTypeInput.value = 'CIO of a mid-size financial services company';
            scenarioGoalInput.value = 'Qualify their security needs and book a follow-up call.';
            break;
        case 'objection_handling':
            productNameInput.value = 'MarketBoost Analytics Suite';
            prospectTypeInput.value = 'Marketing Director who thinks your solution is too expensive';
            scenarioGoalInput.value = 'Address price objections and demonstrate ROI value.';
            break;
        default:
            break;
    }
}

// Generate a random scenario
function generateRandomScenario() {
    const products = [
        'CloudSync Pro', 'DataGuard Elite', 'ProductivityPlus', 'CustomerInsight AI',
        'SupplyChain Optimizer', 'TalentMatch Pro', 'FinanceFlow', 'MobileWorkspace'
    ];
    
    const prospects = [
        'CTO at a healthcare company', 'HR Director at a retail chain',
        'Operations Manager at a manufacturing plant', 'Marketing VP at a SaaS startup',
        'CFO at a non-profit organization', 'IT Manager at a university',
        'Supply Chain Director at a food distributor', 'Sales Manager at a tech company'
    ];
    
    const goals = [
        'Schedule a product demo with the team', 'Get commitment for a free trial',
        'Identify key decision makers in the organization', 'Qualify their needs and budget',
        'Overcome initial objections to your pricing model', 'Upsell additional features to existing client',
        'Close a deal before the quarter ends', 'Gather requirements for a custom solution'
    ];
    
    productNameInput.value = products[Math.floor(Math.random() * products.length)];
    prospectTypeInput.value = prospects[Math.floor(Math.random() * prospects.length)];
    scenarioGoalInput.value = goals[Math.floor(Math.random() * goals.length)];
    
    // Force select the custom option
    scenarioSelect.value = 'custom';
    document.getElementById('custom-scenario-inputs').style.display = 'block';
}

// Start a new practice session
function startSession() {
    const productName = productNameInput.value.trim();
    const prospectType = prospectTypeInput.value.trim();
    const scenarioGoal = scenarioGoalInput.value.trim();
    
    if (!productName || !prospectType || !scenarioGoal) {
        alert('Please fill in all scenario fields before starting.');
        return;
    }
    
    // Clear previous conversation
    conversationHistory = [];
    fullConversationText = '';
    transcriptContainer.innerHTML = '';
    
    // Switch to conversation interface
    scenarioSetup.classList.add('hidden');
    conversationInterface.classList.remove('hidden');
    feedbackDisplay.classList.add('hidden');
    
    // Generate initial AI message based on scenario
    const initialPrompt = createInitialPrompt(productName, prospectType, scenarioGoal);
    
    // Send initial prompt to get the conversation started
    fetchAIResponse(initialPrompt, true);
}

// Create the initial prompt for the AI based on the scenario
function createInitialPrompt(productName, prospectType, scenarioGoal) {
    return {
        role: "system",
        content: `You are simulating a sales prospect for a practice sales conversation. 
        The salesperson is pitching ${productName}. 
        You are acting as a ${prospectType}.
        The salesperson's goal is to ${scenarioGoal}
        
        Instructions for how to behave:
        1. Act realistically and naturally as this specific prospect type.
        2. Ask questions about the product and show appropriate levels of interest or skepticism.
        3. Present realistic objections that salespeople commonly face.
        4. Respond appropriately to the salesperson's pitching techniques.
        5. Keep responses concise and conversational (1-3 sentences per turn).
        6. Never break character or reveal that you're an AI.
        7. Don't be too easy - make the salesperson work to achieve their goal.
        
        Start by introducing yourself briefly as the prospect and asking a simple opening question to let the salesperson begin their pitch.`
    };
}

// Modify fetchAIResponse for better error handling
async function fetchAIResponse(message, isInitial = false) {
    try {
        // Clear any pending speech timeout
        if (window.speechTimeout) {
            clearTimeout(window.speechTimeout);
            window.speechTimeout = null;
        }
        
        // Clear any interim transcript
        clearInterimTranscript();
        
        updateStatus('AI is thinking...');

        // Add user message to conversation history if this isn't the initial prompt
        if (!isInitial) {
            conversationHistory.push({
                role: "user",
                content: message
            });
        } else {
            // If it's the initial prompt, it's a system message
            conversationHistory.push(message);
        }

        // Update the UI to show we're waiting for a response
        const loadingIndicator = document.createElement('li');
        loadingIndicator.className = 'ai-message';
        loadingIndicator.id = 'loading-indicator';
        
        const label = document.createElement('span');
        label.className = 'message-label';
        label.textContent = 'Prospect';
        
        const loadingText = document.createElement('div');
        loadingText.innerHTML = '<span class="loading-dots">Thinking<span>.</span><span>.</span><span>.</span></span>';
        
        loadingIndicator.appendChild(label);
        loadingIndicator.appendChild(loadingText);
        transcriptContainer.appendChild(loadingIndicator);
        
        // Scroll to the loading indicator
        const transcriptContainerElement = document.getElementById('transcript-container');
        transcriptContainerElement.scrollTop = transcriptContainerElement.scrollHeight;

        // Prepare the request body
        const requestBody = {
            messages: conversationHistory
        };

        // Make the API call to our backend
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        // Remove the loading indicator
        const loadingElem = document.getElementById('loading-indicator');
        if (loadingElem) {
            loadingElem.remove();
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const aiMessage = data.response;

        // Add AI response to conversation history
        conversationHistory.push({
            role: "assistant",
            content: aiMessage
        });

        // Update the transcript with the AI's response
        updateTranscript(aiMessage, 'ai');
        fullConversationText += `AI: ${aiMessage}\n\n`;

        // Play the AI response using Text-to-Speech
        playAIResponse(aiMessage);

    } catch (error) {
        console.error('Error fetching AI response:', error);
        updateStatus(`Error: ${error.message}`);
        
        // Remove any loading indicator if it exists
        const loadingElem = document.getElementById('loading-indicator');
        if (loadingElem) {
            loadingElem.remove();
        }
        
        // Display error in the transcript
        const errorMessage = "Sorry, I encountered an error processing your request. Please try again or check the API keys.";
        updateTranscript(errorMessage, 'ai');
    }
}

// Play AI response using Eleven Labs TTS
async function playAIResponse(text) {
    try {
        updateStatus('AI is speaking...');
        isAISpeaking = true;
        micButton.classList.add('speaking');
        
        // Pause speech recognition while AI is speaking
        if (isRecognizing) {
            recognition.stop();
        }

        // Request TTS audio from our backend
        const response = await fetch('/api/tts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text })
        });

        if (!response.ok) {
            throw new Error(`TTS API error: ${response.status}`);
        }

        // Get audio blob and play it
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        audio.onended = () => {
            isAISpeaking = false;
            micButton.classList.remove('speaking');
            updateStatus('Idle - Click mic to speak');
            
            // Auto-restart speech recognition when AI finishes speaking
            if (!isRecognizing) {
                toggleListening();
            }
        };

        audio.play().catch(e => {
            console.error('Error playing audio:', e);
            isAISpeaking = false;
            updateStatus('Error playing audio');
        });

    } catch (error) {
        console.error('Error with TTS:', error);
        isAISpeaking = false;
        updateStatus('Error with speech synthesis');
        micButton.classList.remove('speaking');
    }
}

// Handle speech recognition results
function handleSpeechResult(event) {
    let interimTranscript = '';
    let finalTranscript = '';
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
            finalTranscript += transcript;
        } else {
            interimTranscript += transcript;
        }
    }
    
    // Show interim transcript in a temporary element
    if (interimTranscript) {
        updateInterimTranscript(interimTranscript);
    }
    
    if (finalTranscript) {
        // Clear any speech timeout that might be pending
        if (window.speechTimeout) {
            clearTimeout(window.speechTimeout);
        }
        
        // Add a delay before processing to allow for natural pauses in speech
        window.speechTimeout = setTimeout(() => {
            // User has finished speaking, process the final transcript
            updateStatus('Processing your response...');
            updateTranscript(finalTranscript, 'user');
            fullConversationText += `User: ${finalTranscript}\n\n`;
            fetchAIResponse(finalTranscript);
            
            // Clear interim transcript
            clearInterimTranscript();
        }, 1500); // 1.5 second delay to allow for pauses
    }
}

// Add these two new functions to handle interim transcript display
function updateInterimTranscript(text) {
    // Check if we already have an interim element
    let interimElement = document.getElementById('interim-transcript');
    
    if (!interimElement) {
        // Create a new interim transcript element if it doesn't exist
        interimElement = document.createElement('li');
        interimElement.className = 'user-message interim';
        interimElement.id = 'interim-transcript';
        
        const label = document.createElement('span');
        label.className = 'message-label';
        label.textContent = 'You (typing...)';
        
        const messageText = document.createElement('div');
        messageText.textContent = text;
        
        interimElement.appendChild(label);
        interimElement.appendChild(messageText);
        transcriptContainer.appendChild(interimElement);
    } else {
        // Update existing interim element
        const messageText = interimElement.querySelector('div');
        messageText.textContent = text;
    }
    
    // Scroll to the interim message
    const transcriptContainerElement = document.getElementById('transcript-container');
    transcriptContainerElement.scrollTop = transcriptContainerElement.scrollHeight;
}

function clearInterimTranscript() {
    const interimElement = document.getElementById('interim-transcript');
    if (interimElement) {
        interimElement.remove();
    }
}

// Update the conversation transcript display
function updateTranscript(message, speaker) {
    const li = document.createElement('li');
    li.className = speaker === 'user' ? 'user-message' : 'ai-message';
    
    const label = document.createElement('span');
    label.className = 'message-label';
    label.textContent = speaker === 'user' ? 'You' : 'Prospect';
    
    const messageText = document.createElement('div');
    messageText.textContent = message;
    
    li.appendChild(label);
    li.appendChild(messageText);
    transcriptContainer.appendChild(li);
    
    // Scroll to the latest message
    const transcriptContainerElement = document.getElementById('transcript-container');
    transcriptContainerElement.scrollTop = transcriptContainerElement.scrollHeight;
}

// Toggle speech recognition on/off
function toggleListening() {
    if (isAISpeaking) {
        return; // Don't allow toggling while AI is speaking
    }
    
    if (isRecognizing) {
        recognition.stop();
        updateStatus('Idle - Click mic to speak');
    } else {
        recognition.start();
    }
}

// Update the status display
function updateStatus(message) {
    aiStatus.textContent = `${message}`;
}

// End the current session and get feedback
async function endSession() {
    // Stop any active listening or speaking
    if (isRecognizing) {
        recognition.stop();
    }
    
    updateStatus('Generating feedback...');
    
    try {
        // Request feedback analysis from our backend
        const response = await fetch('/api/feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                conversation: fullConversationText,
                scenario: {
                    product: productNameInput.value,
                    prospectType: prospectTypeInput.value,
                    goal: scenarioGoalInput.value
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Feedback API error: ${response.status}`);
        }

        const feedbackData = await response.json();
        
        // Display feedback
        displayFeedback(feedbackData);
        
        // Switch to feedback view
        conversationInterface.classList.add('hidden');
        feedbackDisplay.classList.remove('hidden');
        
    } catch (error) {
        console.error('Error generating feedback:', error);
        alert('Error generating feedback. Please try again.');
        updateStatus('Error generating feedback');
    }
}

// Display feedback from the AI - Enhanced version
function displayFeedback(feedback) {
    // Display the full conversation transcript
    finalTranscriptElement.textContent = feedback.transcript || fullConversationText;
    
    // Apply enhanced styling to metrics section
    const metricsElement = document.getElementById('metrics');
    metricsElement.innerHTML = feedback.metrics || '<p>No metrics available</p>';
    
    // Apply enhanced styling to key moments section
    const keyMomentsElement = document.getElementById('key-moments');
    keyMomentsElement.innerHTML = feedback.keyMoments || '<p>No key moments identified</p>';
    
    // Apply enhanced styling to AI feedback section
    const aiFeedbackElement = document.getElementById('ai-feedback');
    aiFeedbackElement.innerHTML = feedback.feedback || '<p>No feedback available</p>';
    
    // Apply enhanced styling to recommendations section
    const recommendationsElement = document.getElementById('recommendations');
    recommendationsElement.innerHTML = feedback.recommendations || '<p>No recommendations available</p>';
    
    // Automatically highlight scores in metrics section
    const scoreRegex = /(\d+)(\s*\/\s*10|\s*out of\s*10)/g;
    metricsElement.innerHTML = metricsElement.innerHTML.replace(
        scoreRegex, 
        '<span class="metric-score">$1/10</span>'
    );
    
    // Add special styling to strengths and areas for improvement
    const strengthElements = aiFeedbackElement.querySelectorAll('li, p');
    strengthElements.forEach((el, index) => {
        if (index < strengthElements.length / 2) {
            el.classList.add('strength');
        } else {
            el.classList.add('improvement');
        }
    });
    
    // Add special styling to recommendations
    const recommendationElements = recommendationsElement.querySelectorAll('li, p');
    recommendationElements.forEach(el => {
        el.classList.add('recommendation');
    });
}

// Reset the application to start a new session
function resetApp() {
    // Clear conversation history
    conversationHistory = [];
    fullConversationText = '';
    
    // Reset UI elements
    transcriptContainer.innerHTML = '';
    
    // Show scenario setup screen
    scenarioSetup.classList.remove('hidden');
    conversationInterface.classList.add('hidden');
    feedbackDisplay.classList.add('hidden');
    
    updateStatus('Idle - Click mic to speak');
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);
