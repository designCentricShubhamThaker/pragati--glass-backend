import express from 'express';
import { createOrder, getOrders,filterOrders, updateOrderProgress } from '../controllers/orderController.js';

const router = express.Router();

router.post('/', createOrder); 
router.get('/', getOrders); 
router.get('/:orderType' , filterOrders)
router.patch('/update-progress' , updateOrderProgress)

export default router;
