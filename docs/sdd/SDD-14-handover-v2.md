# SDD-14: Handover v2 (Correct Penalty + Dynamic Entropy Weights)

## 1. Purpose

Fix two bugs in the Paper 4-1 handover manager (Algorithm 1):

1. **Penalty formula**: Use `M_{c,f} × m_{c,f}` (virtual queue × handover indicator) instead of `+= 1`
2. **Entropy weights**: Compute weights dynamically from data instead of fixed `w_load=0.4, w_elev=0.35, w_rst=0.25`

## 2. Paper Formulation

### 2.1 Objective Function (Eq. 32)

```
δ'_f = Σ_s V × (Σ_c (x_{s,c} - 1/2) × Q_c / Σ Q_c)² + Σ_c M_{c,f} × m_{c,f}
```

- **First term**: Load imbalance — normalized weighted load variance across satellites
- **Second term**: Handover penalty — virtual queue value × handover indicator

**v1 bug**: Line 403 uses `handoverPenalty += 1` instead of `+= M_{c,f}`.
When `M_{c,f}` is 0 (no handover pressure), the penalty should be 0 even if a handover happens. When `M_{c,f}` is large (many recent handovers), each additional handover should be heavily penalized.

### 2.2 Multi-Attribute Entropy Decision [11] (Lines 10 of Algorithm 1)

The paper references [11] for entropy-based multi-attribute handover:

**Standard entropy weight method**:
1. Normalize each attribute (load, elevation, remaining service time)
2. Compute entropy for each attribute: `E_j = -1/ln(n) × Σ_i p_{i,j} × ln(p_{i,j})`
3. Compute weights: `w_j = (1 - E_j) / Σ_k (1 - E_k)`

Attributes with **more variation** across candidates get **higher weight**.

**v1 bug**: Fixed weights `[0.4, 0.35, 0.25]` regardless of the actual data distribution.

### 2.3 Conditional Triggering (Lines 1-15 of Algorithm 1)

Three conditions trigger handover:
1. Serving satellite leaves visible range → **mandatory**
2. `σ_f == 0` (new cells need assignment) → **trigger swap matching**
3. `σ_f < σ₀ AND min satellite load > capacity` → **trigger swap matching**

v3 Fix #38: `checkLine15Condition()` now implements the full capacity check:
`σ_f == 0 OR (σ_f < σ₀ AND min_s(Σ_c x_{s,c} Q_c^f) > C_s)` where
`C_s = W₁ × T_slot × log₂(1+SNR) × S`. Swap matching is gated behind this condition.

### 2.4 Swap Matching Objective (Lines 19-34)

Both swap kinds evaluate `δ'_f(Cs')` using the **correct** Eq. 32 penalty:
```
handover_penalty = Σ_c M_{c,f} × m_{c,f}
```

Where `m_{c,f} = 1` if cell c's serving satellite changed from previous epoch, 0 otherwise.

## 3. Design Changes

### 3.1 Fix computeObjective

```typescript
private computeObjective(
  assignments: Map<number, string>,
  satellites: SatelliteInfo[],
  queueMap: Map<number, CellQueueState>,
  virtualQueues: VirtualQueue[],  // NEW PARAMETER
): number {
  const V = this.config.lyapunovV;
  const totalQueue = ...;

  // Term 1: Load imbalance (same as v1, correct)
  let loadImbalanceTerm = 0;
  // ...

  // Term 2: Handover penalty = Σ_c M_{c,f} × m_{c,f}
  let handoverPenalty = 0;
  const vqMap = new Map<number, number>();
  for (const vq of virtualQueues) vqMap.set(vq.cellId, vq.value);

  assignments.forEach((satId, cellId) => {
    const prevSat = this.previousAssignments.get(cellId);
    if (prevSat && prevSat !== satId) {
      // m_{c,f} = 1, multiply by M_{c,f}
      handoverPenalty += vqMap.get(cellId) ?? 0;
    }
  });

  return loadImbalanceTerm + handoverPenalty;
}
```

### 3.2 Dynamic Entropy Weights

```typescript
private entropyAssignment(
  cellId: number,
  cells: EarthFixedCell[],
  satellites: SatelliteInfo[],
  currentAssignments: Map<number, string>,
  queueMap: Map<number, CellQueueState>,
): string | null {
  // Filter visible satellites
  const candidates = ...;

  // Compute raw attributes for each candidate
  const loads = candidates.map(s => countLoad(s.id, currentAssignments));
  const elevs = candidates.map(s => s.elevations.get(cellId) ?? 0);
  const rsts = candidates.map(s => s.remainingServiceTime);

  // Entropy weight method
  const weights = computeEntropyWeights([loads, elevs, rsts]);
  // weights[0]=w_load, weights[1]=w_elev, weights[2]=w_rst (dynamic)

  // Score each candidate
  let bestSat = null;
  let bestScore = -Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const score = weights[0] * normLoad[i] + weights[1] * normElev[i] + weights[2] * normRst[i];
    if (score > bestScore) { bestScore = score; bestSat = candidates[i].id; }
  }
  return bestSat;
}
```

### 3.3 Entropy Weight Calculation

```typescript
function computeEntropyWeights(attributeMatrix: number[][]): number[] {
  const m = attributeMatrix.length;     // number of attributes
  const n = attributeMatrix[0].length;  // number of candidates

  if (n <= 1) return Array(m).fill(1 / m);

  const weights: number[] = [];
  const inversions: number[] = [];

  for (let j = 0; j < m; j++) {
    const col = attributeMatrix[j];
    const total = col.reduce((s, v) => s + v, 0) || 1;

    // Normalize: p_{i,j} = x_{i,j} / Σ x_{i,j}
    const p = col.map(v => v / total);

    // Entropy: E_j = -1/ln(n) × Σ p × ln(p)
    let entropy = 0;
    for (const pi of p) {
      if (pi > 0) entropy -= pi * Math.log(pi);
    }
    entropy /= Math.log(n);

    inversions.push(1 - entropy);
  }

  const totalInversion = inversions.reduce((s, v) => s + v, 0) || 1;
  return inversions.map(v => v / totalInversion);
}
```

### 3.4 Pass Virtual Queues to Manager

The `Paper41HandoverManager.decide()` method needs access to virtual queues for the penalty calculation. Update the `decide()` signature:

```typescript
decide(
  cells: EarthFixedCell[],
  satellites: SatelliteInfo[],
  queueStates: CellQueueState[],
  virtualQueues?: VirtualQueue[],  // NEW
): Paper41HandoverResult;
```

## 4. Affected Files

| File | Change |
|------|--------|
| `src/utils/satellite/Paper41HandoverManager.ts` | Fix penalty + entropy weights |
| `src/hooks/useLyapunovOptimizer.ts` | Pass virtualQueues to decide() |

## 5. Verification Criteria

- [ ] Penalty uses M_{c,f} (virtual queue value), not constant 1
- [ ] When M_{c,f} = 0 for all cells, handover penalty = 0 regardless of handovers
- [ ] Entropy weights vary based on candidate satellite distribution
- [ ] With identical candidates, all weights equal 1/3
- [ ] With one highly variable attribute, that attribute gets highest weight
- [ ] Swap matching uses correct penalty in objective evaluation
- [ ] All existing tests pass
- [ ] TypeScript compiles cleanly
