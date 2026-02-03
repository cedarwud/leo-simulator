import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import { SatelliteOrbitCalculator } from '@/utils/satellite/SatelliteOrbitCalculator';
import { Beam, DEFAULT_BEAM_CONFIG, FRF3_COLORS, DEFAULT_SCHEDULE } from '../types';
import { BeamCones } from './BeamCone';
import { GroundCells } from './GroundCells';
import { WideBeam } from './WideBeam';
import { ENERGY_CONFIG } from '@/config/energy.config';

const SATELLITE_MODEL_PATH = '/models/sat.glb';
const ORBIT_DATA_URL = '/data/satellite-timeseries.json';

useGLTF.preload(SATELLITE_MODEL_PATH);

// ============================================================
// Beam Management 統計數據
// ============================================================

export interface BeamManagementStats {
  /** 當前服務的衛星 ID */
  currentSatelliteId: string | null;
  /** 當前服務的波束 ID */
  currentBeamId: number | null;
  /** 當前 RSRP (dBm) */
  currentRSRP: number | null;
  /** 波束換手次數（intra-satellite） */
  beamHandovers: number;
  /** 衛星換手次數（inter-satellite） */
  satelliteHandovers: number;
  /** 總換手次數 */
  totalHandovers: number;
  /** 運行時間（秒） */
  elapsedTime: number;
  /** 累積能耗（焦耳） */
  energyConsumption: number;
  /** 每秒平均能耗 */
  averageEnergyPerSecond: number;
  /** 當前活躍的波束 ID 列表 */
  activeBeams: number[];
}

// ============================================================
// 編排的衛星系統（展示 beam handover）
// ============================================================

interface ScriptedSatellite {
  id: string;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startTime: number;
  duration: number;
  /** 是否會經過 UE 上方（用於顯示波束） */
  passesOverUE: boolean;
}

/**
 * 生成編排的衛星軌跡
 * - 部分衛星會經過 UE 上方（展示 beam hopping）
 * - 部分衛星在其他位置移動（豐富場景）
 */
function generateScriptedSatellites(
  uavPosition: THREE.Vector3,
  count: number,
  interval: number,
  satelliteHeight: number,
  ambientCount: number = 6  // 額外的環境衛星數量
): ScriptedSatellite[] {
  const satellites: ScriptedSatellite[] = [];
  const pathLength = 1000;

  // 1. 經過 UE 的衛星（展示 beam hopping）
  for (let i = 0; i < count; i++) {
    const angle = (i * 137.5 * Math.PI) / 180 + Math.PI / 6;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);

    satellites.push({
      id: `sat-${i + 1}`,
      startPos: new THREE.Vector3(
        uavPosition.x - dirX * pathLength / 2,
        satelliteHeight,
        uavPosition.z - dirZ * pathLength / 2
      ),
      endPos: new THREE.Vector3(
        uavPosition.x + dirX * pathLength / 2,
        satelliteHeight,
        uavPosition.z + dirZ * pathLength / 2
      ),
      startTime: i * interval,
      duration: interval,
      passesOverUE: true,
    });
  }

  // 2. 不經過 UE 的環境衛星（豐富場景）
  for (let i = 0; i < ambientCount; i++) {
    // 在 UE 周圍的不同位置生成軌跡
    const angle = (i * 60 + 30) * Math.PI / 180; // 每 60 度一顆
    const offset = 200 + (i % 3) * 100; // 距離 UE 200-400 單位
    const perpAngle = angle + Math.PI / 2;

    // 軌跡中心點（偏離 UE）
    const centerX = uavPosition.x + Math.cos(angle) * offset;
    const centerZ = uavPosition.z + Math.sin(angle) * offset;

    // 軌跡方向（垂直於偏移方向，看起來像平行軌道）
    const dirX = Math.cos(perpAngle);
    const dirZ = Math.sin(perpAngle);

    // 時間錯開，讓衛星分散出現
    const timeOffset = (i * interval / 2) % (count * interval);

    satellites.push({
      id: `ambient-${i + 1}`,
      startPos: new THREE.Vector3(
        centerX - dirX * pathLength / 2,
        satelliteHeight + (i % 2) * 50, // 略微不同高度
        centerZ - dirZ * pathLength / 2
      ),
      endPos: new THREE.Vector3(
        centerX + dirX * pathLength / 2,
        satelliteHeight + (i % 2) * 50,
        centerZ + dirZ * pathLength / 2
      ),
      startTime: timeOffset,
      duration: interval * 1.2, // 稍慢一點
      passesOverUE: false,
    });
  }

  return satellites;
}

/**
 * 計算衛星當前位置
 */
