# SDD-13: BSSA v2 (Complete 4-Stage + Eq. 39 Fitness)

## 1. Purpose

Complete the Binary Sparrow Search Algorithm (Algorithm 3) with all stages from the paper and correct the fitness function to match Eq. 39.

## 2. Paper Algorithm 3 (Exact)

The paper's Algorithm 3 has **4 stages** beyond basic SSA:

### Stage 1: Local Search (Lines 7-22)
After sorting by fitness, perform local search on the **best sparrow** Sb:
1. Copy Sb to Sb'
2. Randomly select `a` elements and flip them (mutation)
3. Binarize using Eq. 38
4. If f(Sb') > f(Sb), update Sb
5. If f(Sb') > f(Sg), update global best Sg
6. Repeat for N''' iterations

### Stage 2: Adaptive Crossover (Lines 23-30)
Apply crossover to the **worse half** of population:
1. Compute adaptive probability: `υ = 0.55 - 0.1/(1 + exp(5 - 10*i/N''))`
2. For each sparrow in worse half:
   - If rand() < υ: randomly select ζ ∈ {1,2,3} elements and flip them

### Stage 3: Standard SSA Update (Line 31)
Update all sparrows using standard producer/scrounger/scout rules (already in v1).

### Stage 4: Greedy Search (Lines 35-37)
Post-optimization greedy step:
1. For each cell with z=0 in the best solution:
2. Try setting z=1
3. Keep if constraint (16) — terrestrial interference duration — is still satisfied

### v1 has: Stage 3 only
### v2 needs: All 4 stages in correct order

## 3. Fitness Function (Eq. 39)

### Paper (Eq. 39):
```
              ⎧ Σ_c Ω_c - (D'_{c,f} - Q'_{c,f})²,  if constraint (16) holds
F_i =         ⎨
              ⎩ Σ_c Ω_c - (Q'_{c,f})²,               otherwise

where Ω_c = (Q'_{c,f})² + [(W₂ - W_center) × T_slot × log₂(1 + SNR_c) × T]²
```

- `Q'_{c,f}`: Remaining queue after beam hopping (from Algorithm 2)
- `D'_{c,f}`: Additional data served via shared spectrum (Eq. 36)
- `W₂`: Terrestrial bandwidth (100 MHz)
- `W_center`: Terrestrial cell center bandwidth (20 MHz)
- `T`: Slots per epoch

### v1 bug: `fitness = totalGain - penalty` (heuristic, not Eq. 39)

### Key difference:
The paper's fitness depends on the **queue state** Q'_{c,f} from Algorithm 2, making it directly optimize service satisfaction rather than raw capacity gain.

## 4. Binarization (Eq. 38)

Paper uses s-shape function:
```
S'_{i,j} = 1 if 1/(1 + e^{-2×S_{i,j}}) > μ
           0 otherwise
```
where μ is random in [0,1].

**v1 uses**: `sigmoid(x) > Math.random()` — correct but with coefficient 1, not 2.
**v2 fix**: Use coefficient 2 in sigmoid: `1/(1 + e^{-2x})`

## 5. Tent Chaotic Initialization

Paper specifies tent chaotic strategy for initialization instead of random:
```
x_{n+1} = 2x_n         if x_n < 0.5
           2(1 - x_n)   if x_n ≥ 0.5
```
Then map [0,1] to continuous search space.

## 6. Design Changes

### 6.1 New binarySSA Structure

```typescript
function binarySSA(
  dim: number,
  queueStates: CellQueueState[],       // Q'_{c,f} from Algorithm 2
  clusters: TerrestrialCluster[],
  paperConfig: LyapunovConfig,
  ssConfig: SpectrumSharingConfig,
  physConfig: PhysicalLayerConfig,
  bssaConfig: BSSAConfig,
): number[] {
  // Initialize with tent chaotic strategy (changed from random)

  for (iter = 0; iter < maxIter; iter++) {
    // Sort by fitness (descent order)

    // Stage 1: Local Search on best sparrow (Lines 7-22)
    localSearch(bestSparrow, N_localSearch);

    // Stage 2: Adaptive Crossover on worse half (Lines 23-30)
    adaptiveCrossover(population, iter, maxIter);

    // Stage 3: Standard SSA update (Line 31)
    // - Producers: Eq. 12a/12b
    // - Scroungers: Eq. 13a/13b
    // - Scouts: Eq. 14a/14b
    updateSSA(population);

    // Binarize and evaluate fitness
    binarizeAndEvaluate(population);
  }

  // Stage 4: Greedy Search (Lines 35-37)
  greedySearch(bestSolution, constraint16);

  return bestSolution;
}
```

### 6.2 Correct Fitness Function

```typescript
function computeFitness(
  solution: number[],
  queueStates: CellQueueState[],    // Q'_{c,f}
  clusters: TerrestrialCluster[],
  paperConfig: LyapunovConfig,
  ssConfig: SpectrumSharingConfig,
): number {
  const T = paperConfig.slotsPerEpoch;
  const snr = Math.pow(10, paperConfig.targetSnrDb / 10);
  const sharedBw = ssConfig.terrestrialBandwidthMhz - 20; // W₂ - W_center
  const sharedCapPerSlot = sharedBw * (paperConfig.slotDurationMs / 1000) * Math.log2(1 + snr);

  const constraint16Holds = checkConstraint16(solution, clusters, ssConfig);

  let fitness = 0;
  for (let i = 0; i < solution.length; i++) {
    const q = queueStates[i];
    const Qc = q?.queueLength ?? 0;
    const Omega = Qc * Qc + (sharedCapPerSlot * T) ** 2;

    if (constraint16Holds) {
      const Dc = solution[i] === 1 ? sharedCapPerSlot * T : 0;
      fitness += Omega - (Dc - Qc) ** 2;
    } else {
      fitness += Omega - Qc * Qc; // = (sharedCapPerSlot * T)²
    }
  }
  return fitness;
}
```

## 7. Affected Files

| File | Change |
|------|--------|
| `src/features/beam-hopping/algorithms/spectrumSharing.ts` | Major rewrite: 4-stage BSSA + Eq.39 fitness |
| `src/features/beam-hopping/algorithms/__tests__/spectrumSharing.test.ts` | Update tests |

## 8. Verification Criteria

- [ ] Local search stage: flipping elements in best sparrow improves fitness
- [ ] Adaptive crossover: probability υ decreases over iterations
- [ ] Greedy search: cells with z=0 are tried for z=1 post-optimization
- [ ] Fitness matches Eq. 39 formula
- [ ] Binarization uses coefficient 2 in sigmoid
- [ ] Tent chaotic initialization produces diverse initial population
- [ ] Constraint (16) violation gives lower fitness
- [ ] All existing tests pass
