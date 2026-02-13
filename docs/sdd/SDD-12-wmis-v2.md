# SDD-12: WMIS v2 (Correct ρ_v Formula + Intra-Slot Weight Update)

## 1. Purpose

Fix two critical gaps in the WMIS beam hopping algorithm (Algorithm 2):

1. **ρ_v formula**: Use the paper's neighbor-weight ratio instead of simplified degree-based ratio
2. **Intra-slot weight recalculation**: After selecting each vertex, recalculate weights and re-sort remaining vertices

## 2. Paper Algorithm 2 (Exact)

### 2.1 Weight Ratio ρ_v (Line 6 of Algorithm 2)

Paper definition:
```
ρ_v = w_v / (w_v + Σ_{v' ∈ V_v} (1 - f(v')) × w_{v'})
```

where:
- `V_v`: Set of accessible vertices adjacent to vertex v
- `f(v)`: Accessibility status (1 = inaccessible, 0 = accessible)
- `w_{v'}`: Weight of adjacent vertex v'

**v1 bug**: Used `ρ_v = w_v / (1 + degree_v)` which is degree-based, not weight-based.

**Key difference**: The paper's formula considers the **actual weights** of neighbors, not just their count. A vertex with high weight but equally high-weight neighbors gets lower priority.

### 2.2 Intra-Slot Weight Recalculation (Lines 15-17 of Algorithm 2)

After selecting a vertex v_k in slot t:

```
Line 14: Set inaccessible states f(k) = 1 for all vertices in V_{v_k}
Line 15: Recalculate the weight ratios for the remaining vertices and reorder vertices.
Line 17: Update Q_c^{f,t} and set Q'_{c,f} = Q_c^{f,t}
```

**v1 bug**: Single sort at the beginning, no recalculation after vertex selection.

**What happens in v2**:
1. Select vertex v_k → its cell gets served → Q_c^{f,t} decreases
2. Recalculate weights for remaining accessible vertices (their ρ_v changes because neighbor weights changed)
3. Re-sort remaining vertices by new ρ_v
4. Continue selection

### 2.3 Weight Calculation (Eq. 35)

```
w_v = (W₁ × T_slot × log₂(1 + SNR_c))² + (Q_c^{f,t})² - (D_c^{f,t} - Q_c^{f,t})²
```

Note: Q_c^{f,t} and D_c^{f,t} are **per-slot** values that update as vertices are selected within the same slot. This is the intra-slot update that v1 misses.

## 3. Design Changes

### 3.1 Modified solveWMIS

```typescript
export function solveWMIS(
  graph: ConflictGraph,
  queueStates: CellQueueState[],
  config: LyapunovConfig,
): BeamHoppingDecision {
  // Build queue map
  const queueMap = new Map<number, CellQueueState>();
  for (const q of queueStates) queueMap.set(q.cellId, { ...q });

  const selected: ConflictVertex[] = [];
  const inaccessible = new Set<string>();  // f(v) = 1

  // Mark empty-queue vertices as inaccessible (Line 4-5)
  for (const v of graph.vertices) {
    const q = queueMap.get(v.cellId);
    if (!q || (q.queueLength <= 0 && q.arrivalData <= 0)) {
      inaccessible.add(v.id);
    }
  }

  while (selected.length < config.beamsPerSatellite) {
    // Calculate weights and ρ_v for all accessible vertices (Line 6)
    let bestVertex: ConflictVertex | null = null;
    let bestRatio = -Infinity;

    for (const v of graph.vertices) {
      if (inaccessible.has(v.id)) continue;

      const w_v = computeVertexWeight(v, queueMap.get(v.cellId), config);

      // ρ_v = w_v / (w_v + Σ_{v'∈V_v} (1-f(v')) × w_{v'})
      let neighborWeightSum = 0;
      const neighbors = graph.adjacency.get(v.id);
      if (neighbors) {
        for (const nId of neighbors) {
          if (!inaccessible.has(nId)) {
            const nv = graph.vertices.find(x => x.id === nId);
            if (nv) {
              neighborWeightSum += computeVertexWeight(nv, queueMap.get(nv.cellId), config);
            }
          }
        }
      }

      const rho = w_v / (w_v + neighborWeightSum + 1e-10);

      if (rho > bestRatio) {
        bestRatio = rho;
        bestVertex = { ...v, weight: w_v };
      }
    }

    if (!bestVertex || bestRatio <= 0) break;

    // Select vertex (Line 10-13)
    selected.push(bestVertex);

    // Mark vertex and neighbors as inaccessible (Line 14)
    inaccessible.add(bestVertex.id);
    const neighbors = graph.adjacency.get(bestVertex.id);
    if (neighbors) {
      for (const nId of neighbors) inaccessible.add(nId);
    }

    // Update Q_c^{f,t} for served cell (Line 17)
    const q = queueMap.get(bestVertex.cellId);
    if (q) {
      const capacityPerSlot = computeCapacityPerSlotForConfig(config);
      q.servedData += capacityPerSlot;
      // Queue decreases by served amount for weight recalculation
    }
    // Loop back: weights and ρ_v are recalculated (Line 15)
  }

  return { assignments: selected.map(v => ({ cellId: v.cellId, beamId: v.beamId, polarization: v.polarization })) };
}
```

### 3.2 Performance Optimization

The naive implementation above is O(|V|² × B) per slot. For 20 cells × 4 beams = 80 vertices, this is fine. But for scalability:

- **Vertex lookup**: Use Map<string, ConflictVertex> instead of linear scan for neighbor weight
- **Early termination**: Break when no accessible vertex has positive weight
- **Cap iterations**: Max B vertices selected per slot

### 3.3 Impact on Existing Functions

| Function | Change |
|----------|--------|
| `solveWMIS()` | Major rewrite: loop with recalculation |
| `computeVertexWeight()` | No change to formula, but now called multiple times per slot |
| `solveWMIS_MonteCarlo()` | Update to use new solveWMIS internally |
| `scheduleEpoch()` | No change (calls solveWMIS per slot) |

## 4. Affected Files

| File | Change |
|------|--------|
| `src/features/beam-hopping/algorithms/wmisScheduler.ts` | Rewrite `solveWMIS()` with correct ρ_v and intra-slot update |
| `src/features/beam-hopping/algorithms/__tests__/wmisScheduler.test.ts` | Update tests to verify recalculation behavior |

## 5. Verification Criteria

- [ ] ρ_v uses neighbor weight sum, not degree count
- [ ] After selecting a vertex, remaining vertices' ρ_v values change
- [ ] Queue is updated between vertex selections within a slot
- [ ] Selected vertices still form an independent set (no conflicts)
- [ ] Weight formula (Eq. 35) unchanged
- [ ] Performance: <100ms per epoch with 80 vertices × 200 slots
- [ ] All existing tests pass (may need updated assertions for different selection order)
- [ ] TypeScript compiles cleanly
