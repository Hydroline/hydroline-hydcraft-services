const STATIC_TRANSLATIONS: Record<string, string> = {
  'Invalid email or password': '邮箱或密码错误',
  'Invalid credentials': '邮箱或密码错误',
  'Email already exists': '该邮箱已被注册',
  'Email already registered': '该邮箱已被注册',
  'User already exists': '账户已存在',
  'Missing email': '请填写邮箱地址',
  'Missing password': '请填写密码',
  'Missing credentials': '请填写登录信息',
  'Password is required': '请填写密码',
  'Email is required': '请填写邮箱地址',
  'Email is invalid': '邮箱格式不正确',
  'Invalid email': '邮箱格式不正确',
  'Email must be an email': '邮箱格式不正确',
  'Invalid password': '密码不正确',
  'Account locked': '账户已被锁定，请联系管理员',
  'Too many requests': '尝试次数过多，请稍后再试',
  'Too many failed attempts': '尝试次数过多，请稍后再试',
  'Password must be at least 8 characters long': '密码长度至少 8 位',
  'Password must be at least 8 characters': '密码长度至少 8 位',
  'Password must be at least eight characters long': '密码长度至少 8 位',
  'Password must contain at least 8 characters': '密码长度至少 8 位',
  'Password must contain at least one number': '密码需包含至少一个数字',
  'Password must contain at least one uppercase letter':
    '密码需包含至少一个大写字母',
  'Password must contain at least one lowercase letter':
    '密码需包含至少一个小写字母',
  'Password must contain at least one special character':
    '密码需包含至少一个特殊符号',
  'Password confirmation does not match': '两次输入的密码不一致',
  'Passwords do not match': '两次输入的密码不一致',
  'Invalid AuthMe credentials': 'AuthMe 账号或密码不正确',
  'AuthMe login is disabled': '当前未开放 AuthMe 登录',
  'AuthMe register is disabled': '当前未开放 AuthMe 注册',
  'Dial code must match': '区号格式不正确',
  'Phone must match': '手机号格式不正确',
  'Phone number is invalid': '手机号格式不正确',
  'Invalid phone number': '手机号格式不正确',
  'Phone number format is invalid': '手机号格式不正确',
  'Phone length is invalid': '手机号长度不符合要求',
  'Contact not found': '联系方式未找到',
  'Verification code has expired': '验证码已过期',
  'Code not found': '验证码未找到',
  'Bad Request': '请求参数错误',
  // Phone/dial code validation errors
  'Invalid dial code format': '区号格式无效',
  'Unsupported dial code region': '不支持的区号',
  'Phone number length out of range': '手机号长度不符合要求',
  'Only phone contacts can be updated': '只能更新手机号',
  'Can only set phone as primary contact': '只能设置手机号为主',
  'Phone must be verified before setting as primary':
    '请先完成手机号验证后再设为主',
  'Phone number not found': '未找到对应的手机号',
  'Phone contact not found': '未找到对应的手机号',
  'Phone number already exists': '该手机号已存在',
  // Email validation and verification errors
  'Email address cannot be empty': '邮箱地址不能为空',
  'Invalid email address': '邮箱地址无效',
  'Email already used by another account': '该邮箱已被其他账户使用',
  'At least one email contact must be retained': '至少需要保留一个邮箱',
  'Can only set email as primary contact': '只能设置邮箱为主',
  'Email must be verified before setting as primary':
    '请先完成邮箱验证后再设为主',
  'Email contact not found': '未找到对应的邮箱',
  'Verification code expired or invalid': '验证码无效或已过期',
  'Verification code incorrect': '验证码错误',
  'Verification code is required': '请输入验证码',
  'Invalid email or verification code': '邮箱或验证码错误',
  'code must be longer than or equal to 6 characters': '验证码需为 6 位',
  'code must be shorter than or equal to 6 characters': '验证码需为 6 位',
  'Verification code sent failed, please try again later':
    '验证码发送失败，请稍后重试',
  'Cannot send verification code, please bind email first':
    '无法发送验证码，请先绑定邮箱',
  // AuthMe binding errors
  'AuthMe binding is not enabled in current environment':
    '当前环境未启用 AuthMe 绑定',
  'No AuthMe bindings available to unbind':
    '当前账户没有可以解除的 AuthMe 绑定',
  'The specified AuthMe account is not bound to current user':
    '指定的 AuthMe 账号未绑定到当前用户',
  'AuthMe binding not found': 'AuthMe 绑定不存在',
  'AuthMe binding does not belong to this user': 'AuthMe 绑定不属于该用户',
  'Must provide either a nickname or an AuthMe binding':
    '请至少填写昵称或关联一个 AuthMe 账户',
  'Specified AuthMe binding not found': '指定的 AuthMe 绑定不存在',
  'AuthMe account id is required': 'AuthMe 账号不存在',
  'Identifier cannot be empty': 'Identifier 不能为空',
  'AuthMe registration is not enabled': 'AuthMe 注册暂未开放',
  'AuthMe login is not enabled': 'AuthMe 登录暂未开放',
  'Must specify which AuthMe account to unbind': '请指定要解绑的 AuthMe 账号',
  // Account and profile errors
  'Username can only be changed once every 30 days': '用户名每30天只能修改一次',
  'Current account has no email configured': '当前账户尚未配置邮箱',
  'Invalid join date': '无效的入服日期',
  // Portal and background config errors
  'Background image attachment must be set to public access':
    '背景图附件必须设置为公开访问',
  'Background image not found': '背景图不存在',
  'Order list size does not match background count':
    '排序列表与背景图数量不匹配',
  'Invalid background image ID': '无效的背景图 ID',
  'Navigation ID cannot be empty': '导航 ID 不能为空',
  'Navigation title cannot be empty': '导航标题不能为空',
  'Navigation ID already exists': '导航 ID 已存在',
  'Navigation item not found': '导航项不存在',
  'Order list size does not match navigation item count':
    '排序列表与导航项数量不匹配',
  'Invalid navigation item ID': '无效的导航项 ID',
  'Card not registered': '卡片未注册',
  // Minecraft server errors
  'Server not found': '服务器不存在',
  'Invalid MOTD content': '无效的 MOTD 内容',
  'Unable to connect to server': '无法连接到服务器',
  // Beacon / websocket errors
  'Beacon is not connected. Cannot execute event get_player_mtr_logs. Please verify the Beacon service and try again.':
    'Beacon 未连接，无法加载 MTR 审计日志，请检查 Beacon 服务后重试。',
  'Beacon is not connected. Cannot execute event get_status. Please verify the Beacon service and try again.':
    'Beacon 未连接，无法获取状态，请检查 Beacon 服务后重试。',
  'Beacon is not connected. Cannot execute event get_player_advancements. Please verify the Beacon service and try again.':
    'Beacon 未连接，无法加载成就数据，请检查 Beacon 服务后重试。',
  'Beacon is not connected. Cannot execute event get_player_stats. Please verify the Beacon service and try again.':
    'Beacon 未连接，无法加载统计数据，请检查 Beacon 服务后重试。',
  // Mail and permission errors
  'Mail service is not configured': '邮件服务未配置',
  'Missing user context': '缺少用户上下文',
  'Only administrators can self-assign permissions':
    '仅 Administrator 可自助添加权限',
}

