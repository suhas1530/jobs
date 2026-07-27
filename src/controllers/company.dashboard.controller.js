import CompanyProfile from "../models/CompanyProfile.js";
import Subscription from "../models/Subscription.js";
import Job from "../models/Job.js";
import Application from "../models/Application.js";
import Message from "../models/Message.js";
import Interview from "../models/Interview.js";

export async function getCompanyDashboard(req, res) {
  try {
    const companyUserId = req.dbUser._id;

    const profile = await CompanyProfile.findOne({ user: companyUserId });

    const subscription = await Subscription.findOne({
      company: companyUserId,
      status: "active",
    });

    const activeJobs = await Job.countDocuments({ company: companyUserId, status: "Active" });
    const totalApplications = await Application.countDocuments({ company: companyUserId });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const newToday = await Application.countDocuments({
      company: companyUserId,
      createdAt: { $gte: today },
    });

    const shortlisted = await Application.countDocuments({
      company: companyUserId,
      status: "Shortlisted",
    });

    const interviews = await Interview.countDocuments({
      company: companyUserId,
      status: "Scheduled",
    });

    const unreadMessages = await Message.countDocuments({
      company: companyUserId,
      unread: true,
    });

    const recentApplications = await Application.find({ company: companyUserId })
      .populate("job", "title")
      .populate("student", "name email")
      .sort({ createdAt: -1 })
      .limit(5);

    const activeJobsList = await Job.find({ company: companyUserId })
      .sort({ createdAt: -1 })
      .limit(5);

    const upcomingInterviews = await Interview.find({ company: companyUserId, status: "Scheduled" })
      .sort({ createdAt: -1 })
      .limit(3);

    const recentMessages = await Message.find({ company: companyUserId })
      .sort({ createdAt: -1 })
      .limit(3);

    res.json({
      company: {
        name: profile?.companyName || req.dbUser.name || "Company",
        status: profile?.status || "active",
      },
      stats: {
        activeJobs,
        totalApplications,
        newToday,
        shortlisted,
        interviews,
        unreadMessages,
      },
      subscription: subscription
        ? {
            planName: subscription.planName,
            start: subscription.start,
            end: subscription.end,
            status: subscription.status,
            jobsLimit: subscription.jobsLimit,
            jobsUsed: subscription.jobsUsed,
            appsLimit: subscription.appsLimit,
            appsUsed: subscription.appsUsed,
          }
        : null,
      recentApplications,
      shortlistedCandidates: await Application.find({
        company: companyUserId,
        status: "Shortlisted",
      })
        .populate("student", "name email")
        .sort({ createdAt: -1 })
        .limit(5),
      activeJobs: activeJobsList,
      upcomingInterviews,
      recentMessages,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Dashboard error" });
  }
}
