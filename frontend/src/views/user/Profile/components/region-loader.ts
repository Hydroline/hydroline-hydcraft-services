/*
 Lazy loader for China administrative divisions using `china-division`.
 - Loads only when country === 'CN'
 - Transforms into the same shapes used by RegionSelector:
   provinces: string[]
   citiesMap: Record<string, string[]>
   districtsMap: Record<string, string[]>
   municipalities: string[] (including HK/MO)
*/
export type LoadedRegionData = {
  provinces: string[]
  citiesMap: Record<string, string[]>
  districtsMap: Record<string, string[]>
  municipalities: string[]
}

let cached: LoadedRegionData | null = null
let loading: Promise<LoadedRegionData> | null = null

type DivisionNode = {
  name: string
  code?: string | number
  children?: DivisionNode[]
}

function isMunicipalityName(name: string) {
  return (
    name === '北京市' ||
    name === '上海市' ||
    name === '天津市' ||
    name === '重庆市' ||
    name === '香港特别行政区' ||
    name === '澳门特别行政区'
  )
}

export async function loadChinaDivision(): Promise<LoadedRegionData> {
  if (cached) return cached
  if (loading) return loading
  loading = (async () => {
    // 引入 pcas-code.json（层级为数组树，转换更简单）。
    let data: DivisionNode[] | undefined
    try {
      const mod = (await import('china-division/dist/pcas-code.json')) as {
        default: DivisionNode[]
      }
      data = mod.default
    } catch {
      throw new Error('无法加载 china-division 的 pcas 数据文件')
    }

    const provinces: string[] = []
    const citiesMap: Record<string, string[]> = Object.create(null)
    const districtsMap: Record<string, string[]> = Object.create(null)
    const municipalities = new Set<string>()

    for (const prov of data as DivisionNode[]) {
      const pName = prov.name
      provinces.push(pName)
      const isMun = isMunicipalityName(pName)
      if (isMun) municipalities.add(pName)

      const cities = Array.isArray(prov.children) ? prov.children : []
      if (isMun) {
        // 单层级：城市同名处理，区县来自下一层
        citiesMap[pName] = [pName]
        const districts: string[] = []
        for (const c of cities) {
          if (Array.isArray(c.children)) {
            for (const d of c.children) districts.push(d.name)
          }
        }
        districtsMap[pName] = districts
      } else {
        citiesMap[pName] = cities.map((c) => c.name)
        for (const c of cities) {
          const dNames = Array.isArray(c.children)
            ? c.children.map((d) => d.name)
            : []
          districtsMap[c.name] = dNames
        }
      }
    }

    cached = {
      provinces,
      citiesMap,
      districtsMap,
      municipalities: Array.from(municipalities),
    }
    return cached
  })()
  try {
    return await loading
  } finally {
    loading = null
  }
}

export function clearRegionCache() {
  cached = null
}
