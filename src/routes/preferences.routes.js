import { Router } from "express";
import requireUser from "../middleware/requireUser.js";
import {
  getMyLanguagePreference,
  saveMyLanguagePreference,
  translateTexts,
} from "../controllers/preferences.controller.js";

const router = Router();

router.post("/translate", translateTexts);
router.get("/language", requireUser, getMyLanguagePreference);
router.put("/language", requireUser, saveMyLanguagePreference);

export default router;
