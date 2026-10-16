import { describe, expect, it } from "vitest";
import { createEnDict } from "./en";
import { createZhDict } from "./zh";

describe("active Chinese marketing dictionary", () => {
  it("contains only copy used by the current marketing shell", () => {
    const dictionary = createZhDict(true);

    expect(Object.keys(dictionary)).toEqual([
      "header",
      "footer",
      "about",
      "contactSales",
      "privacy",
      "terms",
    ]);
  });

  it("mirrors legal copy structure between Chinese and English dictionaries", () => {
    const zh = createZhDict(true);
    const en = createEnDict(true);

    expect(Object.keys(en)).toEqual(Object.keys(zh));
    expect(zh.privacy.sections).toHaveLength(en.privacy.sections.length);
    expect(zh.terms.sections).toHaveLength(en.terms.sections.length);
    expect(zh.footer.groups.legal.links.map((l) => l.href)).toEqual([
      "/privacy",
      "/terms",
    ]);
  });

  it("removes the creator navigation entry from shared marketing navigation", () => {
    const zh = createZhDict(true);
    const en = createEnDict(true);

    expect(JSON.stringify(zh.header)).not.toContain("创作者导航");
    expect(JSON.stringify(en.header)).not.toContain("Creator paths");
    expect(JSON.stringify(zh.footer.groups)).not.toContain("/creators");
    expect(JSON.stringify(en.footer.groups)).not.toContain("/creators");
  });

  it("carries the export positioning instead of the retired service-agency one", () => {
    const zh = createZhDict(true);
    const en = createEnDict(true);

    // This replaces an earlier guard that asserted the *opposite*: the shell
    // used to be locked to a "service business" audience and explicitly
    // forbade export vocabulary. The product moved back to Chinese export
    // businesses, so the guard is inverted rather than deleted — it still
    // fails loudly if the retired vocabulary creeps back in.
    expect(zh.footer.tagline).toContain("外贸");
    expect(zh.footer.tagline).toContain("公开原文出处");
    expect(en.footer.tagline).toContain("export");
    expect(en.footer.tagline).toContain("signal");
    expect(JSON.stringify(zh.footer)).not.toContain("拓展业务的商务经理");
    expect(JSON.stringify(en.footer)).not.toContain(
      "independent creators",
    );
  });
});
