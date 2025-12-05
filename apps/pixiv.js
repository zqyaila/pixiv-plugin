import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import YAML from 'yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pluginRoot = path.join(__dirname, '..')

// 配置路径
const configPath = path.join(pluginRoot, 'config/config.yaml')

// 默认配置
let config = {
  proxy: '',
  r18: 0,
  size: 'regular',
  maxResults: 5,
  cooldown: 10,
  timeout: 30,
  imageTimeout: 15,
  maxRandomNum: 10
}

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      config = { ...config, ...YAML.parse(fs.readFileSync(configPath, 'utf8')) }
    }
  } catch (err) {
    logger.error(`[Pixiv] 配置加载失败: ${err}`)
  }
}

function saveConfig() {
  try {
    const configDir = path.dirname(configPath)
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
    fs.writeFileSync(configPath, YAML.stringify(config))
  } catch (err) {
    logger.error(`[Pixiv] 配置保存失败: ${err}`)
  }
}

loadConfig()

// 冷却记录
const cooldownMap = new Map()

// 带超时的fetch
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timeoutId)
    return response
  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') throw new Error('请求超时')
    throw err
  }
}

// 超时包装器
function withTimeout(promise, ms, msg = '请求超时') {
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
  return Promise.race([promise, timeout])
}

export class PixivSearch extends plugin {
  constructor() {
    super({
      name: 'Pixiv搜索',
      dsc: '搜索Pixiv插画',
      event: 'message',
      priority: 500,
      rule: [
        { reg: '^#?搜图(.*)$', fnc: 'searchPixiv' },
        { reg: '^#?p站搜索(.*)$', fnc: 'searchPixiv' },
        { reg: '^#?pixiv搜索(.*)$', fnc: 'searchPixiv' },
        { reg: '^#?p站排行榜(日|周|月)?$', fnc: 'getRanking' },
        { reg: '^#?p站随机图(.*)$', fnc: 'randomPixiv' },
        { reg: '^#?pid(\\d+)$', fnc: 'getByPid' },
        { reg: '^#?设置p站超时(\\d+)$', fnc: 'setTimeoutConfig' },
        { reg: '^#?设置p站数量(\\d+)$', fnc: 'setMaxResults' },
        { reg: '^#?设置p站代理(.*)$', fnc: 'setProxy', permission: 'master' },
        { reg: '^#?p站设置$', fnc: 'showSettings' }
      ]
    })
  }

