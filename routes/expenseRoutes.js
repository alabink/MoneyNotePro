const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.get('/analytics', expenseController.getMonthlyExpenseAnalytics);
router.get('/export', expenseController.exportUserExpenses);
router.post('/quick', expenseController.createQuickExpense);

router.get('/', expenseController.getExpenses);
router.post('/', expenseController.createExpense);
router.put('/:id', expenseController.updateExpense);
router.delete('/:id', expenseController.deleteExpense);

module.exports = router;
