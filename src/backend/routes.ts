import { Router } from 'express';
import { register, login, me } from './controllers/auth.controller.ts';
import { createCompany, listCompanies, uploadCertificate, syncCompany, updateCompany } from './controllers/company.controller.ts';
import { getDocuments, getEvents, dashboardStats, manifestDocument, resetSync } from './controllers/nfe.controller.ts';
import { getAdminLogs, getAdminCompanies } from './controllers/admin.controller.ts';
import { listSuppliers, getSupplier, saveSupplier, deleteSupplier, lookupCnpj } from './controllers/supplier.controller.ts';
import { consultarCnpj } from './controllers/cnpj.controller.ts';
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
router.get('/admin/companies', authMiddleware, getAdminCompanies);

// CNPJ
router.get('/cnpj/:cnpj', authMiddleware, consultarCnpj);

// Suppliers
router.get('/suppliers', authMiddleware, listSuppliers);
router.get('/suppliers/:id', authMiddleware, getSupplier);
router.post('/suppliers', authMiddleware, saveSupplier);
router.delete('/suppliers/:id', authMiddleware, deleteSupplier);
router.post('/suppliers/lookup-cnpj', authMiddleware, lookupCnpj);

// Companies
router.post('/companies', authMiddleware, createCompany);
router.get('/companies', authMiddleware, listCompanies);
router.put('/companies/:companyId', authMiddleware, updateCompany);
router.post('/companies/:companyId/certificate', authMiddleware, upload.single('certificate'), uploadCertificate);
router.post('/companies/:companyId/sync', authMiddleware, syncCompany);
router.post('/companies/:companyId/sync/reset', authMiddleware, resetSync);

// NFe / Dashboard
router.get('/nfe', authMiddleware, getDocuments);
router.get('/nfe/:documentId/events', authMiddleware, getEvents);
router.post('/nfe/:documentId/manifest', authMiddleware, manifestDocument);
router.get('/dashboard', authMiddleware, dashboardStats);

export default router;
