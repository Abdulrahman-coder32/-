const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const JobListing = require('../models/JobListing');

// === إنشاء وظيفة جديدة (مع auth) - حطيناه الأول عشان يشتغل قبل راوت البحث ===
router.post('/create', auth, async (req, res) => {
  if (req.user.role !== 'shop_owner') {
    return res.status(403).json({ msg: 'غير مصرح - يجب أن تكون صاحب عمل' });
  }

  try {
    console.log('طلب إنشاء وظيفة جديدة من المستخدم:', req.user.id);
    console.log('البيانات المرسلة:', req.body);

    const jobData = {
      shop_name: req.body.shop_name,
      category: req.body.category,
      governorate: req.body.governorate,
      city: req.body.city,
      requirements: req.body.requirements,
      working_hours: req.body.working_hours,
      salary: req.body.salary || '',
      owner_id: req.user.id
    };

    const job = new JobListing(jobData);
    await job.save();

    const populatedJob = await JobListing.findById(job._id)
      .populate('owner_id', 'shop_name');

    console.log('تم إنشاء الوظيفة بنجاح وحفظها في الداتابيز:', populatedJob);

    res.json(populatedJob);
  } catch (err) {
    console.error('خطأ في إنشاء الوظيفة:', err);
    res.status(500).json({ msg: 'خطأ في السيرفر', error: err.message });
  }
});

// === البحث عن وظائف (بدون auth) ===
router.post('/', async (req, res) => {
  try {
    console.log('طلب بحث عن وظائف (بدون auth)');
    const filters = req.body || {};
    const query = {};

    if (filters.governorate) query.governorate = filters.governorate;
    if (filters.city) query.city = filters.city;
    if (filters.category) query.category = new RegExp(filters.category, 'i');

    const jobs = await JobListing.find(query)
      .sort({ createdAt: -1 })
      .populate('owner_id', 'shop_name');

    console.log('عدد الوظائف المرجعة في البحث:', jobs.length);
    res.json(jobs);
  } catch (err) {
    console.error('خطأ في البحث عن الوظائف:', err);
    res.status(500).json({ msg: 'خطأ في السيرفر' });
  }
});

// جلب وظائفي
router.get('/my', auth, async (req, res) => {
  if (req.user.role !== 'shop_owner') {
    return res.status(403).json({ msg: 'غير مصرح' });
  }

  try {
    const jobs = await JobListing.find({ owner_id: req.user.id })
      .sort({ createdAt: -1 })
      .populate('owner_id', 'shop_name');

    console.log('جلب وظائفي للمستخدم:', req.user.id, 'العدد:', jobs.length);
    res.json(jobs);
  } catch (err) {
    console.error('خطأ في جلب وظائفي:', err);
    res.status(500).json({ msg: 'خطأ' });
  }
});

// جلب تفاصيل وظيفة واحدة
router.get('/:id', async (req, res) => {
  try {
    const job = await JobListing.findById(req.params.id)
      .populate('owner_id', 'shop_name');

    if (!job) {
      return res.status(404).json({ msg: 'الوظيفة غير موجودة' });
    }

    res.json(job);
  } catch (err) {
    console.error('خطأ في جلب تفاصيل الوظيفة:', err);
    res.status(500).json({ msg: 'خطأ في السيرفر' });
  }
});

// حذف وظيفة
router.delete('/:id', auth, async (req, res) => {
  try {
    const job = await JobListing.findById(req.params.id);
    if (!job) return res.status(404).json({ msg: 'الوظيفة غير موجودة' });

    if (job.owner_id.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'غير مصرح - ليس وظيفتك' });
    }

    await job.deleteOne();
    console.log('تم حذف الوظيفة بنجاح:', req.params.id);
    res.json({ msg: 'تم حذف الوظيفة بنجاح' });
  } catch (err) {
    console.error('خطأ في حذف الوظيفة:', err);
    res.status(500).json({ msg: 'خطأ في السيرفر' });
  }
});

module.exports = router;