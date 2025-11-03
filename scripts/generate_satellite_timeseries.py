#!/usr/bin/env python3
"""
生成衛星可見性時間序列數據
使用 Skyfield 計算 NTPU 觀測點的衛星位置
"""

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from skyfield.api import load, wgs84, EarthSatellite
from skyfield.toposlib import GeographicPosition

# ==================== 配置參數 ====================

# NTPU 觀測點
OBSERVER_LAT = 24.9441667
OBSERVER_LON = 121.3713889
OBSERVER_ALT = 50  # 海拔 50 米

# 計算參數
MIN_ELEVATION_DEG = 0.0   # 最小仰角（設為0以顯示所有衛星）
TIME_STEP_SECONDS = 30    # 時間步長（秒）
DURATION_HOURS = 24       # 計算時長（小時）

# 文件路徑
PROJECT_ROOT = Path(__file__).parent.parent
TLE_FILE = PROJECT_ROOT / "public/data/tle-data.txt"
OUTPUT_FILE = PROJECT_ROOT / "public/data/satellite-timeseries.json"

# ==================== 讀取 TLE 數據 ====================

def read_tle_data(tle_file: Path):
    """讀取 TLE 文件，返回衛星列表"""
    satellites = []

    with open(tle_file, 'r') as f:
        lines = [line.strip() for line in f if line.strip()]

    # TLE 格式：每3行為一組（名稱、第1行、第2行）
    for i in range(0, len(lines), 3):
        if i + 2 < len(lines):
            name = lines[i]
            line1 = lines[i + 1]
            line2 = lines[i + 2]
            satellites.append({
                'name': name,
                'line1': line1,
                'line2': line2
            })

    return satellites

# ==================== 計算衛星位置 ====================

def calculate_satellite_timeseries(tle_data, observer_pos, ts, start_time):
    """計算單顆衛星的時間序列數據"""

    # 創建 Skyfield 衛星對象
    satellite = EarthSatellite(tle_data['line1'], tle_data['line2'], tle_data['name'], ts)

    # 計算時間點數
    time_points = (DURATION_HOURS * 3600) // TIME_STEP_SECONDS

    # 生成時間序列
    timeseries = []
    visible_count = 0
    max_elevation = 0.0

    for i in range(time_points):
        # 計算當前時間
        offset_seconds = i * TIME_STEP_SECONDS
        current_time = ts.ut1_jd(start_time.ut1 + offset_seconds / 86400.0)

        # 計算衛星相對於觀測點的位置
        difference = satellite - observer_pos
        topocentric = difference.at(current_time)

        # 計算仰角、方位角、距離
        alt, az, distance = topocentric.altaz()

        elevation_deg = alt.degrees
        azimuth_deg = az.degrees
        range_km = distance.km
        is_visible = elevation_deg >= MIN_ELEVATION_DEG

        # 統計
        if is_visible:
            visible_count += 1
            max_elevation = max(max_elevation, elevation_deg)

        # 添加數據點（確保所有值都是 Python 原生類型）
        timeseries.append({
            'time': current_time.utc_iso(),
            'time_offset_seconds': int(offset_seconds),
            'elevation_deg': float(round(elevation_deg, 2)),
            'azimuth_deg': float(round(azimuth_deg, 2)),
            'range_km': float(round(range_km, 2)),
            'is_visible': bool(is_visible)
        })

    # 計算可見百分比
    visible_percentage = (visible_count / time_points * 100) if time_points > 0 else 0

    # 提取衛星 ID（從 TLE line1）
    sat_number = tle_data['line1'].split()[1].rstrip('U')
    sat_id = f"sat-{sat_number}"

    # TLE epoch
    tle_epoch = satellite.epoch.utc_iso()

    # 計算 TLE 年齡
    epoch_date = satellite.epoch.utc_datetime()
    start_date = start_time.utc_datetime()
    tle_age_days = (start_date - epoch_date).total_seconds() / 86400.0

    return {
        'id': sat_id,
        'name': tle_data['name'],
        'tle_epoch': tle_epoch,
        'tle_age_days': round(tle_age_days, 2),
        'observer': {
            'name': 'National Taipei University',
            'latitude': OBSERVER_LAT,
            'longitude': OBSERVER_LON,
            'altitude_m': OBSERVER_ALT
        },
        'config': {
            'min_elevation_deg': MIN_ELEVATION_DEG,
            'time_step_seconds': TIME_STEP_SECONDS,
            'time_points': time_points
        },
        'statistics': {
            'visible_points': visible_count,
            'visible_percentage': round(visible_percentage, 2),
            'max_elevation': round(max_elevation, 2)
        },
        'position_timeseries': timeseries
    }

