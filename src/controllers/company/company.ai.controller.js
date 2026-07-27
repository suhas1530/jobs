// backend/src/controllers/company/company.ai.controller.js
import Job from "../../models/Job.js";
import Application from "../../models/Application.js";

function splitSkills(input) {
  if (Array.isArray(input)) return input.map((s) => String(s || "").trim()).filter(Boolean);
  return String(input || "")
    .split(/[,\n]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeSkill(s) {
  return String(s || "").trim().toLowerCase();
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function parseYears(value) {
  const text = String(value || "").toLowerCase();
  const nums = text.match(/\d+(\.\d+)?/g)?.map(Number) || [];
  if (!nums.length) return 0;
  return Math.max(...nums);
}

function extractStudentSkills(student, appTopSkills = []) {
  const fromApp = Array.isArray(appTopSkills) ? appTopSkills : [];
  const fromProfile = Array.isArray(student?.studentProfile?.skills) ? student.studentProfile.skills : [];
  const fromResume = Array.isArray(student?.resume?.skills) ? student.resume.skills : [];

  const normalize = (value) => {
    if (typeof value === "string") return value.trim();
    if (value && typeof value === "object") {
      return String(value.name || value.skill || value.title || "").trim();
    }
    return "";
  };

  return [...fromApp, ...fromProfile, ...fromResume].map(normalize).filter(Boolean);
}

function getExperienceScore(jobExpYears, candidateExpYears) {
  if (jobExpYears <= 0) return 70;
  if (candidateExpYears >= jobExpYears) return 90;
  const ratio = clamp(candidateExpYears / jobExpYears, 0, 1);
  return Math.round(45 + ratio * 45);
}

function getEducationScore(student) {
  const profileEducation = Array.isArray(student?.studentProfile?.education) ? student.studentProfile.education : [];
  const resumeEducation = Array.isArray(student?.resume?.education) ? student.resume.education : [];
  return profileEducation.length > 0 || resumeEducation.length > 0 ? 78 : 52;
}

function getScreeningScore(status) {
  const s = String(status || "");
  if (s === "Interview Scheduled") return 92;
  if (s === "Shortlisted") return 85;
  if (s === "Applied") return 68;
  if (s === "Hold") return 58;
  if (s === "Rejected") return 35;
  return 60;
}

function computeScore({
  jobSkills,
  candSkills,
  weights,
  jobExpYears,
  candidateExpYears,
  educationScore,
  screeningScore,
}) {
  const js = jobSkills.map(normalizeSkill);
  const cs = candSkills.map(normalizeSkill);

  const matched = js.filter((x) => cs.includes(x));
  const missing = js.filter((x) => !cs.includes(x));
  const extra = cs.filter((x) => !js.includes(x));

  const skillsScore = js.length ? Math.round((matched.length / js.length) * 100) : 70;
  const experienceScore = getExperienceScore(jobExpYears, candidateExpYears);

  const w = {
    skills: Number(weights.skillsWeight ?? 35),
    experience: Number(weights.experienceWeight ?? 25),
    education: Number(weights.educationWeight ?? 15),
    screening: Number(weights.screeningWeight ?? 25),
  };
  const sumW = w.skills + w.experience + w.education + w.screening || 100;

  const weighted =
    (skillsScore * w.skills +
      experienceScore * w.experience +
      educationScore * w.education +
      screeningScore * w.screening) /
    sumW;

  return {
    score: clamp(Math.round(weighted), 1, 100),
    matched,
    missing,
    extra,
    skillsScore,
    experienceScore,
    educationScore,
    screeningScore,
  };
}

function scoreLabel(score) {
  if (score >= 85) return "Strong";
  if (score >= 60) return "Moderate";
  return "Low";
}

function suggestionsFromMissing(missing) {
  if (!missing.length) return ["Probe real project ownership and depth."];
  const top = missing.slice(0, 2);
  return [
    `Ask hands-on questions on ${top[0]}.`,
    top[1] ? `Validate practical experience with ${top[1]}.` : "Validate practical project delivery.",
  ];
}

/**
 * GET /api/company/ai/:jobId
 */
export async function getAiScoringForJob(req, res, next) {
  try {
    const companyId = req.user?._id;
    const { jobId } = req.params;

    const job = await Job.findOne({ _id: jobId, company: companyId }).lean();
    if (!job) return res.status(404).json({ message: "Job not found" });

    const apps = await Application.find({ company: companyId, job: jobId })
      .sort({ createdAt: -1 })
      .populate("student", "name email phone resumeUrl studentProfile resume")
      .lean();

    const jobSkills = splitSkills(job.skills);
    const jobExpYears = parseYears(job.experienceText || job.experience);

    const candidates = apps.map((app) => {
      const candSkills = extractStudentSkills(app.student, app.topSkills);
      const candidateExpYears = parseYears(app.experienceText);
      const educationScore = getEducationScore(app.student);
      const screeningScore = getScreeningScore(app.status);
      const calc = computeScore({
        jobSkills,
        candSkills,
        weights: job,
        jobExpYears,
        candidateExpYears,
        educationScore,
        screeningScore,
      });

      const label = scoreLabel(calc.score);
      const experienceText = app.experienceText ? String(app.experienceText) : candidateExpYears > 0 ? `${candidateExpYears} years` : "-";

      return {
        id: app._id,
        name: app.student?.name || "Candidate",
        email: app.student?.email || "",
        experience: experienceText,
        skills: candSkills,
        score: calc.score,
        status: app.status || "Applied",
        matched: calc.matched,
        missing: calc.missing,
        extra: calc.extra,
        expMatch:
          label === "Strong"
            ? "Strong role relevance based on skill and experience fit."
            : label === "Moderate"
            ? "Moderate relevance; verify depth with practical questions."
            : "Low relevance; validate fundamentals and trainability.",
        eduMatch:
          educationScore >= 70
            ? "Education details are present and align with role expectations."
            : "Limited education details available; verify fundamentals in interview.",
        screening: {
          pass: screeningScore >= 70 ? 1 : 0,
          fail: screeningScore < 50 ? 1 : 0,
        },
        keyword: `Skill keyword match: ${calc.skillsScore}%`,
        suggestions: suggestionsFromMissing(calc.missing),
        nextStep: label === "Strong" ? "Shortlist" : label === "Moderate" ? "Needs Review" : "Reject",
      };
    });

    candidates.sort((a, b) => b.score - a.score);

    res.json({
      job: {
        id: job._id,
        title: job.title,
        applicants: apps.length,
        aiEnabled: !!job.enableAiRanking,
        weights: {
          skills: job.skillsWeight ?? 35,
          experience: job.experienceWeight ?? 25,
          education: job.educationWeight ?? 15,
          screening: job.screeningWeight ?? 25,
          top10: !!job.autoHighlightTop10,
          autoTag: !!job.autoTagMatch,
        },
      },
      candidates,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/company/ai/:jobId/weights
 * Accepts either:
 * - { skills, experience, education, screening, top10, autoTag, aiEnabled }
 * - { skillsWeight, experienceWeight, educationWeight, screeningWeight, autoHighlightTop10, autoTagMatch, enableAiRanking }
 */
export async function updateAiWeightsForJob(req, res, next) {
  try {
    const companyId = req.user?._id;
    const { jobId } = req.params;
    const body = req.body || {};

    const patch = {};
    const skills = body.skills ?? body.skillsWeight;
    const experience = body.experience ?? body.experienceWeight;
    const education = body.education ?? body.educationWeight;
    const screening = body.screening ?? body.screeningWeight;
    const top10 = body.top10 ?? body.autoHighlightTop10;
    const autoTag = body.autoTag ?? body.autoTagMatch;
    const aiEnabled = body.aiEnabled ?? body.enableAiRanking;

    if (skills !== undefined) patch.skillsWeight = clamp(Number(skills), 0, 100);
    if (experience !== undefined) patch.experienceWeight = clamp(Number(experience), 0, 100);
    if (education !== undefined) patch.educationWeight = clamp(Number(education), 0, 100);
    if (screening !== undefined) patch.screeningWeight = clamp(Number(screening), 0, 100);
    if (top10 !== undefined) patch.autoHighlightTop10 = !!top10;
    if (autoTag !== undefined) patch.autoTagMatch = !!autoTag;
    if (aiEnabled !== undefined) patch.enableAiRanking = !!aiEnabled;

    const job = await Job.findOneAndUpdate(
      { _id: jobId, company: companyId },
      { $set: patch },
      { returnDocument: "after" }
    ).lean();

    if (!job) return res.status(404).json({ message: "Job not found" });

    res.json({
      ok: true,
      weights: {
        skills: job.skillsWeight ?? 35,
        experience: job.experienceWeight ?? 25,
        education: job.educationWeight ?? 15,
        screening: job.screeningWeight ?? 25,
        top10: !!job.autoHighlightTop10,
        autoTag: !!job.autoTagMatch,
      },
      aiEnabled: !!job.enableAiRanking,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/company/ai/:jobId/rerun
 */
export async function rerunAiForJob(req, res, next) {
  try {
    return getAiScoringForJob(req, res, next);
  } catch (err) {
    next(err);
  }
}
