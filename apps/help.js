import plugin from '../../../lib/plugins/plugin.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import YAML from 'yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pluginRoot = path.join(__dirname, '..')
const resourcePath = path.join(pluginRoot, 'resources', 'help')

// 立即输出日志确保文件加载
logger.mark('[Pixiv] help.js 已加载')

export class PixivHelpPlugin extends plugin {
  constructor() {
    super({
      name: 'pixiv帮助',
      dsc: 'pixiv插件帮助',
      event: 'message',
      priority: 100,
      rule: [
        {
          reg: '^#?(p|P)站帮助$',
          fnc: 'help'
        },
        {
          reg: '^#?(p|P)ixiv帮助$',
          fnc: 'help'
        },
        {
          reg: '^#?搜图帮助$',
          fnc: 'help'
        }
      ]
    })
  }

  async help(e) {
    const config = this.getConfig()
    
    try {
      const imgPath = await this.render(config)
      if (imgPath) {
        await e.reply(segment.image(imgPath))
        return true
      }
    } catch (err) {
      logger.error(`[pixiv帮助] 渲染失败: ${err.message}`)
    }
    
    // 渲染失败时的兜底文本
    await e.reply('Pixiv插件帮助:\n#搜图 关键词\n#p站随机图\n#p站排行榜\n#p站设置')
    return true
  }

  getConfig() {
    const configPath = path.join(pluginRoot, 'config', 'config.yaml')
    const def = { timeout: 30, cooldown: 10, maxResults: 5, maxRandomNum: 10 }
    try {
      if (fs.existsSync(configPath)) {
        return { ...def, ...YAML.parse(fs.readFileSync(configPath, 'utf8')) }
      }
    } catch (e) {}
    return def
  }

  async render(config) {
    // 确保资源目录存在
    if (!fs.existsSync(resourcePath)) {
      fs.mkdirSync(resourcePath, { recursive: true })
    }

    const htmlFile = path.join(resourcePath, 'help.html')
    const cssFile = path.join(resourcePath, 'help.css')
    const imgFile = path.join(resourcePath, 'help.png')

    // 如果模板文件不存在，自动生成（防止初次使用报错）
    if (!fs.existsSync(htmlFile) || !fs.existsSync(cssFile)) {
      this.initResources(htmlFile, cssFile)
    }

    let html = fs.readFileSync(htmlFile, 'utf8')
    const css = fs.readFileSync(cssFile, 'utf8')

    // 获取背景图 Base64
    let bgData = ''
    const bgExtensions = ['png', 'jpg', 'jpeg', 'webp']
    for (const ext of bgExtensions) {
      const bgPath = path.join(resourcePath, `bg.${ext}`)
      if (fs.existsSync(bgPath)) {
        const buf = fs.readFileSync(bgPath)
        bgData = `data:image/${ext};base64,${buf.toString('base64')}`
        break
      }
    }

    // 替换模板变量
    html = html.replace('{{STYLE}}', css)
    html = html.replace(/\{\{BG\}\}/g, bgData)
    html = html.replace(/\{\{TIMEOUT\}\}/g, config.timeout)
    html = html.replace(/\{\{COOLDOWN\}\}/g, config.cooldown)
    html = html.replace(/\{\{MAX_RESULTS\}\}/g, config.maxResults)
    html = html.replace(/\{\{MAX_RANDOM\}\}/g, config.maxRandomNum)

    // 动态导入 Puppeteer
    let puppeteer
    try {
      puppeteer = (await import('../../../lib/puppeteer/puppeteer.js')).default
    } catch (err) {
      logger.error('[pixiv帮助] 未找到puppeteer')
      return null
    }

    const browser = await puppeteer.browserInit()
    const page = await browser.newPage()
    
    // 设置视窗大小
    await page.setViewport({ width: 700, height: 1000, deviceScaleFactor: 2 })
    await page.setContent(html, { waitUntil: 'load' })
    
    const element = await page.$('#app')
    const box = await element.boundingBox()
    
    await page.screenshot({
      path: imgFile,
      type: 'png',
      clip: { x: 0, y: 0, width: box.width, height: box.height }
    })
    
    await page.close()
    return imgFile
  }

