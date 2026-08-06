/**
 * Docket Room — File Upload Route
 *
 * POST /api/docket/upload
 * Accepts a single file (PDF, DOCX, DOC, TXT) up to 16MB.
 * Uploads to S3 and returns { url, fileName }.
 * Requires authentication.
 */
import type { Express, Request, Response } from "express";
import multer from "multer";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import { authenticateRequestUser } from "./_core/request-auth";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Accepted: PDF, DOCX, DOC, TXT`));
    }
  },
});

export function registerDocketUploadRoute(app: Express) {
  app.post("/api/docket/upload", upload.single("file"), async (req: Request, res: Response) => {
    try {
      // Authenticate
      let user;
      try {
        user = await authenticateRequestUser(req, res);
      } catch {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      // Build a unique S3 key
      const ext = file.originalname.split(".").pop() || "pdf";
      const safeFileName = file.originalname
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .substring(0, 200);
      const key = `docket-submissions/${user.id}/${nanoid(12)}-${safeFileName}`;

      // Upload to S3
      const { url } = await storagePut(key, file.buffer, file.mimetype);

      res.json({
        url,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
      });
    } catch (err: any) {
      console.error("[Docket Upload] Error:", err);
      if (err.message?.includes("Unsupported file type")) {
        res.status(400).json({ error: err.message });
      } else if (err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "File too large. Maximum size is 16MB." });
      } else {
        res.status(500).json({ error: "Upload failed" });
      }
    }
  });
}
