import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 检查并创建必要的目录
const dirs = ['resources', 'config']
dirs.forEach(dir => {
  const dirPath = path.join(__dirname, dir)
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
})

// 初始化默认配置
const configPath = path.join(__dirname, 'config/config.yaml')
if (!fs.existsSync(configPath)) {
  const defaultConfig = `# Pixiv搜索插件配置

# 代理地址 (留空使用默认代理)
proxy: ""

# R18设置 (0=非R18, 1=R18, 2=混合)
r18: 0

# 图片尺寸 (original, regular, small, thumb, mini)
size: "regular"

# 最大返回结果数
maxResults: 5

# 冷却时间(秒)
cooldown: 10

# 是否以合并转发(聊天记录)形式发送
forwardMsg: true

# 搜索超时时间(秒)
timeout: 30

# 单张图片下载超时(秒)
imageTimeout: 15

# 超时后是否发送已获取的结果
sendPartialOnTimeout: true
`
  fs.writeFileSync(configPath, defaultConfig)
}

logger.info('-----------------------------------------------')
logger.info('Pixiv搜索插件 v1.1.0 加载成功')
logger.info('新增: 转发消息开关、超时控制')
logger.info('-----------------------------------------------')

export * from './apps/pixiv.js'
export * from './apps/help.js'