  // 初始化默认资源文件
  initResources(htmlFile, cssFile) {
    // 默认 HTML
    const defaultHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>{{STYLE}}</style>
</head>
<body>
  <div class="background" style="background-image: url('{{BG}}')"></div>
  <div class="overlay"></div>
  <div id="app" class="container">
    <div class="header">
      <div class="logo-box"><div class="logo">P</div></div>
      <div class="title-box">
        <h1>Pixiv Search</h1>
        <div class="badges"><span class="badge ver">v2.0 Pro</span><span class="badge plugin">Yunzai-Plugin</span></div>
      </div>
    </div>
    <div class="content">
      <div class="card search-card">
        <div class="card-title"><span class="icon">🔍</span> 核心搜索</div>
        <div class="cmd-grid">
          <div class="cmd-item"><div class="code">#搜图 &lt;关键词&gt;</div><div class="desc">搜索插画作品</div></div>
          <div class="cmd-item"><div class="code">#p站随机图 [标签]</div><div class="desc">发现随机美图</div></div>
          <div class="cmd-item"><div class="code">#pid &lt;数字&gt;</div><div class="desc">精准ID获取</div></div>
        </div>
      </div>
      <div class="card rank-card">
        <div class="card-title"><span class="icon">🏆</span> 排行榜单</div>
        <div class="rank-list">
          <div class="rank-item day"><span class="lbl">#p站排行榜</span><span class="sub">每日精选 TOP10</span></div>
          <div class="rank-item week"><span class="lbl">#p站排行榜周</span><span class="sub">本周热门</span></div>
          <div class="rank-item month"><span class="lbl">#p站排行榜月</span><span class="sub">月度殿堂</span></div>
        </div>
      </div>
      <div class="card settings-card">
        <div class="card-title"><span class="icon">⚙️</span> 管理配置</div>
        <div class="cmd-list-simple">
          <div class="row"><span class="c-code">#设置p站超时 &lt;秒&gt;</span><span class="c-desc">设置请求超时时间</span></div>
          <div class="row"><span class="c-code">#设置p站数量 &lt;数&gt;</span><span class="c-desc">设置默认返回张数</span></div>
          <div class="row"><span class="c-code">#p站设置</span><span class="c-desc">查看当前详细配置</span></div>
        </div>
      </div>
      <div class="status-bar">
        <div class="stat-item"><div class="stat-label">超时时间</div><div class="stat-val">{{TIMEOUT}}<span>s</span></div></div>
        <div class="stat-item"><div class="stat-label">冷却CD</div><div class="stat-val">{{COOLDOWN}}<span>s</span></div></div>
        <div class="stat-item"><div class="stat-label">搜索数量</div><div class="stat-val">{{MAX_RESULTS}}<span>P</span></div></div>
        <div class="stat-item"><div class="stat-label">随机上限</div><div class="stat-val">{{MAX_RANDOM}}<span>P</span></div></div>
      </div>
    </div>
    <div class="footer">Created by Yunzai-Bot & Pixiv-Plugin</div>
  </div>
</body>
</html>`

    // 默认 CSS
    const defaultCss = `@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Noto+Sans+SC:wght@400;500;700;900&display=swap');
:root{--primary:#0096fa;--accent:#ff5c8d;--dark:#2f3e46;--glass:rgba(255,255,255,0.85);--glass-border:rgba(255,255,255,0.6);--shadow:0 8px 32px rgba(0,0,0,0.1)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans SC',sans-serif;background:linear-gradient(135deg,#e0c3fc 0%,#8ec5fc 100%);min-height:100vh;display:flex;justify-content:center}
.background{position:fixed;top:0;left:0;width:100%;height:100%;background-size:cover;background-position:center;z-index:-2}
.overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.2);backdrop-filter:blur(15px);z-index:-1}
.container{width:680px;padding:40px;position:relative}
.header{display:flex;align-items:center;margin-bottom:30px}
.logo-box{width:60px;height:60px;background:var(--primary);border-radius:16px;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 20px rgba(0,150,250,0.3);margin-right:20px}
.logo{font-family:'JetBrains Mono',monospace;font-size:36px;font-weight:900;color:#fff}
.title-box h1{font-size:32px;color:var(--dark);line-height:1.2;letter-spacing:-1px}
.badges{display:flex;gap:8px;margin-top:5px}
.badge{font-size:10px;padding:2px 8px;border-radius:4px;font-weight:700;text-transform:uppercase}
.badge.ver{background:var(--dark);color:#fff}
.badge.plugin{background:rgba(0,0,0,0.05);color:#666}
.card{background:var(--glass);border:1px solid var(--glass-border);border-radius:20px;padding:20px;margin-bottom:20px;box-shadow:var(--shadow)}
.card-title{font-size:16px;font-weight:700;color:#555;margin-bottom:15px;display:flex;align-items:center;gap:8px}
.cmd-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.cmd-item{background:#fff;padding:12px 15px;border-radius:12px;border-left:4px solid var(--primary)}
.code{font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--primary);font-size:14px;margin-bottom:4px}
.desc{font-size:12px;color:#888}
.rank-list{display:flex;gap:12px}
.rank-item{flex:1;background:linear-gradient(145deg,#ffffff,#f0f2f5);padding:15px;border-radius:16px;text-align:center;box-shadow:0 4px 10px rgba(0,0,0,0.03)}
.rank-item.day{border-bottom:3px solid #ff9f1c}
.rank-item.week{border-bottom:3px solid #2ec4b6}
.rank-item.month{border-bottom:3px solid #ff5c8d}
.rank-item .lbl{display:block;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:13px;color:#333;margin-bottom:4px}
.rank-item .sub{font-size:10px;color:#999}
.cmd-list-simple .row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px dashed rgba(0,0,0,0.05)}
.cmd-list-simple .row:last-child{border-bottom:none}
.c-code{font-family:'JetBrains Mono',monospace;color:#444;font-size:13px;background:rgba(0,0,0,0.03);padding:2px 6px;border-radius:4px}
.c-desc{font-size:12px;color:#999}
.status-bar{display:grid;grid-template-columns:repeat(4,1fr);gap:15px;background:var(--dark);border-radius:20px;padding:20px;color:#fff;box-shadow:0 10px 30px rgba(47,62,70,0.3)}
.stat-item{text-align:center;position:relative}
.stat-item:not(:last-child)::after{content:'';position:absolute;right:-7.5px;top:10%;height:80%;width:1px;background:rgba(255,255,255,0.1)}
.stat-label{font-size:10px;opacity:0.6;margin-bottom:5px;text-transform:uppercase}
.stat-val{font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:700;color:var(--primary)}
.stat-val span{font-size:10px;color:#fff;margin-left:2px;font-weight:400}
.footer{text-align:center;margin-top:30px;font-size:10px;color:rgba(0,0,0,0.4);font-family:'JetBrains Mono',monospace}`

    if (!fs.existsSync(htmlFile)) fs.writeFileSync(htmlFile, defaultHtml)
    if (!fs.existsSync(cssFile)) fs.writeFileSync(cssFile, defaultCss)
  }
}