const PASSWORD_TOO_SHORT_RE = /password[^a-z]*least[^0-9]*8/i
const EMAIL_INVALID_RE = /invalid\s+email/i
const EMAIL_IN_USE_RE = /(email|account)[^a-z]*(exists|already)/i
const TOO_MANY_REQUESTS_RE = /too\s+many/i
const PHONE_INVALID_RE = /phone[^a-z]*(match|invalid|format)/i
const PHONE_LENGTH_RE = /phone[^a-z]*(length|range)/i

export function translateAuthErrorMessage(message: unknown): string {
  if (typeof message !== 'string') {
    return '请求失败，请稍后重试'
  }
  const trimmed = message.trim()
  if (!trimmed) {
    return '请求失败，请稍后重试'
  }
  const direct = STATIC_TRANSLATIONS[trimmed]
  if (direct) {
    return direct
  }
  if (PASSWORD_TOO_SHORT_RE.test(trimmed)) {
    return '密码长度至少 8 位'
  }
  if (EMAIL_INVALID_RE.test(trimmed)) {
    return '邮箱格式不正确'
  }
  if (EMAIL_IN_USE_RE.test(trimmed)) {
    return '该邮箱已被注册'
  }
  if (PHONE_INVALID_RE.test(trimmed)) {
    return '手机号格式不正确，应为 5-20 位数字、空格或短横线'
  }
  if (PHONE_LENGTH_RE.test(trimmed)) {
    return '手机号长度不符合要求，应为 5-20 位'
  }
  if (TOO_MANY_REQUESTS_RE.test(trimmed)) {
    return '尝试次数过多，请稍后再试'
  }
  return trimmed
}
