# SDD-15: Paper-Faithful Scale & Baselines

## 1. Purpose

1. Scale the simulation to support **realistic LEO satellite counts** (100+ satellites with orbital mechanics)
2. Replace the current 5 baselines with the **paper's actual baselines** (3 groups × 3 baselines each)

## 2. Paper Simulation Setup (Section V-A)

### 2.1 Satellite Constellation
- **1200 LEO satellites**: 30 orbits × 40 satellites/orbit
- **Altitude**: 550 km
- **Inclination**: 53°
- **Visibility**: Each cell sees ~2-5 satellites at any time (min elevation 35°)
- **Location data**: AGI Systems Tool Kit (STK)
- **Simplification**: "all beam cells are consistently served by two satellites with the longest service time"

### 2.2 Ground Segment
- **20 beam cells**: 4 rows × 5 columns, hexagonal, 34.6 km inter-cell distance
- **First cell**: 30°E, 20°N
- **32400 terrestrial cells**: 500m radius each

### 2.3 Simulation Duration
- **20000 epochs** (66.67 minutes with 200ms slots × 200 slots/epoch)
- Each epoch: ~40 seconds real time

## 3. Paper Baselines

The paper evaluates 3 groups of baselines, one per subproblem:

### 3.1 Beam Hopping Baselines (Fig. 6)
All use proposed handover (Algorithm 1). No spectrum sharing.

| Baseline | Description | B | σ₀ | Arrival Rate |
|----------|-------------|---|-----|-------------|
| **Greedy** | Greedily allocate beams to cells with largest queue [40] | 4 | 0.9 | 6.52 Gbps |
| **MOSEK+Greedy** | MOSEK proxy: Monte Carlo WMIS heuristic (MOSEK requires commercial license) [5] | 4 | 0.9 | 6.52 Gbps |
| **Swap Matching** | Greedy init + swap matching to reduce P3 objective [13] | 4 | 0.9 | 6.52 Gbps |

### 3.2 Handover Baselines (Fig. 7)
All use proposed beam hopping (Algorithm 2). No spectrum sharing.

| Baseline | Description | B | σ₀ | Arrival Rate |
|----------|-------------|---|-----|-------------|
| **Load Balance** | Assign cell to satellite with min load [5] | 8 | 0.6 | 10.57 Gbps |
| **Entropy** | Multi-attribute entropy scheme [11] | 8 | 0.6 | 10.57 Gbps |
| **Cell Clustering** | Maximize geographic separation [41] | 8 | 0.6 | 10.57 Gbps |

### 3.3 Spectrum Sharing Baselines (Fig. 8)
All use proposed handover + beam hopping.

| Baseline | Description | B | σ₀ | Arrival Rate |
|----------|-------------|---|-----|-------------|
| **Greedy SS** | Greedily set z=1 for large queue cells [40] | 8 | 0.6 | 11.871 Gbps |
| **GA** | Genetic algorithm for problem P4 [42] | 8 | 0.6 | 11.871 Gbps |
| **BWO** | Binary whale optimization for P4 [43] | 8 | 0.6 | 11.871 Gbps |

## 4. Design

### 4.1 Satellite Constellation Generator

Instead of 1200 satellites with real STK data, generate a **physically consistent approximation** using the same Walker-Delta 30/40/1 parameters from Table II (no per-point validation against STK):

```typescript
interface ConstellationConfig {
  numOrbits: number;         // 30
  satsPerOrbit: number;      // 40
  altitudeKm: number;        // 550
  inclinationDeg: number;    // 53
  minElevationDeg: number;   // 35
}

function generateConstellation(config: ConstellationConfig, epochIndex: number):
  SatelliteInfo[] // Only visible satellites for the 20 beam cells
```

The function:
1. Computes orbital positions for all 1200 satellites at epoch time
2. Filters to only those visible (elevation > 35°) from the beam cell area
3. Returns ~5-15 visible satellites with realistic elevations and positions
4. Orbital period: ~95 minutes → satellites transit visible area in ~5-10 minutes

For browser performance, we **only track visible satellites**, not all 1200.

### 4.2 Epoch Time Model

```
epoch_time = epoch_index × slots_per_epoch × slot_duration
           = epoch_index × 200 × 0.2s
           = epoch_index × 40s

orbital_period ≈ 95 minutes = 5700s
epochs_per_orbit ≈ 142
```

Visible satellite set changes every ~10-20 epochs (topology change).

### 4.3 Paper-Faithful Baselines

Replace the current 5 baselines with the 9 paper baselines organized into 3 comparison groups.

