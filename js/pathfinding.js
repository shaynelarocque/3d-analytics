import * as THREE from 'three';

export class PathGraph {
  constructor() {
    this.nodes = new Map(); // id -> { position: Vector3, neighbors: [id] }
  }

  addNode(id, position) {
    this.nodes.set(id, { position: position.clone(), neighbors: [] });
  }

  addEdge(id1, id2) {
    const n1 = this.nodes.get(id1);
    const n2 = this.nodes.get(id2);
    if (!n1 || !n2) {
      console.warn(`%c[PathGraph] addEdge failed: ${!n1 ? id1 : id2} not found`, 'color:#ff9800');
      return;
    }
    if (!n1.neighbors.includes(id2)) n1.neighbors.push(id2);
    if (!n2.neighbors.includes(id1)) n2.neighbors.push(id1);
  }

  findNearestNode(position) {
    let nearest = null;
    let minDist = Infinity;
    for (const [id, node] of this.nodes) {
      const dist = position.distanceTo(node.position);
      if (dist < minDist) {
        minDist = dist;
        nearest = id;
      }
    }
    return nearest;
  }

  // A* pathfinding - returns array of Vector3 positions, or null
  findPath(startId, endId) {
    if (startId === endId) {
      return [this.nodes.get(startId).position.clone()];
    }
    if (!this.nodes.has(startId) || !this.nodes.has(endId)) return null;

    const openSet = new Set([startId]);
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    for (const id of this.nodes.keys()) {
      gScore.set(id, Infinity);
      fScore.set(id, Infinity);
    }
    gScore.set(startId, 0);
    fScore.set(startId, this._heuristic(startId, endId));

    while (openSet.size > 0) {
      // Pick node in openSet with lowest fScore
      let current = null;
      let minF = Infinity;
      for (const id of openSet) {
        const f = fScore.get(id);
        if (f < minF) { minF = f; current = id; }
      }

      if (current === endId) {
        return this._reconstructPath(cameFrom, current);
      }

      openSet.delete(current);
      const node = this.nodes.get(current);

      for (const neighborId of node.neighbors) {
        const neighbor = this.nodes.get(neighborId);
        const tentativeG = gScore.get(current) + node.position.distanceTo(neighbor.position);

        if (tentativeG < gScore.get(neighborId)) {
          cameFrom.set(neighborId, current);
          gScore.set(neighborId, tentativeG);
          fScore.set(neighborId, tentativeG + this._heuristic(neighborId, endId));
          openSet.add(neighborId);
        }
      }
    }

    return null; // No path found
  }

  // Convenience: find path from an arbitrary position to a target node
  getPathFromPosition(position, targetNodeId) {
    const nearestId = this.findNearestNode(position);
    if (!nearestId) {
      console.warn(`%c[PathGraph] No nearest node found for position`, 'color:#ff9800', position);
      return null;
    }
    const path = this.findPath(nearestId, targetNodeId);
    if (!path) {
      console.warn(`%c[PathGraph] No path: ${nearestId} → ${targetNodeId}`, 'color:#ff9800');
      // Debug: show connectivity
      const startNode = this.nodes.get(nearestId);
      const endNode = this.nodes.get(targetNodeId);
      console.warn(`  Start "${nearestId}" neighbors: [${startNode?.neighbors.join(', ')}]`);
      console.warn(`  End "${targetNodeId}" exists: ${!!endNode}, neighbors: [${endNode?.neighbors.join(', ')}]`);
      return null;
    }
    if (position.distanceTo(path[0]) > 0.5) {
      path.unshift(position.clone());
    }
    return path;
  }

  // Debug: dump full graph to console
  dump() {
    console.groupCollapsed(`%c[PathGraph] ${this.nodes.size} nodes`, 'color:#ce93d8');
    for (const [id, node] of this.nodes) {
      const pos = node.position;
      console.log(`  ${id} (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}) → [${node.neighbors.join(', ')}]`);
    }
    // Check for orphans
    const orphans = [...this.nodes.entries()].filter(([, n]) => n.neighbors.length === 0);
    if (orphans.length > 0) {
      console.warn(`  ⚠ ${orphans.length} orphan nodes:`, orphans.map(([id]) => id));
    }
    console.groupEnd();
  }

  _heuristic(id1, id2) {
    return this.nodes.get(id1).position.distanceTo(this.nodes.get(id2).position);
  }

  _reconstructPath(cameFrom, current) {
    const path = [this.nodes.get(current).position.clone()];
    while (cameFrom.has(current)) {
      current = cameFrom.get(current);
      path.unshift(this.nodes.get(current).position.clone());
    }
    return path;
  }
}
