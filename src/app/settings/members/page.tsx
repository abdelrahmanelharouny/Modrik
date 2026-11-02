import { MembersManager } from "./members-manager";

export const metadata = {
  title: "Organization members — Modrik",
  robots: { index: false, follow: false },
};

export default function MembersPage() {
  return <MembersManager />;
}
