import { redirect } from "next/navigation";

/** No authenticated area exists yet, so the root sends admins to sign in. */
export default function Home() {
  redirect("/login");
}
