// backend/src/controllers/student/student.meta.controller.js

export const getStudentMe = async (req, res, next) => {
  try {
    const user = req.user; // attached by studentOnly middleware

    res.json({
      id: user._id,
      clerkId: user.clerkId,
      role: user.role,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
      createdAt: user.createdAt,
    });
  } catch (err) {
    next(err);
  }
};
