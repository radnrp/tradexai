import { redirect } from "next/navigation";

// single_xeno: there is one permanent account and no list of agents; old links land on it.
export default function MyAgentsPage() {
  redirect("/agents");
}
