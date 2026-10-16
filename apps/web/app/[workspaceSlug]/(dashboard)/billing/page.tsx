import { BillingPage } from "@iteamify/views/billing";

// Workspace billing is shared with desktop. Every request is scoped by the
// route workspace and the server independently verifies membership/role.
export default function BillingRoute() {
  return <BillingPage />;
}
