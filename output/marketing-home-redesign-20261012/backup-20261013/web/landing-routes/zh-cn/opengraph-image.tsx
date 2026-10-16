import { ImageResponse } from "next/og";
import { ITeamifyOgLockup } from "@/app/og-brand";

export const alt = "iteamify 专业技术服务经营系统，从线索到交付";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function ChineseOpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "flex-start",
          background:
            "linear-gradient(130deg, #f7faff, #e5effc)",
          color: "#102c46",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "space-between",
          padding: "72px 82px",
          width: "100%",
        }}
      >
        <ITeamifyOgLockup />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              color: "#165de5",
              display: "flex",
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: 4,
            }}
          >
            专业技术服务的经营系统
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 70,
              fontWeight: 650,
              letterSpacing: -3,
              lineHeight: 1.08,
              marginTop: 22,
              maxWidth: 920,
            }}
          >
            让专业服务，有序经营。从线索到交付。
          </div>
        </div>
      </div>
    ),
    size,
  );
}
