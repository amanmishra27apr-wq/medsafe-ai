import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Initialize Database
  const db = new Database("medsafe.db");
  db.exec(`
    CREATE TABLE IF NOT EXISTS medicines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      active_salts TEXT,
      common_uses TEXT,
      interactions TEXT -- JSON string of interacting drugs
    );
  `);

  // Seed some initial data if empty
  const count = db.prepare("SELECT count(*) as count FROM medicines").get() as { count: number };
  if (count.count === 0) {
    const insert = db.prepare("INSERT INTO medicines (name, active_salts, common_uses, interactions) VALUES (?, ?, ?, ?)");
    insert.run("Paracetamol", "Acetaminophen", "Pain relief, Fever", JSON.stringify(["Alcohol", "Warfarin"]));
    insert.run("Ibuprofen", "Ibuprofen", "Pain relief, Inflammation", JSON.stringify(["Aspirin", "Warfarin", "Lisinopril"]));
    insert.run("Amoxicillin", "Amoxicillin", "Antibiotic", JSON.stringify(["Methotrexate"]));
    insert.run("Metformin", "Metformin", "Diabetes", JSON.stringify(["Contrast dye", "Alcohol"]));
    insert.run("Atorvastatin", "Atorvastatin", "Cholesterol", JSON.stringify(["Grapefruit juice", "Clarithromycin"]));
  }

  // API Routes
  app.get("/api/medicines", (req, res) => {
    const query = req.query.q as string;
    if (query) {
      const results = db.prepare("SELECT * FROM medicines WHERE name LIKE ?").all(`%${query}%`);
      res.json(results);
    } else {
      const results = db.prepare("SELECT * FROM medicines LIMIT 50").all();
      res.json(results);
    }
  });

  app.post("/api/check-interactions", (req, res) => {
    const { meds } = req.body; // Array of names
    if (!meds || !Array.isArray(meds)) return res.status(400).json({ error: "Invalid meds list" });

    const interactionsFound: any[] = [];
    const dbMeds = db.prepare(`SELECT * FROM medicines WHERE name IN (${meds.map(() => '?').join(',')})`).all(...meds) as any[];

    for (let i = 0; i < dbMeds.length; i++) {
      const medA = dbMeds[i];
      const medAInteractions = JSON.parse(medA.interactions || "[]");
      
      for (let j = i + 1; j < dbMeds.length; j++) {
        const medB = dbMeds[j];
        if (medAInteractions.includes(medB.name)) {
          interactionsFound.push({ med1: medA.name, med2: medB.name, severity: "High" });
        }
      }
    }

    res.json({ interactions: interactionsFound });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
