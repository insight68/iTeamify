import { describe, expect, it } from "vitest";

import { isOfficialMarketingHost } from "./public-host";

describe("isOfficialMarketingHost", () => {
  it.each([
    "iteamify.com",
    "www.iteamify.com",
    "ITEAMIFY.COM",
    "iteamify.com.",
    "aurosignal.com",
    "www.aurosignal.com",
    "AUROSIGNAL.COM",
    "aurosignal.com.",
    "aurocreator.com",
    "www.aurocreator.com",
    "AUROCREATOR.COM",
    "aurocreator.com.",
  ])(
    "recognizes %s as an official marketing host",
    (host) => {
      expect(isOfficialMarketingHost(host)).toBe(true);
    },
  );

  it.each([
    "app.iteamify.com",
    "api.iteamify.com",
    "app.aurocreator.com",
    "api.aurocreator.com",
    "localhost",
    "iteamify.test",
    "aurocreator.test",
  ])(
    "does not treat %s as the public marketing host",
    (host) => {
      expect(isOfficialMarketingHost(host)).toBe(false);
    },
  );
});
