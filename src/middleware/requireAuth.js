// backend/src/middleware/requireAuth.js
import { clerkMiddleware } from "@clerk/express";

// clerkMiddleware verifies token and exposes auth via req.auth()
export default clerkMiddleware();
