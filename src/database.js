/**
 * Database connection for DJAI application
 * PostgreSQL with Sequelize ORM
 */
const { Sequelize } = require('sequelize');
require('dotenv').config();

// Parse connection from environment or use default
const DB_URI = process.env.DATABASE_URL || 'postgres://djaiuser:djai_password@localhost:5432/djai';

const sequelize = new Sequelize(DB_URI, {
  dialect: 'postgres',
  logging: false, // Set to console.log to see SQL queries
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

// Test the connection
sequelize.authenticate()
  .then(() => {
    console.log('PostgreSQL database connected successfully');
  })
  .catch(err => {
    console.error('PostgreSQL connection error:', err);
  });

module.exports = sequelize;