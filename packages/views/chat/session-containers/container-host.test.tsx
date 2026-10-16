import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionContainerHost } from "./container-host";
vi.mock("../../i18n", () => ({ useT: () => ({ t: () => "Update to open this session" }) }));
describe("session container host", () => {
  it("keeps unknown containers readonly without invoking the chat factory", () => {
    const conversation = vi.fn(() => <div>Chat controller</div>);
    render(<SessionContainerHost descriptor={{ type: "unknown" }} target={{kind:"direct",id:"peer",name:"Peer"}} sessionId="session" creating={false} onCreated={() => {}} conversation={conversation} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Update to open this session");
    expect(conversation).not.toHaveBeenCalled();
  });
  it("loads ordinary conversation when no descriptor is present", () => {
    const conversation = vi.fn(() => <div>Ordinary discussion</div>);
    render(<SessionContainerHost target={{kind:"agent",id:"agent",name:"Agent"}} sessionId="session" creating={false} onCreated={() => {}} conversation={conversation} />);
    expect(screen.getByText("Ordinary discussion")).toBeVisible();
    expect(conversation).toHaveBeenCalledOnce();
  });
});
