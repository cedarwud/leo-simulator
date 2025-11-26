#!/usr/bin/env python3
"""
整合 orbit-engine Stage 5 訊號品質數據到前端 timeseries

功能：
1. 從 Stage 5 提取 RSRP/RSRQ/SINR 數據
2. 與 Stage 4 timeseries 數據匹配合併
3. 生成包含完整訊號品質的前端數據

輸出：satellite-timeseries-{constellation}-enhanced.json
"""

import json
import argparse
from datetime import datetime
from pathlib import Path
from collections import defaultdict

# 文件路徑
PROJECT_ROOT = Path(__file__).parent.parent
STAGE4_FILE = Path("/home/sat/satellite/orbit-engine/data/outputs/stage4/link_feasibility_output_20251103_060257.json")
STAGE5_FILE = Path("/home/sat/satellite/orbit-engine/data/outputs/stage5/stage5_signal_analysis_elite_pool_20251125_133343.json")

def load_stage5_signal_data(constellation='starlink'):
    """載入 Stage 5 訊號品質數據"""
    print(f"📂 載入 Stage 5 訊號品質數據（星座: {constellation.upper()}）...")

    with open(STAGE5_FILE, 'r') as f:
        data = json.load(f)

    # 按星座過濾
    signal_data = {}
    for sat_id, sat_data in data['signal_analysis'].items():
        if sat_data['constellation'].lower() == constellation.lower():
            signal_data[sat_id] = sat_data

    print(f"   ✓ 找到 {len(signal_data)} 顆 {constellation.upper()} 衛星的訊號數據")
    return signal_data

def load_stage4_timeseries(constellation='starlink'):
    """載入 Stage 4 時間序列數據"""
    timeseries_file = PROJECT_ROOT / f"public/data/satellite-timeseries-{constellation}.json"

    print(f"📂 載入前端 timeseries 數據...")
    with open(timeseries_file, 'r') as f:
        data = json.load(f)

    print(f"   ✓ 載入 {len(data['satellites'])} 顆衛星的時間序列")
    return data

def match_timestamps(stage4_ts, stage5_ts):
    """
    匹配兩個時間戳（允許小誤差）

    Args:
        stage4_ts: Stage 4 時間戳字符串
        stage5_ts: Stage 5 時間戳字符串

    Returns:
        bool: 是否匹配
    """
    from dateutil import parser

    try:
        t4 = parser.parse(stage4_ts)
        t5 = parser.parse(stage5_ts)

        # 允許 ±30 秒誤差
        diff = abs((t4 - t5).total_seconds())
        return diff <= 30
    except:
        return False

def integrate_signal_quality(timeseries_data, signal_data):
    """
    整合訊號品質數據到 timeseries

    Args:
        timeseries_data: 前端 timeseries 數據
        signal_data: Stage 5 訊號數據

    Returns:
        更新後的 timeseries 數據
    """
    print("\n🔗 整合訊號品質數據...")

    # 構建 Stage 5 時間戳索引
    stage5_index = {}
    for sat_id, sat_data in signal_data.items():
        stage5_index[sat_id] = {}
        for point in sat_data['time_series']:
            ts = point['timestamp']
            stage5_index[sat_id][ts] = point

    matched_count = 0
    total_points = 0

    # 遍歷每顆衛星的 timeseries
    for satellite in timeseries_data['satellites']:
        sat_id = satellite['id']

        # 檢查是否有對應的 Stage 5 數據
        if sat_id not in stage5_index:
            print(f"   ⚠️  衛星 {sat_id} 沒有 Stage 5 數據，跳過")
            continue

        # 遍歷時間點
        for point in satellite['position_timeseries']:
            total_points += 1

            # 如果不可見，設置默認值
            if not point['is_visible']:
                point['signal_quality'] = {
                    'rsrp_dbm': None,
                    'rsrq_db': None,
                    'rs_sinr_db': None
                }
                continue

            # 嘗試匹配時間戳
            stage4_ts = point['time']
            matched = False

            # 精確匹配
            if stage4_ts in stage5_index[sat_id]:
                signal_point = stage5_index[sat_id][stage4_ts]
                point['signal_quality'] = signal_point['signal_quality']
                matched_count += 1
                matched = True
            else:
                # 模糊匹配（允許 ±30 秒）
                for stage5_ts, signal_point in stage5_index[sat_id].items():
                    if match_timestamps(stage4_ts, stage5_ts):
                        point['signal_quality'] = signal_point['signal_quality']
                        matched_count += 1
                        matched = True
                        break

            if not matched:
                # 沒有匹配，設置為 None
                point['signal_quality'] = {
                    'rsrp_dbm': None,
                    'rsrq_db': None,
                    'rs_sinr_db': None
                }

    match_rate = (matched_count / total_points * 100) if total_points > 0 else 0
    print(f"   ✓ 匹配成功: {matched_count}/{total_points} 時間點 ({match_rate:.1f}%)")

    return timeseries_data

def save_enhanced_timeseries(data, constellation):
    """保存增強的 timeseries 數據"""
    output_file = PROJECT_ROOT / f"public/data/satellite-timeseries-{constellation}-enhanced.json"

    # 更新 metadata
    data['metadata']['enhanced'] = True
    data['metadata']['signal_quality_source'] = 'orbit-engine Stage 5'
    data['metadata']['signal_calculation_standard'] = '3GPP_TS_38.214'
    data['metadata']['enhanced_at'] = datetime.now().isoformat()

    print(f"\n💾 保存增強數據到: {output_file}")

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    file_size = output_file.stat().st_size / 1024 / 1024  # MB
    print(f"   ✓ 保存成功 ({file_size:.2f} MB)")

    return output_file

def main():
    parser = argparse.ArgumentParser(
        description='整合 orbit-engine Stage 5 訊號品質數據',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
範例:
  %(prog)s                    # 整合 Starlink 數據
  %(prog)s --constellation starlink
  %(prog)s --constellation oneweb
  %(prog)s --all              # 整合所有星座
        """
    )
    parser.add_argument(
        '--constellation', '-c',
        choices=['starlink', 'oneweb'],
        default='starlink',
        help='選擇星座 (預設: starlink)'
    )
    parser.add_argument(
        '--all', '-a',
        action='store_true',
        help='整合所有星座數據'
    )
    args = parser.parse_args()

    # 決定要處理的星座
    if args.all:
        constellations = ['starlink', 'oneweb']
    else:
        constellations = [args.constellation]

    # 處理每個星座
    for constellation in constellations:
        print("=" * 60)
        print(f"📡 整合 {constellation.upper()} 訊號品質數據")
        print("=" * 60)

        # 1. 載入 Stage 5 訊號數據
        signal_data = load_stage5_signal_data(constellation)

        # 2. 載入前端 timeseries 數據
        timeseries_data = load_stage4_timeseries(constellation)

        # 3. 整合訊號品質
        enhanced_data = integrate_signal_quality(timeseries_data, signal_data)

        # 4. 保存增強數據
        output_file = save_enhanced_timeseries(enhanced_data, constellation)

        print(f"\n✅ {constellation.upper()} 數據整合完成！")
        print(f"   輸出文件: {output_file}")
        print("=" * 60)
        print()

if __name__ == '__main__':
    main()
