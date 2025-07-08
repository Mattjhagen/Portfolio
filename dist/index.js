// server/index.ts
import express2 from "express";

// server/routes.ts
import { createServer } from "http";
import multer from "multer";

// server/storage.ts
var MemStorage = class {
  portfolios;
  uploadedFiles;
  currentPortfolioId;
  currentFileId;
  constructor() {
    this.portfolios = /* @__PURE__ */ new Map();
    this.uploadedFiles = /* @__PURE__ */ new Map();
    this.currentPortfolioId = 1;
    this.currentFileId = 1;
  }
  async getPortfolio(id) {
    return this.portfolios.get(id);
  }
  async getPortfolioBySubdomain(subdomain) {
    return Array.from(this.portfolios.values()).find(
      (portfolio) => portfolio.subdomain === subdomain
    );
  }
  async createPortfolio(insertPortfolio) {
    const id = this.currentPortfolioId++;
    const portfolio = {
      ...insertPortfolio,
      id,
      createdAt: /* @__PURE__ */ new Date(),
      about: insertPortfolio.about || null,
      email: insertPortfolio.email || null,
      phone: insertPortfolio.phone || null,
      linkedin: insertPortfolio.linkedin || null,
      github: insertPortfolio.github || null,
      website: insertPortfolio.website || null,
      skills: Array.isArray(insertPortfolio.skills) ? insertPortfolio.skills : null,
      experience: Array.isArray(insertPortfolio.experience) ? insertPortfolio.experience : null,
      education: Array.isArray(insertPortfolio.education) ? insertPortfolio.education : null,
      projects: Array.isArray(insertPortfolio.projects) ? insertPortfolio.projects : null,
      theme: insertPortfolio.theme || "default",
      isPublic: insertPortfolio.isPublic || "true"
    };
    this.portfolios.set(id, portfolio);
    return portfolio;
  }
  async updatePortfolio(id, updates) {
    const portfolio = this.portfolios.get(id);
    if (!portfolio) return void 0;
    const updatedPortfolio = {
      ...portfolio,
      ...updates,
      skills: Array.isArray(updates.skills) ? updates.skills : portfolio.skills,
      experience: Array.isArray(updates.experience) ? updates.experience : portfolio.experience,
      education: Array.isArray(updates.education) ? updates.education : portfolio.education,
      projects: Array.isArray(updates.projects) ? updates.projects : portfolio.projects
    };
    this.portfolios.set(id, updatedPortfolio);
    return updatedPortfolio;
  }
  async getAllPortfolios() {
    return Array.from(this.portfolios.values());
  }
  async getUploadedFile(id) {
    return this.uploadedFiles.get(id);
  }
  async createUploadedFile(insertFile) {
    const id = this.currentFileId++;
    const file = {
      ...insertFile,
      id,
      createdAt: /* @__PURE__ */ new Date(),
      size: insertFile.size || 0,
      extractedText: insertFile.extractedText || null,
      portfolioId: insertFile.portfolioId || 0
    };
    this.uploadedFiles.set(id, file);
    return file;
  }
  async updateUploadedFile(id, updates) {
    const file = this.uploadedFiles.get(id);
    if (!file) return void 0;
    const updatedFile = {
      ...file,
      ...updates
    };
    this.uploadedFiles.set(id, updatedFile);
    return updatedFile;
  }
};
var storage = new MemStorage();

// server/services/file-parser.ts
import { fileURLToPath } from "url";
import { dirname } from "path";
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
async function extractTextFromFile(file) {
  const { buffer, mimetype, originalname } = file;
  try {
    switch (mimetype) {
      case "application/pdf":
        return await extractTextFromPDF(buffer);
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return await extractTextFromDOCX(buffer);
      case "text/plain":
        return buffer.toString("utf-8");
      default:
        throw new Error(`Unsupported file type: ${mimetype}`);
    }
  } catch (error) {
    console.error(`Error extracting text from ${originalname}:`, error);
    throw new Error(`Failed to extract text from ${originalname}: ${error.message}`);
  }
}
async function extractTextFromPDF(buffer) {
  try {
    const pdfParse = await import("pdf-parse");
    const data = await pdfParse.default(buffer);
    return data.text;
  } catch (error) {
    console.error("PDF parsing error:", error);
    throw new Error("Failed to parse PDF file. Please ensure it is a valid PDF.");
  }
}
async function extractTextFromDOCX(buffer) {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    console.error("DOCX parsing error:", error);
    throw new Error("Failed to parse DOCX file. Please ensure it is a valid Word document.");
  }
}
function validateFileType(mimetype) {
  const allowedTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain"
  ];
  return allowedTypes.includes(mimetype);
}
function validateFileSize(size) {
  const maxSize = 10 * 1024 * 1024;
  return size <= maxSize;
}

