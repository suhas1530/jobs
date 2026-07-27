function createSignalEnvelope() {
  return { type: "", sdp: "", by: "", createdAt: null };
}

function createCompanyMonitorState() {
  return {
    sessionId: "",
    offer: createSignalEnvelope(),
    answer: createSignalEnvelope(),
    adminCandidates: [],
    companyCandidates: [],
  };
}

function createStudentMonitorState() {
  return {
    sessionId: "",
    offer: createSignalEnvelope(),
    answer: createSignalEnvelope(),
    adminCandidates: [],
    studentCandidates: [],
  };
}

export function createAdminMonitorState() {
  return {
    company: createCompanyMonitorState(),
    student: createStudentMonitorState(),
  };
}

export function createInterviewWebrtcState(sessionId = "") {
  return {
    active: false,
    sessionId: String(sessionId || ""),
    offer: createSignalEnvelope(),
    answer: createSignalEnvelope(),
    companyCandidates: [],
    studentCandidates: [],
    adminMonitor: createAdminMonitorState(),
  };
}

export function ensureInterviewWebrtcState(value = {}, sessionId = "") {
  const source = value && typeof value === "object" ? value : {};
  const base = createInterviewWebrtcState(sessionId);
  const sourceAdminMonitor = source?.adminMonitor && typeof source.adminMonitor === "object"
    ? source.adminMonitor
    : {};
  const sourceCompanyMonitor = sourceAdminMonitor?.company && typeof sourceAdminMonitor.company === "object"
    ? sourceAdminMonitor.company
    : {};
  const sourceStudentMonitor = sourceAdminMonitor?.student && typeof sourceAdminMonitor.student === "object"
    ? sourceAdminMonitor.student
    : {};

  return {
    ...base,
    ...source,
    sessionId: String(source.sessionId || base.sessionId || ""),
    offer: { ...base.offer, ...(source.offer || {}) },
    answer: { ...base.answer, ...(source.answer || {}) },
    companyCandidates: Array.isArray(source.companyCandidates) ? source.companyCandidates : [],
    studentCandidates: Array.isArray(source.studentCandidates) ? source.studentCandidates : [],
    adminMonitor: {
      company: {
        ...base.adminMonitor.company,
        ...sourceCompanyMonitor,
        offer: { ...base.adminMonitor.company.offer, ...(sourceCompanyMonitor.offer || {}) },
        answer: { ...base.adminMonitor.company.answer, ...(sourceCompanyMonitor.answer || {}) },
        adminCandidates: Array.isArray(sourceCompanyMonitor.adminCandidates) ? sourceCompanyMonitor.adminCandidates : [],
        companyCandidates: Array.isArray(sourceCompanyMonitor.companyCandidates)
          ? sourceCompanyMonitor.companyCandidates
          : [],
      },
      student: {
        ...base.adminMonitor.student,
        ...sourceStudentMonitor,
        offer: { ...base.adminMonitor.student.offer, ...(sourceStudentMonitor.offer || {}) },
        answer: { ...base.adminMonitor.student.answer, ...(sourceStudentMonitor.answer || {}) },
        adminCandidates: Array.isArray(sourceStudentMonitor.adminCandidates) ? sourceStudentMonitor.adminCandidates : [],
        studentCandidates: Array.isArray(sourceStudentMonitor.studentCandidates)
          ? sourceStudentMonitor.studentCandidates
          : [],
      },
    },
  };
}

export function getMonitorRoleBucket(targetRole) {
  return String(targetRole || "").trim().toLowerCase() === "student" ? "student" : "company";
}

export function getMonitorCandidateKey(targetRole) {
  return getMonitorRoleBucket(targetRole) === "student" ? "studentCandidates" : "companyCandidates";
}

export function normalizeWebRtcSdp(raw) {
  let source = "";
  if (raw && typeof raw === "object" && typeof raw.sdp === "string") {
    source = raw.sdp;
  } else {
    source = String(raw || "").trim();
    if (source.startsWith("{") && source.endsWith("}")) {
      try {
        const parsed = JSON.parse(source);
        if (parsed && typeof parsed.sdp === "string") source = parsed.sdp;
      } catch {
        // keep original source
      }
    }
  }

  const sdp = String(source || "")
    .replace(/\\r\\n/g, "\r\n")
    .replace(/\\n/g, "\n")
    .trim();
  if (!sdp) return "";

  const lines = sdp
    .split(/\r?\n/)
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  const startIndex = lines.findIndex((line) => line.startsWith("v=0"));
  if (startIndex < 0) return "";

  const allowed = /^(v|o|s|t|a|m|c|b)=/;
  const cleaned = lines.slice(startIndex).filter((line) => allowed.test(line));
  if (!cleaned.length || !cleaned[0].startsWith("v=0")) return "";
  if (!cleaned.some((line) => line.startsWith("m="))) return "";

  const normalized = `${cleaned.join("\r\n")}\r\n`;
  return normalized.slice(0, 200000);
}

export function normalizeIceCandidate(input = {}) {
  const parsedMLine = Number(input?.sdpMLineIndex);
  const safeMLine = Number.isFinite(parsedMLine) ? parsedMLine : null;
  return {
    candidate: String(input?.candidate || "").slice(0, 4000),
    sdpMid: String(input?.sdpMid || "").slice(0, 100),
    sdpMLineIndex: safeMLine,
    usernameFragment: String(input?.usernameFragment || "").slice(0, 100),
    createdAt: new Date(),
  };
}
