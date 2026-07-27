import mongoose from "mongoose";
import Company from "../models/Company.js";
import Message from "../models/Message.js";
import MessageThread from "../models/MessageThread.js";
import SocialFollow from "../models/SocialFollow.js";
import SocialNotification from "../models/SocialNotification.js";
import SocialPost from "../models/SocialPost.js";
import SocialStory from "../models/SocialStory.js";
import User from "../models/User.js";

const JAMENDO_CLIENT_ID = process.env.JAMENDO_CLIENT_ID || "96cd8d1e";
const JAMENDO_BASE_URL = process.env.JAMENDO_BASE_URL || "https://api.jamendo.com/v3.0";
const SPOTIFY_CLIENT_ID = safeStr(process.env.SPOTIFY_CLIENT_ID);
const SPOTIFY_CLIENT_SECRET = safeStr(process.env.SPOTIFY_CLIENT_SECRET);
const SPOTIFY_TOKEN_URL = process.env.SPOTIFY_TOKEN_URL || "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE_URL = process.env.SPOTIFY_API_BASE_URL || "https://api.spotify.com/v1";
const ITUNES_SEARCH_URL = process.env.ITUNES_SEARCH_URL || "https://itunes.apple.com/search";
const DEFAULT_INDIAN_HITS_QUERY = process.env.MUSIC_DEFAULT_INDIAN_HITS_QUERY || "indian hit songs bollywood tamil telugu malayalam punjabi";
const SOCIAL_REPORT_REASONS = new Set([
  "Abusive Language",
  "Hate Speech",
  "Sexual Content",
  "Violence or Threat",
  "Illegal Activity",
  "Spam or Misleading",
  "Other",
]);
const SOCIAL_TEXT_BLOCK_RULES = [
  {
    reason: "Abusive language",
    patterns: ["fuck", "bitch", "bastard", "asshole", "motherfucker", "mf", "shit", "slut", "whore"],
  },
  {
    reason: "Hate speech",
    patterns: ["nigger", "faggot", "terrorist lover", "kill muslim", "kill hindu", "kill christian"],
  },
  {
    reason: "Sexual content",
    patterns: ["sex", "sexy", "sexual", "nude", "nudes", "porn", "xxx", "sex video", "escort", "onlyfans", "boobs", "breasts", "hot video"],
  },
  {
    reason: "Violence or threat",
    patterns: ["kill you", "murder", "bomb attack", "school shooting", "behead"],
  },
  {
    reason: "Illegal activity",
    patterns: ["sell drugs", "buy drugs", "fake certificate", "fake degree", "gun for sale", "human trafficking", "child porn"],
  },
];
const AUTO_HIDE_REPORT_THRESHOLD = 3;
const AUTO_HIDE_SEVERE_REASON_THRESHOLD = 2;
const AUTO_HIDE_SEVERE_REASONS = new Set([
  "Hate Speech",
  "Sexual Content",
  "Violence or Threat",
  "Illegal Activity",
]);
let spotifyTokenCache = { token: "", expiresAt: 0 };

function safeStr(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampNumber(value, { min = 0, max = Number.POSITIVE_INFINITY, fallback = 0 } = {}) {
  const numeric = asNumber(value, fallback);
  return Math.min(max, Math.max(min, numeric));
}

function toTextArray(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item ?? "").split(/[\n,;/|]+/g))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,;/|]+/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function uniqueStrings(items = []) {
  return [...new Set(items.map((item) => safeStr(item)).filter(Boolean))];
}

function normalizeModerationText(value = "") {
  return safeStr(value)
    .toLowerCase()
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildModerationHaystacks(values = []) {
  const normalizedValues = values
    .map((value) => normalizeModerationText(value))
    .filter(Boolean);

  const source = normalizedValues.join(" ").trim();
  const collapsed = normalizedValues
    .map((value) =>
      value.replace(/\b(?:[a-z0-9]\s+){1,}[a-z0-9]\b/g, (match) =>
        match.replace(/\s+/g, "")
      )
    )
    .join(" ")
    .trim();

  return uniqueStrings([source, collapsed]).filter(Boolean);
}

function scanUnsafeText(values = []) {
  const haystacks = buildModerationHaystacks(values);

  if (!haystacks.length) {
    return { blocked: false, matchedTerms: [], reasons: [] };
  }

  const matchedTerms = [];
  const reasons = [];

  SOCIAL_TEXT_BLOCK_RULES.forEach((rule) => {
    const ruleMatches = rule.patterns.filter((pattern) => {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "i");
      return haystacks.some((source) => regex.test(source));
    });
    if (!ruleMatches.length) return;
    reasons.push(rule.reason);
    matchedTerms.push(...ruleMatches);
  });

  return {
    blocked: matchedTerms.length > 0,
    matchedTerms: uniqueStrings(matchedTerms),
    reasons: uniqueStrings(reasons),
  };
}

function evaluatePostReports(post) {
  const reports = Array.isArray(post?.reports) ? post.reports : [];
  const total = reports.length;
  const severeCount = reports.filter((report) =>
    AUTO_HIDE_SEVERE_REASONS.has(String(report?.reason || ""))
  ).length;

  return {
    total,
    severeCount,
    shouldHide:
      total >= AUTO_HIDE_REPORT_THRESHOLD ||
      severeCount >= AUTO_HIDE_SEVERE_REASON_THRESHOLD,
  };
}

function normalizeMediaModerationPayload(payload = {}) {
  if (!payload || typeof payload !== "object") return null;

  return {
    scanned: Boolean(payload?.scanned),
    blocked: Boolean(payload?.blocked),
    unsafeScore: clampNumber(payload?.unsafeScore, {
      min: 0,
      max: 1,
      fallback: 0,
    }),
    mediaKind: safeStr(payload?.mediaKind || "unknown"),
    framesScanned: clampNumber(payload?.framesScanned, {
      min: 0,
      max: 20,
      fallback: 0,
    }),
    version: safeStr(payload?.version || ""),
    reasons: uniqueStrings(Array.isArray(payload?.reasons) ? payload.reasons : []),
  };
}

function validateMediaModeration(payload, { required = false, label = "media" } = {}) {
  const moderation = normalizeMediaModerationPayload(payload);
  if (!moderation) {
    if (!required) return { moderation: null };
    return { error: `Safety scan is required before publishing this ${label}.` };
  }

  if (!moderation.scanned) {
    return { error: `Safety scan is required before publishing this ${label}.` };
  }

  if (moderation.blocked || moderation.unsafeScore >= 0.58) {
    return {
      error: `This ${label} may contain unsafe visual content and cannot be published.`,
      reasons: moderation.reasons,
    };
  }

  return { moderation };
}

function shouldDeletePostForReport(post, reason) {
  const reportReason = safeStr(reason);
  const mediaModeration = post?.mediaModeration || {};
  const unsafeScore = Number(mediaModeration?.unsafeScore || 0);
  const normalizedMediaReasons = uniqueStrings(
    Array.isArray(mediaModeration?.reasons) ? mediaModeration.reasons.map((item) => normalizeModerationText(item)) : []
  );
  const textModeration = scanUnsafeText([
    post?.headline,
    post?.content,
    ...(Array.isArray(post?.tags) ? post.tags : []),
  ]);
  const normalizedTextReasons = new Set(
    (textModeration.reasons || []).map((item) => normalizeModerationText(item))
  );

  const reasonMatchers = {
    "Abusive Language": () =>
      normalizedTextReasons.has("abusive language") || normalizedTextReasons.has("hate speech"),
    "Hate Speech": () => normalizedTextReasons.has("hate speech"),
    "Sexual Content": () =>
      normalizedTextReasons.has("sexual content") ||
      unsafeScore >= 0.4 ||
      normalizedMediaReasons.some((item) => item.includes("unsafe") || item.includes("sexual") || item.includes("nud")),
    "Violence or Threat": () =>
      normalizedTextReasons.has("violence or threat") ||
      normalizedMediaReasons.some((item) => item.includes("violence") || item.includes("weapon")),
    "Illegal Activity": () =>
      normalizedTextReasons.has("illegal activity") ||
      normalizedMediaReasons.some((item) => item.includes("illegal") || item.includes("unsafe")),
    "Spam or Misleading": () => false,
    Other: () => false,
  };

  return Boolean(reasonMatchers[reportReason]?.());
}

function mapNotification(notification) {
  return {
    id: String(notification?._id || ""),
    kind: safeStr(notification?.kind || "social"),
    eventType: safeStr(notification?.eventType || "social"),
    title: safeStr(notification?.title || ""),
    message: safeStr(notification?.message || ""),
    severity: safeStr(notification?.severity || "info"),
    createdAt: notification?.createdAt || null,
    readAt: notification?.readAt || null,
    actor: {
      id: String(notification?.actorUser || ""),
      name: safeStr(notification?.actorName || ""),
      avatarUrl: safeStr(notification?.actorAvatarUrl || ""),
    },
    relatedPostId: String(notification?.relatedPost || ""),
    relatedStoryId: String(notification?.relatedStory || ""),
    relatedThreadId: String(notification?.relatedThread || ""),
  };
}

function mapSocialMessage(message, viewer) {
  const senderUserId = String(message?.senderUser || "");
  const senderRole = safeStr(message?.senderRole);
  const viewerRole = safeStr(viewer?.role);
  const deleted = Boolean(message?.deletedAt);
  const reactions = Array.isArray(message?.reactions)
    ? message.reactions
        .map((item) => ({
          emoji: safeStr(item?.emoji),
          user: String(item?.user || ""),
        }))
        .filter((item) => item.emoji)
    : [];
  const sender =
    senderRole === "system"
      ? "system"
      : senderUserId && senderUserId === String(viewer?._id || "")
        ? "self"
        : senderRole === viewerRole
        ? "self"
        : "other";

  return {
    id: String(message?._id || ""),
    sender,
    type: safeStr(message?.type || "text"),
    text: deleted ? "This message was deleted." : safeStr(message?.text || ""),
    fileName: safeStr(message?.fileName || ""),
    fileSize: safeStr(message?.fileSize || ""),
    fileUrl: safeStr(message?.fileUrl || ""),
    mimeType: safeStr(message?.mimeType || ""),
    createdAt: message?.createdAt || null,
    deleted,
    reactions: reactions.map((item) => item.emoji),
    seenByOther:
      senderUserId === String(viewer?._id || "")
        ? (Array.isArray(message?.seenBy) ? message.seenBy : []).some(
            (userId) => String(userId || "") !== String(viewer?._id || "")
          )
        : false,
    canDelete:
      !deleted &&
      senderRole !== "system" &&
      senderUserId === String(viewer?._id || ""),
    canReport:
      !deleted &&
      senderRole !== "system" &&
      senderUserId !== String(viewer?._id || ""),
    reportCount: Number(message?.reportCount || 0),
    replyTo: message?.replyTo
      ? {
          id: String(message.replyTo?._id || message.replyTo?.id || ""),
          text: safeStr(message.replyTo?.deletedAt ? "This message was deleted." : message.replyTo?.text || ""),
          sender:
            String(message.replyTo?.senderUser || "") === String(viewer?._id || "")
              ? "self"
              : safeStr(message.replyTo?.senderRole) === "system"
                ? "system"
                : "other",
        }
      : null,
  };
}

