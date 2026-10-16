const express = require('express');
const router = express.Router();
const incomeController = require('../controllers/incomeController');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.get('/analytics', incomeController.getMonthlyAnalytics);
router.get('/export', incomeController.exportUserIncomes);
router.post('/quick', incomeController.createQuickIncome);

router.get('/', incomeController.getIncomes);
router.post('/', incomeController.createIncome);
router.put('/:id', incomeController.updateIncome);
router.delete('/:id', incomeController.deleteIncome);

module.exports = router;
