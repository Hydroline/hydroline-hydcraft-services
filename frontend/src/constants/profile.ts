// 通用的资料配置常量与下拉选项
import { getTimezones } from '@/utils/timezones'

export type PhoneRegionCode = 'CN' | 'HK' | 'MO' | 'TW'

export const phoneRegions: Array<{
  code: PhoneRegionCode
  name: string
  dial: string
}> = [
  { code: 'CN', name: '中国大陆 +86', dial: '+86' },
  { code: 'HK', name: '中国香港 +852', dial: '+852' },
  { code: 'MO', name: '中国澳门 +853', dial: '+853' },
  { code: 'TW', name: '中国台湾 +886', dial: '+886' },
]

export const languageOptions = [{ label: '中文（简体）', value: 'zh-CN' }]

const regionZhMap: Record<string, string> = {
  Africa: '非洲',
  America: '美洲',
  Antarctica: '南极洲',
  Arctic: '北极地区',
  Asia: '亚洲',
  Atlantic: '大西洋',
  Australia: '澳大利亚',
  Europe: '欧洲',
  Indian: '印度洋',
  Pacific: '太平洋',
  Etc: '其他',
}

// 仅覆盖东亚常见城市，其他保持英文（按需求可再扩充）
const cityZhMap: Record<string, string> = {
  Shanghai: '上海',
  Beijing: '北京',
  Chongqing: '重庆',
  Urumqi: '乌鲁木齐',
  Harbin: '哈尔滨',
  Hong_Kong: '香港',
  Macau: '澳门',
  Taipei: '台北',
  Tokyo: '东京',
  Seoul: '首尔',
}

export function getTimezoneOptionsZh(): Array<{
  label: string
  value: string
}> {
  const tzs = getTimezones()
  return tzs.map((tz) => {
    // tz like "Asia/Shanghai", "America/Los_Angeles"
    const [region, rest] = tz.split('/')
    const regionZh = regionZhMap[region] || region
    const cityZh = cityZhMap[rest] || (rest ? rest.replaceAll('_', ' ') : '')
    const label = cityZh
      ? `${regionZh} / ${cityZh} (${tz})`
      : `${regionZh} (${tz})`
    return { label, value: tz }
  })
}