async function mapSocialThreadsForViewer(threads = [], viewer) {
  const participantIds = uniqueStrings(
    threads.map((thread) => {
      const isStudentViewer = String(thread?.student?._id || thread?.student || "") === String(viewer?._id || "");
      return String(isStudentViewer ? thread?.company?._id || thread?.company || "" : thread?.student?._id || thread?.student || "");
    })
  );

  const [companyMap, followRows] = await Promise.all([
    getCompanyMap(participantIds),
    SocialFollow.find({
      follower: viewer._id,
      following: { $in: participantIds.map((id) => new mongoose.Types.ObjectId(id)) },
    })
      .select("following")
      .lean(),
  ]);

  const followedSet = new Set(followRows.map((row) => String(row.following)));

  return threads.map((thread) => {
    const isStudentViewer = String(thread?.student?._id || thread?.student || "") === String(viewer?._id || "");
    const otherUser = isStudentViewer ? thread.company : thread.student;
    const otherId = String(otherUser?._id || otherUser || "");
    const actor = buildActorProfile(otherUser, companyMap.get(otherId));
    const pending = safeStr(thread?.socialState || "accepted") === "pending";
    const requestedByViewer = String(thread?.socialRequestedBy || "") === String(viewer?._id || "");

    return {
      id: String(thread?._id || ""),
      type: pending ? (requestedByViewer ? "request_sent" : "request_received") : "conversation",
      unread: isStudentViewer ? Number(thread?.studentUnread || 0) : Number(thread?.companyUnread || 0),
      updatedAt: thread?.lastMessageAt || thread?.updatedAt || null,
      preview: safeStr(thread?.lastMessageText || ""),
      participant: {
        ...actor,
        isFollowed: followedSet.has(otherId),
      },
      socialState: pending ? "pending" : "accepted",
      canReply: !pending,
      canAccept: pending && !requestedByViewer,
      requestedByViewer,
    };
  });
}

async function getSocialMessageThreadForViewer(threadId, viewer) {
  if (!mongoose.Types.ObjectId.isValid(threadId)) return null;

  return MessageThread.findOne({
    _id: new mongoose.Types.ObjectId(threadId),
    source: "social",
    $or: [{ student: viewer._id }, { company: viewer._id }],
  })
    .populate("student")
    .populate("company")
    .lean();
}

function buildSocialThreadPairQuery(firstUserId, secondUserId) {
  return {
    source: "social",
    $or: [
      { student: firstUserId, company: secondUserId },
      { student: secondUserId, company: firstUserId },
    ],
  };
}

function buildSocialThreadParticipants(viewer, recipient) {
  const viewerRole = String(viewer?.role || "").toLowerCase();
  const recipientRole = String(recipient?.role || "").toLowerCase();

  if (viewerRole === "student" && recipientRole === "student") {
    const orderedParticipants = [
      { sortKey: String(viewer?._id || ""), value: viewer?._id },
      { sortKey: String(recipient?._id || ""), value: recipient?._id },
    ]
      .filter((item) => item.sortKey && item.value)
      .sort((left, right) => left.sortKey.localeCompare(right.sortKey));

    if (orderedParticipants.length !== 2) return null;

    return {
      student: orderedParticipants[0].value,
      company: orderedParticipants[1].value,
    };
  }

  if (viewerRole === "student" && recipientRole === "company") {
    return { student: viewer._id, company: recipient._id };
  }

  if (viewerRole === "company" && recipientRole === "student") {
    return { student: recipient._id, company: viewer._id };
  }

  return null;
}

function getSocialThreadRecipientUnreadUpdate(thread, senderId) {
  const senderIsStudentSlot =
    String(thread?.student?._id || thread?.student || "") === String(senderId || "");

  return senderIsStudentSlot ? { companyUnread: 1 } : { studentUnread: 1 };
}

async function appendSocialThreadTextMessage(thread, sender, text) {
  const cleanText = safeStr(text);
  if (!thread?._id || !cleanText) {
    return null;
  }

  const message = await Message.create({
    thread: thread._id,
    senderUser: sender._id,
    senderRole: sender.role,
    type: "text",
    text: cleanText,
  });

  await MessageThread.updateOne(
    { _id: thread._id },
    {
      $set: {
        lastMessageText: cleanText,
        lastMessageAt: new Date(),
      },
      $inc: getSocialThreadRecipientUnreadUpdate(thread, sender._id),
    }
  );

  return message;
}

async function refreshSocialThreadLastMessage(threadId) {
  const latestVisibleMessage = await Message.findOne({
    thread: threadId,
    deletedAt: null,
  })
    .sort({ createdAt: -1 })
    .lean();

  await MessageThread.updateOne(
    { _id: threadId },
    {
      $set: {
        lastMessageText: safeStr(latestVisibleMessage?.text || ""),
        lastMessageAt:
          latestVisibleMessage?.createdAt ||
          new Date(),
      },
    }
  );
}

function shouldAutoAcceptSocialThread(viewer, recipient, followState = {}) {
  const viewerRole = safeStr(viewer?.role).toLowerCase();
  const recipientRole = safeStr(recipient?.role).toLowerCase();
  const viewerFollowsRecipient = Boolean(followState.viewerFollowsRecipient);

  if (viewerRole === "student" && recipientRole === "student") {
    return viewerFollowsRecipient;
  }

  return false;
}

async function findExistingSocialThreadBetweenUsers(firstUserId, secondUserId) {
  return MessageThread.findOne(buildSocialThreadPairQuery(firstUserId, secondUserId))
    .populate("student")
    .populate("company")
    .lean();
}

async function resolveSocialRecipient(recipientId) {
  const directUser = await User.findById(recipientId).lean();
  if (
    directUser &&
    directUser.isActive &&
    ["student", "company"].includes(String(directUser.role || "").toLowerCase())
  ) {
    return directUser;
  }

  if (!mongoose.Types.ObjectId.isValid(recipientId)) return null;

  const company = await Company.findById(recipientId).lean();
  if (!company?.ownerUserId) return null;

  const companyOwner = await User.findById(company.ownerUserId).lean();
  if (
    companyOwner &&
    companyOwner.isActive &&
    String(companyOwner.role || "").toLowerCase() === "company"
  ) {
    return companyOwner;
  }

  return null;
}

async function createExploreNotification({
  userId,
  actorUser = null,
  actorName = "",
  actorAvatarUrl = "",
  kind = "social",
  eventType = "social",
  title = "",
  message = "",
  severity = "info",
  relatedPost = null,
  relatedStory = null,
  relatedThread = null,
} = {}) {
  if (!mongoose.Types.ObjectId.isValid(String(userId || ""))) return null;

  return SocialNotification.create({
    user: userId,
    actorUser: actorUser && mongoose.Types.ObjectId.isValid(String(actorUser)) ? actorUser : null,
    actorName: safeStr(actorName),
    actorAvatarUrl: safeStr(actorAvatarUrl),
    kind,
    eventType: safeStr(eventType || kind || "social"),
    title,
    message,
    severity,
    relatedPost: relatedPost && mongoose.Types.ObjectId.isValid(String(relatedPost)) ? relatedPost : null,
    relatedStory: relatedStory && mongoose.Types.ObjectId.isValid(String(relatedStory)) ? relatedStory : null,
    relatedThread: relatedThread && mongoose.Types.ObjectId.isValid(String(relatedThread)) ? relatedThread : null,
  });
}

function capitalize(label = "") {
  const value = safeStr(label);
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : "";
}

function extractTags(content = "", extra = []) {
  const matches = [];
  const regex = /#([\w-]+)/g;
  let match = regex.exec(String(content || ""));
  while (match) {
    matches.push(match[1]);
    match = regex.exec(String(content || ""));
  }
  return uniqueStrings([...matches, ...toTextArray(extra)]).slice(0, 8);
}

function mapJamendoTrack(track = {}) {
  const id = String(track?.id ?? "").trim();
  const title = safeStr(track?.name || track?.title || "Untitled");
  const artist = safeStr(track?.artist_name || track?.artist || "Unknown artist");
  const album = safeStr(track?.album_name || track?.album || "");
  const coverUrl = safeStr(track?.image || track?.album_image || track?.album_cover || "");
  const audioUrl = safeStr(track?.audio || track?.audiodownload || "");
  const durationSeconds = Math.max(0, Math.floor(asNumber(track?.duration, 0)));

  return {
    id,
    title,
    artist,
    album,
    coverUrl,
    audioUrl,
    durationSeconds,
    provider: "jamendo",
  };
}

function mapSpotifyTrack(track = {}) {
  const id = String(track?.id ?? "").trim();
  const title = safeStr(track?.name || "Untitled");
  const artist = Array.isArray(track?.artists)
    ? track.artists.map((item) => safeStr(item?.name)).filter(Boolean).join(", ")
    : "";
  const album = safeStr(track?.album?.name || "");
  const coverUrl = Array.isArray(track?.album?.images) ? safeStr(track.album.images?.[0]?.url) : "";
  const audioUrl = safeStr(track?.preview_url);
  const durationSeconds = Math.max(0, Math.floor(asNumber(track?.duration_ms, 0) / 1000));

  return {
    id,
    title,
    artist: artist || "Unknown artist",
    album,
    coverUrl,
    audioUrl,
    durationSeconds,
    provider: "spotify",
  };
}

function mapITunesTrack(track = {}) {
  const id = String(track?.trackId ?? "").trim();
  const title = safeStr(track?.trackName || "Untitled");
  const artist = safeStr(track?.artistName || "Unknown artist");
  const album = safeStr(track?.collectionName || "");
  const coverSmall = safeStr(track?.artworkUrl100 || track?.artworkUrl60 || track?.artworkUrl30 || "");
  const coverUrl = coverSmall ? coverSmall.replace(/([0-9]+x[0-9]+)bb\./i, "512x512bb.") : "";
  const audioUrl = safeStr(track?.previewUrl);
  const durationSeconds = Math.max(0, Math.floor(asNumber(track?.trackTimeMillis, 0) / 1000));

  return {
    id,
    title,
    artist,
    album,
    coverUrl,
    audioUrl,
    durationSeconds,
    provider: "itunes",
  };
}

function withTrackKey(track = {}) {
  const id = safeStr(track?.id || track?.trackId);
  const provider = safeStr(track?.provider || "unknown");
  const fallback = `${safeStr(track?.title)}|${safeStr(track?.artist)}|${safeStr(track?.audioUrl)}`;
  return `${provider}:${id || fallback}`;
}

