import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HandoverState } from '@/types/handover';

interface EnhancedSatelliteLinksProps {
  visibleSatellites: Map<string, THREE.Vector3>;
  uavPosition: THREE.Vector3;
  handoverState: HandoverState;
}

/**
 * 增強版衛星連線組件
 *
 * 視覺效果：
 * 1. stable - 主連線（綠色實線，粗線條）
 * 2. preparing - 顯示多個候選（淡藍色虛線，細線條）
 * 3. selecting - 高亮目標（藍色虛線，中等線條）
 * 4. establishing - 目標增強（藍色實線，線條變粗）
 * 5. switching - 交叉淡入淡出（綠→灰，藍→綠）
 * 6. completing - 完成（新連線變綠）
 */
export function EnhancedSatelliteLinks({
  visibleSatellites,
  uavPosition,
  handoverState
}: EnhancedSatelliteLinksProps) {
  // 動畫時間追蹤（用於脈衝效果）
  const animationTimeRef = React.useRef(0);

  useFrame((state, delta) => {
    animationTimeRef.current += delta;
  });

  // 主連線（當前衛星）
  const currentLink = useMemo(() => {
    if (!handoverState.currentSatelliteId) return null;

    const satellitePos = visibleSatellites.get(handoverState.currentSatelliteId);
    if (!satellitePos) return null;

    const points = [
      [uavPosition.x, uavPosition.y, uavPosition.z],
      [satellitePos.x, satellitePos.y, satellitePos.z]
    ];

    // 根據階段調整視覺效果
    let color = '#00ff88';
    let lineWidth = 3;
    let opacity = handoverState.signalStrength.current;

    switch (handoverState.phase) {
      case 'stable':
        color = '#00ff88';  // 青綠色
        lineWidth = 3;
        opacity = 1.0;
        break;
      case 'preparing':
        // 準備階段：從綠色漸變到橙色，訊號開始減弱
        const preparingProgress = handoverState.progress;
        color = blendColors('#00ff88', '#ffaa00', preparingProgress);
        lineWidth = 3 - preparingProgress * 0.5;  // 3.0 → 2.5
        opacity = handoverState.signalStrength.current;
        break;
      case 'establishing':
        // 建立階段：繼續減弱變灰
        color = '#cc8800';  // 深橙色
        lineWidth = 2.5 - handoverState.progress * 0.5;
        opacity = handoverState.signalStrength.current;
        break;
      case 'switching':
        // 切換階段：快速衰減變灰
        color = '#888888';  // 灰色
        lineWidth = 2 - handoverState.progress * 0.5;
        opacity = handoverState.signalStrength.current;
        break;
    }

    return { points, color, lineWidth, opacity, dashed: false };
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
      const totalCandidates = handoverState.candidateSatelliteIds.length;

      // 顏色：從亮藍色漸變到深藍色（排名越高越亮）
      const blueIntensity = 255 - (index * 30);
      const greenIntensity = 136 - (index * 20);
      const color = `#${blueIntensity.toString(16).padStart(2, '0')}${greenIntensity.toString(16).padStart(2, '0')}ff`;

      // 根據階段調整視覺效果
      let baseOpacity = 0.7 - (index * 0.08);
      let lineWidth = 2.5 - (index * 0.3);

      if (handoverState.phase === 'preparing') {
        // 準備階段：所有候選逐漸顯現
        const progressBonus = handoverState.progress * 0.2;
        baseOpacity = baseOpacity + progressBonus;
      } else if (handoverState.phase === 'selecting') {
        // 選擇階段：非目標候選逐漸淡出
        const isTarget = satelliteId === handoverState.targetSatelliteId;
        if (!isTarget) {
          baseOpacity = baseOpacity * (1 - handoverState.progress * 0.8);  // 淡出到20%
          lineWidth = lineWidth * (1 - handoverState.progress * 0.5);      // 變細
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
        opacity: Math.max(0.1, baseOpacity),
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

    let color = '#0088ff';  // 藍色
    let lineWidth = 2;
    let opacity = handoverState.signalStrength.target;
    let dashed = false;

    // 脈衝效果（用於 selecting 和 establishing 階段）- 降低頻率以配合更長的換手時間
    const pulseFrequency = 0.6; // Hz（原2Hz太快，改為0.6Hz，更緩慢的呼吸感）
    const pulseAmount = Math.sin(animationTimeRef.current * pulseFrequency * Math.PI * 2) * 0.5 + 0.5;

    switch (handoverState.phase) {
      case 'selecting':
        // 選擇階段：強烈的脈衝動畫突顯被選中的目標
        color = '#00aaff';  // 亮藍色
        lineWidth = 2.5 + pulseAmount * 1.5;  // 2.5-4.0 脈衝變化
        opacity = 0.6 + pulseAmount * 0.4;    // 0.6-1.0 脈衝變化
        dashed = true;
        break;
      case 'establishing':
        // 建立階段：線條逐漸變粗變實，脈衝減弱
        color = '#0088ff';
        const establishProgress = handoverState.progress;
        lineWidth = 2.5 + establishProgress * 1.5 + pulseAmount * 0.5;
        opacity = 0.5 + establishProgress * 0.4;
        dashed = false;
        break;
      case 'switching':
        // 切換階段：平滑的顏色和寬度過渡
        const switchProgress = handoverState.progress;
        // 從藍色漸變到綠色
        color = blendColors('#0088ff', '#00ff88', switchProgress);
        // 線條持續增粗
        lineWidth = 3 + switchProgress * 1;
        opacity = 0.8 + switchProgress * 0.2;
        dashed = false;
        break;
      case 'completing':
        // 完成階段：穩定的綠色連線
        color = '#00ff88';
        lineWidth = 4 - handoverState.progress * 0.5;  // 4.0 → 3.5 輕微收縮到穩定
        opacity = 0.9 + handoverState.progress * 0.1;
        dashed = false;
        break;
    }

    return { points, color, lineWidth, opacity, dashed };
  }, [handoverState, visibleSatellites, uavPosition]);

  return (
    <>
      {/* 當前連線 */}
      {currentLink && (() => {
        let animatedOpacity = currentLink.opacity;
        let animatedLineWidth = currentLink.lineWidth;

        // 準備階段：加入緩慢閃爍警告效果
        if (handoverState.phase === 'preparing') {
          const warningFlicker = Math.sin(animationTimeRef.current * 0.8 * Math.PI * 2) * 0.5 + 0.5;
          animatedOpacity = currentLink.opacity * (0.6 + warningFlicker * 0.4);
          animatedLineWidth = currentLink.lineWidth * (0.85 + warningFlicker * 0.15);
        }
        // 建立和切換階段：加入緩慢衰減抖動
        else if (['establishing', 'switching'].includes(handoverState.phase)) {
          const fadeFlicker = Math.sin(animationTimeRef.current * 1.0 * Math.PI * 2) * 0.5 + 0.5;
          animatedOpacity = currentLink.opacity * (0.8 + fadeFlicker * 0.2);
        }

        return (
          <Line
            key="current-link"
            points={currentLink.points}
            color={currentLink.color}
            lineWidth={animatedLineWidth}
            dashed={currentLink.dashed}
            dashSize={currentLink.dashed ? 10 : undefined}
            gapSize={currentLink.dashed ? 5 : undefined}
            transparent
            opacity={animatedOpacity}
          />
        );
      })()}

      {/* 候選連線（preparing 階段）- 顯示排名和動態效果 */}
      {candidateLinks.map((link) => {
        if (!link) return null;

        // 候選衛星的閃爍效果（排名越高閃爍越快）- 降低頻率配合更長的準備時間
        const flickerFreq = 0.3 + (6 - link.rank) * 0.08;  // 第1名: 0.7Hz, 第6名: 0.3Hz
        const flicker = Math.sin(animationTimeRef.current * flickerFreq * Math.PI * 2) * 0.5 + 0.5;
        const animatedOpacity = link.opacity * (0.7 + flicker * 0.3);

        return (
          <Line
            key={`candidate-${link.id}`}
            points={link.points}
            color={link.color}
            lineWidth={link.lineWidth}
            dashed={link.dashed}
            dashSize={10 - link.rank}  // 排名越高虛線越長
            gapSize={4 + link.rank * 0.5}  // 排名越低間隙越大
            transparent
            opacity={animatedOpacity}
          />
        );
      })}

      {/* 目標連線 */}
      {targetLink && (
        <Line
          key="target-link"
          points={targetLink.points}
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

/**
 * 混合兩個顏色
 */
function blendColors(color1: string, color2: string, ratio: number): string {
  const c1 = parseInt(color1.substring(1), 16);
  const c2 = parseInt(color2.substring(1), 16);

  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;

  const r2 = (c2 >> 16) & 0xff;
  const g2 = (c2 >> 8) & 0xff;
  const b2 = c2 & 0xff;

  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
