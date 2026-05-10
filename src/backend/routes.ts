import { Router } from 'express';
import { register, login, me } from './controllers/auth.controller.ts';
import { createCompany, listCompanies, uploadCertificate, syncCompany } from './controllers/company.controller.ts';
import { getDocuments, getEvents, dashboardStats, manifestDocument } from './controllers/nfe.controller.ts';
import { getAdminLogs } from './controllers/admin.controller.ts';
import { authMiddleware } from './middlewares/auth.ts';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Auth
router.post('/auth/register', register);
router.post('/auth/login', login);
router.get('/auth/me', authMiddleware, me);

// Admin
router.get('/admin/logs', authMiddleware, getAdminLogs);

// Companies
router.post('/companies', authMiddleware, createCompany);
router.get('/companies', authMiddleware, listCompanies);
router.post('/companies/:companyId/certificate', authMiddleware, upload.single('certificate'), uploadCertificate);
router.post('/companies/:companyId/sync', authMiddleware, syncCompany);

// NFe / Dashboard
router.get('/nfe', authMiddleware, getDocuments);
router.get('/nfe/:documentId/events', authMiddleware, getEvents);
router.post('/nfe/:documentId/manifest', authMiddleware, manifestDocument);
router.get('/dashboard', authMiddleware, dashboardStats);

export default router;
