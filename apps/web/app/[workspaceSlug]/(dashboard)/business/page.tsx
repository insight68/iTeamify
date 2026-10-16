import { paths } from "@iteamify/core/paths";
import { redirect } from "next/navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  redirect(paths.workspace(workspaceSlug).root());
}
