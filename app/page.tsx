import { redirect } from "next/navigation";

// There is no marketing page. An authenticated visitor lands on the roster; an
// unauthenticated one is bounced to /login by proxy.ts before this ever runs.
export default function Home() {
  redirect("/personnel");
}