function uniqTrackResults(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = withTrackKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasSpotifyCredentials() {
  return Boolean(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET);
}

async function getSpotifyAccessToken() {
  if (!hasSpotifyCredentials()) {
    throw new Error("Spotify credentials are not configured.");
  }

  if (spotifyTokenCache.token && Date.now() < spotifyTokenCache.expiresAt - 30 * 1000) {
    return spotifyTokenCache.token;
  }

  const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Spotify token request failed (${response.status}).`);
  }

  const payload = await response.json();
  const token = safeStr(payload?.access_token);
  const expiresIn = Math.max(60, Number(payload?.expires_in || 3600));
  if (!token) {
    throw new Error("Spotify token response was empty.");
  }

  spotifyTokenCache = {
    token,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  return token;
}

async function fetchSpotifyTracks({ q, section, limit, offset }) {
  const token = await getSpotifyAccessToken();
  const query = safeStr(q) || (section === "trending" ? "trending india songs hits" : DEFAULT_INDIAN_HITS_QUERY);
  const params = new URLSearchParams({
    q: query,
    type: "track",
    market: "IN",
    limit: String(limit),
    offset: String(offset),
  });

  const response = await fetch(`${SPOTIFY_API_BASE_URL}/search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Spotify search failed (${response.status}).`);
  }

  const payload = await response.json();
  const items = Array.isArray(payload?.tracks?.items) ? payload.tracks.items : [];
  const total = Math.max(0, Number(payload?.tracks?.total || 0));
  const tracks = items.map(mapSpotifyTrack).filter((track) => track.id && track.audioUrl);

  return {
    source: "spotify",
    tracks,
    hasMore: offset + items.length < total,
    nextOffset: offset + items.length,
  };
}

async function fetchJamendoTracks({ q, section, limit, offset }) {
  const params = new URLSearchParams();
  params.set("client_id", JAMENDO_CLIENT_ID);
  params.set("format", "json");
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  params.set("audioformat", "mp32");
  params.set("include", "musicinfo");
  params.set("order", section === "trending" ? "popularity_total" : "popularity_total");
  if (q) {
    params.set("search", q);
  }

  const response = await fetch(`${JAMENDO_BASE_URL}/tracks/?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Jamendo search failed (${response.status}).`);
  }

  const payload = await response.json();
  const status = safeStr(payload?.headers?.status).toLowerCase();
  if (status && status !== "success") {
    throw new Error(safeStr(payload?.headers?.error_message) || "Jamendo returned an error.");
  }

  const tracks = Array.isArray(payload?.results)
    ? payload.results.map(mapJamendoTrack).filter((track) => track.id && track.audioUrl)
    : [];

  return {
    source: "jamendo",
    tracks,
    hasMore: tracks.length >= limit,
    nextOffset: offset + tracks.length,
  };
}

async function fetchITunesTracks({ q, section, limit, offset }) {
  const term = safeStr(q) || (section === "trending" ? "trending india songs" : DEFAULT_INDIAN_HITS_QUERY);
  const fetchLimit = Math.max(limit, Math.min(200, offset + limit));
  const params = new URLSearchParams({
    term,
    country: "IN",
    media: "music",
    entity: "song",
    limit: String(fetchLimit),
  });

  const response = await fetch(`${ITUNES_SEARCH_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`iTunes search failed (${response.status}).`);
  }

  const payload = await response.json();
  const allTracks = Array.isArray(payload?.results)
    ? payload.results.map(mapITunesTrack).filter((track) => track.id && track.audioUrl)
    : [];
  const tracks = allTracks.slice(offset, offset + limit);

  return {
    source: "itunes",
    tracks,
    hasMore: allTracks.length > offset + tracks.length,
    nextOffset: offset + tracks.length,
  };
}

function normalizeStoryMusicPayload(payload = {}) {
  const audioUrl = safeStr(payload?.audioUrl);
  if (!audioUrl) return null;

  const durationSeconds = Math.max(3, Math.floor(asNumber(payload?.durationSeconds, 15)));
  const startSeconds = clampNumber(payload?.startSeconds, {
    min: 0,
    max: Math.max(0, durationSeconds - 3),
    fallback: 0,
  });
  const maxClip = Math.max(3, durationSeconds - startSeconds);
  const clipDurationSeconds = clampNumber(payload?.clipDurationSeconds, {
    min: 3,
    max: maxClip,
    fallback: Math.min(15, maxClip),
  });

  return {
    provider: safeStr(payload?.provider || "jamendo") || "jamendo",
    trackId: safeStr(payload?.trackId || payload?.id),
    title: safeStr(payload?.title || payload?.name),
    artist: safeStr(payload?.artist),
    album: safeStr(payload?.album),
    coverUrl: safeStr(payload?.coverUrl),
    audioUrl,
    durationSeconds,
    startSeconds,
    clipDurationSeconds,
  };
}

function resolveStoryExpiry(inputDateValue) {
  const DEFAULT_24H = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const value = safeStr(inputDateValue);
  if (!value) {
    return { expiresAt: DEFAULT_24H, usingCustomDate: false };
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return { error: "Invalid story expiry date." };
  }

  if (parsed.getTime() <= Date.now() + 60 * 1000) {
    return { error: "Story expiry must be at least 1 minute in the future." };
  }

  return { expiresAt: parsed, usingCustomDate: true };
}

function buildStudentHeadline(user) {
  const personal = user?.studentProfile?.personal || {};
  const preferred = user?.studentProfile?.preferred || {};
  const skills = toTextArray(user?.studentProfile?.skills)
    .slice(0, 3)
    .map((item) => item.replace(/^./, (char) => char.toUpperCase()));

  const parts = [
    safeStr(preferred.stream),
    safeStr(preferred.category),
    skills.length ? skills.join(" • ") : "",
  ].filter(Boolean);

  return (
    parts.join(" • ") ||
    safeStr(personal.location) ||
    safeStr(user?.location) ||
    "Student building skills and sharing career wins"
  );
}

function buildCompanyHeadline(company, user) {
  const parts = [
    safeStr(company?.industry),
    safeStr(company?.category),
    safeStr(company?.location),
  ].filter(Boolean);

  return (
    parts.join(" • ") ||
    safeStr(company?.about) ||
    safeStr(user?.location) ||
    "Hiring team sharing roles, culture, and career updates"
  );
}

function computeProfileStrength(user, company) {
  if (user?.role === "company") {
    const checks = [
      safeStr(company?.name),
      safeStr(company?.industry),
      safeStr(company?.location),
      safeStr(company?.about),
      safeStr(company?.website),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }

  const personal = user?.studentProfile?.personal || {};
  const preferred = user?.studentProfile?.preferred || {};
  const checks = [
    safeStr(user?.name) || safeStr(personal.fullName),
    safeStr(user?.location) || safeStr(personal.location) || safeStr(personal.city),
    safeStr(preferred.stream),
    safeStr(preferred.category),
    toTextArray(user?.studentProfile?.skills).length ? "skills" : "",
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function buildActorProfile(user, company) {
  const isCompany = String(user?.role || "") === "company";
  const avatarUrl = safeStr(
    isCompany
      ? company?.logoUrl
      : user?.avatarUrl || user?.avatar || user?.profilePhoto || user?.imageUrl || ""
  );
  const explicitOnline = [user?.isOnline, user?.online, company?.isOnline, company?.online].find(
    (value) => typeof value === "boolean"
  );
  const lastSeenAt =
    user?.lastSeenAt ||
    user?.lastActiveAt ||
    company?.lastSeenAt ||
    company?.lastActiveAt ||
    user?.updatedAt ||
    company?.updatedAt ||
    user?.createdAt ||
    company?.createdAt ||
    null;
  const lastSeenTime = new Date(lastSeenAt || 0).getTime();
  const isOnline =
    typeof explicitOnline === "boolean"
      ? explicitOnline
      : Number.isFinite(lastSeenTime) && Date.now() - lastSeenTime <= 1000 * 60 * 15;
  const name =
    safeStr(isCompany ? company?.name : user?.name) ||
    safeStr(user?.name) ||
    (isCompany ? "Company" : "Student");
  const location =
    safeStr(isCompany ? company?.location : user?.location) ||
    safeStr(user?.location) ||
    "India";
  const headline = isCompany
    ? buildCompanyHeadline(company, user)
    : buildStudentHeadline(user);
  const focusTags = isCompany
    ? uniqueStrings([company?.industry, company?.category, company?.location]).slice(0, 3)
    : uniqueStrings([
        user?.studentProfile?.preferred?.stream,
        user?.studentProfile?.preferred?.category,
        ...toTextArray(user?.studentProfile?.skills).slice(0, 2),
      ]).slice(0, 4);

  return {
    id: String(user?._id || ""),
    role: String(user?.role || "student"),
    badge: isCompany ? "Company" : "Student",
    name,
    headline,
    location,
    avatarUrl,
    isOnline,
    lastSeenAt: lastSeenAt ? new Date(lastSeenAt).toISOString() : null,
    profileStrength: computeProfileStrength(user, company),
    focusTags,
    intro: isCompany
      ? safeStr(company?.about) || "Sharing hiring updates, culture, and work highlights."
      : "Posting wins, projects, reels, and career updates from campus life.",
    website: safeStr(isCompany ? company?.website : user?.portfolio),
  };
}

function mapComment(comment, viewerId) {
  return {
    id: String(comment?._id || ""),
    author: {
      id: String(comment?.authorUser || ""),
      role: comment?.authorRole || "student",
      name: comment?.authorName || "User",
      headline: comment?.authorHeadline || "",
      avatarUrl: comment?.authorAvatarUrl || "",
    },
    text: comment?.text || "",
    createdAt: comment?.createdAt || null,
    canEdit: String(comment?.authorUser || "") === String(viewerId || ""),
  };
}

function mapPost(post, viewerId, followSet, followerMap) {
  const authorId = String(post?.authorUser || "");
  const likedByViewer = (post?.likedBy || []).some(
    (item) => String(item) === String(viewerId || "")
  );
  const savedByViewer = (post?.savedBy || []).some(
    (item) => String(item) === String(viewerId || "")
  );

  return {
    id: String(post?._id || ""),
    type: post?.type || "text",
    headline: post?.headline || "",
    content: post?.content || "",
    createdAt: post?.createdAt || null,
    visibility: post?.visibility || "everyone",
    media: {
      url: post?.mediaUrl || "",
      publicId: post?.mediaPublicId || "",
      resourceType: post?.mediaResourceType || "",
      mimeType: post?.mimeType || "",
    },
    tags: Array.isArray(post?.tags) ? post.tags : [],
    metrics: {
      likes: Array.isArray(post?.likedBy) ? post.likedBy.length : 0,
      saves: Array.isArray(post?.savedBy) ? post.savedBy.length : 0,
      comments: Array.isArray(post?.comments) ? post.comments.length : 0,
      shares: Number(post?.shareCount || 0),
      impressions: Number(post?.impressions || 0),
    },
    author: {
      id: authorId,
      role: post?.authorRole || "student",
      badge: capitalize(post?.authorRole || "student"),
      name: post?.authorName || "User",
      headline: post?.authorHeadline || "",
      avatarUrl: post?.authorAvatarUrl || "",
      followers: Number(followerMap.get(authorId) || 0),
      isFollowed: followSet.has(authorId),
      canFollow: authorId && authorId !== String(viewerId || ""),
      canMessage: authorId && authorId !== String(viewerId || ""),
    },
    viewerState: {
      liked: likedByViewer,
      saved: savedByViewer,
      canLike: authorId !== String(viewerId || ""),
      canComment: true,
      canReport: authorId !== String(viewerId || ""),
    },
    comments: (post?.comments || [])
      .slice(-4)
      .map((comment) => mapComment(comment, viewerId)),
    moderation: {
      status: post?.moderationStatus || "visible",
      reports: Array.isArray(post?.reports) ? post.reports.length : 0,
    },
  };
}

async function buildStoryAudienceMembers(userIds = []) {
  const orderedIds = [...new Set((Array.isArray(userIds) ? userIds : []).map((item) => String(item || "")).filter(Boolean))];
  if (!orderedIds.length) return [];

  const objectIds = orderedIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!objectIds.length) return [];

  const users = await User.find({ _id: { $in: objectIds } })
    .select("name role location portfolio studentProfile")
    .lean();

  const companyUserIds = users
    .filter((user) => String(user?.role || "") === "company")
    .map((user) => user._id);

  const companies = companyUserIds.length
    ? await Company.find({ userId: { $in: companyUserIds } })
        .select("userId name industry category location about website logoUrl")
        .lean()
    : [];

  const companyMap = new Map(companies.map((company) => [String(company.userId), company]));
  const userMap = new Map(users.map((user) => [String(user._id), user]));

  return orderedIds
    .map((id) => {
      const user = userMap.get(String(id));
      if (!user) return null;
      const actor = buildActorProfile(user, companyMap.get(String(user._id)));
      return {
        id: actor.id,
        name: actor.name,
        headline: actor.headline,
        avatarUrl: actor.avatarUrl,
        role: actor.role,
      };
    })
    .filter(Boolean);
}

function mapStory(story, viewerId, followSet) {
  const authorId = String(story?.authorUser || "");
  const seenByViewer = (story?.seenBy || []).some(
    (item) => String(item) === String(viewerId || "")
  );
  const musicPayload = normalizeStoryMusicPayload(story?.music || {});

  return {
    id: String(story?._id || ""),
    caption: story?.caption || "",
    createdAt: story?.createdAt || null,
    expiresAt: story?.expiresAt || null,
    media: {
      url: story?.mediaUrl || "",
      publicId: story?.mediaPublicId || "",
      resourceType: story?.mediaResourceType || "",
      mimeType: story?.mimeType || "",
    },
    author: {
      id: authorId,
      role: story?.authorRole || "student",
      badge: capitalize(story?.authorRole || "student"),
      name: story?.authorName || "User",
      headline: story?.authorHeadline || "",
      avatarUrl: story?.authorAvatarUrl || "",
      isSelf: authorId === String(viewerId || ""),
      isFollowed: followSet.has(authorId),
    },
    music: musicPayload,
    metrics: {
      likes: Array.isArray(story?.likedBy) ? story.likedBy.length : 0,
      views: Array.isArray(story?.seenBy) ? story.seenBy.length : 0,
    },
    viewerState: {
      seen: seenByViewer || authorId === String(viewerId || ""),
      canReport: authorId !== String(viewerId || ""),
      liked: Array.isArray(story?.likedBy)
        ? story.likedBy.some((item) => String(item) === String(viewerId || ""))
        : false,
    },
  };
}

async function getStoryViewerPreferences(viewerId) {
  if (!viewerId) {
    return {
      mutedAuthorIds: [],
      mutedAuthorSet: new Set(),
    };
  }

  const viewer = await User.findById(viewerId)
    .select("socialPreferences.storyMutedAuthors")
    .lean();

  const mutedAuthorIds = uniqueStrings(
    (viewer?.socialPreferences?.storyMutedAuthors || []).map((item) => String(item || ""))
  ).filter((id) => id !== String(viewerId || ""));

  return {
    mutedAuthorIds,
    mutedAuthorSet: new Set(mutedAuthorIds),
  };
}

function buildStoryGroups(stories = [], viewerId, followSet) {
  const grouped = new Map();

  stories.forEach((story) => {
    const mappedStory = mapStory(story, viewerId, followSet);
    const authorId = mappedStory.author.id;
    if (!authorId) return;

    if (!grouped.has(authorId)) {
      grouped.set(authorId, {
        id: authorId,
        author: mappedStory.author,
        items: [],
        latestCreatedAt: mappedStory.createdAt,
      });
    }

    const group = grouped.get(authorId);
    group.items.push(mappedStory);

    if (
      !group.latestCreatedAt ||
      new Date(mappedStory.createdAt || 0).getTime() >
        new Date(group.latestCreatedAt || 0).getTime()
    ) {
      group.latestCreatedAt = mappedStory.createdAt;
    }
  });

  return [...grouped.values()]
    .map((group) => {
      const items = [...group.items].sort(
        (a, b) =>
          new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
      );
      const latestItem = items[items.length - 1] || null;
      const hasUnseen = items.some((item) => !item.viewerState?.seen);
      return {
        ...group,
        items,
        preview: latestItem?.media || null,
        metrics: {
          count: items.length,
        },
        viewerState: {
          hasUnseen,
          seen: !hasUnseen,
        },
      };
    })
    .sort((a, b) => {
      if (a.author?.isSelf !== b.author?.isSelf) {
        return a.author?.isSelf ? -1 : 1;
      }
      if (a.viewerState?.hasUnseen !== b.viewerState?.hasUnseen) {
        return a.viewerState?.hasUnseen ? -1 : 1;
      }
      return (
        new Date(b.latestCreatedAt || 0).getTime() -
        new Date(a.latestCreatedAt || 0).getTime()
      );
    });
}

async function canViewerAccessPost(post, viewer) {
  if (!post || !viewer?._id) return false;
  if (["hidden", "deleted"].includes(String(post?.moderationStatus || ""))) return false;

  const visibility = String(post?.visibility || "everyone");
  if (visibility === "everyone") return true;
  if (String(post?.authorUser || "") === String(viewer._id || "")) return true;

  const follow = await SocialFollow.exists({
    follower: viewer._id,
    following: post.authorUser,
  });

  return Boolean(follow);
}

async function canViewerAccessStory(story, viewer) {
  if (!story || !viewer?._id) return false;
  if (new Date(story?.expiresAt || 0).getTime() <= Date.now()) return false;
  if (String(story?.moderationStatus || "visible") !== "visible") return false;
  if (String(story?.authorUser || "") === String(viewer._id || "")) return true;

  const follow = await SocialFollow.exists({
    follower: viewer._id,
    following: story.authorUser,
  });

  return Boolean(follow);
}

async function getCompanyMap(userIds = []) {
  const objectIds = userIds
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));

  if (!objectIds.length) return new Map();

  const companies = await Company.find({ ownerUserId: { $in: objectIds } }).lean();
  return new Map(companies.map((company) => [String(company.ownerUserId), company]));
}

