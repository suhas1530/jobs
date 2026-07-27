export const getCompanyHeaderCounts = async (req, res, next) => {
  try {
    // later: calculate from Notification + Message models
    res.json({ notifications: 0, messages: 0 });
  } catch (e) {
    next(e);
  }
};
