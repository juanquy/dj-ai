/**
 * Admin routes for DJAI application
 */
const express = require('express');
const router = express.Router();
const { User, SavedMix } = require('./models/User');
const { Op, Sequelize } = require('sequelize');

// Admin middleware - ensure the user is an admin
const requireAdmin = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const user = await User.findByPk(req.session.userId);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get all users (admin only)
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'name', 'email', 'dateJoined', 'lastLogin', 'mixCount', 'isPremium'],
      order: [['dateJoined', 'DESC']]
    });
    
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get user details (admin only)
router.get('/users/:userId', requireAdmin, async (req, res) => {
  try {
    // Validate userId parameter - must be a valid integer
    const userId = req.params.userId;
    
    if (!userId || userId === 'undefined' || isNaN(parseInt(userId))) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    const user = await User.findByPk(parseInt(userId));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// Update user (admin only)
router.put('/users/:userId', requireAdmin, async (req, res) => {
  try {
    const { name, email, isPremium, isAdmin } = req.body;
    
    // Validate userId parameter - must be a valid integer
    const userId = req.params.userId;
    
    if (!userId || userId === 'undefined' || isNaN(parseInt(userId))) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    // Only allow updating specific fields
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (typeof isPremium === 'boolean') updateData.isPremium = isPremium;
    if (typeof isAdmin === 'boolean') updateData.isAdmin = isAdmin;
    
    const user = await User.findByPk(parseInt(userId));
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    await user.update(updateData);
    res.json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user (admin only)
router.delete('/users/:userId', requireAdmin, async (req, res) => {
  try {
    // Validate userId parameter - must be a valid integer
    const userId = req.params.userId;
    
    if (!userId || userId === 'undefined' || isNaN(parseInt(userId))) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    const user = await User.findByPk(parseInt(userId));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Delete user's saved mixes first (cascade delete would also work)
    await SavedMix.destroy({
      where: { UserId: req.params.userId }
    });
    
    // Delete the user
    await user.destroy();
    
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Get system statistics (admin only)
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    // Get user statistics
    const totalUsers = await User.count();
    const premiumUsers = await User.count({ where: { isPremium: true } });
    
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const lastWeekUsers = await User.count({
      where: {
        dateJoined: { [Op.gte]: oneWeekAgo }
      }
    });
    
    // Get mixes statistics
    const totalMixes = await SavedMix.count();
    const mixDuration = await SavedMix.findOne({
      attributes: [
        [Sequelize.fn('AVG', Sequelize.col('totalDuration')), 'avgDuration']
      ],
      raw: true
    });
    
    // Format statistics
    const stats = {
      users: {
        total: totalUsers,
        premium: premiumUsers,
        premiumPercentage: totalUsers > 0 ? (premiumUsers / totalUsers) * 100 : 0,
        newLastWeek: lastWeekUsers
      },
      mixes: {
        total: totalMixes,
        avgDuration: mixDuration?.avgDuration || 0
      }
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Create first admin if none exists
router.post('/setup', async (req, res) => {
  try {
    // Check if any admin exists
    const adminExists = await User.findOne({ where: { isAdmin: true } });
    if (adminExists) {
      return res.status(400).json({ error: 'Admin account already exists' });
    }
    
    const { name, email } = req.body;
    
    // Basic validation
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    
    // Create admin user
    const admin = await User.create({
      name,
      email,
      isAdmin: true,
      isPremium: true  // Admins get premium for free
    });
    
    // Set up session
    req.session.userId = admin.id;
    req.session.name = admin.name;
    req.session.email = admin.email;
    req.session.isAdmin = true;
    
    res.status(201).json({ success: true, user: admin });
  } catch (error) {
    console.error('Admin setup error:', error);
    res.status(500).json({ error: 'Admin setup failed' });
  }
});

module.exports = router;