// server/services/openai.ts
import OpenAI from "openai";
var openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});
async function parseResumeWithAI(resumeText) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert resume parser and portfolio generator. Parse the provided resume text and extract structured information for creating a professional portfolio website.

Extract the following information and return it as JSON:
- name: Full name
- title: Professional title/role
- about: Professional summary (2-3 sentences)
- email: Email address
- phone: Phone number
- linkedin: LinkedIn profile URL
- github: GitHub profile URL
- website: Personal website URL
- skills: Array of technical skills
- experience: Array of work experience with company, position, startDate, endDate, description, isCurrentJob
- education: Array of education with institution, degree, field, startDate, endDate, gpa
- projects: Array of projects with name, description, technologies, url, githubUrl
- theme: Recommended theme based on profession (default, creative, technical, executive)

For dates, use format "YYYY-MM" or "YYYY" if month not specified. Use "Present" for current positions.
If information is missing, use empty string or empty array as appropriate.
Be intelligent about extracting implicit information and formatting it professionally.`
        },
        {
          role: "user",
          content: `Parse this resume and extract structured portfolio data:

${resumeText}`
        }
      ],
      response_format: { type: "json_object" }
    });
    const result = JSON.parse(response.choices[0].message.content || "{}");
    return {
      name: result.name || "Professional Name",
      title: result.title || "Professional Title",
      about: result.about || "Experienced professional with a passion for excellence.",
      email: result.email || "",
      phone: result.phone || "",
      linkedin: result.linkedin || "",
      github: result.github || "",
      website: result.website || "",
      skills: Array.isArray(result.skills) ? result.skills : [],
      experience: Array.isArray(result.experience) ? result.experience : [],
      education: Array.isArray(result.education) ? result.education : [],
      projects: Array.isArray(result.projects) ? result.projects : [],
      theme: result.theme || "default"
    };
  } catch (error) {
    console.error("OpenAI API Error:", error);
    throw new Error("Failed to parse resume with AI: " + error.message);
  }
}

// shared/schema.ts
import { pgTable, text, serial, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var portfolios = pgTable("portfolios", {
  id: serial("id").primaryKey(),
  subdomain: text("subdomain").notNull().unique(),
  name: text("name").notNull(),
  title: text("title").notNull(),
  about: text("about"),
  email: text("email"),
  phone: text("phone"),
  linkedin: text("linkedin"),
  github: text("github"),
  website: text("website"),
  skills: json("skills").$type().default([]),
  experience: json("experience").$type().default([]),
  education: json("education").$type().default([]),
  projects: json("projects").$type().default([]),
  theme: text("theme").notNull().default("default"),
  isPublic: text("is_public").notNull().default("true"),
  createdAt: timestamp("created_at").defaultNow()
});
var uploadedFiles = pgTable("uploaded_files", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: serial("size").notNull(),
  extractedText: text("extracted_text"),
  portfolioId: serial("portfolio_id").references(() => portfolios.id),
  createdAt: timestamp("created_at").defaultNow()
});
var insertPortfolioSchema = createInsertSchema(portfolios).omit({
  id: true,
  createdAt: true
});
var insertUploadedFileSchema = createInsertSchema(uploadedFiles).omit({
  id: true,
  createdAt: true
});

// server/routes.ts
var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
  // 10MB limit
});
async function registerRoutes(app2) {
  app2.post("/api/upload-resume", upload.single("resume"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const file = req.file;
      if (!validateFileType(file.mimetype)) {
        return res.status(400).json({
          message: "Invalid file type. Please upload a PDF, DOCX, or TXT file."
        });
      }
      if (!validateFileSize(file.size)) {
        return res.status(400).json({
          message: "File too large. Maximum size is 10MB."
        });
      }
      const extractedText = await extractTextFromFile(file);
      if (!extractedText.trim()) {
        return res.status(400).json({
          message: "Could not extract text from the uploaded file. Please ensure it contains readable text."
        });
      }
      const uploadedFile = await storage.createUploadedFile({
        filename: `${Date.now()}-${file.originalname}`,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        extractedText,
        portfolioId: 0
      });
      res.json({
        message: "File uploaded successfully",
        fileId: uploadedFile.id,
        extractedText: extractedText.substring(0, 500) + "..."
        // Preview
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({
        message: "Failed to upload file: " + error.message
      });
    }
  });
  app2.post("/api/generate-portfolio", async (req, res) => {
    try {
      const { fileId } = req.body;
      if (!fileId) {
        return res.status(400).json({ message: "File ID is required" });
      }
      const uploadedFile = await storage.getUploadedFile(fileId);
      if (!uploadedFile || !uploadedFile.extractedText) {
        return res.status(404).json({ message: "File not found or text not extracted" });
      }
      const parsedData = await parseResumeWithAI(uploadedFile.extractedText);
      const subdomain = generateSubdomain(parsedData.name);
      const portfolioData = {
        subdomain,
        name: parsedData.name,
        title: parsedData.title,
        about: parsedData.about,
        email: parsedData.email,
        phone: parsedData.phone,
        linkedin: parsedData.linkedin,
        github: parsedData.github,
        website: parsedData.website,
        skills: parsedData.skills,
        experience: parsedData.experience,
        education: parsedData.education,
        projects: parsedData.projects,
        theme: parsedData.theme,
        isPublic: "true"
      };
      const validatedData = insertPortfolioSchema.parse(portfolioData);
      const portfolio = await storage.createPortfolio(validatedData);
      await storage.updateUploadedFile(fileId, { portfolioId: portfolio.id });
      res.json({
        message: "Portfolio generated successfully",
        portfolio: {
          id: portfolio.id,
          subdomain: portfolio.subdomain,
          name: portfolio.name,
          title: portfolio.title,
          url: `https://${portfolio.subdomain}.vibecodes.space`
        }
      });
    } catch (error) {
      console.error("Portfolio generation error:", error);
      res.status(500).json({
        message: "Failed to generate portfolio: " + error.message
      });
    }
  });
  app2.get("/api/portfolio/:subdomain", async (req, res) => {
    try {
      const { subdomain } = req.params;
      const portfolio = await storage.getPortfolioBySubdomain(subdomain);
      if (!portfolio) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      res.json(portfolio);
    } catch (error) {
      console.error("Get portfolio error:", error);
      res.status(500).json({
        message: "Failed to get portfolio: " + error.message
      });
    }
  });
  app2.get("/api/portfolios", async (req, res) => {
    try {
      const portfolios2 = await storage.getAllPortfolios();
      const publicPortfolios = portfolios2.filter((p) => p.isPublic === "true").map((p) => ({
        id: p.id,
        subdomain: p.subdomain,
        name: p.name,
        title: p.title,
        theme: p.theme,
        url: `https://${p.subdomain}.vibecodes.space`
      }));
      res.json(publicPortfolios);
    } catch (error) {
      console.error("Get portfolios error:", error);
      res.status(500).json({
        message: "Failed to get portfolios: " + error.message
      });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}
function generateSubdomain(name) {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 10);
  const timestamp2 = Date.now().toString().slice(-4);
  return `${cleaned}${timestamp2}`;
}

// server/vite.ts
import express from "express";
import fs from "fs";
import path2 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(import.meta.dirname, "..", "dist", "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  if (!process.env.VERCEL) {
    const port = process.env.PORT || 5e3;
    server.listen(
      {
        port,
        host: "0.0.0.0",
        reusePort: true
      },
      () => {
        log(`serving on port ${port}`);
      }
    );
  }
})();
var index_default = app;
export {
  index_default as default
};