async function getFollowerMap(userIds = []) {
  const objectIds = userIds
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));

  if (!objectIds.length) return new Map();

  const rows = await SocialFollow.aggregate([
    { $match: { following: { $in: objectIds } } },
    { $group: { _id: "$following", count: { $sum: 1 } } },
  ]);

  return new Map(rows.map((row) => [String(row._id), Number(row.count || 0)]));
}

async function getPostCountMap(userIds = []) {
  const objectIds = userIds
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));

  if (!objectIds.length) return new Map();

  const rows = await SocialPost.aggregate([
    { $match: { authorUser: { $in: objectIds } } },
    { $group: { _id: "$authorUser", count: { $sum: 1 } } },
  ]);

  return new Map(rows.map((row) => [String(row._id), Number(row.count || 0)]));
}

async function resolveViewerContext(user) {
  const company =
    String(user?.role || "") === "company"
      ? await Company.findOne({ ownerUserId: user._id }).lean()
      : null;
  return buildActorProfile(user, company);
}

async function buildSuggestionCards(viewer, followedSet) {
  const users = await User.find({
    _id: { $ne: viewer._id },
    role: { $in: ["student", "company"] },
    isActive: true,
  })
    .sort({ updatedAt: -1 })
    .limit(16)
    .lean();

  const ids = users.map((item) => String(item._id));
  const [companyMap, followerMap, postCountMap] = await Promise.all([
    getCompanyMap(ids),
    getFollowerMap(ids),
    getPostCountMap(ids),
  ]);

  return users
    .map((user) => {
      const actor = buildActorProfile(user, companyMap.get(String(user._id)));
      return {
        ...actor,
        followers: Number(followerMap.get(String(user._id)) || 0),
        posts: Number(postCountMap.get(String(user._id)) || 0),
        isFollowing: followedSet.has(String(user._id)),
        isFollowed: followedSet.has(String(user._id)),
        canMessage: String(user?._id || "") !== String(viewer?._id || ""),
        reason:
          actor.role === "company"
            ? "Sharing hiring updates and opportunities"
            : "Posting projects, campus wins, and career learning",
      };
    })
    .sort((a, b) => {
      const aRoleScore = a.role !== viewer.role ? 0 : 1;
      const bRoleScore = b.role !== viewer.role ? 0 : 1;
      if (aRoleScore !== bRoleScore) return aRoleScore - bRoleScore;
      if (a.isFollowing !== b.isFollowing) return Number(a.isFollowing) - Number(b.isFollowing);
      return (b.followers || 0) - (a.followers || 0);
    })
    .slice(0, 12);
}

