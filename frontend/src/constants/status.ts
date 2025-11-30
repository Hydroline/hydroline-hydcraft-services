export type PlayerStatus = 'ACTIVE' | 'AWAY' | 'UNKNOWN' | 'BANNED' | 'ABNORMAL'

export const playerStatusOptions: Array<{
  label: string
  value: PlayerStatus
  description?: string
}> = [
  { label: '正常', value: 'ACTIVE', description: '允许正常登录与服务' },
  { label: '暂离', value: 'AWAY', description: '临时不可用，保留帐号' },
  { label: '未知', value: 'UNKNOWN', description: '状态未同步，谨慎处理' },
  { label: '封禁', value: 'BANNED', description: '禁止登录，需人工解除' },
  {
    label: '异常',
    value: 'ABNORMAL',
    description: '检测到账号异常，待进一步操作',
  },
]