function getScriptedSatellitePosition(
  sat: ScriptedSatellite,
  currentTime: number
): THREE.Vector3 | null {
  const localTime = currentTime - sat.startTime;
  if (localTime < 0 || localTime > sat.duration) {
    return null;
  }

  const progress = localTime / sat.duration;
  return new THREE.Vector3().lerpVectors(sat.startPos, sat.endPos, progress);
}

// ============================================================
// 訊號強度模型（基於 3GPP NTN 標準）
// 參考：3GPP TR 38.821, PMC11511224
// ============================================================

/**
 * 計算波束增益（簡化的 Bessel 函數模型）
 * 參考：PMC11511224 - "A Beam Hopping Scheme Based on Adaptive Beam Radius for LEO Satellites"
 *
 * G(θ) = Gmax × (2×J₁(u)/u)²
 * 其中 u = 2.07123 × sin(θ)/sin(θ₃dB)
 *
 * 簡化為：G(θ) = Gmax × (1 - (d/r)²)² for d < r
 * 這是一個近似，在波束中心最強，向邊緣遞減
 */
function calculateBeamGain(
  distanceFromCenter: number,
  beamRadius: number,
  maxGain: number = 30  // dBi，典型 LEO 衛星增益
): number {
  if (distanceFromCenter >= beamRadius) {
    return -Infinity; // 波束外
  }

  // 正規化距離 (0 = 中心, 1 = 邊緣)
  const normalizedDist = distanceFromCenter / beamRadius;

  // 使用二次衰減模型（近似 Bessel 函數）
  // 在中心增益最大，3dB 點大約在 0.5 半徑處
  const gainReduction = 12 * Math.pow(normalizedDist, 2); // 邊緣約 -12dB

  return maxGain - gainReduction;
}

/**
 * 計算 RSRP（參考訊號接收功率）
 * 參考：3GPP TS 38.215
 *
 * RSRP = EIRP + Gr - PathLoss
 * 簡化模型：RSRP ∝ BeamGain - 10×log10(distance²)
 */
function calculateRSRP(
  beamGain: number,        // dBi
  distanceToSatellite: number,  // 場景單位
  referenceDistance: number = 400  // 參考距離（衛星高度）
): number {
  if (beamGain === -Infinity) return -Infinity;

  // 自由空間路徑損耗（簡化）
  const pathLoss = 20 * Math.log10(distanceToSatellite / referenceDistance);

  // RSRP = 波束增益 - 路徑損耗 + 常數偏移（使數值更直觀）
  return beamGain - pathLoss + 50; // 偏移使 RSRP 大約在 -50 到 -90 dBm 範圍
}

/**
 * 3GPP A3 Event 換手判斷
 * 參考：3GPP TS 36.331 Section 5.5.4.4
 *
 * 觸發條件：RSRP_neighbor + Offset - Hysteresis > RSRP_serving
 *
 * @param rsrpServing - 當前服務波束的 RSRP
 * @param rsrpNeighbor - 鄰近波束的 RSRP
 * @param a3Offset - A3 偏移量 (dB)，正值表示需要更強訊號才換手
 * @param hysteresis - 遲滯值 (dB)，防止 ping-pong
 */
function checkA3Event(
  rsrpServing: number,
  rsrpNeighbor: number,
  a3Offset: number = 2,    // 典型值：2 dB
  hysteresis: number = 1   // 典型值：1 dB
): boolean {
  return rsrpNeighbor + a3Offset - hysteresis > rsrpServing;
}

/**
 * 在所有波束中找到最佳波束（RSRP 最強）
 */
interface BeamRSRPInfo {
  beamId: number;
  beamPos: { x: number; z: number };
  rsrp: number;
  gain: number;
  distanceToUE: number;
}

function findBestBeam(
  beams: Beam[],
  uavPosition: THREE.Vector3,
  satelliteHeight: number
): BeamRSRPInfo | null {
  let bestBeam: BeamRSRPInfo | null = null;
  let maxRSRP = -Infinity;

  for (const beam of beams) {
    const dx = beam.position.x - uavPosition.x;
    const dz = beam.position.z - uavPosition.z;
    const distanceToUE = Math.sqrt(dx * dx + dz * dz);

    // 計算波束增益
    const gain = calculateBeamGain(distanceToUE, beam.radius);

    if (gain === -Infinity) continue; // 不在波束覆蓋內

    // 計算到衛星的距離（3D）
    const distToSat = Math.sqrt(
      dx * dx + dz * dz + satelliteHeight * satelliteHeight
    );

    // 計算 RSRP
    const rsrp = calculateRSRP(gain, distToSat, satelliteHeight);

    if (rsrp > maxRSRP) {
      maxRSRP = rsrp;
      bestBeam = {
        beamId: beam.id,
        beamPos: { x: beam.position.x, z: beam.position.z },
        rsrp,
        gain,
        distanceToUE,
      };
    }
  }

  return bestBeam;
}

