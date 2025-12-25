const axios = require('axios');
const he = require('he');
const { v4: uuidv4 } = require('uuid');

// Helper to pause execution
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const pickOption = (input, fallback) => {
    if (Array.isArray(input)) {
        if (input.length === 0) return fallback;
        return input[Math.floor(Math.random() * input.length)];
    }
    return input ?? fallback;
};

async function fetchQuestions(amount = 10, difficulties = 'medium', categories = '') {
    const questions = [];

    while (questions.length < amount) {
        const diff = pickOption(difficulties, 'any');
        const cat = pickOption(categories, '');
        const batchSize = Math.min(50, amount - questions.length); // OpenTDB caps at 50 per call
        const batch = await fetchQuestionsBatch(batchSize, diff, cat);
        questions.push(...batch);
    }

    return questions.slice(0, amount);
}

async function fetchQuestionsBatch(amount, difficulty, category) {
    let url = `https://opentdb.com/api.php?amount=${amount}&type=multiple`;
    if (difficulty && difficulty !== 'any') url += `&difficulty=${difficulty}`;
    if (category && category !== 'any') url += `&category=${category}`;

    try {
        console.log(`[TRIVIA] Fetching: ${url}`);
        const res = await axios.get(url, { timeout: 5000 });

        if (res.data.response_code !== 0) throw new Error(`API Error ${res.data.response_code}`);
        
        console.log(`[TRIVIA] Success! Got ${res.data.results.length} questions.`);
        return res.data.results.map(normalize);

    } catch (error) {
        // --- 429 RATE LIMIT HANDLER ---
        if (error.response && error.response.status === 429) {
            console.warn("⚠️ [TRIVIA] Rate Limited (429). Waiting 5 seconds to retry...");
            await sleep(5000); // Wait for the limit to reset
            
            try {
                console.log("🔄 [TRIVIA] Retrying...");
                const retryRes = await axios.get(url, { timeout: 5000 });
                return retryRes.data.results.map(normalize);
            } catch (retryError) {
                console.error("❌ [TRIVIA] Retry failed.");
            }
        }
        
        // --- FALLBACK TO BACKUP ---
        console.error("⚠️ [TRIVIA] API FAILED. Switching to Offline Backup Mode.");
        return getBackupQuestions(amount);
    }
}

function normalize(q) {
    const correctAnswerId = uuidv4();
    const answers = [
        { id: correctAnswerId, text: he.decode(q.correct_answer || "") },
        ...q.incorrect_answers.map(ans => ({ id: uuidv4(), text: he.decode(ans || "") }))
    ].sort(() => Math.random() - 0.5);

    return {
        id: uuidv4(),
        text: he.decode(q.question || ""),
        answers,
        correctAnswerId,
        category: q.category || 'General'
    };
}

function getBackupQuestions(amount) {
    const backups = [
        {
            category: "Backup Mode",
            question: "What is the capital of France?",
            correct_answer: "Paris",
            incorrect_answers: ["London", "Berlin", "Madrid"]
        },
        {
            category: "Backup Mode",
            question: "Which planet is closest to the Sun?",
            correct_answer: "Mercury",
            incorrect_answers: ["Venus", "Mars", "Jupiter"]
        },
        {
            category: "Backup Mode",
            question: "How many legs does a spider have?",
            correct_answer: "8",
            incorrect_answers: ["6", "10", "12"]
        },
        {
            category: "Backup Mode",
            question: "What is H2O?",
            correct_answer: "Water",
            incorrect_answers: ["Gold", "Silver", "Salt"]
        }
    ];

    // Repeat questions to fill the requested amount
    let results = [];
    while (results.length < amount) {
        results = results.concat(backups);
    }
    
    return results.slice(0, amount).map(normalize);
}

module.exports = { fetchQuestions };
