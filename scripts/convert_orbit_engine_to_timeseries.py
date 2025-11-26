#!/usr/bin/env python3
"""
從 orbit-engine Stage 4 輸出轉換為前端時間序列格式

轉換邏輯：
1. orbit-engine: 按衛星組織（星座候選池，每顆有可見時段的 time_series）
2. 前端需求: 完整軌道週期（時間點，每個點標記可見/不可見）

支援星座：
- starlink: 98顆，目標 10-15 顆可見
- oneweb: 26顆，目標 3-6 顆可見
"""

import json
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict

# 文件路徑
PROJECT_ROOT = Path(__file__).parent.parent
ORBIT_ENGINE_STAGE4_DIR = Path("/home/sat/satellite/orbit-engine/data/outputs/stage4")

def find_latest_orbit_engine_output():
    """自動找到 stage4 目錄中最新的輸出文件"""
    json_files = list(ORBIT_ENGINE_STAGE4_DIR.glob("link_feasibility_output_*.json"))

    if not json_files:
        raise FileNotFoundError(f"在 {ORBIT_ENGINE_STAGE4_DIR} 中找不到 orbit-engine 輸出文件")

    # 按修改時間排序，取最新的
    latest_file = max(json_files, key=lambda p: p.stat().st_mtime)
    print(f"📂 自動選擇最新的 orbit-engine 輸出: {latest_file.name}")
    return latest_file

def load_orbit_engine_data(constellation='starlink'):
    """載入 orbit-engine Stage 4 輸出

    Args:
        constellation: 'starlink' 或 'oneweb'
    """
    print(f"📂 載入 orbit-engine Stage 4 輸出（星座: {constellation.upper()}）...")
    orbit_engine_file = find_latest_orbit_engine_output()
    with open(orbit_engine_file, 'r') as f:
        data = json.load(f)

    # 提取指定星座優化池
    satellite_pool = data['pool_optimization']['optimized_pools'][constellation]
    print(f"   ✓ {constellation.upper()} 候選池: {len(satellite_pool)} 顆衛星")

    # 提取統計信息
    stats = data['pool_optimization']['optimization_metrics'][constellation]['coverage_statistics']
    print(f"   ✓ 時間點數: {stats['total_time_points']}")
    print(f"   ✓ 平均可見: {stats['avg_visible']:.1f} 顆")
    print(f"   ✓ 範圍: {stats['min_visible']}-{stats['max_visible']} 顆")

    return satellite_pool, stats, constellation

def build_time_index(satellite_pool):
    """
    從按衛星組織的數據構建完整時間軸索引

    返回：
    - time_points: 有序的時間點列表
    - visibility_index: {timestamp: {sat_id: visibility_data}}
    """
    print("\n🔨 構建時間軸索引...")

    # 收集所有時間戳
    all_timestamps = set()
    for satellite in satellite_pool:
        for point in satellite['time_series']:
            all_timestamps.add(point['timestamp'])

    # 排序時間點
    time_points = sorted(all_timestamps)
    print(f"   ✓ 找到 {len(time_points)} 個獨立時間點")

    # 構建可見性索引: {timestamp: {sat_id: data}}
    visibility_index = defaultdict(dict)

    for satellite in satellite_pool:
        sat_id = satellite['satellite_id']
        for point in satellite['time_series']:
            timestamp = point['timestamp']
            visibility_index[timestamp][sat_id] = {
                'elevation_deg': point['visibility_metrics']['elevation_deg'],
                'azimuth_deg': point['visibility_metrics']['azimuth_deg'],
                'distance_km': point['visibility_metrics']['distance_km'],
                'is_visible': point['visibility_metrics']['is_connectable'] == 'True'
            }

    return time_points, visibility_index

def generate_full_orbit_timeseries(starlink_pool, time_points, visibility_index):
    """
    生成每顆衛星的完整軌道週期時間序列

    完整週期 = 可見時段 + 不可見時段（填充）
    """
    print("\n🛰️  生成完整軌道週期數據...")

    satellites_data = []

    # 計算時間步長（秒）
    if len(time_points) >= 2:
        t1 = datetime.fromisoformat(time_points[0].replace('+00:00', ''))
        t2 = datetime.fromisoformat(time_points[1].replace('+00:00', ''))
        time_step_seconds = int((t2 - t1).total_seconds())
    else:
        time_step_seconds = 30

    print(f"   時間步長: {time_step_seconds} 秒")
    print(f"   軌道週期: {len(time_points)} 個時間點 ({len(time_points) * time_step_seconds / 60:.1f} 分鐘)")

    # 為每顆衛星生成完整時間序列
    for sat_idx, satellite in enumerate(starlink_pool, 1):
        sat_id = satellite['satellite_id']

        position_timeseries = []
        visible_count = 0
        max_elevation = 0.0

        for time_idx, timestamp in enumerate(time_points):
            # 計算時間偏移（秒）
            time_offset_seconds = time_idx * time_step_seconds

            # 檢查這顆衛星在這個時間點是否可見
            if sat_id in visibility_index[timestamp]:
                # 可見：使用實際數據
                vis_data = visibility_index[timestamp][sat_id]
                is_visible = True
                visible_count += 1
                max_elevation = max(max_elevation, vis_data['elevation_deg'])

                position_timeseries.append({
                    'time': timestamp,
                    'time_offset_seconds': time_offset_seconds,
                    'elevation_deg': round(vis_data['elevation_deg'], 2),
                    'azimuth_deg': round(vis_data['azimuth_deg'], 2),
                    'range_km': round(vis_data['distance_km'], 2),
                    'is_visible': True
                })
            else:
                # 不可見：填充默認值
                position_timeseries.append({
                    'time': timestamp,
                    'time_offset_seconds': time_offset_seconds,
                    'elevation_deg': -90.0,  # 地平線以下
                    'azimuth_deg': 0.0,
                    'range_km': 9999.0,  # 遠距離
                    'is_visible': False
                })

        # 計算可見百分比
        visible_percentage = (visible_count / len(time_points) * 100) if len(time_points) > 0 else 0

        satellites_data.append({
            'id': sat_id,
            'name': satellite['name'],
            'constellation': 'starlink',
            'config': {
                'min_elevation_deg': 5.0,
                'time_step_seconds': time_step_seconds,
                'time_points': len(time_points)
            },
            'statistics': {
                'visible_points': visible_count,
                'visible_percentage': round(visible_percentage, 2),
                'max_elevation': round(max_elevation, 2)
            },
            'position_timeseries': position_timeseries
        })

        if sat_idx % 10 == 0:
            print(f"   [{sat_idx}/{len(starlink_pool)}] 處理中...")

    print(f"   ✓ 完成 {len(satellites_data)} 顆衛星")

    return satellites_data, time_step_seconds, len(time_points)

