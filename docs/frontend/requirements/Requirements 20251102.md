根据这个草图（对于草图对应的描述，请参照下方描述 c），以及 docs/backend/milestone 下相关的后端第一阶段文档内已实现 Auth 相关功能，现在请你实现对应的前端用户界面和后台界面。对于前端的具体功能描述如下。

注：你需要把本次构建增加的内容放到  docs/frontend/milestone/20251102 文件夹下。这个文件夹下你可以任意添加文件。强制规定：等理解了需求以后，你还需要制作一个 TODO List 在文件夹下，一个一个打勾，好了就完成一个，直到全部完成。为了防止你忘记我的需求，一定要这么做！

a) 前端基本设计规则
在你设计前端界面的时候，UI 风格请参照 frontend/src/views/HomeView.vue 内的实例模块（AI 编写）。使用简约的风格进行编写。我们的项目 Tailwind CSS 配色已经在 frontend/src/assets/styles/styles.css 内配置。使用 Nuxt UI + Tailwind CSS + Reka UI + Headless UI 实现我们的需求。

b) 项目组织规则
确保能方便的添加其他功能。
普通业务和后台业务都放在 frontend 文件夹下组织。只不过两者在路由上会更区分开一点。用户端与后台端放一个仓库里，分文件夹和路由域区分，配独立 layout 和权限守卫。以路由为举例：路由文件内分两个数组，adminRoutes = [{ ... }] 和 userRoutes = [{ ... }]，最终通过

const router = createRouter({
  history: createWebHistory(),
  routes: [
    ...userRoutes,
    ...adminRoutes,
    { path: '/:pathMatch(.*)*', redirect: '/error/404' }
  ]
})
一起注册。包括状态、路由、用户业务/后台业务视图组织也是如此，业务上分开，但有逻辑可以共用。架构设计需要提前确定好。一定要提前规划好文件夹结构，否则到了后期，前端文件组织是个灾难！

同样的，这些设计规范也需要放入 docs/frontend/milestone/20251102 文件夹下的某文档。

c) 业务逻辑
（我给你上传的图片下文称为“首页低保真设计图”或者“首页设计图”，图里的内容不一定真的和我说的一模一样，主要看我讲的）我以普通用户的视角描述前端需要有的内容，你根据我的文字实现具体的功能和设计。当然也包含后端不存在的功能，可能是 Auth 缺少的，你需要一同添加上。

前端需要移动端适配和暗色适配。

前端整体的设计风格以白 + 各种主题灰阶色 + 主题色点缀。多用 Blur、渐变，Nuxt UI 的组件也很好看，后台设计要多用。

用户（未登录）使用 PC 进入首页页面后：图中最顶栏 Header 是透明的 background。
Header 最左侧是玩家对应的 Minecraft 信息和 Minecraft 在线情况，但鉴于我们现在后端还没功能，这点先预留着。最左侧留个区域。
Header 中间则是首页信息窗。根据 Scroll 情况变化。如果 scroll 始终在最上方（没变化），此时首页背景会显示一个背景图（背景图具体展示逻辑见下），Header 会显示切图。
Header 右侧最右边是用户登录信息 + 私信/公告按钮 + 暗色/浅色/跟随系统 模式切换。未登录的时候右上角用户信息块只显示文字未登录。

此时，首页内（图）中间有 “Hydroline” 手写艺术体，矢量图位于 frontend/src/assets/resources/hydroline_logo.svg。Logo 下方有文字：ALPHA 测试阶段（letter-spacing 需要大一点）。再下方则是访问 Minecraft 服务器内其它业务网站的 Link。三个原型按钮带 hover 效果和 transition，分别是地图（六周目）、地图（七周目）、知识库（Wiki）。括号内的文字通过 Hover Tooltip 实现。


登录后弹出登录 Dialog（① 登录/注册是 Dialog，Dialog 要预留好 SSO 接口，以注释的方式在组件里面写好，后续一旦在后端开发 SSO 功能的时候很重要），用户输入自己的邮箱和密码以后，点击登录按钮成功登录。右上角显示它的用户名（就是系统内的 User！而非 Minecraft ID 或者 Minecraft Nick）和头像（后端需要增加附件系统。）。


d) 后端修改内容
后端需要添加附件系统。Minecraft 服务器系统。并添加对应的后台页面。具体需求如下：


对了，后端的 Prisma Schema 你写上注释，如果不清楚需求，参照 docs/backend/requirements/Requiremens MVP.md 和 docs/backend/milestone/20251101 文件夹下的文件。

e) 总结

代码写完后你自己启动后端和前端，前端服务启动后使用 Playwright 进行测试。默认管理员账户：`admin@hydcraft.local / admin123456`。对于具体的后端内容，你可以访问 docs/backend/milestone/20251101，这里有上次 CodeX Agent 的编辑记录，我们本次修改需要继续动后端，你可以接续。（接续后在 docs/backend/milestone 下新建 20251102 文件夹，随后在内部编辑后端对应的内容。）