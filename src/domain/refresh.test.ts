import assert from "node:assert/strict";
import test from "node:test";
import { decideRefresh } from "./refresh.ts";

test("未送信の操作や古い応答や切替後の応答は採用せず、失敗はやり直せる", () => {
  assert.equal(decideRefresh({ ticket: 1, epoch: 1, pending: true, seenRevision: 4, status: 200, revision: 9 }), "ignore");
  assert.equal(decideRefresh({ ticket: 1, epoch: 1, pending: false, seenRevision: 5, status: 200, revision: 4 }), "ignore");
  assert.equal(decideRefresh({ ticket: 1, epoch: 2, pending: false, seenRevision: 0, status: 200, revision: 9 }), "ignore");
  assert.equal(decideRefresh({ ticket: 2, epoch: 3, pending: false, seenRevision: 0, status: 401 }), "ignore");
  assert.equal(decideRefresh({ ticket: 1, epoch: 1, pending: false, seenRevision: 4, status: 200, revision: 4 }), "adopt");
  assert.equal(decideRefresh({ ticket: 1, epoch: 1, pending: false, seenRevision: 4, status: 200, revision: 6 }), "adopt");
  assert.equal(decideRefresh({ ticket: 1, epoch: 1, pending: false, seenRevision: 4, status: 401 }), "logout");
  assert.equal(decideRefresh({ ticket: 1, epoch: 1, pending: true, seenRevision: 4, status: 401 }), "logout");
  assert.equal(decideRefresh({ ticket: 1, epoch: 1, pending: false, seenRevision: 4, status: "network" }), "retry");
  assert.equal(decideRefresh({ ticket: 1, epoch: 1, pending: false, seenRevision: 4, status: 500 }), "retry");
});
