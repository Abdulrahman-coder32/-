// models/Application.js
const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
  job_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobListing',
    required: true
  },
  seeker_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  message: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  lastMessage: {
    type: String,
    default: ''
  },
  lastTimestamp: {
    type: Date,
    default: null
  },
  unreadCounts: {
    owner: { type: Number, default: 0 },
    seeker: { type: Number, default: 0 }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes
applicationSchema.index({ seeker_id: 1, status: 1 });
applicationSchema.index({ job_id: 1, seeker_id: 1 });
applicationSchema.index({ lastTimestamp: -1 });

module.exports = mongoose.model('Application', applicationSchema);