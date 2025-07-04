import express from "express";
import cors from "cors";
import { mockArticles, mockWarranties } from "./mockData";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  })
);
app.use(express.json());

// Mock auth endpoint
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  if (email && password) {
    res.json({
      token: "mock-jwt-token",
      user: {
        userId: 1,
        email: email,
        role: "ADMIN",
      },
    });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

app.post("/api/auth/register", (req, res) => {
  const { email, password } = req.body;
  if (email && password) {
    res.status(201).json({
      token: "mock-jwt-token",
      user: {
        userId: 2,
        email: email,
        role: "USER",
      },
    });
  } else {
    res.status(400).json({ error: "Missing email or password" });
  }
});

// Mock profile endpoint for token verification
app.get("/api/auth/me", (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    // Mock user profile - in real app this would verify the JWT
    res.json({
      userId: 1,
      email: "demo@example.com",
      role: "ADMIN",
    });
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
});

// Mock articles endpoints
app.get("/api/articles", (req, res) => {
  res.json(mockArticles);
});

app.post("/api/articles", (req, res) => {
  const newArticle = {
    articleId: mockArticles.length + 1,
    ...req.body,
    ownerUserId: 1,
    owner: { userId: 1, email: "demo@example.com" },
  };
  mockArticles.push(newArticle);
  res.status(201).json(newArticle);
});

// Mock warranties endpoints
app.get("/api/warranties", (req, res) => {
  res.json(mockWarranties);
});

app.post("/api/warranties", (req, res) => {
  const newWarranty = {
    garantieId: mockWarranties.length + 1,
    ...req.body,
    garantieFin: new Date(
      Date.now() + req.body.garantieDuration * 30 * 24 * 60 * 60 * 1000
    ),
    garantieIsValide: true,
    ownerUserId: 1,
  };
  mockWarranties.push(newWarranty);
  res.status(201).json(newWarranty);
});

// Mock sharing endpoints
app.get("/api/sharing", (req, res) => {
  res.json([]);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Mock WIM API running at http://localhost:${port}`);
});