/**
 * 生成 7-beam 佈局
 */
function generate7BeamLayout(centerX: number, centerZ: number): Beam[] {
  const { cellSpacing, coneRadiusBottom, frequencyReuseFactor } = DEFAULT_BEAM_CONFIG;
  const colors = [FRF3_COLORS.group0, FRF3_COLORS.group1, FRF3_COLORS.group2];

  const beams: Beam[] = [
    {
      id: 0,
      position: { x: centerX, z: centerZ },
      radius: coneRadiusBottom,
      color: colors[0],
      isActive: false,
      frequencyGroup: 0,
    },
  ];

  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const x = centerX + Math.cos(angle) * cellSpacing;
    const z = centerZ + Math.sin(angle) * cellSpacing;
    const freqGroup = frequencyReuseFactor === 3 ? (i % 3) : 0;

    beams.push({
      id: i + 1,
      position: { x, z },
      radius: coneRadiusBottom,
      color: colors[freqGroup],
      isActive: false,
      frequencyGroup: freqGroup,
    });
  }

  return beams;
}

// ============================================================
// 單顆編排衛星的波束系統
// ============================================================

interface ScriptedSatelliteBeamSystemProps {
  satellite: ScriptedSatellite;
  position: THREE.Vector3;
  uavPosition: THREE.Vector3;
  showBeams: boolean;      // 是否顯示波束（衛星激活後持續為 true）
  isServingUE: boolean;    // 是否正在服務 UE（用於顯示連線）
  wideBeamRadius: number;
  /** 當前服務的波束 ID（用於 A3 換手判斷） */
  currentServingBeamId: number | null;
  /** 當服務波束改變時的回調 */
  onServingBeamChange?: (beamInfo: BeamRSRPInfo | null) => void;
}

