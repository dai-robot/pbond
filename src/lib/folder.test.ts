import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterGroup } from "./deal.ts";
import { displayDealStatusLabel } from "./labels.ts";

describe("終了フォルダ", () => {
  const open = { status: "BOOK OPEN" as const, pricingDate: "2026-09-30" };

  it("条件決定日の当日は進行中", () => {
    assert.equal(filterGroup(open, "2026-09-30 23:59"), "ACTIVE");
  });

  it("条件決定の翌日から終了", () => {
    assert.equal(filterGroup(open, "2026-10-01 00:00"), "CLOSED");
    assert.equal(filterGroup({ status: "BOOK OPEN", pricingDate: "2026-10-01" }, "2026-10-07 05:00"), "CLOSED");
  });

  it("下書きは条件決定日を過ぎても予定のまま", () => {
    assert.equal(filterGroup({ status: "DRAFT", pricingDate: "2026-09-01" }, "2026-10-07 05:00"), "UPCOMING");
  });

  it("ステータスが終了なら条件決定前でも終了", () => {
    assert.equal(filterGroup({ status: "CLOSED", pricingDate: "2026-12-01" }, "2026-10-07 05:00"), "CLOSED");
  });
});

describe("ブッククローズの表示", () => {
  it("ブックを閉じていても台帳がブック中ならブッククローズと出す", () => {
    assert.equal(displayDealStatusLabel("BOOK OPEN", true), "ブッククローズ");
    assert.equal(displayDealStatusLabel("BOOK OPEN", false), "ブック中");
  });
});
