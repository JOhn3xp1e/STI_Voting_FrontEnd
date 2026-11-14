import { redirect } from "next/navigation";

/** The root opens the sign-in screen, which forwards admins who are already signed in to the dashboard. */
export default function Home() {
  redirect("/login");
}
