## TODO - MCSM 集成（后端）

- [x] 调整 Prisma 模型，为服务器添加 MCSM 配置字段
- [x] 更新 DTO/Service/Controller，隐藏 apiKey 并支持读写 MCSM 配置
- [x] 新增 backend/src/lib/mcsmanager 客户端封装并接入服务器服务层方法（状态/命令/启停重启/日志）
- [x] 自检：pnpm build（backend）
