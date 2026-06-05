const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  console.log('Auth Middleware:', authHeader);

  if (!authHeader) {
    return res.status(401).json({ msg: 'لا يوجد توكن، الوصول مرفوض' });
  }

  // لازم يكون Bearer token
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ msg: 'صيغة التوكن غير صحيحة' });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ msg: 'توكن فارغ' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // مهم جدًا — الشكل الموحد للمستخدم
    req.user = {
      id: decoded.id,
      role: decoded.role
    };

    next();
  } catch (err) {
    console.log('JWT Error:', err.message);

    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ msg: 'التوكن منتهي الصلاحية' });
    }

    return res.status(401).json({ msg: 'توكن غير صالح' });
  }
};