function ScriptedSatelliteBeamSystem({
  satellite,
  position,
  uavPosition,
  showBeams,
  isServingUE,
  wideBeamRadius,
  currentServingBeamId,
  onServingBeamChange,
}: ScriptedSatelliteBeamSystemProps) {
  const satPos: [number, number, number] = [position.x, position.y, position.z];

  // 本地 ref 追蹤服務波束（避免依賴父組件 state 的延遲）
  const localServingBeamRef = useRef<number | null>(null);
  // 追蹤上一個服務的波束（用於 beam hopping 展示）
  const previousServingBeamRef = useRef<number | null>(null);

  // Beam hopping 時隙動畫（當不服務 UE 時使用）
  const [slotIndex, setSlotIndex] = useState(0);
  const slotTimeRef = useRef(0);

  // 時隙循環動畫
  useFrame((_, delta) => {
    if (!showBeams) return;

    slotTimeRef.current += delta * 1000; // 轉換為毫秒
    const slotDuration = DEFAULT_SCHEDULE[slotIndex % DEFAULT_SCHEDULE.length].duration;

    if (slotTimeRef.current >= slotDuration) {
      slotTimeRef.current = 0;
      setSlotIndex(prev => (prev + 1) % DEFAULT_SCHEDULE.length);
    }
  });

  // 波束佈局（以衛星地面投影為中心）
  const beamLayout = useMemo(
    () => generate7BeamLayout(position.x, position.z),
    [position.x, position.z]
  );

  // A3 換手參數
  const A3_OFFSET = 1;      // dB
  const HYSTERESIS = 1;     // dB

  // 計算所有波束到 UE 的距離和 RSRP
  const allBeamsInfo = useMemo<BeamRSRPInfo[]>(() => {
    if (!showBeams) return [];

    const results: BeamRSRPInfo[] = [];
    for (const beam of beamLayout) {
      const dx = beam.position.x - uavPosition.x;
      const dz = beam.position.z - uavPosition.z;
      const distToUE = Math.sqrt(dx * dx + dz * dz);
      const gain = calculateBeamGain(distToUE, beam.radius);

      const distToSat = Math.sqrt(dx * dx + dz * dz + position.y * position.y);
      const rsrp = gain === -Infinity ? -Infinity : calculateRSRP(gain, distToSat, position.y);

      results.push({
        beamId: beam.id,
        beamPos: { x: beam.position.x, z: beam.position.z },
        rsrp,
        gain,
        distanceToUE: distToUE,
      });
    }

    return results;
  }, [beamLayout, uavPosition, position.y, showBeams]);

  // Beam Hopping 邏輯
  // - 服務 UE 時：UE-aware（確保 UE 連接的波束 active）
  // - 不服務 UE 時：時隙循環動畫（展示 beam hopping 效果）
  const activeBeamIds = useMemo(() => {
    if (!showBeams) {
      return new Set<number>();
    }

    // 不服務 UE 時，使用時隙循環動畫
    if (!isServingUE) {
      const slot = DEFAULT_SCHEDULE[slotIndex % DEFAULT_SCHEDULE.length];
      return new Set(slot.activeBeams);
    }

    const active = new Set<number>();

    // 找到 UE 在覆蓋範圍內的所有波束
    const coveringBeams = allBeamsInfo.filter(b => b.gain !== -Infinity);

    if (coveringBeams.length === 0) {
      // UE 不在任何波束覆蓋內，使用時隙循環動畫
      const slot = DEFAULT_SCHEDULE[slotIndex % DEFAULT_SCHEDULE.length];
      return new Set(slot.activeBeams);
    }

    // 當前服務波束一定要 active
    const servingId = localServingBeamRef.current ?? currentServingBeamId;
    if (servingId !== null) {
      active.add(servingId);
    }

    // 找到 RSRP 最強的波束（UE 即將進入或正在使用的）
    const bestBeam = coveringBeams.reduce((best, b) =>
      b.rsrp > best.rsrp ? b : best, coveringBeams[0]);
    active.add(bestBeam.beamId);

    // 如果 UE 在重疊區（有多個波束覆蓋），讓即將切換的波束也 active
    if (coveringBeams.length > 1) {
      // 第二強的波束也 active（準備換手）
      const sortedByRsrp = [...coveringBeams].sort((a, b) => b.rsrp - a.rsrp);
      if (sortedByRsrp.length > 1) {
        active.add(sortedByRsrp[1].beamId);
      }
    }

    return active;
  }, [showBeams, isServingUE, allBeamsInfo, currentServingBeamId, slotIndex]);

  // 只考慮 active 的波束來選擇連線
  const coveringBeams = useMemo<BeamRSRPInfo[]>(() => {
    return allBeamsInfo.filter(b =>
      b.gain !== -Infinity && activeBeamIds.has(b.beamId)
    ).sort((a, b) => b.rsrp - a.rsrp);
  }, [allBeamsInfo, activeBeamIds]);

  // A3 換手邏輯：使用本地 ref 確保穩定
  const servingBeamInfo = useMemo<BeamRSRPInfo | null>(() => {
    if (!showBeams || coveringBeams.length === 0) {
      localServingBeamRef.current = null;
      return null;
    }

    const bestBeam = coveringBeams[0];

    // 獲取當前服務波束（優先使用本地 ref，其次是父組件傳入的值）
    const currentBeamId = localServingBeamRef.current ?? currentServingBeamId;

    // 如果沒有當前服務波束
    if (currentBeamId === null) {
      // 首次選擇：如果有多個波束 RSRP 相近（差距 < 2dB），選擇 ID 較小的（確定性選擇）
      const similarBeams = coveringBeams.filter(b => bestBeam.rsrp - b.rsrp < 2);
      const selected = similarBeams.reduce((min, b) => b.beamId < min.beamId ? b : min, similarBeams[0]);
      localServingBeamRef.current = selected.beamId;
      return selected;
    }

    // 找到當前服務波束的資訊
    const currentBeamInfo = coveringBeams.find(b => b.beamId === currentBeamId);

    // 如果當前波束已離開覆蓋範圍，切換到最佳波束
    if (!currentBeamInfo) {
      localServingBeamRef.current = bestBeam.beamId;
      console.log(`📶 波束換手: B${currentBeamId} → B${bestBeam.beamId} (舊波束離開覆蓋)`);
      return bestBeam;
    }

    // 如果最佳波束就是當前波束，維持
    if (bestBeam.beamId === currentBeamId) {
      return currentBeamInfo;
    }

    // A3 Event 檢查：只有當最佳波束顯著更強時才換手
    const rsrpDiff = bestBeam.rsrp - currentBeamInfo.rsrp;
    if (rsrpDiff > A3_OFFSET + HYSTERESIS) {
      localServingBeamRef.current = bestBeam.beamId;
      console.log(`📶 波束換手: B${currentBeamId} → B${bestBeam.beamId} (RSRP 差: +${rsrpDiff.toFixed(1)} dB)`);
      return bestBeam;
    }

    // 維持當前波束
    return currentBeamInfo;
  }, [showBeams, coveringBeams, currentServingBeamId]);

  // 通知父組件服務波束改變（只在真正改變時）
  const lastNotifiedBeamRef = useRef<number | null>(null);
  useEffect(() => {
    if (onServingBeamChange && isServingUE && servingBeamInfo) {
      if (servingBeamInfo.beamId !== lastNotifiedBeamRef.current) {
        lastNotifiedBeamRef.current = servingBeamInfo.beamId;
        onServingBeamChange(servingBeamInfo);
      }
    }
  }, [servingBeamInfo, onServingBeamChange, isServingUE]);

  // 更新波束狀態（根據 beam hopping schedule 標記 active/inactive）
  const beamsWithState = useMemo(() => {
    if (!showBeams) {
      return beamLayout.map((b) => ({ ...b, isActive: false }));
    }

    // 根據當前時隙的 schedule 決定哪些波束是 active
    return beamLayout.map((beam) => ({
      ...beam,
      isActive: activeBeamIds.has(beam.id),
    }));
  }, [beamLayout, showBeams, activeBeamIds]);

  return (
    <group>
      {/* 衛星標籤 */}
      <Text
        position={[satPos[0], satPos[1] + 40, satPos[2]]}
        fontSize={14}
        color={isServingUE ? '#00ff00' : showBeams ? '#88ff88' : '#666666'}
        anchorX="center"
        anchorY="middle"
        outlineWidth={1}
        outlineColor="#000000"
      >
        {satellite.id}
      </Text>

      {/* Wide Beam（總是顯示） */}
      <WideBeam
        satellitePosition={satPos}
        radius={wideBeamRadius}
        color="#ffffff"
        coneOpacity={0.005}
        groundOpacity={0.02}
      />

      {/* Spot Beams（顯示波束時） */}
      {showBeams && (
        <>
          <BeamCones
            beams={beamsWithState}
            satelliteHeight={position.y}
            satellitePosition={satPos}
          />
          <GroundCells beams={beamsWithState} showLabels={true} />
        </>
      )}

      {/* 服務連線（只有正在服務 UE 且有服務波束時顯示一條線） */}
      {isServingUE && servingBeamInfo && (
        <Line
          points={[
            satPos,
            [servingBeamInfo.beamPos.x, 0, servingBeamInfo.beamPos.z],
            [uavPosition.x, uavPosition.y, uavPosition.z],
          ]}
          color="#00ff00"
          lineWidth={3}
          transparent
          opacity={0.8}
        />
      )}

      {/* 當前服務的波束資訊 */}
      {isServingUE && servingBeamInfo && (
        <Text
          position={[satPos[0], satPos[1] + 55, satPos[2]]}
          fontSize={10}
          color="#00ff00"
          anchorX="center"
          anchorY="middle"
          outlineWidth={1}
          outlineColor="#000000"
        >
          {`B${servingBeamInfo.beamId} | RSRP: ${servingBeamInfo.rsrp.toFixed(1)} dBm`}
        </Text>
      )}
    </group>
  );
}

