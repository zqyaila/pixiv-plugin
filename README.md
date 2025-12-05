# pixiv-plugin
本插件由claude创造，渲染模板由gemini优化，

## 安装插件

#### 1. 克隆仓库

```
git clone https://github.com/zqyaila/pixiv-plugin.git ./plugins/pixiv-plugin
```

> [!NOTE]
> 如果你的网络环境较差，无法连接到 Github，可以使用 [GitHub Proxy](https://ghproxy.link/) 提供的文件代理加速下载服务
>
#### 2. 自定义配置

1.配置自定义背景图
准备一张图片，将其改名为bg.png
并放于pixiv-plugin/resources/help/中即可


2.修改配置文件
前往config.config.yaml
代理地址 (留空使用默认代理)
proxy: ""

R18设置 (0=非R18, 1=R18, 2=混合)
r18: 0

图片尺寸 (original, regular, small, thumb, mini)
size: "regular"

最大返回结果数
maxResults: 5

冷却时间(秒)
cooldown: 10

是否以合并转发(聊天记录)形式发送
forwardMsg: true
因为报错还有部分原因这个修改了应该没有用，默认转发消息发送

搜索超时时间(秒)
timeout: 30

单张图片下载超时(秒)
imageTimeout: 15

超时后是否发送已获取的结果
sendPartialOnTimeout: true


