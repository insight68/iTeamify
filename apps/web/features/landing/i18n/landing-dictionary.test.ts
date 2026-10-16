import { describe, expect, it } from "vitest";
import { createEnDict } from "./en";
import { createZhDict } from "./zh";

describe("active Chinese marketing dictionary", () => {
  it("contains only copy used by the current marketing shell", () => {
    const dictionary = createZhDict(true);

    expect(Object.keys(dictionary)).toEqual([
      "home",
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

  it("describes the current team workspace", () => {
    expect(createZhDict(true).footer.tagline).toContain("任务");
    expect(createEnDict(true).footer.tagline).toContain("tasks");
  });
});
