const express = require('express');
const router = express.Router();
const goalController = require('../controllers/goalController');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', goalController.getGoals);
router.post('/', goalController.createGoal);
router.put('/:id', goalController.updateGoal);
router.patch('/:id/pin', goalController.pinGoal);
router.delete('/:id', goalController.deleteGoal);

module.exports = router;
