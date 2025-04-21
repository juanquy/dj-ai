/**
 * User model for DJAI application (PostgreSQL version)
 */
const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../database');

const User = sequelize.define('User', {
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  dateJoined: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  mixCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  isPremium: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isAdmin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  lastLogin: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

// SavedMix model for many-to-one relationship with User
const SavedMix = sequelize.define('SavedMix', {
  name: {
    type: DataTypes.STRING
  },
  date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  tracks: {
    type: DataTypes.JSONB
  },
  transitions: {
    type: DataTypes.JSONB
  },
  totalDuration: {
    type: DataTypes.FLOAT
  }
});

// Define the relationship
User.hasMany(SavedMix);
SavedMix.belongsTo(User);

module.exports = { User, SavedMix };