# ==================== 主程序 ====================

def main():
    print("=" * 60)
    print("📡 衛星時間序列數據生成器")
    print("=" * 60)

    # 載入 TLE 數據
    print(f"\n📂 讀取 TLE 數據: {TLE_FILE}")
    tle_satellites = read_tle_data(TLE_FILE)
    print(f"   ✓ 成功讀取 {len(tle_satellites)} 顆衛星")

    # 創建 Skyfield 時間尺度
    ts = load.timescale()

    # 使用 TLE epoch 時間作為起始時間
    # 這樣可以避免時間基準錯誤
    start_time = ts.now()

    print(f"\n⏰ 計算時間範圍:")
    print(f"   起始時間: {start_time.utc_iso()}")
    print(f"   持續時長: {DURATION_HOURS} 小時")
    print(f"   時間步長: {TIME_STEP_SECONDS} 秒")

    # 創建觀測點
    observer_pos = wgs84.latlon(OBSERVER_LAT, OBSERVER_LON, elevation_m=OBSERVER_ALT)
    print(f"\n📍 觀測點: NTPU")
    print(f"   經緯度: ({OBSERVER_LAT}, {OBSERVER_LON})")
    print(f"   海拔: {OBSERVER_ALT} m")
    print(f"   最小仰角: {MIN_ELEVATION_DEG}°")

    # 計算每顆衛星
    print(f"\n🛰️  計算衛星位置...")
    satellites_data = []
    visible_satellites = 0

    for idx, tle in enumerate(tle_satellites, 1):
        print(f"   [{idx}/{len(tle_satellites)}] {tle['name']}...", end=' ')

        sat_data = calculate_satellite_timeseries(tle, observer_pos, ts, start_time)
        satellites_data.append(sat_data)

        if sat_data['statistics']['visible_points'] > 0:
            visible_satellites += 1
            print(f"✓ ({sat_data['statistics']['visible_percentage']:.1f}% 可見)")
        else:
            print("⚠️  (不可見)")

    # 生成輸出 JSON
    output_data = {
        'metadata': {
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'generator': 'generate-satellite-timeseries.py',
            'description': 'NTPU 衛星可見性時間序列數據',
            'warning': '⚠️ 此數據基於 TLE epoch 時間計算，請勿使用當前時間進行實時計算',
            'observer': {
                'name': 'National Taipei University',
                'latitude': OBSERVER_LAT,
                'longitude': OBSERVER_LON,
                'altitude': OBSERVER_ALT
            }
        },
        'statistics': {
            'total_satellites': len(tle_satellites),
            'processed_satellites': len(satellites_data),
            'visible_satellites': visible_satellites
        },
        'satellites': satellites_data
    }

    # 保存到文件
    print(f"\n💾 保存數據到: {OUTPUT_FILE}")
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)

    file_size = OUTPUT_FILE.stat().st_size / 1024  # KB
    print(f"   ✓ 保存成功 ({file_size:.1f} KB)")

    # 統計摘要
    print(f"\n📊 生成摘要:")
    print(f"   總衛星數: {len(tle_satellites)}")
    print(f"   可見衛星: {visible_satellites}")
    print(f"   數據點數: {len(tle_satellites) * ((DURATION_HOURS * 3600) // TIME_STEP_SECONDS)}")

    print("\n✅ 完成！")
    print("=" * 60)

if __name__ == '__main__':
    main()
