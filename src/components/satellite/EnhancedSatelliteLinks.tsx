import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { HandoverState } from '@/types/handover';

interface EnhancedSatelliteLinksProps {
  visibleSatellites: Map<string, THREE.Vector3>;
  uavPosition: THREE.Vector3;
  handoverState: HandoverState;
}

const CURRENT_COLOR = '#0088ff';
const TARGET_COLOR = '#00ff88';
const CANDIDATE_COLOR = '#5c6475';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * 增強版衛星連線組件
 *
 * 視覺效果：
 * - 僅使用三種顏色來對應角色：
 *   1) 當前服務衛星：綠色實線
 *   2) 換手目標衛星：藍色實線
 *   3) 其他候選衛星：灰色虛線
 * - 強度用亮暗（opacity）與線寬表達；不再使用多段漸層。
 */
export function EnhancedSatelliteLinks({
  visibleSatellites,
  uavPosition,
  handoverState
}: EnhancedSatelliteLinksProps) {
  // 主連線（當前衛星）
  const currentLink = useMemo(() => {
    if (!handoverState.currentSatelliteId) return null;

    const satellitePos = visibleSatellites.get(handoverState.currentSatelliteId);
    if (!satellitePos) return null;

    const points = [
      [uavPosition.x, uavPosition.y, uavPosition.z],
      [satellitePos.x, satellitePos.y, satellitePos.z]
    ];

    let color = CURRENT_COLOR;
    let lineWidth = 3.2;
    let opacity = clamp(0.35 + handoverState.signalStrength.current * 0.65, 0.25, 1);
    let dashed = false;

    switch (handoverState.phase) {
      case 'stable':
        opacity = clamp(opacity, 0.75, 1);
        break;
      case 'preparing':
      case 'selecting':
        opacity = clamp(opacity * 0.9, 0.5, 0.85);
        break;
      case 'establishing':
        lineWidth = 3 - handoverState.progress * 0.6;
        opacity = clamp(opacity * 0.75, 0.4, 0.8);
        break;
      case 'switching':
        lineWidth = 2.5 - handoverState.progress * 0.5;
        opacity = clamp(opacity * 0.55, 0.3, 0.7);
        break;
    }

    return { points, color, lineWidth, opacity, dashed };
  }, [handoverState, visibleSatellites, uavPosition]);

  // 候選連線（準備/選擇階段）- 增強視覺差異化
  const candidateLinks = useMemo(() => {
    if (!['preparing', 'selecting'].includes(handoverState.phase) ||
        handoverState.candidateSatelliteIds.length === 0) {
      return [];
    }

    return handoverState.candidateSatelliteIds.map((satelliteId, index) => {
      const satellitePos = visibleSatellites.get(satelliteId);
      if (!satellitePos) return null;

      const points = [
        [uavPosition.x, uavPosition.y, uavPosition.z],
        [satellitePos.x, satellitePos.y, satellitePos.z]
      ];

      // 根據排名給予不同的視覺效果
      const rank = index + 1;
      const isTarget = satelliteId === handoverState.targetSatelliteId;

      const color = CANDIDATE_COLOR;

      // 灰色虛線，亮暗和線寬表達排名
      let opacity = clamp(0.42 - (index * 0.06), 0.18, 0.5);
      let lineWidth = Math.max(1, 1.8 - (index * 0.15));

      if (handoverState.phase === 'preparing') {
        opacity = clamp(opacity + handoverState.progress * 0.2, 0.2, 0.65);
      } else if (handoverState.phase === 'selecting') {
        if (!isTarget) {
          opacity = clamp(opacity * (0.6 - handoverState.progress * 0.2), 0.12, 0.4);
          lineWidth = Math.max(0.9, lineWidth * 0.9);
        } else {
          // 目標候選在這裡不顯示（由 targetLink 處理）
          return null;
        }
      }

      return {
        id: satelliteId,
        rank,
        points,
        color,
        lineWidth: Math.max(0.8, lineWidth),
        opacity: Math.max(0.1, opacity),
        dashed: true
      };
    }).filter(Boolean);
  }, [handoverState, visibleSatellites, uavPosition]);

  // 目標連線（選擇/建立/切換階段）- 增強動畫效果
  const targetLink = useMemo(() => {
    if (!handoverState.targetSatelliteId) return null;
    if (!['selecting', 'establishing', 'switching', 'completing'].includes(handoverState.phase)) {
      return null;
    }

    const satellitePos = visibleSatellites.get(handoverState.targetSatelliteId);
    if (!satellitePos) return null;

    const points = [
      [uavPosition.x, uavPosition.y, uavPosition.z],
      [satellitePos.x, satellitePos.y, satellitePos.z]
    ];

    let color = TARGET_COLOR;
    let lineWidth = 2.8;
    let opacity = clamp(0.35 + handoverState.signalStrength.target * 0.6, 0.35, 0.95);
    let dashed = false;

    switch (handoverState.phase) {
      case 'selecting':
        opacity = clamp(opacity * 0.85, 0.45, 0.85);
        dashed = true; // selecting remains dashed
        break;
      case 'establishing':
        const establishProgress = handoverState.progress;
        lineWidth = 2.8 + establishProgress * 0.8;
        opacity = clamp(0.5 + establishProgress * 0.4, 0.5, 0.9);
        break;
      case 'switching':
        const switchProgress = handoverState.progress;
        lineWidth = 3 + switchProgress * 0.7;
        opacity = clamp(0.7 + switchProgress * 0.25, 0.7, 1);
        break;
      case 'completing':
        lineWidth = 3.2;
        opacity = 0.95;
        break;
    }

    return { points, color, lineWidth, opacity, dashed };
  }, [handoverState, visibleSatellites, uavPosition]);

  return (
    <>
      {/* 當前連線 */}
      {currentLink && (
        <Line
          key="current-link"
          points={currentLink.points as any}
          color={currentLink.color}
          lineWidth={currentLink.lineWidth}
          dashed={currentLink.dashed}
          dashSize={currentLink.dashed ? 10 : undefined}
          gapSize={currentLink.dashed ? 5 : undefined}
          transparent
          opacity={currentLink.opacity}
        />
      )}

      {/* 候選連線（preparing/selecting 階段） */}
      {candidateLinks.map((link) => {
        if (!link) return null;

        return (
          <Line
            key={`candidate-${link.id}`}
            points={link.points as any}
            color={link.color}
            lineWidth={link.lineWidth}
            dashed={link.dashed}
            dashSize={10 - link.rank}  // 排名越高虛線越長
            gapSize={4 + link.rank * 0.5}  // 排名越低間隙越大
            transparent
            opacity={link.opacity}
          />
        );
      })}

      {/* 目標連線 */}
      {targetLink && (
        <Line
          key="target-link"
          points={targetLink.points as any}
          color={targetLink.color}
          lineWidth={targetLink.lineWidth}
          dashed={targetLink.dashed}
          dashSize={targetLink.dashed ? 10 : undefined}
          gapSize={targetLink.dashed ? 5 : undefined}
          transparent
          opacity={targetLink.opacity}
        />
      )}
    </>
  );
}
