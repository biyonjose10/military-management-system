"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/lib/auth/config";

/**
 * The sign-in server action.
 *
 * `signIn` completes by throwing a redirect, so the catch has to re-throw
 * anything that is not an AuthError — swallowing it would leave the user on the
 * form staring at a successful login that went nowhere.
 *
 * The message never distinguishes a wrong password from an unknown address. The
 * credentials provider is careful not to leak that through timing either; it
 * would be pointless to spend a bcrypt round hiding it and then say it out loud.
 */
export async function authenticate(
  _previous: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const next = String(formData.get("next") ?? "/personnel");

  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      // Only same-origin paths, so a crafted ?next= cannot bounce a freshly
      // authenticated user to another site.
      redirectTo: next.startsWith("/") && !next.startsWith("//") ? next : "/personnel",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return error.type === "CredentialsSignin"
        ? "Invalid email or password."
        : "Sign-in failed. Try again.";
    }
    throw error;
  }
}
