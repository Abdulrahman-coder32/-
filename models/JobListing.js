// backend/models/JobListing.js
const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  shop_name: { type: String, required: true },
  category: { type: String, required: true },
  governorate: { type: String, required: true },
  city: { type: String, required: true },
  requirements: { type: String, required: true },
  working_hours: { type: String, required: true },
  salary: String,
  approved: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

jobSchema.index({ governorate: 1, city: 1, category: 1 });

module.exports = mongoose.model('JobListing', jobSchema);