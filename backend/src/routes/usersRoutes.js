import express from 'express';
import { createUser, getUsers, getUser, updateUser, deleteUser } from '../controllers/usersController.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, requireAdmin, getUsers);
router.get('/:id', authenticate, requireAdmin, getUser);
router.post('/', authenticate, requireAdmin, createUser);
router.patch('/:id', authenticate, requireAdmin, updateUser);
router.put('/:id', authenticate, requireAdmin, updateUser);
router.delete('/:id', authenticate, requireAdmin, deleteUser);

export default router;

