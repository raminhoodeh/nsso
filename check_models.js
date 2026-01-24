const https = require('https');
const fs = require('fs');
const path = require('path');

// Read .env.local manually since we can't use dotenv package easily if not installed
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

let apiKey = '';
const match = envContent.match(/GOOGLE_GENERATIVE_AI_API_KEY=(.+)/);
if (match) {
    apiKey = match[1].trim();
} else {
    console.error("Could not find API KEY");
    process.exit(1);
}

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.models) {
                console.log("\nAVAILABLE MODELS:");
                json.models.forEach(m => {
                    if (m.supportedGenerationMethods.includes('generateContent')) {
                        console.log(`- ${m.name.replace('models/', '')}`);
                        console.log(`  Version: ${m.version}`);
                        console.log(`  Methods: ${m.supportedGenerationMethods.join(', ')}`);
                    }
                });
            } else {
                console.log("No models found or error:", json);
            }
        } catch (e) {
            console.error("Error parsing JSON:", e);
            console.log("Raw output:", data);
        }
    });
}).on('error', (err) => {
    console.error("Error:", err.message);
});
