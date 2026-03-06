// cli/lib/dependency-graph.js — dependency-graph.json read/write/validate utilities
import fs from "node:fs";
import path from "node:path";

const DEP_GRAPH_FILE = ".aitri/dependency-graph.json";

export function dependencyGraphPath(root) {
  return path.join(root, DEP_GRAPH_FILE);
}

export function readDependencyGraph(root) {
  const file = dependencyGraphPath(root);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function writeDependencyGraph(root, data) {
  const file = dependencyGraphPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

/**
 * Topological sort via Kahn's algorithm.
 * depends_on means "these nodes must execute before me".
 * Returns execution_order array (node IDs). Returns empty if cycle detected.
 */
export function getExecutionOrder(graph) {
  const nodes = (graph.nodes || []).map((n) => n.id);
  // pendingDeps[id] = set of deps not yet scheduled
  const pendingDeps = {};
  for (const n of graph.nodes || []) {
    pendingDeps[n.id] = new Set(n.depends_on || []);
  }
  // reverse: successors[dep] = list of nodes waiting on dep
  const successors = {};
  for (const id of nodes) {
    for (const dep of (pendingDeps[id] || [])) {
      if (!successors[dep]) successors[dep] = [];
      successors[dep].push(id);
    }
  }
  const order = [];
  const queue = nodes.filter((id) => pendingDeps[id].size === 0);
  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    for (const dependent of (successors[id] || [])) {
      pendingDeps[dependent].delete(id);
      if (pendingDeps[dependent].size === 0) queue.push(dependent);
    }
  }
  return order;
}

/**
 * Detect cycles in the dependency graph using DFS.
 * Returns { ok: boolean, cycles: string[][] }
 */
export function validateCycles(graph) {
  const nodes = (graph.nodes || []).map((n) => n.id);
  const depsMap = {};
  for (const n of graph.nodes || []) {
    depsMap[n.id] = n.depends_on || [];
  }
  const visited = new Set();
  const inStack = new Set();
  const cycles = [];

  function dfs(id, stack) {
    visited.add(id);
    inStack.add(id);
    stack.push(id);
    for (const dep of (depsMap[id] || [])) {
      if (!visited.has(dep)) {
        dfs(dep, stack);
      } else if (inStack.has(dep)) {
        const cycleStart = stack.indexOf(dep);
        cycles.push(stack.slice(cycleStart));
      }
    }
    stack.pop();
    inStack.delete(id);
  }

  for (const id of nodes) {
    if (!visited.has(id)) dfs(id, []);
  }
  return { ok: cycles.length === 0, cycles };
}

/**
 * Returns the set of nodes affected by a change to the given nodeId.
 * "Affected" means: the node itself + all nodes that (transitively) depend on it.
 */
export function getAffectedNodes(graph, nodeId) {
  const depsMap = {};
  for (const n of graph.nodes || []) {
    depsMap[n.id] = n.depends_on || [];
  }
  // Build reverse map: which nodes depend on this one
  const reverseDeps = {};
  for (const n of graph.nodes || []) {
    for (const dep of (n.depends_on || [])) {
      if (!reverseDeps[dep]) reverseDeps[dep] = [];
      reverseDeps[dep].push(n.id);
    }
  }
  // Also include GI consumers of this node if it is a global interface
  const giConsumers = graph.global_interface_consumers || {};
  for (const [gi, consumers] of Object.entries(giConsumers)) {
    if (gi === nodeId) {
      if (!reverseDeps[nodeId]) reverseDeps[nodeId] = [];
      reverseDeps[nodeId].push(...consumers);
    }
  }

  const affected = new Set([nodeId]);
  const queue = [nodeId];
  while (queue.length > 0) {
    const id = queue.shift();
    for (const dependent of (reverseDeps[id] || [])) {
      if (!affected.has(dependent)) {
        affected.add(dependent);
        queue.push(dependent);
      }
    }
  }
  return [...affected];
}
