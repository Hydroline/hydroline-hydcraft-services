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
  'AuthMe account not found': '未找到对应的 AuthMe 账号',
  'AuthMe login is disabled': '当前未开放 AuthMe 登录',
  'AuthMe register is disabled': '当前未开放 AuthMe 注册',
  'phone must match': '手机号格式不正确',
  'Phone number is invalid': '手机号格式不正确',
  'Invalid phone number': '手机号格式不正确',
  'Phone number format is invalid': '手机号格式不正确',
  'Phone length is invalid': '手机号长度不符合要求',
  '区号无效': '区号无效',
  '不支持的区号': '不支持的区号',
  '手机号长度超出范围': '手机号长度不符合要求',
  '该手机号已存在': '该手机号已存在',
  '未找到对应的手机号': '未找到对应的手机号',
  '请先完成手机号验证后再设为主手机号': '请先完成手机号验证',
  '仅支持更新手机号联系人': '只能更新手机号',
  '只能设置手机号为主联系方式': '只能设置手机号为主',
  '至少需要保留一个邮箱联系方式': '至少需要保留一个邮箱',
  'Contact not found': '联系方式未找到',
  '该邮箱已被验证': '该邮箱已被验证',
  '邮箱地址无效': '邮箱地址无效',
  'Verification code has expired': '验证码已过期',
  '验证码无效或已过期': '验证码已过期',
  '验证码错误': '验证码错误',
  'Code not found': '验证码未找到',
  'Bad Request': '请求参数错误',
  '无法发送验证码，请先绑定邮箱': '请先绑定邮箱',
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
