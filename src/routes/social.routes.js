import { Router } from "express";
import socialActorOnly from "../middleware/socialActorOnly.js";
import {
  addCareerPulseComment,
  createCareerPulseStory,
  createCareerPulsePost,
  deleteCareerPulseMessages,
  deleteCareerPulseMessageThread,
  getCareerPulseComments,
  getCareerPulseFeed,
  getCareerPulseMessageThread,
  listCareerPulseMessageThreads,
  getCareerPulseNotifications,
  searchCareerPulseMusic,
  markCareerPulseMessageThreadRead,
  markCareerPulseNotificationsRead,
  getCareerPulseStories,
  getCareerPulseStoryInsights,
  openCareerPulseMessageThread,
  markCareerPulseStorySeen,
  deleteCareerPulseStory,
  toggleCareerPulseStoryLike,
  reportCareerPulseStory,
  reportCareerPulsePost,
  reportCareerPulseMessage,
  sendCareerPulseMessage,
  toggleCareerPulseMessageReaction,
  acceptCareerPulseMessageRequest,
  shareCareerPulsePost,
  startCareerPulseMessage,
  toggleCareerPulseStoryAuthorMute,
  toggleCareerPulseFollow,
  toggleCareerPulseLike,
  toggleCareerPulseSave,
} from "../controllers/social.controller.js";

const router = Router();

router.use(socialActorOnly);

router.get("/music/tracks", searchCareerPulseMusic);
router.get("/stories", getCareerPulseStories);
router.get("/stories/:storyId/insights", getCareerPulseStoryInsights);
router.post("/stories", createCareerPulseStory);
router.post("/stories/:storyId/view", markCareerPulseStorySeen);
router.delete("/stories/:storyId", deleteCareerPulseStory);
router.post("/stories/:storyId/like", toggleCareerPulseStoryLike);
router.post("/stories/:storyId/report", reportCareerPulseStory);
router.post("/stories/authors/:authorId/mute", toggleCareerPulseStoryAuthorMute);
router.get("/feed", getCareerPulseFeed);
router.get("/messages/threads", listCareerPulseMessageThreads);
router.post("/messages/open", openCareerPulseMessageThread);
router.get("/messages/threads/:threadId", getCareerPulseMessageThread);
router.post("/messages/threads/:threadId/send", sendCareerPulseMessage);
router.post("/messages/threads/:threadId/delete", deleteCareerPulseMessages);
router.delete("/messages/threads/:threadId", deleteCareerPulseMessageThread);
router.post("/messages/threads/:threadId/messages/:messageId/react", toggleCareerPulseMessageReaction);
router.post("/messages/threads/:threadId/messages/:messageId/report", reportCareerPulseMessage);
router.post("/messages/threads/:threadId/accept", acceptCareerPulseMessageRequest);
router.patch("/messages/threads/:threadId/read", markCareerPulseMessageThreadRead);
router.get("/notifications", getCareerPulseNotifications);
router.post("/notifications/read", markCareerPulseNotificationsRead);
router.post("/notifications/:notificationId/read", markCareerPulseNotificationsRead);
router.get("/posts/:postId/comments", getCareerPulseComments);
router.post("/posts", createCareerPulsePost);
router.post("/posts/:postId/like", toggleCareerPulseLike);
router.post("/posts/:postId/save", toggleCareerPulseSave);
router.post("/posts/:postId/comments", addCareerPulseComment);
router.post("/posts/:postId/share", shareCareerPulsePost);
router.post("/posts/:postId/report", reportCareerPulsePost);
router.post("/follow/:targetId", toggleCareerPulseFollow);
router.post("/message", startCareerPulseMessage);

export default router;