function buildTrendingTags(posts = []) {
  const tagCount = new Map();
  posts.forEach((post) => {
    (post?.tags || []).forEach((tag) => {
      const key = safeStr(tag).replace(/^#/, "");
      if (!key) return;
      tagCount.set(key, Number(tagCount.get(key) || 0) + 1);
    });
  });

  const entries = [...tagCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => ({
      tag: `#${tag}`,
      count,
    }));

  if (entries.length) return entries;

  return [
    { tag: "#CampusWins", count: 0 },
    { tag: "#HiringNow", count: 0 },
    { tag: "#PortfolioDrop", count: 0 },
    { tag: "#Explore", count: 0 },
  ];
}

export async function searchCareerPulseMusic(req, res, next) {
  try {
    const q = safeStr(req.query?.q);
    const section = safeStr(req.query?.section).toLowerCase() || "for-you";
    const source = safeStr(req.query?.source).toLowerCase() || "auto";
    const limit = Math.max(8, Math.min(40, Number(req.query?.limit || 24)));
    const offset = Math.max(0, Number(req.query?.offset || 0));

    const attemptedProviders = [];
    const providerErrors = [];
    let spotifyResult = null;
    let itunesResult = null;
    let jamendoResult = null;

    const shouldTrySpotify = source === "spotify" || source === "auto";
    const shouldTryITunes = source === "itunes" || source === "auto" || source === "spotify";
    const shouldTryJamendo = source === "jamendo" || source === "auto";

    if (shouldTrySpotify) {
      attemptedProviders.push("spotify");
      try {
        spotifyResult = await fetchSpotifyTracks({ q, section, limit, offset });
      } catch (error) {
        providerErrors.push(`spotify: ${error?.message || "failed"}`);
      }
    }

    if (shouldTryJamendo && (!spotifyResult || spotifyResult.tracks.length < Math.min(6, limit))) {
      attemptedProviders.push("jamendo");
      try {
        jamendoResult = await fetchJamendoTracks({ q, section, limit, offset });
      } catch (error) {
        providerErrors.push(`jamendo: ${error?.message || "failed"}`);
      }
    }

    if (shouldTryITunes && (!spotifyResult || spotifyResult.tracks.length < Math.min(6, limit))) {
      attemptedProviders.push("itunes");
      try {
        itunesResult = await fetchITunesTracks({ q, section, limit, offset });
      } catch (error) {
        providerErrors.push(`itunes: ${error?.message || "failed"}`);
      }
    }

    let mergedTracks = uniqTrackResults([
      ...(spotifyResult?.tracks || []),
      ...(itunesResult?.tracks || []),
      ...(jamendoResult?.tracks || []),
    ]).slice(0, limit);

    if (!mergedTracks.length && source === "auto" && q) {
      if (shouldTrySpotify) {
        try {
          spotifyResult = await fetchSpotifyTracks({ q: "", section, limit, offset: 0 });
        } catch (error) {
          providerErrors.push(`spotify-fallback: ${error?.message || "failed"}`);
        }
      }

      if (shouldTryJamendo) {
        try {
          jamendoResult = await fetchJamendoTracks({ q: "", section, limit, offset: 0 });
        } catch (error) {
          providerErrors.push(`jamendo-fallback: ${error?.message || "failed"}`);
        }
      }

      if (shouldTryITunes) {
        try {
          itunesResult = await fetchITunesTracks({ q: "", section, limit, offset: 0 });
        } catch (error) {
          providerErrors.push(`itunes-fallback: ${error?.message || "failed"}`);
        }
      }

      mergedTracks = uniqTrackResults([
        ...(spotifyResult?.tracks || []),
        ...(itunesResult?.tracks || []),
        ...(jamendoResult?.tracks || []),
      ]).slice(0, limit);
    }

    if (!mergedTracks.length) {
      return res.status(200).json({
        source: attemptedProviders.join("+") || "none",
        tracks: [],
        hasMore: false,
        nextOffset: offset,
        message:
          "No songs found for this search with playable preview audio. Try another keyword.",
        providerErrors,
      });
    }

    return res.json({
      source:
        spotifyResult?.tracks?.length && itunesResult?.tracks?.length && jamendoResult?.tracks?.length
          ? "spotify+itunes+jamendo"
          : spotifyResult?.tracks?.length && itunesResult?.tracks?.length
            ? "spotify+itunes"
            : spotifyResult?.tracks?.length && jamendoResult?.tracks?.length
              ? "spotify+jamendo"
              : itunesResult?.tracks?.length && jamendoResult?.tracks?.length
                ? "itunes+jamendo"
                : spotifyResult?.tracks?.length
                  ? "spotify"
                  : itunesResult?.tracks?.length
                    ? "itunes"
                    : "jamendo",
      tracks: mergedTracks,
      hasMore: Boolean(
        (spotifyResult && spotifyResult.hasMore) ||
          (itunesResult && itunesResult.hasMore) ||
          (jamendoResult && jamendoResult.hasMore),
      ),
      nextOffset: Math.max(
        Number(spotifyResult?.nextOffset || offset),
        Number(itunesResult?.nextOffset || offset),
        Number(jamendoResult?.nextOffset || offset),
      ),
      providerErrors,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCareerPulseStories(req, res, next) {
  try {
    const viewer = req.user;
    const now = new Date();
    const { mutedAuthorIds, mutedAuthorSet } = await getStoryViewerPreferences(viewer._id);

    const followedRows = await SocialFollow.find({ follower: viewer._id })
      .select("following")
      .lean();
    const followedIds = new Set(followedRows.map((row) => String(row.following)));
    const visibleFollowedIds = [...followedIds].filter(
      (id) => !mutedAuthorSet.has(String(id || ""))
    );

    const visibleAuthorIds = [
      new mongoose.Types.ObjectId(viewer._id),
      ...visibleFollowedIds.map((id) => new mongoose.Types.ObjectId(id)),
    ];

    const stories = await SocialStory.find({
      authorUser: { $in: visibleAuthorIds },
      expiresAt: { $gt: now },
      moderationStatus: { $in: ["visible", null] },
      hiddenForUsers: { $ne: viewer._id },
    })
      .sort({ createdAt: -1 })
      .limit(120)
      .lean();

    return res.json({
      groups: buildStoryGroups(stories, viewer._id, followedIds),
      ttlHours: 24,
      viewerPreferences: {
        mutedAuthorIds,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getCareerPulseStoryInsights(req, res, next) {
  try {
    const viewer = req.user;
    const storyId = String(req.params?.storyId || "");
    if (!mongoose.Types.ObjectId.isValid(storyId)) {
      return res.status(400).json({ message: "Invalid story id." });
    }

    const story = await SocialStory.findById(storyId).lean();
    if (!story) {
      return res.status(404).json({ message: "Story not found." });
    }
    if (String(story.authorUser || "") !== String(viewer?._id || "")) {
      return res.status(403).json({ message: "Only the story owner can view insights." });
    }

    const [viewers, likes] = await Promise.all([
      buildStoryAudienceMembers(story.seenBy || []),
      buildStoryAudienceMembers(story.likedBy || []),
    ]);

    return res.json({
      storyId: String(story._id),
      metrics: {
        views: viewers.length,
        likes: likes.length,
      },
      viewers,
      likes,
    });
  } catch (error) {
    next(error);
  }
}

export async function createCareerPulseStory(req, res, next) {
  try {
    const viewer = req.user;
    const mediaUrl = safeStr(req.body?.mediaUrl);
    const mimeType = safeStr(req.body?.mimeType).toLowerCase();
    const resourceType = safeStr(req.body?.mediaResourceType).toLowerCase();
    const caption = safeStr(req.body?.caption);
    const rawMusic = req.body?.music && typeof req.body.music === "object" ? req.body.music : null;
    const textModeration = scanUnsafeText([caption]);
    const mediaModerationCheck = validateMediaModeration(req.body?.mediaModeration, {
      required: true,
      label: "story",
    });

    if (!mediaUrl) {
      return res.status(400).json({ message: "Upload an image or video before publishing a story." });
    }
    if (mediaModerationCheck.error) {
      await createExploreNotification({
        userId: viewer._id,
        kind: "moderation_warning",
        title: "Story not shared",
        message: mediaModerationCheck.error,
        severity: "warning",
      });
      return res.status(400).json({
        message: mediaModerationCheck.error,
        reasons: mediaModerationCheck.reasons || [],
      });
    }
    if (textModeration.blocked) {
      await createExploreNotification({
        userId: viewer._id,
        kind: "moderation_warning",
        title: "Story blocked",
        message: "Your story caption contains abusive, sexual, illegal, or unsafe language. Edit it before posting.",
        severity: "warning",
      });
      return res.status(400).json({
        message: "Your story caption contains abusive, unsafe, or policy-violating language. Please edit it and try again.",
        reasons: textModeration.reasons,
      });
    }

    const isAllowedMedia =
      mimeType.startsWith("image/") ||
      mimeType.startsWith("video/") ||
      resourceType === "image" ||
      resourceType === "video";

    if (!isAllowedMedia) {
      return res.status(400).json({ message: "Stories currently support only image and video uploads." });
    }

    const isImageStory = mimeType.startsWith("image/") || resourceType === "image";
    const normalizedMusic = rawMusic ? normalizeStoryMusicPayload(rawMusic) : null;
    if (rawMusic && !normalizedMusic) {
      return res.status(400).json({ message: "Selected story music is invalid. Please pick a valid song." });
    }
    if (normalizedMusic && !isImageStory) {
      return res.status(400).json({ message: "Music tracks can be attached only to image stories." });
    }

    const expiry = resolveStoryExpiry(req.body?.expiresAt);
    if (expiry.error) {
      return res.status(400).json({ message: expiry.error });
    }

    const actor = await resolveViewerContext(viewer);
    const story = await SocialStory.create({
      authorUser: viewer._id,
      authorRole: viewer.role,
      authorName: actor.name,
      authorHeadline: actor.headline,
      authorAvatarUrl: actor.avatarUrl,
      caption,
      mediaUrl,
      mediaPublicId: safeStr(req.body?.mediaPublicId),
      mediaResourceType: safeStr(req.body?.mediaResourceType),
      mimeType: safeStr(req.body?.mimeType),
      music: normalizedMusic || undefined,
      moderationStatus: "visible",
      moderationReasons: [],
      expiresAt: expiry.expiresAt,
    });

    return res.status(201).json({
      message: "Story shared to Explore.",
      story: mapStory(story.toObject(), viewer._id, new Set()),
    });
  } catch (error) {
    next(error);
  }
}

export async function markCareerPulseStorySeen(req, res, next) {
  try {
    const viewer = req.user;
    const { storyId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(storyId)) {
      return res.status(400).json({ message: "Invalid story id." });
    }

    const story = await SocialStory.findById(storyId);
    if (!story || !(await canViewerAccessStory(story, viewer))) {
      return res.status(404).json({ message: "Story not found." });
    }

    if (String(story.authorUser || "") !== String(viewer._id || "")) {
      const alreadySeen = (story.seenBy || []).some(
        (item) => String(item) === String(viewer._id)
      );
      if (!alreadySeen) {
        story.seenBy.push(viewer._id);
        await story.save();
      }
    }

    return res.json({
      storyId: String(story._id),
      seen: true,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteCareerPulseStory(req, res, next) {
  try {
    const viewer = req.user;
    const { storyId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(storyId)) {
      return res.status(400).json({ message: "Invalid story id." });
    }

    const story = await SocialStory.findById(storyId);
    if (!story) {
      return res.status(404).json({ message: "Story not found." });
    }
    if (String(story.authorUser || "") !== String(viewer._id || "")) {
      return res.status(403).json({ message: "You can delete only your own story." });
    }

    await SocialStory.deleteOne({ _id: story._id });

    return res.json({
      ok: true,
      storyId: String(story._id),
      message: "Story deleted.",
    });
  } catch (error) {
    next(error);
  }
}

export async function toggleCareerPulseStoryLike(req, res, next) {
  try {
    const viewer = req.user;
    const { storyId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(storyId)) {
      return res.status(400).json({ message: "Invalid story id." });
    }

    const story = await SocialStory.findById(storyId);
    if (!story || !(await canViewerAccessStory(story, viewer))) {
      return res.status(404).json({ message: "Story not found." });
    }
    if (String(story.authorUser || "") === String(viewer._id || "")) {
      return res.status(400).json({ message: "You cannot like your own story." });
    }

    const likedIndex = (story.likedBy || []).findIndex(
      (item) => String(item) === String(viewer._id || "")
    );
    const liked = likedIndex < 0;

    if (liked) {
      story.likedBy.push(viewer._id);
    } else {
      story.likedBy.splice(likedIndex, 1);
    }

    await story.save();

      if (liked) {
        await createExploreNotification({
          userId: story.authorUser,
          actorUser: viewer._id,
          actorName: safeStr(viewer?.name || viewer?.fullName || "Someone"),
          actorAvatarUrl: "",
          kind: "social",
          eventType: "story_like",
          title: "Your story got a like",
          message: `${safeStr(viewer?.name || "Someone")} liked your story.`,
          severity: "info",
          relatedStory: story._id,
        });
      }

    return res.json({
      storyId: String(story._id),
      liked,
      likes: Array.isArray(story.likedBy) ? story.likedBy.length : 0,
    });
  } catch (error) {
    next(error);
  }
}

export async function reportCareerPulseStory(req, res, next) {
  try {
    const viewer = req.user;
    const { storyId } = req.params;
    const reason = safeStr(req.body?.reason) || "Spam or Misleading";
    const details = safeStr(req.body?.details);

    if (!mongoose.Types.ObjectId.isValid(storyId)) {
      return res.status(400).json({ message: "Invalid story id." });
    }
    if (!SOCIAL_REPORT_REASONS.has(reason)) {
      return res.status(400).json({ message: "Invalid report reason." });
    }

    const story = await SocialStory.findById(storyId);
    if (!story || !(await canViewerAccessStory(story, viewer))) {
      return res.status(404).json({ message: "Story not found." });
    }
    if (String(story.authorUser || "") === String(viewer._id || "")) {
      return res.status(400).json({ message: "You cannot report your own story." });
    }

    const alreadyReported = (story.reports || []).some(
      (report) => String(report?.reporterUser || "") === String(viewer._id || "")
    );
    if (alreadyReported) {
      return res.status(400).json({ message: "You already reported this story." });
    }

    const alreadyHiddenForViewer = (story.hiddenForUsers || []).some(
      (item) => String(item || "") === String(viewer._id || "")
    );
    if (!alreadyHiddenForViewer) {
      story.hiddenForUsers.push(viewer._id);
    }

    story.reports.push({
      reporterUser: viewer._id,
      reporterRole: viewer.role,
      reason,
      details,
      createdAt: new Date(),
    });

    await story.save();

    await createExploreNotification({
      userId: story.authorUser,
      actorUser: viewer._id,
      actorName: safeStr(viewer?.name || viewer?.fullName || "Explore"),
      actorAvatarUrl: "",
      kind: "report_update",
      eventType: "story_report",
      title: "Your story was reported",
      message: `Your story was reported from Explore for "${reason}".`,
      severity: "warning",
      relatedStory: story._id,
    });

    return res.status(201).json({
      message: "Report accepted. This story is now hidden for you while we review it.",
      hiddenForReporter: true,
      reportCount: Array.isArray(story.reports) ? story.reports.length : 0,
    });
  } catch (error) {
    next(error);
  }
}

export async function toggleCareerPulseStoryAuthorMute(req, res, next) {
  try {
    const viewer = req.user;
    const { authorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(authorId)) {
      return res.status(400).json({ message: "Invalid author id." });
    }
    if (String(authorId) === String(viewer._id || "")) {
      return res.status(400).json({ message: "You cannot mute your own stories." });
    }

    const author = await User.findById(authorId).select("_id role isActive").lean();
    if (!author || !author.isActive || !["student", "company"].includes(String(author.role || ""))) {
      return res.status(404).json({ message: "Story author not found." });
    }

    const viewerDoc = await User.findById(viewer._id).select("socialPreferences.storyMutedAuthors");
    if (!viewerDoc) {
      return res.status(404).json({ message: "Viewer not found." });
    }

    if (!viewerDoc.socialPreferences || typeof viewerDoc.socialPreferences !== "object") {
      viewerDoc.socialPreferences = {};
    }

    const existingIds = uniqueStrings(
      (viewerDoc.socialPreferences.storyMutedAuthors || []).map((item) => String(item || ""))
    );
    const muted = !existingIds.includes(String(authorId));

    viewerDoc.socialPreferences.storyMutedAuthors = muted
      ? [...existingIds, String(authorId)].map((id) => new mongoose.Types.ObjectId(id))
      : existingIds
          .filter((id) => id !== String(authorId))
          .map((id) => new mongoose.Types.ObjectId(id));

    await viewerDoc.save();

    return res.json({
      muted,
      authorId: String(authorId),
      mutedAuthorIds: uniqueStrings(
        (viewerDoc.socialPreferences.storyMutedAuthors || []).map((item) => String(item || ""))
      ),
      message: muted ? "Story author muted." : "Story author unmuted.",
    });
  } catch (error) {
    next(error);
  }
}

export async function getCareerPulseFeed(req, res, next) {
  try {
    const viewer = req.user;
    const limit = Math.max(4, Math.min(24, Number(req.query?.limit || 8)));
    const offset = Math.max(0, Number(req.query?.offset || 0));
    const mediaOnly = String(req.query?.mediaOnly || "").toLowerCase() === "true";
    const savedOnly = String(req.query?.savedOnly || "").toLowerCase() === "true";
    const focusPostId = safeStr(req.query?.focusPostId);

    const followedRows = await SocialFollow.find({ follower: viewer._id })
      .select("following")
      .lean();
    const followedIds = new Set(followedRows.map((row) => String(row.following)));

    const visibleAuthorIds = [
      new mongoose.Types.ObjectId(viewer._id),
      ...[...followedIds].map((id) => new mongoose.Types.ObjectId(id)),
    ];

    const visibilityQuery = {
      $or: [
        { visibility: "everyone" },
        { authorUser: viewer._id },
        { visibility: "followers", authorUser: { $in: visibleAuthorIds } },
      ],
    };

    const postQuery = {
      moderationStatus: { $in: ["visible", null] },
      hiddenForUsers: { $ne: viewer._id },
      ...visibilityQuery,
      ...(mediaOnly ? { type: { $in: ["image", "banner", "video", "reel"] } } : {}),
      ...(savedOnly ? { savedBy: viewer._id } : {}),
    };

    const [viewerProfile, posts, suggestions, viewerFollowerCount, viewerFollowingCount, viewerPostCount, focusPost, unreadNotifications, socialThreads] =
      await Promise.all([
        resolveViewerContext(viewer),
        SocialPost.find(postQuery)
          .sort({ createdAt: -1 })
          .skip(offset)
          .limit(limit + 1)
          .lean(),
        buildSuggestionCards(viewer, followedIds),
        SocialFollow.countDocuments({ following: viewer._id }),
        SocialFollow.countDocuments({ follower: viewer._id }),
        SocialPost.countDocuments({ authorUser: viewer._id }),
        focusPostId && mongoose.Types.ObjectId.isValid(focusPostId)
          ? SocialPost.findOne({
              ...postQuery,
              _id: new mongoose.Types.ObjectId(focusPostId),
            }).lean()
          : null,
        SocialNotification.countDocuments({ user: viewer._id, readAt: null }),
        MessageThread.find({
          source: "social",
          $or: [{ student: viewer._id }, { company: viewer._id }],
        })
          .select("student company studentUnread companyUnread socialState socialRequestedBy")
          .lean(),
      ]);

    const messagesUnread = socialThreads.reduce((total, thread) => {
      const viewerIsStudent = String(thread?.student || "") === String(viewer._id || "");
      const unread = viewerIsStudent ? Number(thread?.studentUnread || 0) : Number(thread?.companyUnread || 0);
      const isIncomingRequest =
        String(thread?.socialState || "accepted") === "pending" &&
        String(thread?.socialRequestedBy || "") !== String(viewer._id || "");
      return total + unread + (isIncomingRequest ? 1 : 0);
    }, 0);

    const hasMore = posts.length > limit;
    const initialVisiblePosts = hasMore ? posts.slice(0, limit) : posts;
    const shouldInjectFocusPost =
      Boolean(focusPost?._id) &&
      !initialVisiblePosts.some((post) => String(post?._id) === String(focusPost?._id));
    const visiblePosts = shouldInjectFocusPost
      ? [focusPost, ...initialVisiblePosts].slice(0, limit)
      : initialVisiblePosts;

    const postAuthorIds = uniqueStrings(visiblePosts.map((post) => String(post.authorUser)));
    const followerMap = await getFollowerMap(postAuthorIds);

    const mappedPosts = visiblePosts.map((post) =>
      mapPost(
        {
          ...post,
          viewerRole: viewer.role,
        },
        viewer._id,
        followedIds,
        followerMap
      )
    );

    return res.json({
      viewer: {
        ...viewerProfile,
        followers: viewerFollowerCount,
        following: viewerFollowingCount,
        posts: viewerPostCount,
        notificationsUnread: unreadNotifications,
        messagesUnread,
      },
      insights: {
        title: savedOnly ? "Saved" : "Explore",
        subtitle:
          savedOnly
            ? "Everything you bookmarked in Explore, ready to reopen whenever you want."
            : "A professional social space for student creators and hiring teams to post, follow, interact, and connect.",
      },
      suggestions,
      trending: buildTrendingTags(posts),
      posts: mappedPosts,
      hasMore,
      nextOffset: hasMore ? offset + mappedPosts.length - (shouldInjectFocusPost ? 1 : 0) : null,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCareerPulseComments(req, res, next) {
  try {
    const viewer = req.user;
    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid post id." });
    }

    const post = await SocialPost.findById(postId)
      .select("authorUser visibility comments")
      .lean();

    if (!post || !(await canViewerAccessPost(post, viewer))) {
      return res.status(404).json({ message: "Post not found." });
    }

    const limit = Math.max(10, Math.min(100, Number(req.query?.limit || 40)));
    const offset = Math.max(0, Number(req.query?.offset || 0));
    const allComments = Array.isArray(post?.comments) ? post.comments : [];
    const total = allComments.length;
    const end = Math.max(0, total - offset);
    const start = Math.max(0, end - limit);
    const comments = allComments
      .slice(start, end)
      .map((comment) => mapComment(comment, viewer._id));

    return res.json({
      postId: String(post._id || postId),
      comments,
      total,
      hasMore: start > 0,
      nextOffset: start > 0 ? offset + comments.length : null,
    });
  } catch (error) {
    next(error);
  }
}

export async function createCareerPulsePost(req, res, next) {
  try {
    const viewer = req.user;
    const type = safeStr(req.body?.type || "text").toLowerCase();
    const headline = safeStr(req.body?.headline);
    const content = safeStr(req.body?.content);
    const mediaUrl = safeStr(req.body?.mediaUrl);
    const textModeration = scanUnsafeText([headline, content, ...toTextArray(req.body?.tags)]);
    const requiresMediaSafety = ["image", "banner", "video", "reel"].includes(type);
    const mediaModerationCheck = validateMediaModeration(req.body?.mediaModeration, {
      required: requiresMediaSafety,
      label: "post",
    });

    if (!content && !mediaUrl) {
      return res.status(400).json({ message: "Write something or attach media before posting." });
    }
    if (mediaModerationCheck.error) {
      await createExploreNotification({
        userId: viewer._id,
        kind: "moderation_warning",
        title: "Post not published",
        message: mediaModerationCheck.error,
        severity: "warning",
      });
      return res.status(400).json({
        message: mediaModerationCheck.error,
        reasons: mediaModerationCheck.reasons || [],
      });
    }
    if (textModeration.blocked) {
      await createExploreNotification({
        userId: viewer._id,
        kind: "moderation_warning",
        title: "Post blocked",
        message: "Your post contains abusive, sexual, illegal, or unsafe language. Edit it before publishing.",
        severity: "warning",
      });
      return res.status(400).json({
        message: "Your post contains abusive, unsafe, or policy-violating language. Please edit it and try again.",
        reasons: textModeration.reasons,
      });
    }

    const allowedTypes = new Set(["text", "image", "banner", "video", "reel", "document"]);
    if (!allowedTypes.has(type)) {
      return res.status(400).json({ message: "Invalid post type." });
    }

    if (type !== "text" && !mediaUrl) {
      return res.status(400).json({ message: "This post type requires media." });
    }

    const actor = await resolveViewerContext(viewer);
    const post = await SocialPost.create({
      authorUser: viewer._id,
      authorRole: viewer.role,
      authorName: actor.name,
      authorHeadline: actor.headline,
      authorAvatarUrl: actor.avatarUrl,
      type,
      headline,
      content,
      mediaUrl,
      mediaPublicId: safeStr(req.body?.mediaPublicId),
      mediaResourceType: safeStr(req.body?.mediaResourceType),
      mimeType: safeStr(req.body?.mimeType),
      visibility: safeStr(req.body?.visibility || "everyone") === "followers" ? "followers" : "everyone",
      tags: extractTags(content, req.body?.tags),
      moderationStatus: "visible",
      moderationReasons: [],
      mediaModeration: mediaModerationCheck.moderation || undefined,
    });

    const followerMap = await getFollowerMap([String(viewer._id)]);

    return res.status(201).json({
      message: "Post published to Explore.",
      post: mapPost(
        { ...post.toObject(), viewerRole: viewer.role },
        viewer._id,
        new Set(),
        followerMap
      ),
    });
  } catch (error) {
    next(error);
  }
}

export async function toggleCareerPulseLike(req, res, next) {
  try {
    const viewer = req.user;
    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid post id." });
    }

    const post = await SocialPost.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found." });

    const index = (post.likedBy || []).findIndex(
      (item) => String(item) === String(viewer._id)
    );

    let liked = false;
    if (index >= 0) {
      post.likedBy.splice(index, 1);
    } else {
      post.likedBy.push(viewer._id);
      liked = true;
    }

    await post.save();

    return res.json({
      liked,
      likes: post.likedBy.length,
    });
  } catch (error) {
    next(error);
  }
}

export async function toggleCareerPulseSave(req, res, next) {
  try {
    const viewer = req.user;
    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid post id." });
    }

    const post = await SocialPost.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found." });

    const index = (post.savedBy || []).findIndex(
      (item) => String(item) === String(viewer._id)
    );

    let saved = false;
    if (index >= 0) {
      post.savedBy.splice(index, 1);
    } else {
      post.savedBy.push(viewer._id);
      saved = true;
    }

    await post.save();

    return res.json({
      saved,
      saves: post.savedBy.length,
    });
  } catch (error) {
    next(error);
  }
}

export async function addCareerPulseComment(req, res, next) {
  try {
    const viewer = req.user;
    const { postId } = req.params;
    const text = safeStr(req.body?.text);

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid post id." });
    }
    if (!text) {
      return res.status(400).json({ message: "Comment text is required." });
    }

    const [actor, post] = await Promise.all([
      resolveViewerContext(viewer),
      SocialPost.findById(postId),
    ]);

    if (!post) return res.status(404).json({ message: "Post not found." });

    post.comments.push({
      authorUser: viewer._id,
      authorRole: viewer.role,
      authorName: actor.name,
      authorHeadline: actor.headline,
      authorAvatarUrl: actor.avatarUrl,
      text,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await post.save();
    const comment = post.comments[post.comments.length - 1];

    return res.status(201).json({
      message: "Comment added.",
      comment: mapComment(comment, viewer._id),
      comments: post.comments.length,
    });
  } catch (error) {
    next(error);
  }
}

export async function toggleCareerPulseFollow(req, res, next) {
  try {
    const viewer = req.user;
    const { targetId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ message: "Invalid account id." });
    }
    if (String(targetId) === String(viewer._id)) {
      return res.status(400).json({ message: "You cannot follow your own profile." });
    }

    const target = await User.findById(targetId).lean();
    if (!target || !target.isActive || !["student", "company"].includes(String(target.role || ""))) {
      return res.status(404).json({ message: "Profile not found." });
    }

    const existing = await SocialFollow.findOne({
      follower: viewer._id,
      following: target._id,
    });

    let following = false;
      if (existing) {
        await existing.deleteOne();
      } else {
        await SocialFollow.create({
          follower: viewer._id,
          following: target._id,
        });
        following = true;
        await createExploreNotification({
          userId: target._id,
          actorUser: viewer._id,
          actorName: safeStr(viewer?.name || viewer?.fullName || "Someone"),
          actorAvatarUrl: "",
          kind: "social",
          eventType: "follow",
          title: "New follower",
          message: `${safeStr(viewer?.name || "Someone")} started following you on Explore.`,
          severity: "info",
        });
      }

    const followers = await SocialFollow.countDocuments({ following: target._id });

    return res.json({
      following,
      followers,
      targetId: String(target._id),
    });
  } catch (error) {
    next(error);
  }
}

export async function shareCareerPulsePost(req, res, next) {
  try {
    const { postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid post id." });
    }

    const post = await SocialPost.findByIdAndUpdate(
      postId,
      { $inc: { shareCount: 1 } },
      { returnDocument: "after" }
    ).lean();

    if (!post) return res.status(404).json({ message: "Post not found." });

    return res.json({
      shares: Number(post.shareCount || 0),
    });
  } catch (error) {
    next(error);
  }
}

export async function reportCareerPulsePost(req, res, next) {
  try {
    const viewer = req.user;
    const { postId } = req.params;
    const reason = safeStr(req.body?.reason);
    const details = safeStr(req.body?.details);

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid post id." });
    }
    if (!SOCIAL_REPORT_REASONS.has(reason)) {
      return res.status(400).json({ message: "Invalid report reason." });
    }
    if (reason === "Other" && !details) {
      return res.status(400).json({ message: "Please add a short note for the Other reason." });
    }

    const post = await SocialPost.findById(postId);
    if (!post || !(await canViewerAccessPost(post, viewer))) {
      return res.status(404).json({ message: "Post not found." });
    }
    if (String(post.authorUser || "") === String(viewer._id || "")) {
      return res.status(400).json({ message: "You cannot report your own post." });
    }

    const alreadyReported = (post.reports || []).some(
      (report) => String(report?.reporterUser || "") === String(viewer._id || "")
    );
    if (alreadyReported) {
      return res.status(400).json({ message: "You already reported this reel." });
    }

    const alreadyHiddenForViewer = (post.hiddenForUsers || []).some(
      (item) => String(item || "") === String(viewer._id || "")
    );
    if (!alreadyHiddenForViewer) {
      post.hiddenForUsers.push(viewer._id);
    }

    post.reports.push({
      reporterUser: viewer._id,
      reporterRole: viewer.role,
      reason,
      details,
      createdAt: new Date(),
    });

    let autoDeleted = false;
    if (shouldDeletePostForReport(post, reason) && ["", "visible", "hidden"].includes(String(post.moderationStatus || ""))) {
      post.moderationStatus = "deleted";
      post.moderationBlockedAt = new Date();
      post.moderationBlockedBy = "verified_report_match";
      post.moderationReasons = uniqueStrings([
        ...(post.moderationReasons || []),
        "Auto-deleted after report matched moderation verification",
        reason,
      ]);
      autoDeleted = true;
    }

    await post.save();

    if (autoDeleted) {
      await createExploreNotification({
        userId: post.authorUser,
        actorUser: viewer._id,
        actorName: safeStr(viewer?.name || viewer?.fullName || "Explore"),
        actorAvatarUrl: "",
        kind: "report_update",
        title: "Your reel was removed",
        message: `Your reel was removed from Explore after a report for "${reason}" matched our safety checks.`,
        severity: "danger",
        relatedPost: post._id,
      });
    }

    return res.status(201).json({
      message: autoDeleted
        ? "Report accepted. The reel matched the safety check and was deleted."
        : "Report accepted. This reel is now hidden for you while we verify it.",
      autoDeleted,
      hiddenForReporter: true,
      reportCount: Array.isArray(post.reports) ? post.reports.length : 0,
      moderationStatus: post.moderationStatus || "visible",
    });
  } catch (error) {
    next(error);
  }
}

export async function listCareerPulseMessageThreads(req, res, next) {
  try {
    const viewer = req.user;

    const threads = await MessageThread.find({
      source: "social",
      $or: [{ student: viewer._id }, { company: viewer._id }],
    })
      .populate("student")
      .populate("company")
      .sort({ updatedAt: -1, lastMessageAt: -1 })
      .lean();

    const items = await mapSocialThreadsForViewer(threads, viewer);
    const unreadCount = items.reduce((total, item) => total + Number(item?.unread || 0), 0);
    const requestCount = items.filter((item) => item.type === "request_received").length;

    return res.json({
      threads: items,
      requests: requestCount,
      unreadCount: unreadCount + requestCount,
    });
  } catch (error) {
    next(error);
  }
}

export async function openCareerPulseMessageThread(req, res, next) {
  try {
    const viewer = req.user;
    const recipientId = req.body?.recipientId;
    const initialText = safeStr(req.body?.text);

    if (!mongoose.Types.ObjectId.isValid(recipientId)) {
      return res.status(400).json({ message: "Invalid recipient id." });
    }
    if (String(recipientId) === String(viewer._id || "")) {
      return res.status(400).json({ message: "You cannot message your own profile." });
    }

    const recipient = await resolveSocialRecipient(recipientId);
    if (!recipient) {
      return res.status(404).json({ message: "Recipient not found." });
    }
    if (String(recipient._id || "") === String(viewer._id || "")) {
      return res.status(400).json({ message: "You cannot message your own profile." });
    }

    const participants = buildSocialThreadParticipants(viewer, recipient);
    if (!participants) {
      return res.status(400).json({
        message: "Explore messaging is available between student and company accounts only.",
      });
    }

    const existing = await findExistingSocialThreadBetweenUsers(viewer._id, recipient._id);

    if (existing) {
      let hydratedThread = existing;

      if (
        initialText &&
        (safeStr(existing?.socialState || "accepted") === "accepted" ||
          String(existing?.socialRequestedBy || "") === String(viewer._id || ""))
      ) {
        await appendSocialThreadTextMessage(existing, viewer, initialText);
        hydratedThread = await getSocialMessageThreadForViewer(existing._id, viewer);
      }

      const [mappedThread] = await mapSocialThreadsForViewer([hydratedThread], viewer);
      return res.json({
        thread: mappedThread,
        created: false,
      });
    }

    const followRows = await SocialFollow.find({
      $or: [
        { follower: viewer._id, following: recipient._id },
        { follower: recipient._id, following: viewer._id },
      ],
    })
      .select("follower following")
      .lean();

    const viewerFollowsRecipient = followRows.some(
      (row) =>
        String(row?.follower || "") === String(viewer._id || "") &&
        String(row?.following || "") === String(recipient._id || "")
    );
    const recipientFollowsViewer = followRows.some(
      (row) =>
        String(row?.follower || "") === String(recipient._id || "") &&
        String(row?.following || "") === String(viewer._id || "")
    );
    const autoAccept = shouldAutoAcceptSocialThread(viewer, recipient, {
      viewerFollowsRecipient,
      recipientFollowsViewer,
    });

    let thread;
    let created = false;
    try {
      const result = await MessageThread.collection.findOneAndUpdate(
        {
          student: participants.student,
          company: participants.company,
          source: "social",
        },
        {
          $setOnInsert: {
            student: participants.student,
            company: participants.company,
            source: "social",
            subject: "Explore connection",
            status: "Connected",
            socialState: autoAccept ? "accepted" : "pending",
            socialRequestedBy: autoAccept ? null : viewer._id,
            socialAcceptedAt: autoAccept ? new Date() : null,
            lastMessageText: initialText || (autoAccept ? "Conversation started from Explore." : "Message request sent from Explore."),
            lastMessageAt: new Date(),
            studentUnread: 0,
            companyUnread: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        {
          upsert: true,
          returnDocument: "after",
        }
      );

      thread = result?.value ? { _id: result.value._id } : null;
      created = !result?.lastErrorObject?.updatedExisting;
    } catch (error) {
      if (error?.code !== 11000) throw error;

      const duplicate = await findExistingSocialThreadBetweenUsers(viewer._id, recipient._id);

      if (!duplicate) throw error;

      const [mappedThread] = await mapSocialThreadsForViewer([duplicate], viewer);
      return res.json({
        thread: mappedThread,
        created: false,
      });
    }

    if (!thread?._id) {
      const fallback = await findExistingSocialThreadBetweenUsers(viewer._id, recipient._id);
      if (!fallback) {
        return res.status(500).json({ message: "Could not create the Explore conversation." });
      }
      const [mappedThread] = await mapSocialThreadsForViewer([fallback], viewer);
      return res.json({
        thread: mappedThread,
        created: false,
      });
    }

    if (created) {
      const hydratedThread = await MessageThread.findById(thread._id)
        .populate("student")
        .populate("company")
        .lean();

      if (initialText) {
        await appendSocialThreadTextMessage(hydratedThread, viewer, initialText);
      } else {
        await Message.create({
          thread: thread._id,
          senderRole: "system",
          type: "system",
          text: autoAccept ? "Conversation started from Explore." : "Message request sent from Explore.",
        });
      }

        if (!autoAccept) {
          await createExploreNotification({
            userId: recipient._id,
            actorUser: viewer._id,
            actorName: safeStr(viewer?.name || "Explore member"),
            kind: "social",
            eventType: "message_request",
            title: "New message request",
            message: `${safeStr(viewer?.name || "Someone")} wants to message you on Explore.`,
            severity: "info",
            relatedThread: thread._id,
          });
        }
    }

    const hydrated = await MessageThread.findById(thread._id)
      .populate("student")
      .populate("company")
      .lean();
    const [mappedThread] = await mapSocialThreadsForViewer([hydrated], viewer);

    return res.status(created ? 201 : 200).json({
      thread: mappedThread,
      created,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCareerPulseMessageThread(req, res, next) {
  try {
    const viewer = req.user;
    const { threadId } = req.params;

    const thread = await getSocialMessageThreadForViewer(threadId, viewer);
    if (!thread) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    await Message.updateMany(
      {
        thread: thread._id,
        senderRole: { $ne: "system" },
        deletedAt: null,
      },
      {
        $addToSet: { seenBy: viewer._id },
      }
    );

    const [mappedThread, messages] = await Promise.all([
      mapSocialThreadsForViewer([thread], viewer),
      Message.find({ thread: thread._id })
        .populate("replyTo")
        .sort({ createdAt: 1 })
        .lean(),
    ]);

    const unreadField =
      String(thread?.student?._id || thread?.student || "") === String(viewer._id || "")
        ? "studentUnread"
        : "companyUnread";
    await MessageThread.updateOne({ _id: thread._id }, { $set: { [unreadField]: 0 } });

    return res.json({
      thread: mappedThread[0],
      messages: messages.map((message) => mapSocialMessage(message, viewer)),
    });
  } catch (error) {
    next(error);
  }
}

export async function sendCareerPulseMessage(req, res, next) {
  try {
    const viewer = req.user;
    const { threadId } = req.params;
    const text = safeStr(req.body?.text);
    const replyToMessageId = safeStr(req.body?.replyToMessageId);
    const fileUrl = safeStr(req.body?.fileUrl);
    const fileName = safeStr(req.body?.fileName);
    const fileSize = safeStr(req.body?.fileSize);
    const mimeType = safeStr(req.body?.mimeType);
    const messageType =
      mimeType &&
      (mimeType.startsWith("image/") ||
        mimeType.startsWith("video/") ||
        mimeType.startsWith("audio/"))
        ? "file"
        : "text";

    if (!text && !fileUrl) {
      return res.status(400).json({ message: "Message text or attachment is required." });
    }

    const thread = await getSocialMessageThreadForViewer(threadId, viewer);
    if (!thread) {
      return res.status(404).json({ message: "Conversation not found." });
    }
    if (safeStr(thread?.socialState || "accepted") !== "accepted") {
      return res.status(400).json({ message: "This message request has not been accepted yet." });
    }

    let replyTo = null;
    if (replyToMessageId) {
      if (!mongoose.Types.ObjectId.isValid(replyToMessageId)) {
        return res.status(400).json({ message: "Invalid reply message id." });
      }

      replyTo = await Message.findOne({
        _id: new mongoose.Types.ObjectId(replyToMessageId),
        thread: thread._id,
      }).lean();

      if (!replyTo) {
        return res.status(404).json({ message: "Reply message not found." });
      }
    }

    const message = await Message.create({
      thread: thread._id,
      senderUser: viewer._id,
      senderRole: viewer.role,
      type: messageType,
      text,
      replyTo: replyTo?._id || null,
      fileUrl,
      fileName,
      fileSize,
      mimeType,
      seenBy: [viewer._id],
    });

      const viewerIsStudent = String(thread?.student?._id || thread?.student || "") === String(viewer._id || "");
      const receiverId = viewerIsStudent
        ? String(thread?.company?._id || thread?.company || "")
        : String(thread?.student?._id || thread?.student || "");
      await MessageThread.updateOne(
        { _id: thread._id },
        {
          $set: {
            lastMessageText:
              text ||
              fileName ||
              (mimeType.startsWith("video/")
                ? "Sent a video."
                : mimeType.startsWith("audio/")
                  ? "Sent a voice message."
                  : "Sent an image."),
            lastMessageAt: new Date(),
          },
          $inc: viewerIsStudent ? { companyUnread: 1 } : { studentUnread: 1 },
        }
      );

      await createExploreNotification({
        userId: receiverId,
        actorUser: viewer._id,
        actorName: safeStr(viewer?.name || "Explore member"),
        actorAvatarUrl: "",
        kind: "social",
        eventType: "message",
        title: replyTo ? "New reply" : "New message",
        message: replyTo
          ? `${safeStr(viewer?.name || "Someone")} replied to your Explore message.`
          : `${safeStr(viewer?.name || "Someone")} sent you a new Explore message.`,
        severity: "info",
        relatedThread: thread._id,
      });

      return res.status(201).json({
      message: mapSocialMessage(
        {
          ...message.toObject(),
          replyTo,
        },
        viewer
      ),
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteCareerPulseMessages(req, res, next) {
  try {
    const viewer = req.user;
    const { threadId } = req.params;
    const messageIds = Array.isArray(req.body?.messageIds)
      ? req.body.messageIds.map((item) => safeStr(item)).filter(Boolean)
      : [];

    if (!messageIds.length) {
      return res.status(400).json({ message: "Select at least one message to delete." });
    }

    const thread = await getSocialMessageThreadForViewer(threadId, viewer);
    if (!thread) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    const objectIds = messageIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const result = await Message.updateMany(
      {
        _id: { $in: objectIds },
        thread: thread._id,
        senderUser: viewer._id,
        deletedAt: null,
      },
      {
        $set: {
          deletedAt: new Date(),
          deletedBy: viewer._id,
          text: "",
          fileName: "",
          fileSize: "",
          fileUrl: "",
          mimeType: "",
        },
      }
    );

    await refreshSocialThreadLastMessage(thread._id);

    return res.json({
      deleted: Number(result?.modifiedCount || 0),
      messageIds,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteCareerPulseMessageThread(req, res, next) {
  try {
    const viewer = req.user;
    const { threadId } = req.params;

    const thread = await getSocialMessageThreadForViewer(threadId, viewer);
    if (!thread) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    await Message.deleteMany({ thread: thread._id });
    await MessageThread.deleteOne({ _id: thread._id, source: "social" });

    return res.json({
      success: true,
      threadId: String(thread._id || ""),
      message: "Explore chat deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
}

export async function toggleCareerPulseMessageReaction(req, res, next) {
  try {
    const viewer = req.user;
    const { threadId, messageId } = req.params;
    const emoji = safeStr(req.body?.emoji);

    if (!emoji) {
      return res.status(400).json({ message: "Reaction emoji is required." });
    }

    const thread = await getSocialMessageThreadForViewer(threadId, viewer);
    if (!thread) {
      return res.status(404).json({ message: "Conversation not found." });
    }
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: "Invalid message id." });
    }

    const message = await Message.findOne({
      _id: new mongoose.Types.ObjectId(messageId),
      thread: thread._id,
      deletedAt: null,
    });

    if (!message) {
      return res.status(404).json({ message: "Message not found." });
    }

    const existingIndex = (message.reactions || []).findIndex(
      (item) =>
        String(item?.user || "") === String(viewer._id || "") && safeStr(item?.emoji) === emoji
    );

    if (existingIndex >= 0) {
      message.reactions.splice(existingIndex, 1);
    } else {
      message.reactions.push({
        user: viewer._id,
        emoji,
        createdAt: new Date(),
      });
    }

    await message.save();

    return res.json({
      message: mapSocialMessage(message.toObject(), viewer),
    });
  } catch (error) {
    next(error);
  }
}

export async function reportCareerPulseMessage(req, res, next) {
  try {
    const viewer = req.user;
    const { threadId, messageId } = req.params;
    const reason = safeStr(req.body?.reason) || "Other";
    const details = safeStr(req.body?.details);

    const thread = await getSocialMessageThreadForViewer(threadId, viewer);
    if (!thread) {
      return res.status(404).json({ message: "Conversation not found." });
    }
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: "Invalid message id." });
    }

    const message = await Message.findOne({
      _id: new mongoose.Types.ObjectId(messageId),
      thread: thread._id,
    });

    if (!message) {
      return res.status(404).json({ message: "Message not found." });
    }
    if (String(message.senderUser || "") === String(viewer._id || "")) {
      return res.status(400).json({ message: "You cannot report your own message." });
    }

    const alreadyReported = (message.reports || []).some(
      (item) => String(item?.reporterUser || "") === String(viewer._id || "")
    );
    if (alreadyReported) {
      return res.status(400).json({ message: "You already reported this message." });
    }

    message.reports.push({
      reporterUser: viewer._id,
      reason,
      details,
      createdAt: new Date(),
    });
    message.reportCount = Number(message.reportCount || 0) + 1;
    await message.save();

    const receiverId =
      String(thread?.student?._id || thread?.student || "") === String(viewer._id || "")
        ? String(thread?.company?._id || thread?.company || "")
        : String(thread?.student?._id || thread?.student || "");

    await createExploreNotification({
      userId: receiverId,
      actorUser: viewer._id,
      actorName: safeStr(viewer?.name || "Explore member"),
      kind: "social",
      eventType: "message_report",
      title: "Message reported",
      message: "One of your Explore messages was reported for review.",
      severity: "warning",
      relatedThread: thread._id,
    });

    return res.status(201).json({
      success: true,
      reportCount: Number(message.reportCount || 0),
      message: "Message reported successfully.",
    });
  } catch (error) {
    next(error);
  }
}

export async function acceptCareerPulseMessageRequest(req, res, next) {
  try {
    const viewer = req.user;
    const { threadId } = req.params;

    const thread = await getSocialMessageThreadForViewer(threadId, viewer);
    if (!thread) {
      return res.status(404).json({ message: "Conversation not found." });
    }
    if (safeStr(thread?.socialState || "accepted") !== "pending") {
      return res.status(400).json({ message: "This message request is already active." });
    }
    if (String(thread?.socialRequestedBy || "") === String(viewer._id || "")) {
      return res.status(400).json({ message: "You cannot accept your own message request." });
    }

    await MessageThread.updateOne(
      { _id: thread._id },
      {
        $set: {
          socialState: "accepted",
          socialAcceptedAt: new Date(),
          lastMessageText: "Message request accepted.",
          lastMessageAt: new Date(),
        },
      }
    );

    await Message.create({
      thread: thread._id,
      senderRole: "system",
      type: "system",
      text: "Message request accepted.",
    });

    await createExploreNotification({
      userId: thread.socialRequestedBy,
      actorUser: viewer._id,
      actorName: safeStr(viewer?.name || "Explore member"),
      kind: "social",
      eventType: "request_accepted",
      title: "Request accepted",
      message: `${safeStr(viewer?.name || "Someone")} accepted your Explore message request.`,
      severity: "info",
      relatedThread: thread._id,
    });

    const updated = await getSocialMessageThreadForViewer(thread._id, viewer);
    const [mappedThread] = await mapSocialThreadsForViewer([updated], viewer);

    return res.json({
      thread: mappedThread,
      accepted: true,
    });
  } catch (error) {
    next(error);
  }
}

export async function markCareerPulseMessageThreadRead(req, res, next) {
  try {
    const viewer = req.user;
    const { threadId } = req.params;

    const thread = await getSocialMessageThreadForViewer(threadId, viewer);
    if (!thread) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    const unreadField =
      String(thread?.student?._id || thread?.student || "") === String(viewer._id || "")
        ? "studentUnread"
        : "companyUnread";
    await MessageThread.updateOne({ _id: thread._id }, { $set: { [unreadField]: 0 } });

    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function getCareerPulseNotifications(req, res, next) {
  try {
    const viewer = req.user;
    const limit = Math.max(10, Math.min(60, Number(req.query?.limit || 30)));

    const [rows, unreadCount] = await Promise.all([
      SocialNotification.find({ user: viewer._id })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      SocialNotification.countDocuments({ user: viewer._id, readAt: null }),
    ]);

    return res.json({
      notifications: rows.map(mapNotification),
      unreadCount,
    });
  } catch (error) {
    next(error);
  }
}

export async function markCareerPulseNotificationsRead(req, res, next) {
  try {
    const viewer = req.user;
    const { notificationId } = req.params;

    if (notificationId && !mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({ message: "Invalid notification id." });
    }

    const query = notificationId
      ? { _id: new mongoose.Types.ObjectId(notificationId), user: viewer._id }
      : { user: viewer._id, readAt: null };

    await SocialNotification.updateMany(query, { $set: { readAt: new Date() } });

    const unreadCount = await SocialNotification.countDocuments({ user: viewer._id, readAt: null });

    return res.json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    next(error);
  }
}

export async function startCareerPulseMessage(req, res, next) {
  return openCareerPulseMessageThread(req, res, next);
}
