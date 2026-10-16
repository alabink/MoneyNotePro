const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken, isAdmin } = require('../middleware/auth');

router.use(verifyToken, isAdmin);

// 1. Thống kê toàn hệ thống
router.get('/overview', adminController.getSystemOverview);

// 2. Quản lý Người dùng (CRUD, Ban/Unban, Role, Reset Password)
router.get('/users', adminController.getAllUsers);
router.patch('/users/:id/status', adminController.toggleUserStatus);
router.patch('/users/:id/role', adminController.updateUserRole);
router.post('/users/:id/reset-password', adminController.resetUserPassword);
router.delete('/users/:id', adminController.deleteUserPermanently);

// 3. Quản lý Thông báo Hệ thống (Broadcast Announcements)
router.get('/announcements', adminController.getAnnouncements);
router.post('/announcements', adminController.createAnnouncement);
router.put('/announcements/:id', adminController.updateAnnouncement);
router.delete('/announcements/:id', adminController.deleteAnnouncement);

// 4. Quản lý Danh mục Mặc định & Sao lưu (System Settings)
router.get('/settings', adminController.getSystemSettings);
router.put('/settings/categories', adminController.updateSystemCategories);
router.get('/export', adminController.exportSystemReport);

module.exports = router;