  checkCooldown(userId) {
    const now = Date.now()
    const lastUse = cooldownMap.get(userId) || 0
    const remaining = config.cooldown * 1000 - (now - lastUse)
    
    if (remaining > 0) return Math.ceil(remaining / 1000)
    cooldownMap.set(userId, now)
    return 0
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  getBotUin(e) {
    try {
      return e.bot?.uin || e.self_id || Bot.uin || 10000
    } catch {
      return 10000
    }
  }

  getBotName() {
    try {
      return Bot.nickname || 'Pixiv'
    } catch {
      return 'Pixiv'
    }
  }

  async sendForwardMsg(e, messages) {
    if (!messages?.length) return false

    const botUin = this.getBotUin(e)
    const botName = this.getBotName()
    
    const nodes = messages.map(msg => ({
      user_id: botUin,
      nickname: botName,
      message: msg
    }))

    const methods = [
      async () => Bot?.makeForwardMsg && e.reply(await Bot.makeForwardMsg(nodes)),
      async () => e.group?.makeForwardMsg && e.group.sendMsg(await e.group.makeForwardMsg(nodes)),
      async () => Bot?.pickGroup?.(e.group_id)?.sendMsg(await Bot.pickGroup(e.group_id).makeForwardMsg(nodes)),
      async () => e.bot?.pickGroup?.(e.group_id)?.sendMsg(await e.bot.pickGroup(e.group_id).makeForwardMsg(nodes))
    ]

    for (const method of methods) {
      try {
        const result = await method()
        if (result?.message_id) return true
      } catch {}
    }

    e.reply('消息发送失败，请稍后重试')
    return false
  }

  makeImage(url) {
    return { type: 'image', file: url, url }
  }

  async checkImage(url) {
    const res = await fetchWithTimeout(url, { method: 'HEAD' }, 10000)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return true
  }

  async searchPixiv(e) {
    const keyword = e.msg.replace(/^#?(搜图|p站搜索|pixiv搜索)/, '').trim()
    
    if (!keyword) {
      e.reply('请输入搜索关键词\n例如: #搜图 初音未来')
      return true
    }

    const cd = this.checkCooldown(e.user_id)
    if (cd > 0) {
      e.reply(`冷却中，请${cd}秒后再试`)
      return true
    }

    e.reply(`正在搜索: ${keyword}...`)

    const startTime = Date.now()
    const messages = []
    let successCount = 0

    try {
      const apiUrl = `https://api.lolicon.app/setu/v2?keyword=${encodeURIComponent(keyword)}&num=${config.maxResults}&r18=${config.r18}&size=${config.size}`
      const response = await fetchWithTimeout(apiUrl, {}, config.timeout * 1000)
      const data = await response.json()

      if (!data.data?.length) {
        e.reply(`未找到关于"${keyword}"的插画`)
        return true
      }

      for (const item of data.data) {
        if (Date.now() - startTime > config.timeout * 1000) break

        messages.push([
          `📷 ${item.title}`,
          `👤 作者: ${item.author}`,
          `🔢 PID: ${item.pid}`,
          `🏷️ 标签: ${item.tags.slice(0, 5).join(', ')}`,
          `🔗 pixiv.net/artworks/${item.pid}`
        ].join('\n'))

        try {
          const imgUrl = (item.urls[config.size] || item.urls.regular).replace('i.pixiv.cat', 'i.pixiv.re')
          await withTimeout(this.checkImage(imgUrl), config.imageTimeout * 1000)
          messages.push(this.makeImage(imgUrl))
          successCount++
        } catch (err) {
          messages.push(`[图片加载失败: ${err.message}]`)
        }
      }

      if (messages.length) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        messages.unshift(`✅ 搜索「${keyword}」完成\n共${successCount}张图片，耗时${elapsed}秒`)
        await this.sendForwardMsg(e, messages)
      }

    } catch (err) {
      logger.error(`[Pixiv搜索] ${err}`)
      e.reply(`搜索失败: ${err.message}`)
    }

    return true
  }

  async randomPixiv(e) {
    let input = e.msg.replace(/^#?p站随机图/, '').trim()
    
    let num = 1
    const numMatch = input.match(/\s+(\d+)$/)
    if (numMatch) {
      num = parseInt(numMatch[1])
      input = input.replace(/\s+\d+$/, '').trim()
    }
    
    if (/^\d+$/.test(input)) {
      num = parseInt(input)
      input = ''
    }
    
    num = Math.max(1, Math.min(num, config.maxRandomNum))
    const tag = input

    const cd = this.checkCooldown(e.user_id)
    if (cd > 0) {
      e.reply(`冷却中，请${cd}秒后再试`)
      return true
    }

    e.reply(`正在获取${num}张随机图片${tag ? `(${tag})` : ''}...`)

    const startTime = Date.now()

    try {
      let apiUrl = `https://api.lolicon.app/setu/v2?r18=${config.r18}&size=${config.size}&num=${num}`
      if (tag) apiUrl += `&tag=${encodeURIComponent(tag)}`

      const response = await fetchWithTimeout(apiUrl, {}, config.timeout * 1000)
      const data = await response.json()

      if (!data.data?.length) {
        e.reply('获取失败，请重试')
        return true
      }

      const messages = []
      let successCount = 0

      for (let i = 0; i < data.data.length; i++) {
        const item = data.data[i]
        if (Date.now() - startTime > config.timeout * 1000) break

        messages.push([
          `🎨 [${i + 1}/${data.data.length}] ${item.title}`,
          `👤 作者: ${item.author}`,
          `🔢 PID: ${item.pid}`,
          `🏷️ 标签: ${item.tags.slice(0, 5).join(', ')}`
        ].join('\n'))

        try {
          const imgUrl = (item.urls[config.size] || item.urls.regular).replace('i.pixiv.cat', 'i.pixiv.re')
          await withTimeout(this.checkImage(imgUrl), config.imageTimeout * 1000)
          messages.push(this.makeImage(imgUrl))
          successCount++
        } catch (err) {
          messages.push(`[图片加载失败: ${err.message}]`)
        }
      }

      if (messages.length) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        messages.unshift(`🎲 随机图片${tag ? ` [${tag}]` : ''}\n共${successCount}张，耗时${elapsed}秒`)
        await this.sendForwardMsg(e, messages)
      }

    } catch (err) {
      logger.error(`[Pixiv随机] ${err}`)
      e.reply(`获取失败: ${err.message}`)
    }

    return true
  }

  async getByPid(e) {
    const match = e.msg.match(/^#?pid(\d+)$/)
    if (!match) return false
    
    const pid = match[1]

    const cd = this.checkCooldown(e.user_id)
    if (cd > 0) {
      e.reply(`冷却中，请${cd}秒后再试`)
      return true
    }

    e.reply(`正在获取PID: ${pid}...`)

    try {
      const response = await fetchWithTimeout(`https://api.lolicon.app/setu/v2?pid=${pid}`, {}, config.timeout * 1000)
      const data = await response.json()
      const messages = []

      if (!data.data?.length) {
        messages.push(`🔢 PID: ${pid}\n🔗 pixiv.net/artworks/${pid}`)
        messages.push(this.makeImage(`https://i.pixiv.re/img-master/img/2020/01/01/00/00/00/${pid}_p0_master1200.jpg`))
      } else {
        const item = data.data[0]
        const imgUrl = (item.urls[config.size] || item.urls.regular).replace('i.pixiv.cat', 'i.pixiv.re')

        messages.push([
          `📷 ${item.title}`,
          `👤 作者: ${item.author}`,
          `🔢 PID: ${item.pid}`,
          `🏷️ 标签: ${item.tags.slice(0, 8).join(', ')}`,
          `🔗 pixiv.net/artworks/${item.pid}`
        ].join('\n'))

        try {
          await withTimeout(this.checkImage(imgUrl), config.imageTimeout * 1000)
          messages.push(this.makeImage(imgUrl))
        } catch (err) {
          messages.push(`[图片加载失败: ${err.message}]`)
        }
      }

      await this.sendForwardMsg(e, messages)

    } catch (err) {
      logger.error(`[Pixiv PID] ${err}`)
      e.reply(`获取失败: ${err.message}`)
    }

    return true
  }

  async getRanking(e) {
    const type = e.msg.match(/^#?p站排行榜(日|周|月)?$/)?.[1] || '日'
    
    const cd = this.checkCooldown(e.user_id)
    if (cd > 0) {
      e.reply(`冷却中，请${cd}秒后再试`)
      return true
    }

    e.reply(`正在获取${type}排行榜...`)

    const startTime = Date.now()

    try {
      const response = await fetchWithTimeout(`https://api.lolicon.app/setu/v2?num=10&r18=${config.r18}&size=${config.size}`, {}, config.timeout * 1000)
      const data = await response.json()

      if (!data.data?.length) {
        e.reply('获取排行榜失败，请稍后重试')
        return true
      }

      const messages = [`📊 Pixiv ${type}排行榜 TOP${data.data.length}`]
      let rank = 1

      for (const item of data.data) {
        if (Date.now() - startTime > config.timeout * 1000) {
          messages.push(`⚠️ 超时，已加载${rank - 1}张`)
          break
        }

        const imgUrl = (item.urls[config.size] || item.urls.regular).replace('i.pixiv.cat', 'i.pixiv.re')
        messages.push(`【第${rank}名】${item.title}\n👤 ${item.author} | PID: ${item.pid}`)

        try {
          await withTimeout(this.checkImage(imgUrl), config.imageTimeout * 1000)
          messages.push(this.makeImage(imgUrl))
        } catch {
          messages.push(`[图片加载失败]`)
        }

        rank++
      }

      await this.sendForwardMsg(e, messages)

    } catch (err) {
      logger.error(`[Pixiv排行榜] ${err}`)
      e.reply(`获取排行榜失败: ${err.message}`)
    }

    return true
  }

  async setTimeoutConfig(e) {
    const timeout = parseInt(e.msg.match(/^#?设置p站超时(\d+)$/)?.[1])
    if (!timeout || timeout < 5 || timeout > 120) {
      e.reply('超时时间应在5-120秒之间')
      return true
    }
    config.timeout = timeout
    saveConfig()
    e.reply(`✅ 超时时间已设置为: ${timeout}秒`)
    return true
  }

  async setMaxResults(e) {
    const num = parseInt(e.msg.match(/^#?设置p站数量(\d+)$/)?.[1])
    if (!num || num < 1 || num > 20) {
      e.reply('搜索数量应在1-20之间')
      return true
    }
    config.maxResults = num
    saveConfig()
    e.reply(`✅ 搜索数量已设置为: ${num}张`)
    return true
  }

  async setProxy(e) {
    const proxy = e.msg.replace(/^#?设置p站代理/, '').trim()
    config.proxy = proxy
    saveConfig()
    e.reply(`✅ 代理已设置为: ${proxy || '无'}`)
    return true
  }

  async showSettings(e) {
    loadConfig()
    e.reply([
      `⚙️ Pixiv插件设置`,
      `━━━━━━━━━━━━━━`,
      `⏱️ 搜索超时: ${config.timeout}秒`,
      `🖼️ 图片超时: ${config.imageTimeout}秒`,
      `❄️ 冷却时间: ${config.cooldown}秒`,
      `📊 搜索数量: ${config.maxResults}张`,
      `🎲 随机上限: ${config.maxRandomNum}张`,
      `📐 图片尺寸: ${config.size}`,
      `🔞 R18模式: ${['关闭', '开启', '混合'][config.r18]}`,
      `🌐 代理: ${config.proxy || '无'}`
    ].join('\n'))
    return true
  }
}