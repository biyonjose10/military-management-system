// Auth.js mounts its own endpoints here: sign-in, sign-out, session, CSRF.
// Nothing project-specific belongs in this file.
import { handlers } from "@/lib/auth/config";

export const { GET, POST } = handlers;
