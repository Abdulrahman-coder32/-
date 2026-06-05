const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

// ========================
// SIGNUP
// ========================
router.post('/signup', async (req, res) => {
  const { email, password, role, ...profile } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ msg: 'بيانات ناقصة' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ msg: 'المستخدم موجود بالفعل' });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = new User({
      email,
      password: hashed,
      role,
      ...profile
    });

    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name,
        phone: user.phone || '',
        profileImage: user.profileImage || '',
        cacheBuster: user.cacheBuster || '',
        governorate: user.governorate,
        city: user.city,
        age: user.age,
        work_experience: user.work_experience,
        desired_job_type: user.desired_job_type,
        shop_name: user.shop_name,
        bio: user.bio || ''
      }
    });
  } catch (err) {
    console.error('Signup Error:', err);
    res.status(500).json({ msg: 'خطأ في السيرفر' });
  }
});

// ========================
// LOGIN
// ========================
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ msg: 'بيانات ناقصة' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: 'بيانات غير صحيحة' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ msg: 'بيانات غير صحيحة' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name,
        phone: user.phone || '',
        profileImage: user.profileImage || '',
        cacheBuster: user.cacheBuster || '',
        governorate: user.governorate,
        city: user.city,
        age: user.age,
        work_experience: user.work_experience,
        desired_job_type: user.desired_job_type,
        shop_name: user.shop_name,
        bio: user.bio || ''
      }
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ msg: 'خطأ في السيرفر' });
  }
});

module.exports = router;