// ============================================================
// 主組件
// ============================================================

export interface BeamHoppingDemoProps {
  uavPosition: THREE.Vector3;
  /** 時間速度倍率 */
  timeSpeed?: number;
  /** 編排衛星數量 */
  scriptedSatelliteCount?: number;
  /** 編排衛星間隔（秒）*/
  scriptedInterval?: number;
  /** Wide beam 半徑 */
  wideBeamRadius?: number;
  /** 衛星高度 */
  satelliteHeight?: number;
  /** 統計數據更新回調 */
  onStatsUpdate?: (stats: BeamManagementStats) => void;
}

/**
 * Beam Hopping 展示場景
 *
 * 混合模式：
 * 1. 背景衛星：使用真實軌道數據（無波束，自然移動）
 * 2. 展示衛星：編排軌跡經過 UE（有波束，展示 handover）
 */
export function BeamHoppingDemo({
  uavPosition,
  timeSpeed = 0.6,
  scriptedSatelliteCount = 4,
  scriptedInterval = 15,  // 每 15 秒一顆衛星經過
  wideBeamRadius = 180,
  satelliteHeight = 400,
  onStatsUpdate,
}: BeamHoppingDemoProps) {
  const [calculator] = useState(() => new SatelliteOrbitCalculator());
  const [isLoaded, setIsLoaded] = useState(false);
  const elapsedTimeRef = useRef(0);

  const { scene } = useGLTF(SATELLITE_MODEL_PATH);

  // 背景衛星位置（真實軌道）
  const [backgroundSatellites, setBackgroundSatellites] = useState<Map<string, THREE.Vector3>>(new Map());

  // 編排的衛星
  const scriptedSatellites = useMemo(
    () => generateScriptedSatellites(uavPosition, scriptedSatelliteCount, scriptedInterval, satelliteHeight),
    [uavPosition, scriptedSatelliteCount, scriptedInterval, satelliteHeight]
  );

  // 編排衛星的當前位置（需要 state 來觸發波束系統重新渲染）
  const [scriptedPositions, setScriptedPositions] = useState<Map<string, THREE.Vector3>>(new Map());
  const scriptedPositionsRef = useRef<Map<string, THREE.Vector3>>(new Map());

  // 已激活的衛星（顯示波束，直到衛星消失）- 用 ref 追蹤，只在改變時更新 state
  const activatedSatellitesRef = useRef<Set<string>>(new Set());
  const [activatedSatellites, setActivatedSatellites] = useState<Set<string>>(new Set());

  // 當前服務 UE 的衛星 ID - 用 ref 追蹤，只在改變時更新 state
  const servingScriptedIdRef = useRef<string | null>(null);
  const [servingScriptedId, setServingScriptedId] = useState<string | null>(null);

  // ===== 統計數據追蹤 =====
  // 初始化模擬數據：假設已經運行了一段時間
  const INITIAL_ELAPSED_SECONDS = 47;  // 模擬已運行 47 秒
  const INITIAL_BEAM_HANDOVERS = 8;    // 已發生 8 次波束換手
  const INITIAL_SAT_HANDOVERS = 2;     // 已發生 2 次衛星換手

  const beamHandoversRef = useRef(INITIAL_BEAM_HANDOVERS);
  const satelliteHandoversRef = useRef(INITIAL_SAT_HANDOVERS);
  const lastServingBeamIdRef = useRef<number | null>(null);
  const lastServingSatelliteIdRef = useRef<string | null>(null);
  const currentRSRPRef = useRef<number | null>(null);
  const currentBeamIdRef = useRef<number | null>(null);
  const activeBeamsRef = useRef<number[]>([]);
  const startTimeRef = useRef<number>(Date.now() - INITIAL_ELAPSED_SECONDS * 1000);

  // 每顆衛星當前服務的波束 ID（用於 A3 換手判斷）
  const [servingBeamIds, setServingBeamIds] = useState<Map<string, number>>(new Map());

  // 更新統計數據的回調
  const updateStats = useCallback(() => {
    if (!onStatsUpdate) return;

    const elapsedTime = (Date.now() - startTimeRef.current) / 1000;
    const totalHandovers = beamHandoversRef.current + satelliteHandoversRef.current;
    const energyConsumption = totalHandovers * ENERGY_CONFIG.ENERGY_PER_HANDOVER;

    onStatsUpdate({
      currentSatelliteId: servingScriptedIdRef.current,
      currentBeamId: currentBeamIdRef.current,
      currentRSRP: currentRSRPRef.current,
      beamHandovers: beamHandoversRef.current,
      satelliteHandovers: satelliteHandoversRef.current,
      totalHandovers,
      elapsedTime,
      energyConsumption,
      averageEnergyPerSecond: elapsedTime > 0 ? energyConsumption / elapsedTime : 0,
      activeBeams: activeBeamsRef.current,
    });
  }, [onStatsUpdate]);

  // 處理波束變更（來自 ScriptedSatelliteBeamSystem 的回調）
  const handleServingBeamChange = useCallback((satId: string, beamInfo: BeamRSRPInfo | null) => {
    if (beamInfo) {
      // 更新當前服務資訊
      const prevBeamId = currentBeamIdRef.current;
      const prevSatId = lastServingSatelliteIdRef.current;

      currentBeamIdRef.current = beamInfo.beamId;
      currentRSRPRef.current = beamInfo.rsrp;

      // 檢測波束換手（同一顆衛星內）
      if (prevSatId === satId && prevBeamId !== null && prevBeamId !== beamInfo.beamId) {
        beamHandoversRef.current += 1;
        console.log(`📊 Beam handover #${beamHandoversRef.current}: B${prevBeamId} → B${beamInfo.beamId}`);
      }

      // 檢測衛星換手
      if (prevSatId !== null && prevSatId !== satId) {
        satelliteHandoversRef.current += 1;
        console.log(`📊 Satellite handover #${satelliteHandoversRef.current}: ${prevSatId} → ${satId}`);
      }

      lastServingSatelliteIdRef.current = satId;
      lastServingBeamIdRef.current = beamInfo.beamId;

      // 更新衛星的服務波束
      setServingBeamIds(prev => new Map(prev).set(satId, beamInfo.beamId));

      // 更新統計
      updateStats();
    }
  }, [updateStats]);

  // 載入真實軌道數據（背景用）
  useEffect(() => {
    calculator
      .loadTimeseries(ORBIT_DATA_URL)
      .then(() => {
        setIsLoaded(true);
        console.log('✅ Beam Hopping Demo 載入完成');
        console.log(`   編排衛星: ${scriptedSatelliteCount} 顆`);
        console.log(`   間隔: ${scriptedInterval} 秒`);
      })
      .catch((err) => {
        console.error('❌ 軌道數據載入失敗:', err);
        // 即使真實數據載入失敗，編排衛星仍可運作
        setIsLoaded(true);
      });
  }, [calculator, scriptedSatelliteCount, scriptedInterval]);

  // 每幀更新（使用 ref 避免不必要的 re-render）
  useFrame((_, delta) => {
    if (!isLoaded) return;

    elapsedTimeRef.current += delta * timeSpeed;
    const currentTime = elapsedTimeRef.current;

    // 循環時間（所有編排衛星完成一輪後重新開始）
    const totalCycleDuration = scriptedSatelliteCount * scriptedInterval;
    const cycleTime = currentTime % totalCycleDuration;

    // 更新背景衛星位置（這個需要 state 因為要觸發背景衛星渲染）
    const bgSatellites = calculator.getVisibleSatellites(currentTime, 1);
    setBackgroundSatellites(bgSatellites);

    // 更新編排衛星位置（存入 ref，不觸發 re-render）
    const newPositions = new Map<string, THREE.Vector3>();
    scriptedSatellites.forEach((sat) => {
      const pos = getScriptedSatellitePosition(sat, cycleTime);
      if (pos) {
        newPositions.set(sat.id, pos);
      }
    });
    scriptedPositionsRef.current = newPositions;
    setScriptedPositions(newPositions);

    // 波束覆蓋半徑
    const beamCoverageRadius = DEFAULT_BEAM_CONFIG.cellSpacing + DEFAULT_BEAM_CONFIG.coneRadiusBottom;
    // 波束激活距離（更早顯示波束）
    const beamActivationDistance = beamCoverageRadius * 2.5;

    // 使用 ref 追蹤激活衛星
    const currentActivated = activatedSatellitesRef.current;
    let activatedChanged = false;

    // 清理已消失的衛星
    currentActivated.forEach((satId) => {
      if (!newPositions.has(satId)) {
        currentActivated.delete(satId);
        activatedChanged = true;
        console.log(`🛰️ 衛星 ${satId} 已消失，波束移除`);
      }
    });

    // 檢查每顆編排衛星，更新激活狀態（只考慮會經過 UE 的衛星）
    const coveringSatellites: { id: string; groundDist: number }[] = [];

    for (const sat of scriptedSatellites) {
      // 環境衛星不顯示波束，跳過
      if (!sat.passesOverUE) continue;

      const pos = newPositions.get(sat.id);
      if (!pos) continue;

      // 計算衛星地面投影到 UE 的距離
      const groundDist = Math.sqrt(
        Math.pow(pos.x - uavPosition.x, 2) +
        Math.pow(pos.z - uavPosition.z, 2)
      );

      const isOverUE = groundDist <= beamCoverageRadius;

      // 激活條件：距離夠近就激活（更早顯示波束）
      if (groundDist < beamActivationDistance) {
        if (!currentActivated.has(sat.id)) {
          currentActivated.add(sat.id);
          activatedChanged = true;
          console.log(`🛰️ 衛星 ${sat.id} 波束激活 (距離: ${groundDist.toFixed(0)})`);
        }
      }

      // 記錄正在覆蓋 UE 的衛星（用於連線判斷）
      if (isOverUE) {
        coveringSatellites.push({ id: sat.id, groundDist });
      }
    }

    // ===== 換手邏輯：維持連接直到離開覆蓋（加入遲滯邊界） =====
    const currentServingId = servingScriptedIdRef.current;
    let newServingId: string | null = currentServingId;

    // 遲滯邊界：當前服務衛星有 20% 額外容忍距離
    const hysteresisMargin = 1.2;

    // 找到當前服務衛星的距離
    let currentServingDist = Infinity;
    if (currentServingId) {
      const pos = newPositions.get(currentServingId);
      if (pos) {
        currentServingDist = Math.sqrt(
          Math.pow(pos.x - uavPosition.x, 2) +
          Math.pow(pos.z - uavPosition.z, 2)
        );
      }
    }

    // 當前衛星是否還在覆蓋範圍（使用遲滯邊界）
    const currentStillCovering = currentServingId && currentServingDist <= beamCoverageRadius * hysteresisMargin;

    if (currentStillCovering) {
      // 當前衛星還在遲滯範圍內，維持連接（不管有沒有其他衛星更近）
      newServingId = currentServingId;
    } else if (coveringSatellites.length > 0) {
      // 當前衛星離開了，或沒有服務衛星 → 選擇最近的
      coveringSatellites.sort((a, b) => a.groundDist - b.groundDist);
      const newSat = coveringSatellites[0];
      if (newSat.id !== currentServingId) {
        console.log(`🔄 換手: ${currentServingId || '(無)'} → ${newSat.id}`);
      }
      newServingId = newSat.id;
    } else {
      // 沒有衛星覆蓋 UE
      if (currentServingId) {
        console.log(`📡 ${currentServingId} 離開覆蓋，等待下一顆衛星...`);
      }
      newServingId = null;
    }

    // 只在值真正改變時才更新 state（避免不必要的 re-render）
    if (activatedChanged) {
      setActivatedSatellites(new Set(currentActivated));
    }

    if (newServingId !== servingScriptedIdRef.current) {
      servingScriptedIdRef.current = newServingId;
      setServingScriptedId(newServingId);
    }

    // 定期更新統計數據（每幀）
    updateStats();
  });

  // 衛星模型（背景 + 編排）
  const allSatelliteModels = useMemo(() => {
    const models: { id: string; model: THREE.Group }[] = [];

    // 背景衛星模型
    if (isLoaded) {
      const bgIds = calculator.getAllSatelliteIds().slice(0, 20); // 只取前 20 顆作為背景
      bgIds.forEach((id) => {
        models.push({ id: `bg-${id}`, model: scene.clone(true) });
      });
    }

    // 編排衛星模型
    scriptedSatellites.forEach((sat) => {
      models.push({ id: sat.id, model: scene.clone(true) });
    });

    return models;
  }, [isLoaded, calculator, scene, scriptedSatellites]);

  const meshesRef = useRef<Map<string, THREE.Group>>(new Map());

  // 更新衛星模型位置
  useFrame(() => {
    meshesRef.current.forEach((mesh, modelId) => {
      // 背景衛星
      if (modelId.startsWith('bg-')) {
        const satId = modelId.replace('bg-', '');
        const pos = backgroundSatellites.get(satId);
        if (pos) {
          mesh.position.set(pos.x, pos.y, pos.z);
          mesh.visible = true;
          mesh.scale.setScalar(4);
        } else {
          mesh.visible = false;
        }
      }
      // 編排衛星
      else {
        const pos = scriptedPositionsRef.current.get(modelId);
        if (pos) {
          mesh.position.set(pos.x, pos.y, pos.z);
          mesh.visible = true;
          mesh.scale.setScalar(servingScriptedIdRef.current === modelId ? 8 : 6);
        } else {
          mesh.visible = false;
        }
      }
    });
  });

  // 狀態計算
  const isBeingServed = servingScriptedId !== null;

  const statusColor = useMemo(() => {
    return isBeingServed ? '#00ff00' : '#ff3300';
  }, [isBeingServed]);

  const statusText = useMemo(() => {
    if (isBeingServed && servingScriptedId) {
      return `Connected: ${servingScriptedId}`;
    }
    return 'Waiting for satellite...';
  }, [isBeingServed, servingScriptedId]);

  if (!isLoaded) {
    return null;
  }

  return (
    <group>
      {/* 衛星模型 */}
      {allSatelliteModels.map(({ id, model }) => (
        <group
          key={id}
          ref={(ref) => {
            if (ref) {
              meshesRef.current.set(id, ref);
            }
          }}
          scale={5}
          visible={false}
        >
          <primitive object={model} />
        </group>
      ))}

      {/* 編排衛星的波束系統（只有會經過 UE 的衛星才顯示波束） */}
      {scriptedSatellites
        .filter(sat => sat.passesOverUE)
        .map((sat) => {
          const pos = scriptedPositions.get(sat.id);
          if (!pos) return null;

          const showBeams = activatedSatellites.has(sat.id);
          const isServingUE = servingScriptedId === sat.id;
          const currentServingBeamId = servingBeamIds.get(sat.id) ?? null;

          return (
            <ScriptedSatelliteBeamSystem
              key={sat.id}
              satellite={sat}
              position={pos}
              uavPosition={uavPosition}
              showBeams={showBeams}
              isServingUE={isServingUE}
              wideBeamRadius={wideBeamRadius}
              currentServingBeamId={currentServingBeamId}
              onServingBeamChange={(beamInfo) => {
                handleServingBeamChange(sat.id, beamInfo);
              }}
            />
          );
        })}

      {/* UAV 狀態指示環 */}
      <mesh
        position={[uavPosition.x, 1, uavPosition.z]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[15, 20, 32]} />
        <meshBasicMaterial
          color={statusColor}
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 狀態文字 */}
      <Text
        position={[uavPosition.x, 55, uavPosition.z]}
        fontSize={12}
        color={statusColor}
        anchorX="center"
        anchorY="middle"
        outlineWidth={1.5}
        outlineColor="#000000"
      >
        {statusText}
      </Text>

      {/* UE 標籤 */}
      <Text
        position={[uavPosition.x, 35, uavPosition.z]}
        fontSize={10}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={1}
        outlineColor="#000000"
      >
        UE (UAV)
      </Text>
    </group>
  );
}
