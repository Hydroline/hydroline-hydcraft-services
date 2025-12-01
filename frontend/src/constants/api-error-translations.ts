export const apiErrorTranslations: Record<string, string> = {
  'Player ID is required': '缺少玩家 ID',
  'Please select a game account to query': '请选择要查询的游戏账户',
  'LuckPerms API is not enabled': 'LuckPerms 接口未启用',
  'No valid AuthMe binding found': '未找到有效的 AuthMe 绑定',
  'Server not found': '服务器不存在',
  'Valid AuthMe username is required': '缺少有效的 AuthMe 用户名',
  'AuthMe password verification failed': 'AuthMe 密码核查失败',
  'LuckPerms permission group verification failed': 'LuckPerms 权限组核查失败',
  'Current account is not bound to this provider': '当前未绑定该 Provider',
  'Beacon is not enabled or configured': 'Beacon 未启用或未配置',
  'Beacon configuration incomplete: endpoint and key are required':
    'Beacon 配置不完整：请设置 endpoint 与 key',
  'Unknown email template': '未知的邮件模板',
  'User not found': '用户不存在',
  'AuthMe account not found': '未找到对应的 AuthMe 账户',
  'Specified server not found': '未找到指定的服务器',
  'Please select a server': '请选择服务器',
  'Please enter a new password with at least 6 characters':
    '请输入至少 6 位的新密码',
  'Please select the target permission group': '请选择目标权限组',
  'OAuth binding does not exist': 'OAuth 绑定不存在',
  'Binding record does not belong to this user': '绑定记录不属于该用户',
  'Missing valid player identifier': '缺少合法的玩家标识',
  'Player identifier must not contain whitespace': '玩家标识不能包含空白字符',
  'Please enter a new password': '请输入新密码',
  'Password must not contain whitespace': '密码不能包含空白字符',
  'Target permission group is required': '缺少目标权限组',
  'Permission group identifier must not contain whitespace':
    '权限组标识不能包含空白字符',
  'Invalid Bedrock Ping response format.': '无效的基岩版 Ping 响应格式。',
  'Server information format is incomplete.': '服务器信息格式不完整。',
}

export function translateApiErrorMessage(message: string | null | undefined) {
  if (!message) return undefined
  return apiErrorTranslations[message]
}
