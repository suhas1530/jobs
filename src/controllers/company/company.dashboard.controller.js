// backend/src/controllers/company/company.dashboard.controller.js
import Application from "../../models/Application.js";
import Job from "../../models/Job.js";
import Interview from "../../models/Interview.js";
import Company from "../../models/Company.js";
import MessageThread from "../../models/MessageThread.js";
import { ensureSubscription } from "../../services/paymentActivation.js";

function dateOnly(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toISOString().slice(0, 10);
}

function fmtDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

export const getCompanyDashboard = async (req, res, next) => {
  try {
    const companyId = req.user._id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      companyDoc,
      activeJobs,
      totalApplications,
      shortlisted,
      interviewsScheduled,
      newToday,
      unreadAgg,
    ] = await Promise.all([
      Company.findOne({ ownerUserId: companyId }).lean(),
      Job.countDocuments({ company: companyId, status: "Active" }),
      Application.countDocuments({ company: companyId }),
      Application.countDocuments({ company: companyId, status: "Shortlisted" }),
      Application.countDocuments({ company: companyId, status: "Interview Scheduled" }),
      Application.countDocuments({ company: companyId, createdAt: { $gte: today } }),
      MessageThread.aggregate([
        { $match: { company: companyId } },
        { $group: { _id: null, total: { $sum: "$companyUnread" } } },
      ]),
    ]);
    const subscriptionDoc = await ensureSubscription(companyId);

    const unreadMessages = Number(unreadAgg?.[0]?.total || 0);

    const recentApplicationsRaw = await Application.find({ company: companyId })
      .sort({ createdAt: -1 })
      .limit(8)
      .populate("student", "name email phone")
      .populate("job", "title location")
      .lean();

    const recentApplications = recentApplicationsRaw.map((a) => ({
      id: a._id,
      name: a.student?.name || "Candidate",
      candidateName: a.student?.name || "Candidate",
      jobTitle: a.job?.title || "-",
      job: a.job?.title || "-",
      experience: a.experienceText || "-",
      exp: a.experienceText || "-",
      skills: a.topSkills || [],
      topSkills: a.topSkills || [],
      appliedDate: dateOnly(a.createdAt),
      date: dateOnly(a.createdAt),
      status: a.status || "Applied",
    }));

    const shortlistedRaw = await Application.find({
      company: companyId,
      status: { $in: ["Shortlisted", "Interview Scheduled"] },
    })
      .sort({ updatedAt: -1 })
      .limit(6)
      .populate("student", "name")
      .populate("job", "title")
      .lean();

    const shortlistedCandidates = shortlistedRaw.map((a) => ({
      id: a._id,
      name: a.student?.name || "Candidate",
      candidateName: a.student?.name || "Candidate",
      role: a.job?.title || "-",
      jobTitle: a.job?.title || "-",
      exp: a.experienceText || "-",
      experience: a.experienceText || "-",
      skill: (a.topSkills || [])[0] || "-",
      topSkill: (a.topSkills || [])[0] || "-",
      status: a.status || "Shortlisted",
    }));

    const activeJobsRaw = await Job.find({ company: companyId, status: "Active" })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const activeJobIds = activeJobsRaw.map((j) => j._id);
    const appCountAgg = activeJobIds.length
      ? await Application.aggregate([
          { $match: { company: companyId, job: { $in: activeJobIds } } },
          { $group: { _id: "$job", c: { $sum: 1 } } },
        ])
      : [];

    const appCountMap = new Map(appCountAgg.map((x) => [String(x._id), x.c]));

    const activeJobsMapped = activeJobsRaw.map((j) => ({
      id: j._id,
      title: j.title || "Untitled",
      jobTitle: j.title || "Untitled",
      location: j.location || "-",
      mode: j.mode || j.workMode || "Online",
      applications: Number(appCountMap.get(String(j._id)) || 0),
      applicationCount: Number(appCountMap.get(String(j._id)) || 0),
      status: j.status || "Active",
    }));

    const interviewsRaw = await Interview.find({
      company: companyId,
      status: "Scheduled",
      scheduledAt: { $gte: new Date() },
    })
      .sort({ scheduledAt: 1 })
      .limit(5)
      .lean();

    const upcomingInterviews = interviewsRaw.map((i) => ({
      id: i._id,
      name: i.candidateName || "Candidate",
      candidateName: i.candidateName || "Candidate",
      jobTitle: i.jobTitle || "-",
      job: i.jobTitle || "-",
      when: fmtDateTime(i.scheduledAt),
      scheduledAt: fmtDateTime(i.scheduledAt),
      mode: i.mode || "Online",
    }));

    const messagesRaw = await MessageThread.find({ company: companyId })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(6)
      .populate("student", "name")
      .lean();

    const recentMessages = messagesRaw.map((m) => ({
      id: m._id,
      name: m.student?.name || "Candidate",
      candidateName: m.student?.name || "Candidate",
      text: m.lastMessageText || "",
      message: m.lastMessageText || "",
      unread: Number(m.companyUnread || 0) > 0,
      time: dateOnly(m.lastMessageAt || m.updatedAt),
      timeAgo: dateOnly(m.lastMessageAt || m.updatedAt),
    }));

    const subscription = {
      planName: subscriptionDoc?.planName || "Starter",
      status: subscriptionDoc?.status === "active" ? "Active" : "Inactive",
      startDate: dateOnly(subscriptionDoc?.start),
      endDate: dateOnly(subscriptionDoc?.end),
      jobsLimit: Number(subscriptionDoc?.jobsLimit ?? 0),
      jobsUsed: Number(subscriptionDoc?.jobsUsed ?? activeJobs),
      applicationsLimit: Number(subscriptionDoc?.appsLimit ?? 0),
      applicationsUsed: Number(subscriptionDoc?.appsUsed ?? totalApplications),
    };

    return res.json({
      company: {
        name: companyDoc?.name || req.user?.name || "Company",
      },
      stats: {
        activeJobs,
        totalApplications,
        newToday,
        shortlisted,
        interviews: interviewsScheduled,
        unreadMessages,
      },
      subscription,
      recentApplications,
      shortlistedCandidates,
      activeJobs: activeJobsMapped,
      upcomingInterviews,
      recentMessages,
    });
  } catch (err) {
    next(err);
  }
};
