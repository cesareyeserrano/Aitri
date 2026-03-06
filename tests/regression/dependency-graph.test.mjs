import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readDependencyGraph, writeDependencyGraph,
  getExecutionOrder, validateCycles, getAffectedNodes
} from "../../cli/lib/dependency-graph.js";

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aitri-depgraph-"));
}

const SIMPLE_GRAPH = {
  feature: "test-feature",
  nodes: [
    { id: "US-1", depends_on: [], fr: ["FR-1"] },
    { id: "US-2", depends_on: ["US-1"], fr: ["FR-2"] },
    { id: "US-3", depends_on: ["US-1", "US-2"], fr: ["FR-3"] }
  ],
  global_interfaces: [],
  global_interface_consumers: {}
};

test("readDependencyGraph returns null for missing file", () => {
  const tmp = makeTmpDir();
  assert.equal(readDependencyGraph(tmp), null);
});

test("writeDependencyGraph + readDependencyGraph round-trips data", () => {
  const tmp = makeTmpDir();
  writeDependencyGraph(tmp, SIMPLE_GRAPH);
  const read = readDependencyGraph(tmp);
  assert.equal(read.feature, "test-feature");
  assert.equal(read.nodes.length, 3);
});

test("getExecutionOrder returns valid topological order", () => {
  const order = getExecutionOrder(SIMPLE_GRAPH);
  assert.equal(order.length, 3);
  // US-1 must come before US-2 and US-3
  assert.ok(order.indexOf("US-1") < order.indexOf("US-2"));
  assert.ok(order.indexOf("US-1") < order.indexOf("US-3"));
  assert.ok(order.indexOf("US-2") < order.indexOf("US-3"));
});

test("getExecutionOrder handles empty graph", () => {
  const order = getExecutionOrder({ nodes: [] });
  assert.deepEqual(order, []);
});

test("getExecutionOrder handles single node", () => {
  const order = getExecutionOrder({ nodes: [{ id: "US-1", depends_on: [] }] });
  assert.deepEqual(order, ["US-1"]);
});

test("validateCycles returns ok for acyclic graph", () => {
  const result = validateCycles(SIMPLE_GRAPH);
  assert.equal(result.ok, true);
  assert.equal(result.cycles.length, 0);
});

test("validateCycles detects direct cycle", () => {
  const cyclic = {
    nodes: [
      { id: "US-1", depends_on: ["US-2"] },
      { id: "US-2", depends_on: ["US-1"] }
    ]
  };
  const result = validateCycles(cyclic);
  assert.equal(result.ok, false);
  assert.ok(result.cycles.length > 0);
});

test("validateCycles detects self-loop", () => {
  const selfLoop = {
    nodes: [{ id: "US-1", depends_on: ["US-1"] }]
  };
  const result = validateCycles(selfLoop);
  assert.equal(result.ok, false);
});

test("getAffectedNodes returns node itself when no dependents", () => {
  const affected = getAffectedNodes(SIMPLE_GRAPH, "US-3");
  assert.deepEqual(affected, ["US-3"]);
});

test("getAffectedNodes includes transitive dependents", () => {
  const affected = getAffectedNodes(SIMPLE_GRAPH, "US-1");
  assert.ok(affected.includes("US-1"));
  assert.ok(affected.includes("US-2"));
  assert.ok(affected.includes("US-3"));
  assert.equal(affected.length, 3);
});

test("getAffectedNodes includes GI consumers", () => {
  const graphWithGI = {
    ...SIMPLE_GRAPH,
    global_interfaces: ["GI-1"],
    global_interface_consumers: { "GI-1": ["US-2", "US-3"] }
  };
  const affected = getAffectedNodes(graphWithGI, "GI-1");
  assert.ok(affected.includes("GI-1"));
  assert.ok(affected.includes("US-2"));
  assert.ok(affected.includes("US-3"));
});