```typescript
export interface BaselineGroup {
  name: string;
  config: {
    beamsPerSatellite: number;
    resourceUtilizationThreshold: number;
    totalArrivalRateGbps: number;
  };
  baselines: {
    name: string;
    run: (state, cells, satellites, graph, epoch, config, queueStates) => BaselineMetrics;
  }[];
}

export const BASELINE_GROUPS: BaselineGroup[] = [
  {
    name: 'Beam Hopping (Fig. 6)',
    config: { beamsPerSatellite: 4, resourceUtilizationThreshold: 0.9, totalArrivalRateGbps: 6.52 },
    baselines: [
      { name: 'Greedy', run: runGreedyBeamHopping },
      { name: 'MOSEK+Greedy', run: runMosekGreedyBeamHopping },
      { name: 'Swap Matching', run: runSwapMatchingBeamHopping },
    ],
  },
  {
    name: 'Handover (Fig. 7)',
    config: { beamsPerSatellite: 8, resourceUtilizationThreshold: 0.6, totalArrivalRateGbps: 10.57 },
    baselines: [
      { name: 'Load Balance', run: runLoadBalanceHandover },
      { name: 'Entropy', run: runEntropyHandover },
      { name: 'Cell Clustering', run: runCellClusteringHandover },
    ],
  },
  {
    name: 'Spectrum Sharing (Fig. 8)',
    config: { beamsPerSatellite: 8, resourceUtilizationThreshold: 0.6, totalArrivalRateGbps: 11.871 },
    baselines: [
      { name: 'Greedy SS', run: runGreedySpectrumSharing },
      { name: 'GA', run: runGASpectrumSharing },
      { name: 'BWO', run: runBWOSpectrumSharing },
    ],
  },
];
```

### 4.4 Baseline Implementations

| Baseline | Implementation |
|----------|---------------|
| **Greedy BH** | Allocate beams to cells with largest queue, one at a time |
| **MOSEK+Greedy** | Monte Carlo WMIS (existing) with higher trial count |
| **Swap Matching BH** | Greedy init + pairwise beam swaps minimizing P3 |
| **Load Balance** | Each cell → satellite with minimum current load |
| **Entropy** | Multi-attribute scheme from [11] (use same entropy weight as Algorithm 1 but without conditional trigger or swap matching) |
| **Cell Clustering** | Assign cells to satellites maximizing geographic spread, fixed per topology |
| **Greedy SS** | Set z=1 for cells with largest queue, one at a time, respecting constraint (16) |
| **GA** | Standard binary genetic algorithm: crossover + mutation + selection |
| **BWO** | Binary whale optimization: exploration/exploitation phases with sigmoid transfer |

### 4.5 Chart Updates

Update `SimulationChartsPanel` and `ConstraintValidationPanel` to support the 3-group structure:
- Each group has its own set of 3 charts (objective, queue, HO freq)
- Or: one set of charts with group selector tab

## 5. Affected Files

| File | Change |
|------|--------|
| `src/features/beam-hopping/algorithms/baselineRunner.ts` | Major rewrite: 3 groups × 3 baselines |
| `src/features/beam-hopping/algorithms/constellation.ts` | **NEW**: LEO constellation generator |
| `src/hooks/useLyapunovOptimizer.ts` | Use constellation generator instead of synthetic satellites |
| `src/components/ui/sidebar/SimulationChartsPanel.tsx` | Support 3 baseline groups |
| `src/components/ui/sidebar/ConstraintValidationPanel.tsx` | Support 3 baseline groups |
| `src/types/lyapunov.ts` | Update EpochSnapshot baselines type |

## 6. Phased Approach

Given the scope, SDD-15 can be implemented in sub-phases:

### Phase 15a: Constellation Generator
- Replace synthetic satellites with orbital mechanics
- Generate 5-15 visible satellites per epoch
- Support topology changes every ~10-20 epochs

### Phase 15b: Beam Hopping Baselines (Fig. 6)
- Replace current Greedy with paper's Greedy
- Keep MOSEK+Greedy (increase trials)
- Add Swap Matching beam hopping

### Phase 15c: Handover Baselines (Fig. 7)
- Add Load Balance, Entropy, Cell Clustering
- Run with B=8, σ₀=0.6, 10.57 Gbps

### Phase 15d: Spectrum Sharing Baselines (Fig. 8)
- Add Greedy SS, GA, BWO
- Run with B=8, σ₀=0.6, 11.871 Gbps

### Phase 15e: Chart/UI Updates
- Tab-based group selection
- Correct chart labels matching Fig. 6-8

## 7. Verification Criteria

- [ ] Constellation produces ~5-15 visible satellites from 1200-satellite constellation
- [ ] Satellite positions change over time with ~95 min orbital period
- [ ] Each baseline group uses correct B, σ₀, and arrival rate
- [ ] 9 baselines match paper descriptions
- [ ] Charts correctly display 4 lines per group (Proposed + 3 baselines)
- [ ] Simulation can run 1000+ epochs without performance degradation
- [ ] All tests pass, TypeScript compiles cleanly
