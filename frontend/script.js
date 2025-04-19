document.getElementById('pitchForm').addEventListener('submit', async (event) => {
    event.preventDefault(); // Prevent default form submission

    const loadingDiv = document.getElementById('loading');
    const responseTextP = document.getElementById('responseText');
    const responseAudio = document.getElementById('responseAudio');
    const submitButton = event.target.querySelector('button[type="submit"]');

    // Clear previous response and hide audio player
    responseTextP.textContent = '';
    responseAudio.src = '';
    responseAudio.style.display = 'none';
    loadingDiv.style.display = 'block'; // Show loading indicator
    submitButton.disabled = true;

    const formData = new FormData(event.target);
    const userPrompt = formData.get('userPrompt');
    const productInfo = {
        productName: formData.get('productName'),
        productDescription: formData.get('productDescription'),
        idealCustomer: formData.get('idealCustomer'),
        oneLinePitch: formData.get('oneLinePitch')
    };

    try {
        const response = await fetch('/chat', { // Calls the backend endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt: userPrompt, productInfo }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error || 'Unknown error'}`);
        }

        const data = await response.json();

        // Display text response
        responseTextP.textContent = data.reply;

        // Set and display audio player
        // Construct absolute URL for the audio source
        const audioUrl = `${window.location.origin}${data.audioUrl}`;
        responseAudio.src = audioUrl;
        responseAudio.style.display = 'block';
        // Optional: Autoplay the audio
        // responseAudio.play();

    } catch (error) {
        console.error('Error sending pitch:', error);
        responseTextP.textContent = `Error: ${error.message}`;
    } finally {
        loadingDiv.style.display = 'none'; // Hide loading indicator
        submitButton.disabled = false;
    }
});