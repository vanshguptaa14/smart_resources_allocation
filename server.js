require('dotenv').config(); // MUST be at the very top
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = process.env.PORT || 5000;

// --- API Configurations ---
// Using the API Key from .env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname)); 

// --- MongoDB Connection ---
// Using the Connection String from .env
const mongoURL = process.env.MONGO_URL; 

mongoose.connect(mongoURL)
    .then(() => console.log('✅ Connected to MongoDB Atlas (SevaAI 2.0)'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- Database Schemas ---

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, 
    role: { type: String, enum: ['ngo', 'volunteer'], required: true },
    regId: String,   
    skills: { type: String, default: "General Support" },  
    xp: { type: Number, default: 0 }, 
    impact: { type: Number, default: 0 }, 
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const NeedSchema = new mongoose.Schema({
    title: { type: String, required: true },
    requirement: String, 
    description: String,
    locationName: String, 
    coordinates: {
        lng: { type: Number, required: true },
        lat: { type: Number, required: true }
    },
    volunteersNeeded: { type: Number, default: 1 },
    category: String,
    priority: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Low' },
    aiScore: { type: Number, default: 0 },
    status: { type: String, default: 'Active' },
    ngoName: String,
    createdAt: { type: Date, default: Date.now }
});
const Need = mongoose.model('Need', NeedSchema);

// --- Static Page Serving ---
app.get("/", (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get("/ngo-dashboard", (req, res) => res.sendFile(path.join(__dirname, 'ngo-dashboard.html')));
app.get("/vol-dashboard", (req, res) => res.sendFile(path.join(__dirname, 'vol-dashboard.html')));


app.get('/api/config', (req, res) => {
    res.json({
        mapboxToken: process.env.MAPBOX_TOKEN
    });
});
// --- AI Analysis API ---
app.post('/api/analyze-need', async (req, res) => {
    try {
        const { title, description } = req.body;
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        
        const prompt = `Analyze this NGO social work requirement:
        Title: "${title}"
        Description: "${description}"
        Return ONLY a raw JSON object (no markdown) with: 
        1. "score": (A number 0-10) where 10 is extreme emergency.
        2. "category": (One of: "Medical", "Food", "Education", "Shelter", or "Other").
        (Note: Do not return priority as the user will set it manually).`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const cleanJson = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        
        res.json(JSON.parse(cleanJson));
    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ score: 1, category: "Other" });
    }
});

// --- NGO APIs ---

app.get('/api/volunteers', async (req, res) => {
    try {
        const volunteers = await User.find({ role: 'volunteer' })
            .select('name email skills xp impact')
            .sort({ xp: -1 });
        res.json(volunteers);
    } catch (error) {
        res.status(500).json({ message: "Error fetching volunteers" });
    }
});

app.post('/api/needs', async (req, res) => {
    try {
        const newNeed = new Need({
            ...req.body,
            volunteersNeeded: req.body.volunteers,
            aiScore: req.body.score 
        });
        await newNeed.save();
        res.status(201).json(newNeed);
    } catch (error) {
        console.error("Save Error:", error);
        res.status(500).json({ message: "Error saving requirement" });
    }
});

// --- Volunteer APIs ---

app.get('/api/needs', async (req, res) => {
    try {
        const needs = await Need.find({ status: 'Active' }).sort({ createdAt: -1 });
        res.json(needs);
    } catch (error) {
        res.status(500).json({ message: "Error fetching needs" });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const leaders = await User.find({ role: 'volunteer' })
            .select('name xp email') 
            .sort({ xp: -1 })
            .limit(10);
        res.json(leaders);
    } catch (error) {
        res.status(500).json({ message: "Leaderboard error" });
    }
});

// Example Express.js Route
app.post('/api/verify-impact', async (req, res) => {
    try {
        const { email, xpToAdd } = req.body;
        
        // 1. Find user in your database
        // 2. Add xpToAdd to their current XP
        // 3. Save the user
        
        // Mock response for testing:
        const updatedXP = 1500; // This should come from your DB logic
        
        res.json({ 
            success: true, 
            newXP: updatedXP 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// --- Auth APIs ---

app.post('/register', async (req, res) => {
    try {
        const { email } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: "User already exists." });

        const newUser = new User(req.body);
        await newUser.save();
        res.status(201).json({ message: "Registration successful!" });
    } catch (error) {
        res.status(500).json({ message: "Server error." });
    }
});

app.post('/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        const user = await User.findOne({ email, role });

        if (!user || user.password !== password) {
            return res.status(401).json({ message: "Invalid credentials." });
        }

        res.status(200).json({ 
            message: "Login successful", 
            user: { name: user.name, email: user.email, role: user.role, xp: user.xp, impact: user.impact } 
        });
    } catch (error) {
        res.status(500).json({ message: "Server error." });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 SevaAI Server running on http://localhost:${PORT}`);
});