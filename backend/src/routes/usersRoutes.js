import express from 'express';
import { createUser, getUsers, getUser, updateUser, deleteUser } from '../controllers/usersController.js';
import { authenticate, requireAdmin, requireJwt } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate, requireAdmin, requireJwt);

router.get('/', getUsers);
router.get('/:id', getUser);
router.post('/', createUser);
router.patch('/:id', updateUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;

