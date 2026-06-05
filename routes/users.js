const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const router = express.Router();

// ======= Cloudinary Config =======
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ======= Multer (memory storage) =======
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(file.mimetype)) return cb(null, true);
    cb(new Error('صور فقط (jpeg, jpg, png, gif, webp)'));
  }
});

// ========================
// GET /api/users/me
// ========================
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ msg: 'المستخدم غير موجود' });
    res.json(user);
  } catch (err) {
    console.error('خطأ في جلب البروفايل:', err);
    res.status(500).json({ msg: 'خطأ في السيرفر' });
  }
});

// ========================
// PUT /api/users/profile
// ========================
router.put('/profile', auth, upload.single('profileImage'), async (req, res) => {
  try {
    const updates = {
      name: req.body.name || '',
      phone: req.body.phone || '',
      bio: req.body.bio || '',
      governorate: req.body.governorate || '',
      city: req.body.city || '',
      age: req.body.age ? Number(req.body.age) : null,
      work_experience: req.body.work_experience || '',
      desired_job_type: req.body.desired_job_type || '',
      shop_name: req.body.shop_name || ''
    };

    // ✅ رفع الصورة على Cloudinary بدل disk
    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'sahlawork/profiles',
            public_id: `profile-${req.user.id}-${Date.now()}`,
            resource_type: 'image',
            overwrite: true
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
      });

      updates.profileImage = uploadResult.secure_url;
      updates.cacheBuster = Date.now().toString();
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      updates,
      { new: true }
    ).select('-password');

    res.json(updatedUser);
  } catch (err) {
    console.error('خطأ في تحديث البروفايل:', err);
    res.status(500).json({ msg: 'خطأ في حفظ التغييرات' });
  }
});

// ========================
// PATCH /:id — legacy route
// ========================
router.patch('/:id', auth, async (req, res) => {
  if (req.params.id !== req.user.id) return res.status(403).json({ msg: 'غير مصرح' });

  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-password');
    if (!user) return res.status(404).json({ msg: 'المستخدم غير موجود' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ msg: 'خطأ في التحديث' });
  }
});

module.exports = router;