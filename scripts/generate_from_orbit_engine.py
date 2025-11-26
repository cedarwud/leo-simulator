#!/usr/bin/env python3
"""
從 orbit-engine Stage 4 輸出生成完整軌道週期數據
提取候選池中的衛星，使用 Skyfield 生成包含可見和不可見時段的完整數據
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from skyfield.api import load, wgs84, EarthSatellite

# ==================== 配置參數 ====================

# NTPU 觀測點
OBSERVER_LAT = 24.9441667
OBSERVER_LON = 121.3713889
OBSERVER_ALT = 50  # 海拔 50 米

# 計算參數 - 使用較短的週期以快速驗證
TIME_STEP_SECONDS = 30    # 時間步長（秒）
DURATION_HOURS = 2        # 計算時長（小時）- 2小時足以觀察動態變化

# 文件路徑
PROJECT_ROOT = Path(__file__).parent.parent
ORBIT_ENGINE_STAGE4_DIR = Path("/home/sat/satellite/orbit-engine/data/outputs/stage4")
STARLINK_TLE_DIR = Path("/home/sat/satellite/tle_data/starlink/tle")
ONEWEB_TLE_DIR = Path("/home/sat/satellite/tle_data/oneweb/tle")
OUTPUT_FILE = PROJECT_ROOT / "public/data/satellite-timeseries.json"

def find_latest_orbit_engine_output():
    """自動找到 stage4 目錄中最新的輸出文件"""
    json_files = list(ORBIT_ENGINE_STAGE4_DIR.glob("link_feasibility_output_*.json"))

    if not json_files:
        raise FileNotFoundError(f"在 {ORBIT_ENGINE_STAGE4_DIR} 中找不到 orbit-engine 輸出文件")

    # 按修改時間排序，取最新的
    latest_file = max(json_files, key=lambda p: p.stat().st_mtime)
    print(f"📂 自動選擇最新的 orbit-engine 輸出: {latest_file.name}")
    return latest_file

# ==================== 讀取 orbit-engine 輸出 ====================

def load_satellite_pool(orbit_engine_file: Path):
    """從 orbit-engine Stage 4 輸出載入衛星池"""
    print(f"📂 讀取 orbit-engine 輸出: {orbit_engine_file}")

    with open(orbit_engine_file, 'r') as f:
        data = json.load(f)

    pool_data = data.get('pool_optimization', {}).get('optimized_pools', {})

    satellite_ids = {
        'starlink': [],
        'oneweb': []
    }

    # 提取 Starlink 衛星 ID
    if 'starlink' in pool_data and isinstance(pool_data['starlink'], list):
        for sat in pool_data['starlink']:
            sat_id = sat.get('satellite_id')
            if sat_id:
                satellite_ids['starlink'].append(sat_id)

    # 提取 OneWeb 衛星 ID
    if 'oneweb' in pool_data and isinstance(pool_data['oneweb'], list):
        for sat in pool_data['oneweb']:
            sat_id = sat.get('satellite_id')
            if sat_id:
                satellite_ids['oneweb'].append(sat_id)

    print(f"   ✓ Starlink 衛星: {len(satellite_ids['starlink'])} 顆")
    print(f"   ✓ OneWeb 衛星: {len(satellite_ids['oneweb'])} 顆")

    return satellite_ids

# ==================== 讀取 TLE 數據 ====================

def load_tle_for_satellites(satellite_ids: dict):
    """載入指定衛星的 TLE 數據"""
    print(f"\n📡 載入 TLE 數據...")

    tle_data = {}

    # 載入 Starlink TLE
    latest_starlink_tle = sorted(STARLINK_TLE_DIR.glob("starlink_*.tle"))[-1]
    print(f"   使用 Starlink TLE: {latest_starlink_tle.name}")

    with open(latest_starlink_tle, 'r') as f:
        lines = [line.strip() for line in f if line.strip()]

    # 解析 TLE（每3行一組）
    for i in range(0, len(lines), 3):
        if i + 2 < len(lines):
            name = lines[i]
            line1 = lines[i + 1]
            line2 = lines[i + 2]

            # 提取衛星編號
            sat_number = line1.split()[1].rstrip('U')

            if sat_number in satellite_ids['starlink']:
                tle_data[sat_number] = {
                    'name': name,
                    'line1': line1,
                    'line2': line2,
                    'constellation': 'starlink',
                    'min_elevation': 5.0  # Starlink 使用 5° 門檻
                }

    # 載入 OneWeb TLE
    if satellite_ids['oneweb']:
        latest_oneweb_tle = sorted(ONEWEB_TLE_DIR.glob("oneweb_*.tle"))[-1]
        print(f"   使用 OneWeb TLE: {latest_oneweb_tle.name}")

        with open(latest_oneweb_tle, 'r') as f:
            lines = [line.strip() for line in f if line.strip()]

        for i in range(0, len(lines), 3):
            if i + 2 < len(lines):
                name = lines[i]
                line1 = lines[i + 1]
                line2 = lines[i + 2]

                sat_number = line1.split()[1].rstrip('U')

                if sat_number in satellite_ids['oneweb']:
                    tle_data[sat_number] = {
                        'name': name,
                        'line1': line1,
                        'line2': line2,
                        'constellation': 'oneweb',
                        'min_elevation': 10.0  # OneWeb 使用 10° 門檻
                    }

    print(f"   ✓ 成功載入 {len(tle_data)} 顆衛星的 TLE 數據")
    return tle_data

# ==================== 計算衛星時間序列 ====================

def calculate_satellite_timeseries(sat_id, tle, observer_pos, ts, start_time):
    """計算單顆衛星的完整軌道週期數據"""

    # 創建 Skyfield 衛星對象
    satellite = EarthSatellite(tle['line1'], tle['line2'], tle['name'], ts)

    # 計算時間點數
    time_points = (DURATION_HOURS * 3600) // TIME_STEP_SECONDS

    # 生成時間序列
    timeseries = []
    visible_count = 0
    max_elevation = 0.0
    min_elevation = tle['min_elevation']

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
        is_visible = elevation_deg >= min_elevation

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

    return {
        'id': sat_id,
        'name': tle['name'],
        'constellation': tle['constellation'],
        'config': {
            'min_elevation_deg': min_elevation,
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
    print("📡 從 orbit-engine 生成衛星時間序列數據")
    print("=" * 60)

    # 1. 載入 orbit-engine 衛星池
    orbit_engine_file = find_latest_orbit_engine_output()
    satellite_ids = load_satellite_pool(orbit_engine_file)
    total_satellites = len(satellite_ids['starlink']) + len(satellite_ids['oneweb'])

    # 2. 載入 TLE 數據
    tle_data = load_tle_for_satellites(satellite_ids)

    # 3. 創建 Skyfield 時間尺度和觀測點
    ts = load.timescale()
    start_time = ts.now()
    observer_pos = wgs84.latlon(OBSERVER_LAT, OBSERVER_LON, elevation_m=OBSERVER_ALT)

    print(f"\n⏰ 計算時間範圍:")
    print(f"   起始時間: {start_time.utc_iso()}")
    print(f"   持續時長: {DURATION_HOURS} 小時")
    print(f"   時間步長: {TIME_STEP_SECONDS} 秒")
    print(f"   總時間點: {(DURATION_HOURS * 3600) // TIME_STEP_SECONDS}")

    print(f"\n📍 觀測點: NTPU")
    print(f"   經緯度: ({OBSERVER_LAT}, {OBSERVER_LON})")
    print(f"   海拔: {OBSERVER_ALT} m")

    # 4. 計算每顆衛星
    print(f"\n🛰️  計算衛星位置...")
    satellites_data = []
    visible_satellites_count = 0

    for sat_id, tle in tle_data.items():
        idx = len(satellites_data) + 1
        print(f"   [{idx}/{len(tle_data)}] {tle['constellation'].upper()} {sat_id}...", end=' ')

        sat_data = calculate_satellite_timeseries(sat_id, tle, observer_pos, ts, start_time)
        satellites_data.append(sat_data)

        if sat_data['statistics']['visible_points'] > 0:
            visible_satellites_count += 1
            print(f"✓ ({sat_data['statistics']['visible_percentage']:.1f}% 可見)")
        else:
            print("⚠️  (不可見)")

    # 5. 生成輸出 JSON
    output_data = {
        'metadata': {
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'generator': 'generate_from_orbit_engine.py',
            'description': 'NTPU 衛星可見性時間序列數據（基於 orbit-engine 候選池）',
            'source': 'orbit-engine Stage 4 output + Skyfield SGP4 propagation',
            'warning': '⚠️ 此數據基於 TLE epoch 時間計算，包含完整軌道週期（可見+不可見時段）'
        },
        'statistics': {
            'total_satellites': len(tle_data),
            'processed_satellites': len(satellites_data),
            'visible_satellites': visible_satellites_count,
            'starlink_count': len(satellite_ids['starlink']),
            'oneweb_count': len(satellite_ids['oneweb'])
        },
        'satellites': satellites_data
    }

    # 6. 保存到文件
    print(f"\n💾 保存數據到: {OUTPUT_FILE}")
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)

    file_size = OUTPUT_FILE.stat().st_size / 1024 / 1024  # MB
    print(f"   ✓ 保存成功 ({file_size:.2f} MB)")

    # 7. 統計摘要
    print(f"\n📊 生成摘要:")
    print(f"   總衛星數: {len(tle_data)}")
    print(f"   Starlink: {len(satellite_ids['starlink'])}")
    print(f"   OneWeb: {len(satellite_ids['oneweb'])}")
    print(f"   可見衛星: {visible_satellites_count}")
    print(f"   數據點數: {len(satellites_data) * ((DURATION_HOURS * 3600) // TIME_STEP_SECONDS)}")

    print("\n✅ 完成！")
    print("=" * 60)

if __name__ == '__main__':
    main()
