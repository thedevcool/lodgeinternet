/**
 * Guards lib/hostelSlug.ts: how a hostel's name becomes its web address and
 * how a name stored in capitals is shown.
 *
 * The plans page finds its hostel by comparing the address to
 * `toHostelSlug(name)`, so a change in how a slug is made breaks every link a
 * student has saved or been sent.
 */
import { describe, expect, it } from "vitest";
import { displayName, slugToDisplayName, toHostelSlug } from "@/lib/hostelSlug";

describe("a hostel's web address", () => {
  it("is the name in lower case with dashes for spaces", () => {
    expect(toHostelSlug("Ayoni Block A")).toBe("ayoni-block-a");
  });

  it("ignores spaces around the name and treats a run of spaces as one", () => {
    expect(toHostelSlug("  Ayoni   Block A ")).toBe("ayoni-block-a");
    expect(toHostelSlug("Ayoni\tBlock\nA")).toBe("ayoni-block-a");
  });

  it("drops punctuation", () => {
    expect(toHostelSlug("ROAD 8, IWOROKO")).toBe("road-8-iworoko");
    expect(toHostelSlug("H’ALL En-Suite")).toBe("hall-en-suite");
    expect(toHostelSlug("St. Mary's (Annex)")).toBe("st-marys-annex");
  });

  it("keeps digits and dashes already in the name", () => {
    expect(toHostelSlug("Block-C 2")).toBe("block-c-2");
  });

  it("gives nothing for a name with no letters or digits", () => {
    expect(toHostelSlug("")).toBe("");
    expect(toHostelSlug("!!!")).toBe("");
  });
});

describe("how a hostel's name is shown", () => {
  it("shows a name stored in capitals in title case", () => {
    expect(displayName("ROAD 8, IWOROKO")).toBe("Road 8, Iworoko");
    expect(displayName("AYONI")).toBe("Ayoni");
  });

  it("capitalises after a dash, a slash and an opening bracket", () => {
    expect(displayName("AYONI-BLOCK (ANNEX)")).toBe("Ayoni-Block (Annex)");
    expect(displayName("BOYS/GIRLS HOSTEL")).toBe("Boys/Girls Hostel");
  });

  it("leaves a mixed-case name exactly as it was typed", () => {
    expect(displayName("H’ALL En-Suite")).toBe("H’ALL En-Suite");
    expect(displayName("SS JAY Hostel")).toBe("SS JAY Hostel");
    expect(displayName("Ayoni Block A")).toBe("Ayoni Block A");
  });

  it("leaves a name without letters alone", () => {
    expect(displayName("12-14")).toBe("12-14");
    expect(displayName("")).toBe("");
  });
});

describe("a readable name from a web address", () => {
  it("capitalises each word", () => {
    expect(slugToDisplayName("ayoni-block-a")).toBe("Ayoni Block A");
    expect(slugToDisplayName("road-8-iworoko")).toBe("Road 8 Iworoko");
  });

  it("copes with a single word and with nothing", () => {
    expect(slugToDisplayName("ayoni")).toBe("Ayoni");
    expect(slugToDisplayName("")).toBe("");
  });
});