def verify_coverage(satellites_data, time_step_seconds):
    """驗證覆蓋率是否符合 10-15 顆目標"""
    print("\n📊 驗證覆蓋率...")

    if not satellites_data:
        print("   ❌ 無衛星數據")
        return

    total_time_points = satellites_data[0]['config']['time_points']
    visible_counts = []

    for time_idx in range(total_time_points):
        count = sum(1 for sat in satellites_data
                   if sat['position_timeseries'][time_idx]['is_visible'])
        visible_counts.append(count)

    avg_visible = sum(visible_counts) / len(visible_counts)
    min_visible = min(visible_counts)
    max_visible = max(visible_counts)

    # 計算滿足 10-15 顆目標的時間點比例
    target_met = sum(1 for c in visible_counts if 10 <= c <= 15)
    target_met_rate = target_met / total_time_points

    print(f"   平均可見: {avg_visible:.1f} 顆")
    print(f"   範圍: {min_visible}-{max_visible} 顆")
    print(f"   目標達成率: {target_met_rate*100:.1f}% ({target_met}/{total_time_points} 時間點)")

    if 10 <= avg_visible <= 15 and target_met_rate >= 0.95:
        print("   ✅ 符合目標（10-15 顆，95%+ 覆蓋率）")
    else:
        print("   ⚠️  未完全達標")

    return {
        'avg_visible': avg_visible,
        'min_visible': min_visible,
        'max_visible': max_visible,
        'target_met_rate': target_met_rate
    }

def main():
    # 解析命令行參數
    parser = argparse.ArgumentParser(
        description='轉換 orbit-engine 數據為前端時間序列格式',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
範例:
  %(prog)s                    # 生成 Starlink 數據
  %(prog)s --constellation starlink
  %(prog)s --constellation oneweb
  %(prog)s --all              # 生成所有星座數據
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
        help='生成所有星座數據'
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
        print(f"📡 轉換 orbit-engine 數據為前端時間序列格式 ({constellation.upper()})")
        print("=" * 60)

        # 1. 載入數據
        satellite_pool, orbit_stats, const_name = load_orbit_engine_data(constellation)

        # 2. 構建時間軸索引
        time_points, visibility_index = build_time_index(satellite_pool)

        # 3. 生成完整軌道週期數據
        satellites_data, time_step_seconds, total_time_points = generate_full_orbit_timeseries(
            satellite_pool, time_points, visibility_index
        )

        # 4. 驗證覆蓋率
        coverage_stats = verify_coverage(satellites_data, time_step_seconds)

        # 5. 生成輸出 JSON
        output_data = {
            'metadata': {
                'generated_at': datetime.now().isoformat(),
                'generator': 'convert_orbit_engine_to_timeseries.py',
                'description': f'NTPU {const_name.upper()} 衛星完整軌道週期數據（基於 orbit-engine Stage 4）',
                'source': 'orbit-engine Stage 4 pool_optimization',
                'constellation': const_name,
                'orbit_period_minutes': total_time_points * time_step_seconds / 60,
                'warning': '⚠️ 此數據包含完整軌道週期（可見+不可見時段），前端循環播放此週期'
            },
            'statistics': {
                'total_satellites': len(satellites_data),
                'constellation': const_name,
                'time_points': total_time_points,
                'time_step_seconds': time_step_seconds,
                'orbit_period_minutes': total_time_points * time_step_seconds / 60,
                'avg_visible_satellites': coverage_stats['avg_visible'],
                'visible_range': [coverage_stats['min_visible'], coverage_stats['max_visible']],
                'target_met_rate': coverage_stats['target_met_rate']
            },
            'satellites': satellites_data
        }

        # 6. 保存到文件
        output_file = PROJECT_ROOT / f"public/data/satellite-timeseries-{const_name}.json"
        print(f"\n💾 保存數據到: {output_file}")
        output_file.parent.mkdir(parents=True, exist_ok=True)

        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)

        file_size = output_file.stat().st_size / 1024 / 1024  # MB
        print(f"   ✓ 保存成功 ({file_size:.2f} MB)")

        # 7. 最終摘要
        print(f"\n✅ 轉換完成！")
        print(f"   星座: {const_name.upper()}")
        print(f"   衛星數量: {len(satellites_data)} 顆")
        print(f"   軌道週期: {total_time_points * time_step_seconds / 60:.1f} 分鐘 ({total_time_points} 個時間點)")
        print(f"   平均可見: {coverage_stats['avg_visible']:.1f} 顆 (範圍 {coverage_stats['min_visible']}-{coverage_stats['max_visible']})")
        print("=" * 60)
        print()

if __name__ == '__main__':
    main()
