import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { logger } from '../config/logger';
import { authenticate, requireAdmin } from '../middleware/authenticate';
import { processFile } from '../services/fileProcessor';
import { upsertDocumentChunks, deleteDocumentChunks } from '../services/knowledgeBase';

export const knowledgeBaseRouter = Router();

knowledgeBaseRouter.use(authenticate, requireAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

/**
 * @openapi
 * /admin/knowledge-base:
 *   get:
 *     tags: [Knowledge Base]
 *     summary: List knowledge base documents
 *     description: Returns all documents in the knowledge base, including admin uploads and the daily digest entries. Admin only.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Knowledge base documents
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Internal server error
 */
knowledgeBaseRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT kb.id, kb.title, kb.filename, kb.source, kb.chunk_count, kb.created_at, kb.updated_at, u.email AS uploaded_by_email
       FROM knowledge_base_documents kb
       LEFT JOIN users u ON u.id = kb.uploaded_by
       ORDER BY kb.created_at DESC`,
    );
    res.status(200).json(result.rows);
  } catch (err) {
    logger.error({ err }, 'GET /admin/knowledge-base error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /admin/knowledge-base:
 *   post:
 *     tags: [Knowledge Base]
 *     summary: Upload a document to the knowledge base
 *     description: |
 *       Accepts a PDF, Word (.docx), or text file, extracts its text, chunks and embeds it,
 *       and makes it retrievable in chat via semantic search. Admin only.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               title:
 *                 type: string
 *                 description: Display title. Defaults to the filename if omitted.
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Document added to the knowledge base
 *       400:
 *         description: Missing file, unsupported file type, or empty extracted text
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Internal server error
 */
knowledgeBaseRouter.post(
  '/',
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'A file is required' });
        return;
      }

      const attachment = await processFile(req.file.buffer, req.file.mimetype, req.file.originalname);

      if (attachment.type !== 'pdf' && attachment.type !== 'docx' && attachment.type !== 'text') {
        res.status(400).json({
          error: `Unsupported file type: ${req.file.mimetype}. Supported: PDF, Word (.docx), and text files.`,
        });
        return;
      }

      const text = attachment.text?.trim();
      if (!text) {
        res.status(400).json({ error: 'No extractable text found in this file' });
        return;
      }

      const title = (req.body?.title as string | undefined)?.trim() || req.file.originalname;
      const documentId = randomUUID();

      const chunkCount = await upsertDocumentChunks(documentId, title, 'upload', text);

      const result = await query(
        `INSERT INTO knowledge_base_documents (id, title, filename, source, chunk_count, uploaded_by)
         VALUES ($1, $2, $3, 'upload', $4, $5)
         RETURNING id, title, filename, source, chunk_count, created_at, updated_at`,
        [documentId, title, req.file.originalname, chunkCount, req.user!.id],
      );

      logger.info(
        { documentId, title, chunkCount, byAdminId: req.user!.id },
        'Knowledge base document added',
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      logger.error({ err }, 'POST /admin/knowledge-base error');
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * @openapi
 * /admin/knowledge-base/{id}:
 *   delete:
 *     tags: [Knowledge Base]
 *     summary: Remove a document from the knowledge base
 *     description: Deletes the document's metadata and its embedded chunks. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Document deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
knowledgeBaseRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const existing = await query(
      `SELECT id, chunk_count FROM knowledge_base_documents WHERE id = $1`,
      [id],
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    await deleteDocumentChunks(id, existing.rows[0].chunk_count);
    await query(`DELETE FROM knowledge_base_documents WHERE id = $1`, [id]);

    logger.info({ documentId: id, byAdminId: req.user!.id }, 'Knowledge base document deleted');
    res.status(204).send();
  } catch (err) {
    logger.error({ err, documentId: req.params.id }, 'DELETE /admin/knowledge-base/:id error');
    res.status(500).json({ error: 'Internal server error' });
  }
});
