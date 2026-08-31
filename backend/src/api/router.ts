import { Router } from 'express';
import authRouter from './auth.js';
import plansRouter from './plans.js';
import meterRouter from './meter.js';

const router = Router();
router.use(authRouter);
router.use(plansRouter);
router.use(meterRouter);

export default router;
