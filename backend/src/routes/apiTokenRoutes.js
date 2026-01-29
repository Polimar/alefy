import express from 'express';
import { list, create, revoke } from '../controllers/apiTokensController.js';
import { authenticate, requireAdmin, requireJwt } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate, requireAdmin, requireJwt);

router.get('/', list);
router.post('/', create);
router.delete('/:id', revoke);

export default router;
