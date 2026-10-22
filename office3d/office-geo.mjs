const OFFICE_GEO_DATA = {
  name: '智序工场',
  address: '13b Ke Nou St. (9), Phnom Penh',
  lat: 11.5536458,
  lon: 104.9318027,
  tz: 'Asia/Phnom_Penh',
  note: '董事会 2026-10-21 指定的现实定位（示意用，非测绘精度）',
}

export const OFFICE_GEO = Object.freeze(OFFICE_GEO_DATA)

export const DR_CAMPUS_GEO = Object.freeze({
  name: 'DR 仓配服务中心',
  lat: 11.5337037,
  lon: 104.9725248,
  tz: 'Asia/Phnom_Penh',
  note: '董事会 2026-10-22 确认的现实定位',
})

export function coarsenGeo(lat, lon) {
  return {
    lat: Math.round(Number(lat) * 100) / 100,
    lon: Math.round(Number(lon) * 100) / 100,
  }
}
