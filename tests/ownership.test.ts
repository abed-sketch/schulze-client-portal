import { test } from "node:test";
import assert from "node:assert/strict";
import { authorizeLead } from "../backend/ownership.ts";
const a = "recAAAAAAAAAAAAAA",
  b = "recBBBBBBBBBBBBBB",
  ta = "recTTTTTTTTTTTTTT",
  tb = "recUUUUUUUUUUUUUU";
const targets = [
  { id: ta, fields: { Client: [a] } },
  { id: tb, fields: { Client: [b] } },
];
const lead = (ids: unknown) => ({
  id: "recLLLLLLLLLLLLLL",
  fields: { "Target Company": ids },
});
test("lead belongs only to the client owning its target company", () => {
  assert.equal(authorizeLead(a, lead([ta]), targets), true);
  assert.equal(authorizeLead(b, lead([ta]), targets), false);
});
test("missing, malformed, duplicate and multi-target relationships fail closed", () => {
  for (const links of [undefined, [], ta, [ta, tb], [ta, ta], ["unknown"]])
    assert.equal(authorizeLead(a, lead(links), targets), false);
});
test("multi-client target and duplicate target records fail closed", () => {
  assert.equal(
    authorizeLead(a, lead([ta]), [{ id: ta, fields: { Client: [a, b] } }]),
    false,
  );
  assert.equal(authorizeLead(a, lead([ta]), [targets[0], targets[0]]), false);
});
test("person relationship cannot override target ownership", () => {
  assert.equal(
    authorizeLead(
      a,
      {
        id: "lead",
        fields: {
          "Target Company": [tb],
          "Linked Person": ["shared-person"],
          Client: [a],
        },
      },
      targets,
    ),
    false,
  );
});
