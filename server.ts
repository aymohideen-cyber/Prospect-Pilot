import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";
import serverless from "serverless-http";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // --- API Routes ---

  // 1. Lead Scraping via Geoapify
  app.post("/api/leads", async (req, res) => {
    const { niche, city, state, category } = req.body;
    const apiKey = process.env.GEOAPIFY_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "Geoapify API key missing" });
    }

    try {
      // Step 1: Geocoding
      const geoUrl = `https://api.geoapify.com/v1/geocode/search?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&country=USA&apiKey=${apiKey}`;
      const geoResponse = await axios.get(geoUrl);
      
      if (!geoResponse.data.features || geoResponse.data.features.length === 0) {
        return res.status(404).json({ error: "City not found" });
      }

      const feature = geoResponse.data.features[0];
      const { lat, lon } = feature.properties;
      const placeId = feature.properties.place_id;

      // Step 2: Places API
      const categories = category || "healthcare.dentist";
      let placesUrl = `https://api.geoapify.com/v2/places?categories=${categories}&filter=place:${placeId}&limit=20&apiKey=${apiKey}`;
      let placesResponse = await axios.get(placesUrl);

      if (placesResponse.data.features.length === 0) {
        // Fallback to radius
        placesUrl = `https://api.geoapify.com/v2/places?categories=${categories}&filter=circle:${lon},${lat},15000&limit=20&apiKey=${apiKey}`;
        placesResponse = await axios.get(placesUrl);
      }

      const leads = placesResponse.data.features
        .map((f: any) => ({
          name: f.properties.name,
          website: f.properties.website,
          address: f.properties.address_line2,
          place_id: f.properties.place_id,
          lat: f.properties.lat,
          lon: f.properties.lon,
        }))
        .filter((l: any) => l.website && l.website.startsWith("http") && l.name);

      res.json(leads);
    } catch (error: any) {
      console.error("Geoapify error:", error.message);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  // 2. Email extraction
  app.post("/api/extract-email", async (req, res) => {
    const { website } = req.body;
    if (!website) return res.status(400).json({ error: "Website required" });

    const candidatePaths = [
      "",
      "/contact",
      "/contact-us",
      "/about",
      "/about-us",
      "/team",
      "/locations",
      "/location"
    ];

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const foundEmails = new Set<string>();

    try {
      const baseUrl = website.endsWith("/") ? website.slice(0, -1) : website;

      // Parallelize checking paths
      await Promise.all(candidatePaths.map(async (path) => {
        try {
          const response = await axios.get(`${baseUrl}${path}`, {
            timeout: 5000,
            validateStatus: (status) => status < 500,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
          });

          if (response.status === 200) {
            const html = response.data;
            const matches = html.match(emailRegex);
            if (matches) {
              matches.forEach((email: string) => {
                const lower = email.toLowerCase();
                // Filter out junk
                if (!lower.includes("sentry") && 
                    !lower.includes("noreply") && 
                    !lower.includes("wix") && 
                    !lower.includes("godaddy") &&
                    !lower.match(/\.(png|jpg|jpeg|gif|svg|webp|retina|2x)$/)) {
                  foundEmails.add(lower);
                }
              });
            }
          }
        } catch (e) {
          // Ignore 404s or timeouts for subpages
        }
      }));

      const emails = Array.from(foundEmails);
      
      // Smart sorting
      const sorted = emails.sort((a, b) => {
        // Priority 1: personal-looking (contains .)
        const aPersonal = a.split("@")[0].includes(".");
        const bPersonal = b.split("@")[0].includes(".");
        if (aPersonal && !bPersonal) return -1;
        if (!aPersonal && bPersonal) return 1;

        // Priority 2: generic good ones
        const generics = ["info@", "contact@", "hello@", "support@"];
        const aGen = generics.some(g => a.startsWith(g));
        const bGen = generics.some(g => b.startsWith(g));
        if (aGen && !bGen) return -1;
        if (!aGen && bGen) return 1;

        return 0;
      });

      res.json({ email: sorted[0] || null, all: sorted });
    } catch (error: any) {
      res.status(500).json({ error: "Extraction failed" });
    }
  });

  // 3. AI Audit & Draft
  app.post("/api/audit", async (req, res) => {
    const { website, screenshotUrl } = req.body;
    
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            text: `
        You are a conversion rate optimization expert. 
        Analyze this website screenshot: ${screenshotUrl}.
        Website URL: ${website}

        Task 1: AI Audit Detail
        Identify one specific, critical flaw in their current website (e.g., weak hero section, slow load indicator, missing CTA, poor mobile spacing).
        Keep it brief and data-driven.
        
        Task 2: Cold Email Draft
        Follow the "Observation -> Insight -> Gap" framework.
        - No flattery. No "I hope you're well". No "I noticed your website".
        - Subject: 2-4 words, lowercase, specific (e.g., "your hero section layout").
        - Body: "I was looking at your site and the [Specific Detail] is [Problem]. Usually, this makes it harder for customers to [Action]. I recorded a 2-min video on how to fix this. Worth a look?"
        - Signature: Animesh, ProspectPilot

        Task 3: Score
        Assign a score (0-100) based on conversion quality. 
        
        Return JSON format:
        {
          "audit": "The specific detail and finding",
          "emailSubject": "The subject line",
          "emailBody": "The body content",
          "score": 85
        }
      `
          }
        ],
        config: {
          responseMimeType: "application/json"
        }
      });

      const text = response.text;
      if (text) {
        res.json(JSON.parse(text));
      } else {
        res.status(500).json({ error: "Failed to get AI response" });
      }
    } catch (error: any) {
      console.error("Audit error:", error);
      res.status(500).json({ error: "Audit failed" });
    }
  });

  // --- Vite Middleware ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // --- Serverless Wrapper ---
  const handler = serverless(app);

  if (process.env.NODE_ENV !== "production" || !process.env.LAMBDA_TASK_ROOT) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

  return app;
}

startServer();
