# SDD-11: Conflict Graph v2 (Satellite Dimension)

## 1. Purpose

Extend the conflict graph from **(cell, beam)** vertices to **(satellite, cell, beam)** triples, matching the paper's formulation in Section IV-C. This is required for correct multi-satellite beam hopping.

## 2. Paper Formulation

### 2.1 Vertices (Section IV-C, Fig. 5)

> "a vertex represents a feasible y_{s,c,b}^{f,t} of a cell"
> "There are bound to B vertices corresponding to a cell"

In the paper, each cell c has a **serving satellite** s_c (from Algorithm 1), and creates B vertices: one per beam of that serving satellite. The vertex represents "satellite s_c serves cell c using beam b".

**Key insight**: Since different cells may be served by **different satellites**, the conflict graph naturally has a satellite dimension. Vertices for cell c1 (served by sat s1) and cell c2 (served by sat s2) have different satellite contexts.

### 2.2 Edge Conditions (Section IV-C)

Three categories of conflicts:

1. **Same cell** (Eq. 10): `cellId_i == cellId_j` → edge (a cell gets at most 1 beam per slot)
2. **Same beam of same satellite** (Eq. 12): `satId_i == satId_j && beamId_i == beamId_j` → edge (a beam serves at most 1 cell per slot)
3. **Inter-beam interference** (Eq. 14): Based on off-axis angle threshold G_th (Eq. 8) — two beams with same polarization from different or same satellites may interfere

### 2.3 Interference Check (Eq. 8)

```
G_th_{c,c'} = I_s^th - 10log(S_c × B) - SNR_{c'} - 10log(h_{s_c',c}/(δ × h_{s_c,c}))

Two beams conflict if:
  G_1(θ_{c',s',c}) + G_2(θ_{s',c,s}) < G_th_{c,c'}
```

where G_1 and G_2 are antenna gain attenuations at off-axis angles.

## 3. Design Changes

### 3.1 Extended ConflictVertex

```typescript
export interface ConflictVertex {
  id: string;              // "sat{satId}_cell{cellId}_beam{beamId}"
  satId: string;           // Serving satellite ID (NEW)
  cellId: number;
  beamId: number;
  polarization: 'A' | 'B';
  weight: number;
}
```

### 3.2 Extended buildConflictGraph Signature

```typescript
export interface SatelliteCellAssignment {
  satId: string;
  cellId: number;
  elevationDeg: number;     // Elevation from cell to satellite
  slantDistanceKm: number;  // For channel gain calculation
}

export function buildConflictGraph(
  cells: EarthFixedCell[],
  assignments: SatelliteCellAssignment[],  // From Algorithm 1
  beamsPerSatellite: number,
  physicalConfig?: PhysicalLayerConfig,
): ConflictGraph;
```

### 3.3 Satellite-Aware Conflict Rules

1. **Same cell**: Same as v1
2. **Same beam of same satellite**: `v_i.satId === v_j.satId && v_i.beamId === v_j.beamId`
   - v1 had: `v_i.beamId === v_j.beamId` (wrong — beams are per-satellite, not global)
3. **Interference (Eq. 8+14)**:
   - Compute off-axis angles using `computeOffAxisAngle()` from channelModel
   - Compute antenna gain attenuation for both Tx and Rx
   - Compare sum against dynamic threshold G_th (Eq. 8)
   - Only same-polarization beams need checking

### 3.4 Vertex ID Format

Change from `cell{id}_beam{id}` to `sat{satId}_cell{cellId}_beam{beamId}`.

Update `vertexId()` and `parseVertexId()` accordingly.

### 3.5 Backward Compatibility

- Keep the old `buildConflictGraph(cells, beamsPerSatellite)` signature as a **v1 fallback** that generates assignments with a single synthetic satellite
- The new signature accepts explicit satellite-cell assignments
- All downstream consumers (WMIS, baselines) work with the same `ConflictGraph` interface

## 4. Inter-Cell Distance

For the interference check, we need distances between cell centers in km. The cells in the simulation have `position: {x, z}` in scene units. The paper specifies 34.6 km inter-cell distance.

```typescript
/** Scale factor: scene units → km */
const SCENE_TO_KM = 34.6 / CELL_SPACING_SCENE_UNITS;

function cellDistanceKm(c1: EarthFixedCell, c2: EarthFixedCell): number {
  const dx = c1.position.x - c2.position.x;
  const dz = c1.position.z - c2.position.z;
  return Math.sqrt(dx * dx + dz * dz) * SCENE_TO_KM;
}
```

## 5. Affected Files

| File | Change |
|------|--------|
| `src/features/beam-hopping/algorithms/conflictGraph.ts` | Major rewrite: add satellite dimension, Eq.8 interference |
| `src/features/beam-hopping/algorithms/index.ts` | Update exports |
| `src/features/beam-hopping/algorithms/__tests__/conflictGraph.test.ts` | Update tests for new vertex format |

## 6. Verification Criteria

- [ ] Vertex ID includes satellite: `sat{id}_cell{id}_beam{id}`
- [ ] Same beam of **different** satellites does NOT create edge
- [ ] Same beam of **same** satellite creates edge
- [ ] Interference check uses off-axis angle model (not just adjacency)
- [ ] Two non-adjacent cells with small off-axis angle still get edge
- [ ] v1 fallback API still works for existing consumers
- [ ] All existing tests pass (adapted for new vertex format)
- [ ] TypeScript compiles cleanly
